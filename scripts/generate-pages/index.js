const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { google } = require('googleapis');

class PageGenerator {
    constructor() {
        this.templatePath = path.join(__dirname, '../../src/templates/detail-page.html');
        this.outputDir = path.join(__dirname, '../../src/pages');
        this.dataPath = path.join(__dirname, '../../src/data/summaries.json');
        this.sitemapPath = path.join(__dirname, '../../src/sitemap.xml');
        this.youtube = google.youtube({
            version: 'v3',
            auth: process.env.YOUTUBE_API_KEY,
        });
    }

    async fetchVideoStatistics(videoIds) {
        try {
            console.log(`Fetching statistics for ${videoIds.length} videos...`);
            const response = await this.youtube.videos.list({
                part: 'statistics',
                id: videoIds.join(','),
                maxResults: 50,
            });

            const statistics = {};
            if (response.data.items) {
                for (const item of response.data.items) {
                    statistics[item.id] = {
                        viewCount: item.statistics.viewCount ? parseInt(item.statistics.viewCount, 10) : 0,
                        likeCount: item.statistics.likeCount ? parseInt(item.statistics.likeCount, 10) : 0,
                    };
                }
            }
            console.log(`Successfully fetched statistics for ${Object.keys(statistics).length} videos.`);
            return statistics;
        } catch (error) {
            console.error('Error fetching video statistics:', error.message);
            return {};
        }
    }

    async generatePages() {
        try {
            let data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
            
            const videoIds = data.map(archive => archive.videoId);
            if (videoIds.length > 0) {
                const videoStats = await this.fetchVideoStatistics(videoIds);
                data = data.map(archive => {
                    const stats = videoStats[archive.videoId];
                    return {
                        ...archive,
                        viewCount: stats ? stats.viewCount : 0,
                        likeCount: stats ? stats.likeCount : 0,
                    };
                });
                fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf8');
                console.log('Successfully updated summaries.json with video statistics.');
            }

            // 出力ディレクトリをクリーンアップ
            if (fs.existsSync(this.outputDir)) {
                fs.rmSync(this.outputDir, { recursive: true, force: true });
            }
            fs.mkdirSync(this.outputDir, { recursive: true });
            
            console.log(`Starting to generate ${data.length} individual pages...`);
            
            for (const archive of data) {
                await this.generatePage(archive);
            }
            
            // サイトマップ生成
            this.generateSitemap(data);
            
            console.log(`Successfully generated ${data.length} individual pages and sitemap`);
        } catch (error) {
            console.error('Error generating pages:', error);
            process.exit(1);
        }
    }

    async generatePage(archive) {
        try {
            const template = fs.readFileSync(this.templatePath, 'utf8');
            const pageContent = this.replaceTemplateVariables(template, archive);
            const outputPath = path.join(this.outputDir, `${archive.videoId}.html`);
            
            fs.writeFileSync(outputPath, pageContent);
            console.log(`Generated: ${archive.videoId}.html`);
        } catch (error) {
            console.error(`Error generating page for ${archive.videoId}:`, error);
        }
    }

    replaceTemplateVariables(template, archive) {
        return template
            .replace(/\{\{TITLE\}\}/g, this.escapeHtml(archive.title))
            .replace(/\{\{DESCRIPTION\}\}/g, this.escapeHtml(archive.overview.summary))
            .replace(/\{\{VIDEO_ID\}\}/g, archive.videoId)
            .replace(/\{\{STREAMER\}\}/g, this.escapeHtml(archive.streamer))
            .replace(/\{\{DATE\}\}/g, this.formatDate(archive.date))
            .replace(/\{\{DURATION\}\}/g, this.formatDuration(archive.duration))
            .replace(/\{\{THUMBNAIL_URL\}\}/g, archive.thumbnailUrl)
            .replace(/\{\{TAGS\}\}/g, this.escapeHtml(archive.tags.join(', ')))
            .replace(/\{\{OVERVIEW_SUMMARY\}\}/g, this.escapeHtml(archive.overview.summary))
            .replace(/\{\{OVERVIEW_MOOD\}\}/g, this.escapeHtml(archive.overview.mood))
            .replace(/\{\{HIGHLIGHTS_JSON\}\}/g, JSON.stringify(archive.highlights))
            .replace(/\{\{TAGS_JSON\}\}/g, JSON.stringify(archive.tags));
    }

    escapeHtml(text) {
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

    formatDuration(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

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

    generateSitemap(archives) {
        const baseUrl = 'https://aegisfleet.github.io/live-stream-summarizer';
        let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
        sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n';
        // トップページ
        const now = new Date().toISOString();
        sitemap += `  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
`;
        
        // 個別ページ
        archives.forEach(archive => {
            sitemap += `  <url>\n    <loc>${baseUrl}/pages/${archive.videoId}.html</loc>\n    <lastmod>${archive.date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
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