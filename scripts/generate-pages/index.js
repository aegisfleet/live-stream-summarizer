const fs = require('fs');
const path = require('path');

class PageGenerator {
    constructor() {
        this.templatePath = path.join(__dirname, '../../src/templates/detail-page.html');
        this.outputDir = path.join(__dirname, '../../src/pages');
        this.dataPath = path.join(__dirname, '../../src/data/summaries.json');
        this.sitemapPath = path.join(__dirname, '../../src/sitemap.xml');
    }

    async generatePages() {
        try {
            const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
            
            // 出力ディレクトリの作成
            if (!fs.existsSync(this.outputDir)) {
                fs.mkdirSync(this.outputDir, { recursive: true });
            }
            
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
        sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
        
        // トップページ
        sitemap += `  <url>\n    <loc>${baseUrl}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
        
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
