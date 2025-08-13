const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { google } = require('googleapis');

class PageGenerator {
    constructor() {
        this.templatePaths = {
            ja: path.join(__dirname, '../../src/templates/detail-page.html'),
            en: path.join(__dirname, '../../src/templates/detail-page.en.html'),
        };
        this.outputDirs = {
            ja: path.join(__dirname, '../../src/pages'),
            en: path.join(__dirname, '../../src/en/pages'),
        };
        this.dataPath = path.join(__dirname, '../../src/data/summaries.json');
        this.sitemapPath = path.join(__dirname, '../../src/sitemap.xml');
        this.youtube = google.youtube({
            version: 'v3',
            auth: process.env.YOUTUBE_API_KEY,
        });
    }

    async fetchVideoStatistics(videoIds) {
        const stats = {};
        const BATCH_SIZE = 50; // YouTube API has a limit of 50 video IDs per request
        try {
            console.log(`Fetching statistics for ${videoIds.length} videos...`);
            for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
                const batch = videoIds.slice(i, i + BATCH_SIZE);
                const response = await this.youtube.videos.list({
                    part: 'statistics',
                    id: batch.join(','),
                });

                if (response.data.items) {
                    for (const item of response.data.items) {
                        stats[item.id] = {
                            viewCount: item.statistics.viewCount ? parseInt(item.statistics.viewCount, 10) : 0,
                            likeCount: item.statistics.likeCount ? parseInt(item.statistics.likeCount, 10) : 0,
                        };
                    }
                }
            }
            console.log(`Successfully fetched statistics for ${Object.keys(stats).length} videos.`);
            return stats;
        } catch (error) {
            console.error('Error fetching video statistics:', error.message);
            // Return any stats that were successfully fetched before the error
            return stats;
        }
    }

    async generatePages() {
        try {
            let data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));

            // Filter out any entries with missing or empty videoId
            const videoIds = data.map(archive => archive.videoId).filter(id => id);
            
            // if (videoIds.length > 0) {
            //     const videoStats = await this.fetchVideoStatistics(videoIds);
            //     data = data.map(archive => {
            //         const stats = videoStats[archive.videoId];
            //         return {
            //             ...archive,
            //             viewCount: stats ? stats.viewCount : 0,
            //             likeCount: stats ? stats.likeCount : 0,
            //         };
            //     });
            //     fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf8');
            //     console.log('Successfully updated summaries.json with video statistics.');
            // }

            // Clean up output directories
            Object.values(this.outputDirs).forEach(dir => {
                if (fs.existsSync(dir)) {
                    fs.rmSync(dir, { recursive: true, force: true });
                }
                fs.mkdirSync(dir, { recursive: true });
            });
            
            console.log(`Starting to generate ${data.length} individual pages in Japanese and English...`);
            
            for (const archive of data) {
                await this.generatePage(archive, 'ja');
                await this.generatePage(archive, 'en');
            }
            
            // Generate sitemap
            this.generateSitemap(data);

            this.updateServiceWorkerCacheName();
            
            console.log(`Successfully generated ${data.length} individual pages in both languages, sitemap, and updated service worker.`);
        } catch (error) {
            console.error('Error generating pages:', error);
            process.exit(1);
        }
    }

    async generatePage(archive, lang) {
        try {
            const template = fs.readFileSync(this.templatePaths[lang], 'utf8');
            const pageContent = this.replaceTemplateVariables(template, archive, lang);
            const outputPath = path.join(this.outputDirs[lang], `${archive.videoId}.html`);
            
            fs.writeFileSync(outputPath, pageContent);
            console.log(`Generated: ${lang}/${archive.videoId}.html`);
        } catch (error) {
            console.error(`Error generating page for ${archive.videoId} (${lang}):`, error);
        }
    }

    replaceTemplateVariables(template, archive, lang) {
        const viewCount = archive.viewCount ? this.formatNumber(archive.viewCount) : '0';
        const likeCount = archive.likeCount ? this.formatNumber(archive.likeCount) : '0';

        const title = lang === 'en' && archive.title_en ? archive.title_en : archive.title;
        const overviewSummary = lang === 'en' && archive.overview_en ? archive.overview_en.summary : archive.overview.summary;
        const overviewMood = lang === 'en' && archive.overview_en ? archive.overview_en.mood : archive.overview.mood;
        const highlightsJson = lang === 'en' && archive.highlights_en ? JSON.stringify(archive.highlights_en) : JSON.stringify(archive.highlights);
        const tags = lang === 'en' && archive.tags_en ? archive.tags_en : archive.tags;

        return template
            .replace(/\{\{TITLE\}\}/g, this.escapeHtml(title))
            .replace(/\{\{DESCRIPTION\}\}/g, this.escapeHtml(overviewSummary))
            .replace(/\{\{VIDEO_ID\}\}/g, archive.videoId)
            .replace(/\{\{STREAMER\}\}/g, this.escapeHtml(archive.streamer))
            .replace(/\{\{DATE\}\}/g, this.formatDate(archive.date))
            .replace(/\{\{DURATION\}\}/g, this.formatDuration(archive.duration, lang))
            .replace(/\{\{VIEW_COUNT\}\}/g, viewCount)
            .replace(/\{\{LIKE_COUNT\}\}/g, likeCount)
            .replace(/\{\{THUMBNAIL_URL\}\}/g, archive.thumbnailUrl)
            .replace(/\{\{TAGS\}\}/g, this.escapeHtml(tags.join(', ')))
            .replace(/\{\{OVERVIEW_SUMMARY\}\}/g, this.escapeHtml(overviewSummary))
            .replace(/\{\{OVERVIEW_MOOD\}\}/g, this.escapeHtml(overviewMood))
            .replace(/\{\{HIGHLIGHTS_JSON\}\}/g, highlightsJson)
            .replace(/\{\{TAGS_JSON\}\}/g, JSON.stringify(tags));
    }

    formatNumber(num) {
        return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
    }

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    formatDate(dateString) {
        return new Date(dateString).toISOString().slice(0, 19).replace('T', ' ');
    }

    formatDuration(totalSeconds, lang = 'ja') {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (lang === 'en') {
            let durationStr = "";
            if (hours > 0) durationStr += `${hours}h `;
            if (minutes > 0) durationStr += `${minutes}m `;
            if (seconds > 0 || durationStr === "") durationStr += `${seconds}s`;
            return durationStr.trim();
        }

        // Default to Japanese
        let durationStr = "";
        if (hours > 0) {
            durationStr += `${hours}時間`;
        }
        if (minutes > 0) {
            durationStr += `${minutes}分`;
        }
        if (seconds > 0 || durationStr === "") {
            durationStr += `${seconds}秒`;
        }
        return durationStr.trim();
    }

    updateServiceWorkerCacheName() {
        const swPath = path.join(__dirname, '../../src/service-worker.js');
        try {
            let swContent = fs.readFileSync(swPath, 'utf8');
            const cacheNameRegex = /const CACHE_NAME = 'hololive-summary-cache-v(\d+)-(\d*)';/;
            const match = swContent.match(cacheNameRegex);

            if (match) {
                const newVersion = Date.now();
                const newCacheName = `const CACHE_NAME = 'hololive-summary-cache-v1-${newVersion}';`;
                swContent = swContent.replace(cacheNameRegex, newCacheName);
                fs.writeFileSync(swPath, swContent, 'utf8');
                console.log(`Successfully updated service worker cache name to v1-${newVersion}`);
            } else {
                // If the pattern is not found, try the initial pattern
                const initialCacheNameRegex = /const CACHE_NAME = 'hololive-summary-cache-v1';/;
                const initialMatch = swContent.match(initialCacheNameRegex);
                if (initialMatch) {
                    const newVersion = Date.now();
                    const newCacheName = `const CACHE_NAME = 'hololive-summary-cache-v1-${newVersion}';`;
                    swContent = swContent.replace(initialCacheNameRegex, newCacheName);
                    fs.writeFileSync(swPath, swContent, 'utf8');
                    console.log(`Successfully updated service worker cache name to v1-${newVersion}`);
                } else {
                    console.warn('Could not find CACHE_NAME in service-worker.js');
                }
            }
        } catch (error) {
            console.error('Error updating service worker cache name:', error);
        }
    }

    generateSitemap(archives) {
        const baseUrl = 'https://aegisfleet.github.io/live-stream-summarizer';
        let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
        sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n';

        const now = new Date().toISOString();
        
        // Home pages
        sitemap += `  <url><loc>${baseUrl}/</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;
        sitemap += `  <url><loc>${baseUrl}/en/</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;

        // Detail pages
        archives.forEach(archive => {
            sitemap += `  <url>\n    <loc>${baseUrl}/pages/${archive.videoId}.html</loc>\n    <lastmod>${archive.date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
            sitemap += `  <url>\n    <loc>${baseUrl}/en/pages/${archive.videoId}.html</loc>\n    <lastmod>${archive.date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
        });
        
        sitemap += '</urlset>';
        
        fs.writeFileSync(this.sitemapPath, sitemap);
        console.log('Generated sitemap.xml');
    }
}

// スクリプト実行
if (require.main === module) {
    const generator = new PageGenerator();
    generator.generatePages().catch(console.error);
}

module.exports = PageGenerator;