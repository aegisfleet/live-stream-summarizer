import { getBasePath, timestampToSeconds } from './utils.js';

class DetailPageManager {
    constructor() {
        this.archiveData = pageData;
        this.player = null;
        this.resizeTimer = null;
        this.lang = document.documentElement.lang || 'ja';
        this.init();
    }

    init() {
        // Save the initial state when loading the detail page
        const basePath = getBasePath();
        const lang = document.documentElement.lang || 'ja';
        const homeUrl = lang === 'en' ? `${basePath}en/` : basePath;

        // Setup popstate event listener for handling browser back button
        window.addEventListener('popstate', () => {
            window.location.href = homeUrl;
        });

        // Only pushState if we haven't already
        if (!history.state || history.state.page !== 'detail') {
            history.pushState({ page: 'detail' }, '', window.location.href);
        }

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
            const seconds = timestampToSeconds(highlight.timestamp);
            const li = document.createElement('li');
            li.classList.add('highlight-item');
            li.id = `highlight-${seconds}`;
            
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
            
            li.addEventListener('click', () => {
                const seconds = timestampToSeconds(highlight.timestamp);
                this.seekToTime(seconds);
                this.scrollToHighlight(seconds);

                const url = new URL(window.location);
                url.searchParams.set('t', seconds);
                history.replaceState({ t: seconds }, '', url);
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
        if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            
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

        const playerWidth = playerElement.parentElement.clientWidth || 1000;
        const playerHeight = playerWidth * (9 / 16);

        this.player = new YT.Player('youtube-player', {
            height: String(playerHeight),
            width: '100%',
            videoId: this.archiveData.videoId,
            playerVars: {
                'playsinline': 1,
                'rel': 0,
                'modestbranding': 1,
                'origin': window.location.origin
            },
            events: {
                'onReady': this._onPlayerReady.bind(this),
                'onStateChange': this._onPlayerStateChange.bind(this)
            }
        });
    }

    _onPlayerReady(event) {
        this.setupResizeListener();
        this.adjustHighlightsHeight();

        const params = new URLSearchParams(window.location.search);
        const time = params.get('t');
        if (time) {
            const seconds = Number(time);
            this.seekToTime(seconds);
            this.scrollToHighlight(seconds);
        }
    }

    _onPlayerStateChange(event) {
        // This can be used to handle state changes in the future
    }

    setupResizeListener() {
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

        this.adjustHighlightsHeight();
    }

    adjustHighlightsHeight() {
        const highlights = document.querySelector('.detail-highlights');
        const playerIframe = document.getElementById('youtube-player');

        if (!highlights || !playerIframe) return;

        if (window.matchMedia('(min-width: 769px)').matches) {
            const playerHeight = playerIframe.offsetHeight;
            highlights.style.height = `${playerHeight}px`;
        } else {
            highlights.style.height = 'auto';
        }
    }

    setupEventListeners() {
        this.setupLanguageSwitcher();
        const backToHomeButton = document.getElementById('back-to-home');
        if (backToHomeButton) {
            backToHomeButton.classList.add('show');
            backToHomeButton.addEventListener('click', (e) => {
                e.preventDefault();
                const lang = document.documentElement.lang || 'ja';
                const basePath = getBasePath();
                let homeUrl = basePath;
                if (lang === 'en') {
                    homeUrl = `${basePath}en/`;
                }
                history.pushState({ page: 'home' }, '', homeUrl);
                window.location.href = homeUrl;
            });
        }

        const topLogoLink = document.getElementById('top-logo-link');
        if (topLogoLink) {
            topLogoLink.addEventListener('click', (event) => {
                event.preventDefault();
                const lang = document.documentElement.lang || 'ja';
                const basePath = getBasePath();
                let homeUrl = basePath;
                if (lang === 'en') {
                    homeUrl = `${basePath}en/`;
                }
                history.pushState({ page: 'home' }, '', homeUrl);
                window.location.href = homeUrl;
            });
        }

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
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        const copyButton = document.getElementById('copy-button');
        if (copyButton) {
            copyButton.addEventListener('click', () => {
                const copyText = `${this.archiveData.title}\n${window.location.href}`;
                navigator.clipboard.writeText(copyText).then(() => {
                    copyButton.textContent = this.lang === 'en' ? 'Copied!' : 'コピー完了！';
                    setTimeout(() => {
                        copyButton.textContent = this.lang === 'en' ? 'Copy' : 'コピー';
                    }, 2000);
                }).catch(err => {
                    const errorMsg = this.lang === 'en' ? 'Failed to copy to clipboard:' : 'クリップボードへのコピーに失敗しました:';
                    console.error(errorMsg, err);
                    copyButton.textContent = this.lang === 'en' ? 'Failed' : '失敗';
                    setTimeout(() => {
                        copyButton.textContent = this.lang === 'en' ? 'Copy' : 'コピー';
                    }, 2000);
                });
            });
        }

        const shareButton = document.getElementById('share-button');
        if (shareButton) {
            shareButton.addEventListener('click', () => {
                const shareText = `${this.archiveData.title}\n${window.location.href}`;
                const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
                window.open(twitterIntentUrl, '_blank');
            });
        }

        const shareHelpButton = document.getElementById('share-help-button');
        const shareHelpDialog = document.getElementById('share-help-dialog');
        const closeShareDialogButton = document.getElementById('close-share-dialog');

        if (shareHelpButton && shareHelpDialog && closeShareDialogButton) {
            shareHelpButton.addEventListener('click', () => {
                shareHelpDialog.style.display = 'flex';
            });

            closeShareDialogButton.addEventListener('click', () => {
                shareHelpDialog.style.display = 'none';
            });

            shareHelpDialog.addEventListener('click', (e) => {
                if (e.target === shareHelpDialog) {
                    shareHelpDialog.style.display = 'none';
                }
            });
        }
    }

    setupLanguageSwitcher() {
        const PREFERRED_LANGUAGE_KEY = 'preferredLanguage';
        const jaLink = document.getElementById('lang-ja');
        const enLink = document.getElementById('lang-en');

        if (jaLink) {
            jaLink.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.setItem(PREFERRED_LANGUAGE_KEY, 'ja');
                location.replace(e.target.href);
            });
        }

        if (enLink) {
            enLink.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.setItem(PREFERRED_LANGUAGE_KEY, 'en');
                location.replace(e.target.href);
            });
        }
    }

    seekToTime(seconds) {
        if (this.player && this.player.seekTo) {
            this.player.seekTo(seconds, true);
            this.player.playVideo();
        }
    }

    scrollToHighlight(seconds) {
        const highlightElement = document.getElementById(`highlight-${seconds}`);
        if (highlightElement) {
            const isDesktop = window.matchMedia('(min-width: 769px)').matches;
            if (isDesktop) {
                const videoPlayer = document.getElementById('youtube-player');
                if (videoPlayer) {
                    videoPlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                const scrollContainer = document.querySelector('.detail-highlights');
                if (scrollContainer) {
                    const containerRect = scrollContainer.getBoundingClientRect();
                    const elementRect = highlightElement.getBoundingClientRect();
                    const scrollOffset = (elementRect.top + scrollContainer.scrollTop) - containerRect.top - (containerRect.height / 2) + (elementRect.height / 2);
                    scrollContainer.scrollTo({
                        top: scrollOffset,
                        behavior: 'smooth'
                    });
                }
            } else {
                highlightElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            highlightElement.classList.add('flash');
            setTimeout(() => {
                highlightElement.classList.remove('flash');
            }, 1000);
        }
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

document.addEventListener('DOMContentLoaded', () => {
    new DetailPageManager();
});
