class DetailPageManager {
    constructor() {
        this.archiveData = pageData; // テンプレートから渡されるデータ
        this.init();
    }

    init() {
        this.renderDetailPage();
        this.setupEventListeners();
        this.addStructuredData();
    }

    renderDetailPage() {
        this.renderHighlights();
        this.renderTags();
        this.setupThumbnailClick();
    }

    renderHighlights() {
        const highlightsList = document.getElementById('highlights-list');
        if (!highlightsList || !this.archiveData.highlights) return;

        highlightsList.innerHTML = '';
        this.archiveData.highlights.forEach(highlight => {
            const li = document.createElement('li');
            li.classList.add('highlight-item');
            
            const title = document.createElement('h3');
            title.textContent = highlight.title;
            
            const timestamp = document.createElement('span');
            timestamp.className = 'timestamp';
            timestamp.textContent = highlight.timestamp;
            
            const type = document.createElement('span');
            type.className = `highlight-type ${highlight.type}`;
            type.textContent = highlight.type;
            
            const description = document.createElement('p');
            description.textContent = highlight.description;
            
            li.appendChild(title);
            li.appendChild(timestamp);
            li.appendChild(document.createTextNode(' / '));
            li.appendChild(type);
            li.appendChild(description);
            
            // クリックでYouTubeの該当時間にジャンプ
            li.addEventListener('click', () => {
                const seconds = this.timestampToSeconds(highlight.timestamp);
                this.openVideo(seconds);
            });
            
            highlightsList.appendChild(li);
        });
    }

    renderTags() {
        const tagsContainer = document.getElementById('tags-container');
        if (!tagsContainer || !this.archiveData.tags) return;

        tagsContainer.innerHTML = '';
        this.archiveData.tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'tag';
            tagSpan.textContent = `#${tag}`;
            tagsContainer.appendChild(tagSpan);
        });
    }

    setupThumbnailClick() {
        const thumbnail = document.querySelector('.clickable-thumbnail');
        if (thumbnail) {
            thumbnail.addEventListener('click', () => this.openVideo());
        }
    }

    setupEventListeners() {
        // トップページに戻るボタン
        const backButton = document.getElementById('back-to-home');
        if (backButton) {
            backButton.addEventListener('click', () => {
                window.location.href = '../';
            });
        }

        // コピーボタン
        const copyButton = document.getElementById('copy-button');
        if (copyButton) {
            copyButton.addEventListener('click', () => {
                const copyText = `${this.archiveData.title}\n${window.location.href}`;
                navigator.clipboard.writeText(copyText).then(() => {
                    copyButton.textContent = 'コピー完了！';
                    setTimeout(() => {
                        copyButton.textContent = 'コピー';
                    }, 2000);
                }).catch(err => {
                    console.error('クリップボードへのコピーに失敗しました:', err);
                    copyButton.textContent = '失敗';
                    setTimeout(() => {
                        copyButton.textContent = 'コピー';
                    }, 2000);
                });
            });
        }

        // 共有ボタン
        const shareButton = document.getElementById('share-button');
        if (shareButton) {
            shareButton.addEventListener('click', () => {
                const shareText = `${this.archiveData.title}\n${window.location.href}`;
                const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
                window.open(twitterIntentUrl, '_blank');
            });
        }
    }

    openVideo(startTime = 0) {
        const url = `https://www.youtube.com/watch?v=${this.archiveData.videoId}&t=${startTime}s`;
        window.open(url, '_blank');
    }

    timestampToSeconds(timestamp) {
        const parts = timestamp.split(':').map(Number).reverse();
        return parts.reduce((total, part, index) => total + part * Math.pow(60, index), 0);
    }

    addStructuredData() {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": this.archiveData.title,
            "description": this.archiveData.overview.summary,
            "thumbnailUrl": this.archiveData.thumbnailUrl,
            "uploadDate": this.archiveData.date,
            "duration": `PT${Math.floor(this.archiveData.duration / 3600)}H${Math.floor((this.archiveData.duration % 3600) / 60)}M`,
            "url": `https://www.youtube.com/watch?v=${this.archiveData.videoId}`,
            "author": {
                "@type": "Person",
                "name": this.archiveData.streamer
            },
            "keywords": this.archiveData.tags.join(', ')
        });
        document.head.appendChild(script);
    }
}

// ページ読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', () => {
    new DetailPageManager();
});
