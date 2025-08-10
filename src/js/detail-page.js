class DetailPageManager {
    constructor() {
        this.archiveData = pageData; // テンプレートから渡されるデータ
        this.player = null;
        this.resizeTimer = null; // リサイズイベントのdebounce用タイマー
        this.init();
    }

    init() {
        this.renderDetailPage();
        this.setupEventListeners();
        this.addStructuredData();
        this.initYouTubePlayer();
    }

    renderDetailPage() {
        this.renderHighlights();
        this.renderTags();
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
            
            // クリックで埋め込みプレーヤーの該当時間にジャンプ
            li.addEventListener('click', () => {
                const seconds = this.timestampToSeconds(highlight.timestamp);
                this.seekToTime(seconds, true);
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

    initYouTubePlayer() {
        // YouTube IFrame APIが読み込まれているかチェック
        if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
            // YouTube IFrame APIを動的に読み込み
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            
            // API読み込み完了後にプレーヤーを初期化
            window.onYouTubeIframeAPIReady = () => {
                this.createPlayer();
            };
        } else {
            this.createPlayer();
        }
    }

    createPlayer() {
        const playerElement = document.getElementById('youtube-player');
        if (!playerElement) return;

        // 親要素の幅に基づいて、アスペクト比16:9でプレーヤーの高さを動的に計算します。
        const playerWidth = playerElement.parentElement.clientWidth || 1000;
        const playerHeight = playerWidth * (9 / 16);

        this.player = new YT.Player('youtube-player', {
            height: String(playerHeight),
            width: '100%',
            videoId: this.archiveData.videoId,
            playerVars: {
                'playsinline': 1,
                'rel': 0,
                'modestbranding': 1
            },
            events: {
                'onReady': (event) => {
                    // プレーヤーの準備ができたら、リサイズイベントリスナーを設定
                    this.setupResizeListener();

                    // URLから再生時間を取得してシーク
                    const params = new URLSearchParams(window.location.search);
                    const time = params.get('t');
                    if (time) {
                        this.seekToTime(Number(time), true);
                    }
                },
                'onStateChange': (event) => {
                    // プレーヤーの状態変更を監視
                }
            }
        });
    }

    setupResizeListener() {
        // debounce関数でリサイズイベントの発火を制御し、過剰な再計算を防ぎます。
        const debounce = (func, delay) => {
            return (...args) => {
                clearTimeout(this.resizeTimer);
                this.resizeTimer = setTimeout(() => {
                    func.apply(this, args);
                }, delay);
            };
        };

        window.addEventListener('resize', debounce(this.resizePlayer.bind(this), 250));
    }

    resizePlayer() {
        if (!this.player || typeof this.player.setSize !== 'function') return;

        const playerElement = document.getElementById('youtube-player');
        if (!playerElement || !playerElement.parentElement) return;

        const newWidth = playerElement.parentElement.clientWidth;
        const newHeight = newWidth * (9 / 16);
        this.player.setSize(newWidth, newHeight);
    }

    setupEventListeners() {
        // ホームに戻るボタン（詳細ページでは常に表示）
        const backToHomeButton = document.getElementById('back-to-home');
        if (backToHomeButton) {
            backToHomeButton.classList.add('show');
            backToHomeButton.addEventListener('click', () => {
                window.location.href = '../';
            });
        }

        // トップに戻るボタン
        const backToTopButton = document.getElementById('back-to-top');
        if (backToTopButton) {
            window.onscroll = function() {
                if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
                    backToTopButton.classList.add('show');
                } else {
                    backToTopButton.classList.remove('show');
                }
            };

            backToTopButton.addEventListener('click', () => {
                backToTopButton.classList.remove('show');
                window.scrollTo({ top: 0, behavior: 'smooth' });
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

    seekToTime(seconds, scroll = false) {
        if (this.player && this.player.seekTo) {
            this.player.seekTo(seconds, true);
            this.player.playVideo();
            if (scroll) {
                this.scrollToPlayer();
            }
        }
    }

    scrollToPlayer() {
        const playerElement = document.getElementById('youtube-player');
        if (playerElement) {
            playerElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
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
