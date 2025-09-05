import BookmarkAccessibility from './bookmark-accessibility.js';
import BookmarkManager from './bookmark-manager.js';
import NotificationSystem from './notification-system.js';
import { formatDuration, formatNumber, getBasePath, goToHomeAndResetHistory, timestampToSeconds } from './utils.js';

class ArchiveManager {
    constructor() {
        this.archiveData = [];
        this.filteredData = [];
        this.streamers = new Set();
        this.selectedStreamers = new Set();
        this.tags = new Set();
        this.selectedTags = new Set();
        this.currentPage = 1;
        this.itemsPerPage = 15;
        this.originalTitle = document.title;
        this.streamerCategories = {};

        // 新しいブックマーク機能
        this.bookmarkManager = null;
        this.notificationSystem = null;
        this.bookmarkAccessibility = null;

        this.isWatchLaterMode = false;
        this.currentSortKey = 'date';
        this.sortOrders = {
            date: 'desc',
            viewCount: 'desc',
            likeCount: 'desc'
        };
        this.lang = document.documentElement.lang || 'ja';

        // Listen for custom navigateToHome event
        window.addEventListener('navigateToHome', () => {
            this._resetToDefaultView();
            this.currentPage = 1;
            this.renderArchives(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // Handle browser back button on main page
        window.addEventListener('popstate', () => {
            if (!history.state) {
                // If there's no state, we're at the initial page load
                // Just let the browser handle the navigation
                return;
            }
            if (history.state.page === 'home') {
                // If we're already on the home page, let the browser exit
                history.back();
            }
        });

        this.init();
    }

    async init() {
        await this.loadData();

        // 新しいブックマーク機能の初期化
        await this.initializeBookmarkSystem();


        this._setupInitialFilters();
        this._setupEventListeners();
        this.renderArchives();
        this.updateTitle();

        // If this is a direct load of the home page (not navigated via pushState),
        // replace the current history entry
        if (!history.state) {
            history.replaceState(null, '', window.location.href);
        }
    }

    /**
     * 新しいブックマーク機能の初期化
     */
    async initializeBookmarkSystem() {
        try {
            // 通知システムの初期化
            this.notificationSystem = new NotificationSystem();

            // アクセシビリティ機能の初期化
            this.bookmarkAccessibility = new BookmarkAccessibility();

            // ブックマークマネージャーの初期化
            this.bookmarkManager = new BookmarkManager(this);



            // イベントリスナーの設定
            this.setupBookmarkEventListeners();

            console.log('新しいブックマーク機能が初期化されました');

        } catch (error) {
            console.error('ブックマーク機能の初期化に失敗:', error);

            // フォールバック: 基本的な通知機能を使用
            this.notificationSystem = {
                showBookmarkSuccess: (added, archiveData) => {
                    console.log(`ブックマーク${added ? '追加' : '削除'}: ${archiveData?.title || 'Unknown'}`);
                },
                showBookmarkError: (error) => {
                    console.error('ブックマークエラー:', error);
                }
            };
        }
    }



    /**
     * ブックマーク関連のイベントリスナーを設定
     */
    setupBookmarkEventListeners() {
        // ブックマーク切り替えイベントは直接処理するため削除

        // ブックマーク一覧切り替えイベント
        document.addEventListener('bookmark-list-toggle', () => {
            this.toggleWatchLaterMode();
        });

        // ストレージクリーンアップイベント
        document.addEventListener('storage-cleanup', () => {
            this.cleanupStorage();
        });

        // ブックマーク再試行イベント
        document.addEventListener('bookmark-retry', async (event) => {
            const { archiveData } = event.detail;
            if (archiveData) {
                // 再試行ロジック
                await this.bookmarkManager.toggleBookmark(archiveData.videoId);
            }
        });
    }

    /**
     * アーカイブデータの取得
     * @param {string} videoId - 動画ID
     * @returns {Object|null} アーカイブデータ
     */
    getArchiveData(videoId) {
        return this.archiveData.find(archive => archive.videoId === videoId) || null;
    }

    /**
     * ストレージのクリーンアップ
     */
    cleanupStorage() {
        try {
            // 古いデータを削除
            const keysToRemove = [
                'holoSummary_old_data',
                'watchLaterList',
                'watchLaterList_backup',
                'temp_bookmark_data'
            ];

            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
            });

            if (this.notificationSystem) {
                this.notificationSystem.showToast(
                    this.lang === 'en' ? 'Storage cleaned up successfully' : 'ストレージのクリーンアップが完了しました',
                    'success'
                );
            }

        } catch (error) {
            console.error('ストレージクリーンアップエラー:', error);
        }
    }

    /**
     * ブックマークモードの更新
     */
    updateWatchLaterMode() {
        if (this.isWatchLaterMode && this.bookmarkManager) {
            const bookmarkedVideoIds = this.bookmarkManager.getBookmarks();

            if (bookmarkedVideoIds.length === 0) {
                // ブックマークがなくなった場合は通常モードに戻る
                this._resetToDefaultView();
            } else {
                // ブックマークされた配信のみを表示
                this.filteredData = this.archiveData.filter(archive =>
                    bookmarkedVideoIds.includes(archive.videoId)
                );
            }

            this.currentPage = 1;
            this.renderArchives(true);
        }
    }

    _setupInitialFilters() {
        const hasUrlParams = this.filterByUrlParams();

        if (!hasUrlParams || new URLSearchParams(window.location.search).get('watchLater') === 'true') {
            this.setupStreamerFilter();
            this.setupTagFilter();
        }

        const params = new URLSearchParams(window.location.search);
        if (params.get('watchLater') === 'true' && this.bookmarkManager && this.bookmarkManager.getBookmarkCount() > 0) {
            this.isWatchLaterMode = true;
            const bookmarkedVideoIds = this.bookmarkManager.getBookmarks();
            this.filteredData = this.archiveData.filter(archive =>
                bookmarkedVideoIds.includes(archive.videoId)
            );
            document.getElementById('filter-container').style.display = 'none';
            document.querySelector('.filter-group.collapsible').style.display = 'none';
        }
    }

    _setupEventListeners() {
        this.setupSiteDescriptionToggle();
        this.setupBackToTopButton();
        this.setupBackToHomeButton();
        this.setupTopLogoLink();
        this.setupWatchLaterButton();
        this.setupLoadMoreButton();
        this.setupSortControls();
        this.setupHintDialog();
        this.setupServiceWorker();
        this.setupLanguageSwitcher();
    }

    setupLanguageSwitcher() {
        const PREFERRED_LANGUAGE_KEY = 'preferredLanguage';
        const jaLinks = [document.getElementById('lang-ja'), document.getElementById('top-lang-ja')];
        const enLinks = [document.getElementById('lang-en'), document.getElementById('top-lang-en')];

        jaLinks.forEach(link => {
            if (link) {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    localStorage.setItem(PREFERRED_LANGUAGE_KEY, 'ja');
                    const basePath = getBasePath();
                    // The 'basePath' already includes a trailing slash if it's not the root.
                    // For the root, it's '/'.
                    location.replace(e.currentTarget.href);
                });
            }
        });

        enLinks.forEach(link => {
            if (link) {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    localStorage.setItem(PREFERRED_LANGUAGE_KEY, 'en');
                    location.replace(e.currentTarget.href);
                });
            }
        });
    }

    setupSortControls() {
        const sortButtons = document.querySelectorAll('#sort-buttons button');
        sortButtons.forEach(button => {
            button.addEventListener('click', () => {
                const sortKey = button.dataset.sortKey;
                if (this.currentSortKey === sortKey) {
                    this.sortOrders[sortKey] = this.sortOrders[sortKey] === 'desc' ? 'asc' : 'desc';
                } else {
                    this.currentSortKey = sortKey;
                    this.sortOrders[sortKey] = 'desc';
                }

                sortButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                this.currentPage = 1;
                this.renderArchives(true);
            });
        });
    }

    updateTitle() {
        const params = new URLSearchParams(window.location.search);
        const videoId = params.get('videoId');
        const streamerName = params.get('streamer');

        if (videoId) {
            const archive = this.archiveData.find(a => a.videoId === videoId);
            if (archive) {
                document.title = `${archive.title} - ${this.originalTitle}`;
            }
        } else if (streamerName) {
            document.title = this.lang === 'en'
                ? `Streams by ${streamerName} - ${this.originalTitle}`
                : `${streamerName}の配信一覧 - ${this.originalTitle}`;
        } else {
            document.title = this.originalTitle;
        }
    }

    filterByUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const videoId = params.get('videoId');
        if (videoId) {
            this.filteredData = this.archiveData.filter(archive => archive.videoId === videoId);
            document.getElementById('filter-container').style.display = 'none';
            document.querySelector('.filter-group.collapsible').style.display = 'none';
            const watchLaterButton = document.getElementById('watch-later');
            if (watchLaterButton) {
                watchLaterButton.classList.remove('show');
            }
            return true;
        }

        const watchLater = params.get('watchLater');
        if (watchLater === 'true' && this.bookmarkManager && this.bookmarkManager.getBookmarkCount() > 0) {
            this.isWatchLaterMode = true;
            const bookmarkedVideoIds = this.bookmarkManager.getBookmarks();
            this.filteredData = this.archiveData.filter(archive =>
                bookmarkedVideoIds.includes(archive.videoId)
            );
            document.getElementById('filter-container').style.display = 'none';
            document.querySelector('.filter-group.collapsible').style.display = 'none';
            return false;
        }

        const streamerName = params.get('streamer');
        if (streamerName && this.streamers.has(streamerName)) {
            this.selectedStreamers.clear();
            this.selectedStreamers.add(streamerName);
        }
        return false;
    }

    setupLoadMoreButton() {
        const loadMoreButton = document.getElementById('load-more');
        if (loadMoreButton) {
            loadMoreButton.addEventListener('click', () => this.loadMoreArchives());
        }
    }

    loadMoreArchives() {
        this.currentPage++;
        this.renderArchives(false);
    }

    setupBackToTopButton() {
        const backToTopButton = document.getElementById('back-to-top');

        if (!backToTopButton) {
            console.error('Back to top button not found.');
            return;
        }

        window.onscroll = function () {
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

    setupBackToHomeButton() {
        const backToHomeButton = document.getElementById('back-to-home');
        const params = new URLSearchParams(window.location.search);
        const videoId = params.get('videoId');

        if (!backToHomeButton) {
            console.error('Back to home button not found.');
            return;
        }

        if (videoId) {
            backToHomeButton.classList.add('show');
        } else {
            backToHomeButton.classList.remove('show');
        }

        backToHomeButton.addEventListener('click', () => {
            goToHomeAndResetHistory();
        });
    }

    setupTopLogoLink() {
        const topLogoLink = document.getElementById('top-logo-link');
        if (topLogoLink) {
            topLogoLink.addEventListener('click', (event) => {
                event.preventDefault();
                location.reload();
            });
        }
    }

    setupWatchLaterButton() {
        const watchLaterButton = document.getElementById('watch-later');
        const params = new URLSearchParams(window.location.search);
        const videoId = params.get('videoId');

        if (!watchLaterButton) {
            console.error('Watch later button not found.');
            return;
        }

        if (videoId) {
            watchLaterButton.classList.remove('show');
        } else {
            watchLaterButton.classList.add('show');

            // ブックマーク数の表示を更新
            this.updateBookmarkButtonDisplay();
        }

        watchLaterButton.addEventListener('click', () => {
            this.toggleWatchLaterMode();
        });
    }

    /**
     * ブックマークボタンの表示を更新
     */
    updateBookmarkButtonDisplay() {
        const watchLaterButton = document.getElementById('watch-later');
        if (!watchLaterButton) return;

        const bookmarkCount = this.bookmarkManager ?
            this.bookmarkManager.getBookmarkCount() :
            0;

        // カウンターバッジの更新または作成
        let countBadge = watchLaterButton.querySelector('.bookmark-count');

        if (!countBadge) {
            countBadge = document.createElement('span');
            countBadge.className = 'bookmark-count';
            watchLaterButton.appendChild(countBadge);
        }

        countBadge.textContent = bookmarkCount;
        countBadge.setAttribute('data-count', bookmarkCount);

        // ボタンのタイトル更新
        const title = bookmarkCount > 0
            ? (this.lang === 'en'
                ? `View ${bookmarkCount} bookmarked streams`
                : `${bookmarkCount}件のブックマークを表示`)
            : (this.lang === 'en'
                ? 'No bookmarks yet'
                : 'ブックマークはありません');

        watchLaterButton.title = title;

        // アクセシビリティ対応
        watchLaterButton.setAttribute('aria-label', title);
    }

    async loadData() {
        try {
            const dataPath = this.lang === 'en' ? '../data/summaries.json' : 'data/summaries.json';
            const response = await fetch(dataPath);
            this.archiveData = await response.json();
            this.filteredData = [...this.archiveData];

            this.archiveData.forEach(archive => {
                this.streamers.add(archive.streamer);
                const tags = this.lang === 'en' && archive.tags_en ? archive.tags_en : archive.tags;
                if (tags) {
                    tags.forEach(tag => this.tags.add(tag));
                }
            });

            this._buildStreamerCategories(); // Build the category structure

        } catch (error) {
            const errorMsg = this.lang === 'en' ? 'Failed to load data:' : 'データの読み込みに失敗しました:';
            console.error(errorMsg, error);
        }
    }

    _buildStreamerCategories() {
        const categories = {};
        const lang = this.lang;

        this.archiveData.forEach(archive => {
            let categoryName;
            let generationName;
            const streamerName = archive.streamer;

            if (!archive.category || !archive.category.name || !archive.category.talent || !archive.category.talent.generation) {
                categoryName = (lang === 'en' ? 'Other' : 'その他');
                generationName = (lang === 'en' ? 'Uncategorized' : '未分類');
            } else {
                categoryName = archive.category.name[lang];
                generationName = archive.category.talent.generation[lang];
            }

            if (!categoryName || !generationName) return; // Still skip if names are empty after fallback

            if (!categories[categoryName]) {
                categories[categoryName] = {};
            }
            if (!categories[categoryName][generationName]) {
                categories[categoryName][generationName] = new Set();
            }
            categories[categoryName][generationName].add(streamerName);
        });

        const sortedCategories = {};
        const categoryKeys = Object.keys(categories).sort();

        const otherCategoryKey = (lang === 'en' ? 'Other' : 'その他');
        const otherCategoryIndex = categoryKeys.indexOf(otherCategoryKey);

        if (otherCategoryIndex > -1) {
            categoryKeys.splice(otherCategoryIndex, 1); // Remove 'Other' from its sorted position
            categoryKeys.push(otherCategoryKey); // Add 'Other' to the end
        }

        categoryKeys.forEach(categoryKey => {
            const generations = categories[categoryKey];
            const sortedGenerations = {};
            Object.keys(generations).sort().forEach(generationKey => {
                sortedGenerations[generationKey] = generations[generationKey];
            });
            sortedCategories[categoryKey] = sortedGenerations;
        });

        this.streamerCategories = sortedCategories;
    }

    toggleWatchLaterMode() {
        // 新しいブックマーク機能を使用してモーダルを表示
        if (this.bookmarkManager) {
            this.bookmarkManager.showBookmarkList();
        } else {
            // フォールバック: 基本的なブックマーク機能
            console.warn('BookmarkManagerが利用できません。基本機能を使用します。');
        }
    }

    showWatchLaterDialog() {
        const dialog = document.getElementById('watch-later-dialog');
        if (dialog) {
            dialog.style.display = 'flex';
        }
    }



    _resetToDefaultView() {
        this.isWatchLaterMode = false;
        this.filteredData = [...this.archiveData];
        document.getElementById('filter-container').style.display = 'block';
        document.querySelector('.filter-group.collapsible').style.display = 'block';

        const params = new URLSearchParams(window.location.search);
        params.delete('watchLater');
        const newUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
        history.replaceState(null, '', newUrl);

        this.selectedStreamers = new Set(this.streamers);
        this.selectedTags = new Set(this.tags);

        const streamerButtons = document.querySelectorAll('#filter-buttons button');
        streamerButtons.forEach(button => button.classList.add('active'));

        const tagButtons = document.querySelectorAll('#tag-filter-buttons button');
        tagButtons.forEach(button => button.classList.add('active'));


    }

    setupStreamerFilter() {
        const filterContainer = document.getElementById('filter-buttons');
        const selectAllButton = document.getElementById('select-all');

        if (!filterContainer || !selectAllButton) {
            const errorMsg = this.lang === 'en' ? 'Required DOM elements not found:' : '必要なDOM要素が見つかりません:';
            console.error(errorMsg, {
                filterContainer: !!filterContainer,
                selectAllButton: !!selectAllButton
            });
            return;
        }

        filterContainer.innerHTML = ''; // Clear existing buttons

        const streamerButtonsContainer = document.createElement('div');
        streamerButtonsContainer.className = 'streamer-buttons-container';

        for (const categoryName in this.streamerCategories) {
            const categoryContainer = document.createElement('div');
            categoryContainer.className = 'streamer-category collapsible'; // Add 'collapsible'

            const categoryHeader = document.createElement('h3');
            categoryHeader.textContent = categoryName;
            categoryHeader.className = 'collapsible-trigger'; // Add 'collapsible-trigger'
            categoryContainer.appendChild(categoryHeader);

            const allGenerationsContainer = document.createElement('div');
            allGenerationsContainer.className = 'collapsible-content';

            const generations = this.streamerCategories[categoryName];
            for (const generationName in generations) {
                const generationContainer = document.createElement('div');
                generationContainer.className = 'streamer-generation';

                const generationHeader = document.createElement('h4');
                generationHeader.textContent = generationName;
                generationContainer.appendChild(generationHeader);

                const memberContainer = document.createElement('div');
                memberContainer.className = 'streamer-members';

                const members = Array.from(generations[generationName]).sort();
                members.forEach(streamerName => {
                    const button = document.createElement('button');
                    button.textContent = streamerName;
                    button.addEventListener('click', () => this.filterByStreamer(streamerName));
                    memberContainer.appendChild(button);
                });

                generationContainer.appendChild(memberContainer);
                allGenerationsContainer.appendChild(generationContainer);
            }
            categoryContainer.appendChild(allGenerationsContainer);
            streamerButtonsContainer.appendChild(categoryContainer);

            categoryHeader.addEventListener('click', () => {
                categoryContainer.classList.toggle('open');
                if (categoryContainer.classList.contains('open')) {
                    allGenerationsContainer.style.maxHeight = allGenerationsContainer.scrollHeight + 'px';
                } else {
                    allGenerationsContainer.style.maxHeight = null;
                }
            });
        }

        filterContainer.appendChild(streamerButtonsContainer);

        selectAllButton.addEventListener('click', () => {
            if (new URLSearchParams(window.location.search).has('videoId')) {
                goToHomeAndResetHistory();
            } else {
                this.selectAllStreamers();
            }
        });

        if (this.selectedStreamers.size > 0) {
            const buttons = document.querySelectorAll('#filter-buttons button');
            buttons.forEach(button => {
                if (this.selectedStreamers.has(button.textContent)) {
                    button.classList.add('active');
                } else {
                    button.classList.remove('active');
                }
            });
        } else {
            this.selectAllStreamers(false);
        }
        this.updateSelectAllStreamersButtonState();
    }

    filterByStreamer(clickedStreamer) {
        const params = new URLSearchParams(window.location.search);
        const videoIdPresent = params.has('videoId');

        document.getElementById('filter-container').style.display = 'block';
        document.querySelector('.filter-group.collapsible').style.display = 'block';

        if (videoIdPresent) {
            params.delete('videoId');
            this.selectedStreamers.clear();
            this.selectedStreamers.add(clickedStreamer);
            params.set('streamer', clickedStreamer);
            const newUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
            history.replaceState(null, '', newUrl);
            this.setupStreamerFilter();
            this.setupTagFilter();
        } else if (this.selectedStreamers.has(clickedStreamer) && this.selectedStreamers.size === 1) {
            this.selectAllStreamers();
        } else {
            this.selectedStreamers.clear();
            this.selectedStreamers.add(clickedStreamer);
            params.set('streamer', clickedStreamer);
            const newUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
            history.replaceState(null, '', newUrl);
        }

        const buttons = document.querySelectorAll('#filter-buttons button');
        buttons.forEach(button => {
            button.classList.toggle('active', this.selectedStreamers.has(button.textContent));
        });

        this.updateSelectAllStreamersButtonState();
        this.updateTagFilter();
        this.filterArchives();

        const archiveGrid = document.getElementById('archive-grid');
        if (archiveGrid) {
            archiveGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        this.updateTitle();
        this.setupBackToHomeButton();
    }

    selectAllStreamers(updateHistory = true) {
        const buttons = document.querySelectorAll('#filter-buttons button');
        this.selectedStreamers = new Set(this.streamers);
        buttons.forEach(button => button.classList.add('active'));

        if (updateHistory) {
            const params = new URLSearchParams(window.location.search);
            params.delete('streamer');
            const newUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
            history.replaceState(null, '', newUrl);
        }

        this.updateTagFilter();
        this.updateTitle();
        this.updateSelectAllStreamersButtonState();
    }

    updateSelectAllStreamersButtonState() {
        const selectAllButton = document.getElementById('select-all');
        if (selectAllButton) {
            selectAllButton.disabled = this.selectedStreamers.size === this.streamers.size;
        }
    }

    setupTagFilter() {
        const filterContainer = document.getElementById('tag-filter-buttons');
        const selectAllButton = document.getElementById('select-all-tags');
        const toggleButton = document.querySelector('.toggle-tags');
        const collapsibleContainer = document.querySelector('.filter-group.collapsible');

        if (!filterContainer || !selectAllButton || !toggleButton || !collapsibleContainer) {
            const errorMsg = this.lang === 'en' ? 'Required DOM elements for tag filter not found:' : 'タグフィルターに必要なDOM要素が見つかりません:';
            console.error(errorMsg, {
                filterContainer: !!filterContainer,
                selectAllButton: !!selectAllButton,
                toggleButton: !!toggleButton,
                collapsibleContainer: !!collapsibleContainer
            });
            return;
        }

        selectAllButton.addEventListener('click', () => this.selectAllTags());

        const toggleTags = () => {
            const isOpen = collapsibleContainer.classList.toggle('open');
            toggleButton.textContent = isOpen
                ? (this.lang === 'en' ? 'Close' : '閉じる')
                : (this.lang === 'en' ? 'Show More' : 'もっと見る');

            const content = collapsibleContainer.querySelector('.collapsible-content');
            if (isOpen) {
                content.style.maxHeight = content.scrollHeight + 'px';
            } else {
                content.style.maxHeight = null;
                collapsibleContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        toggleButton.addEventListener('click', toggleTags);
        collapsibleContainer.querySelector('.collapsible-trigger').addEventListener('click', toggleTags);

        this.updateTagFilter();
    }

    updateTagFilter() {
        const filterContainer = document.getElementById('tag-filter-buttons');
        filterContainer.innerHTML = '';

        const relevantArchives = this.archiveData.filter(archive => this.selectedStreamers.has(archive.streamer));
        const visibleTags = new Set();
        relevantArchives.forEach(archive => {
            const tags = this.lang === 'en' && archive.tags_en ? archive.tags_en : archive.tags;
            if (tags) {
                tags.forEach(tag => visibleTags.add(tag));
            }
        });

        this.tags = visibleTags;

        Array.from(this.tags).sort().forEach(tag => {
            const button = document.createElement('button');
            button.textContent = tag;
            button.addEventListener('click', () => this.filterByTag(tag));
            filterContainer.appendChild(button);
        });

        this.checkContentOverflow(filterContainer);
        this.selectAllTags();
    }

    setupSiteDescriptionToggle() {
        const siteDescription = document.getElementById('site-description');
        const toggleButton = siteDescription.querySelector('.toggle-site-description');
        const collapsibleContent = siteDescription.querySelector('.collapsible-content');
        const collapsibleTrigger = siteDescription.querySelector('.collapsible-trigger');

        if (!siteDescription || !toggleButton || !collapsibleContent || !collapsibleTrigger) {
            return;
        }

        this.checkContentOverflow(collapsibleContent);

        const toggleDescription = () => {
            const isOpen = siteDescription.classList.toggle('open');
            toggleButton.textContent = isOpen
                ? (this.lang === 'en' ? 'Close' : '閉じる')
                : (this.lang === 'en' ? 'Read More' : 'もっと見る');

            if (isOpen) {
                collapsibleContent.style.maxHeight = collapsibleContent.scrollHeight + 'px';
                collapsibleContent.classList.remove('has-overflow');
            } else {
                collapsibleContent.style.maxHeight = null;
                this.checkContentOverflow(collapsibleContent);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };

        toggleButton.addEventListener('click', toggleDescription);
        collapsibleTrigger.addEventListener('click', toggleDescription);
    }

    selectAllTags() {
        const buttons = document.querySelectorAll('#tag-filter-buttons button');
        this.selectedTags = new Set(this.tags);
        buttons.forEach(button => button.classList.add('active'));
        this.filterArchives();
        this.updateSelectAllTagsButtonState();
    }

    updateSelectAllTagsButtonState() {
        const selectAllButton = document.getElementById('select-all-tags');
        if (selectAllButton) {
            selectAllButton.disabled = this.selectedTags.size === this.tags.size;
        }
    }

    checkContentOverflow(content) {
        if (!content) return;

        const check = () => {
            const isOverflowing = content.scrollHeight > content.clientHeight;
            if (isOverflowing) {
                content.classList.add('has-overflow');
            } else {
                content.classList.remove('has-overflow');
            }
        };
        setTimeout(check, 50);
    }

    filterByTag(clickedTag) {
        if (new URLSearchParams(window.location.search).has('videoId')) {
            history.replaceState(null, '', window.location.pathname);
            document.getElementById('filter-container').style.display = 'block';
            document.querySelector('.filter-group.collapsible').style.display = 'block';
            this.setupStreamerFilter();
            this.setupTagFilter();
            this.setupBackToHomeButton();
        }

        if (this.selectedTags.has(clickedTag) && this.selectedTags.size === 1) {
            return;
        }

        this.selectedTags.clear();
        this.selectedTags.add(clickedTag);

        const buttons = document.querySelectorAll('#tag-filter-buttons button');
        buttons.forEach(button => {
            button.classList.toggle('active', button.textContent === clickedTag);
        });

        this.filterArchives();
        this.updateSelectAllTagsButtonState();
    }

    filterArchives() {
        this.currentPage = 1;
        this.filteredData = this.archiveData.filter(archive => {
            const streamerMatch = this.selectedStreamers.has(archive.streamer);
            const tags = this.lang === 'en' && archive.tags_en ? archive.tags_en : archive.tags;
            const tagMatch = this.selectedTags.size === 0 ||
                (tags && tags.some(tag => this.selectedTags.has(tag)));
            return streamerMatch && tagMatch;
        });
        this.renderArchives(true);
    }

    renderArchives(clearGrid = true) {
        const grid = document.getElementById('archive-grid');
        const loadMoreButton = document.getElementById('load-more');

        if (!grid) {
            const errorMsg = this.lang === 'en' ? 'Archive grid element not found. Element ID: archive-grid' : 'アーカイブグリッド要素が見つかりません。要素ID: archive-grid';
            console.error(errorMsg);
            return;
        }

        if (clearGrid) {
            grid.innerHTML = '';
        }

        const sortedData = [...this.filteredData].sort((a, b) => {
            const order = this.sortOrders[this.currentSortKey] === 'asc' ? 1 : -1;
            const key = this.currentSortKey;

            let valA, valB;

            if (key === 'date') {
                valA = new Date(a[key]).getTime();
                valB = new Date(b[key]).getTime();
            } else {
                valA = a[key];
                valB = b[key];
            }

            if (valA < valB) {
                return -1 * order;
            }
            if (valA > valB) {
                return 1 * order;
            }
            return 0;
        });

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const archivesToRender = sortedData.slice(startIndex, endIndex);

        archivesToRender.forEach(archive => {
            const card = this.createArchiveCard(archive);
            grid.appendChild(card);
        });

        if (loadMoreButton) {
            if (endIndex < this.filteredData.length && !new URLSearchParams(window.location.search).has('videoId')) {
                loadMoreButton.style.display = 'block';
            } else {
                loadMoreButton.style.display = 'none';
            }
        }
    }

    createArchiveCard(archive) {
        const card = document.createElement('div');
        card.className = 'archive-card';

        const img = document.createElement('img');
        img.src = archive.thumbnailUrl;
        img.alt = archive.title;
        img.classList.add('clickable-thumbnail');
        img.title = this.lang === 'en' ? 'Go to details page' : '詳細ページへ';
        img.addEventListener('click', () => {
            const detailPage = this.lang === 'en' ? 'en/' : '';
            const url = `${getBasePath()}${detailPage}pages/${archive.videoId}.html`;
            history.pushState({ page: 'detail' }, '', url);
            window.location.href = url;
        });

        const bookmarkIcon = document.createElement('button');
        bookmarkIcon.className = 'bookmark-icon';
        bookmarkIcon.innerHTML = '🔖';
        bookmarkIcon.setAttribute('data-video-id', archive.videoId);

        // 新しいブックマーク機能を使用
        const isBookmarked = this.bookmarkManager ?
            this.bookmarkManager.hasBookmark(archive.videoId) :
            this.watchLaterList.has(archive.videoId);

        if (isBookmarked) {
            bookmarkIcon.classList.add('active');
        }

        // アクセシビリティ対応
        if (this.bookmarkAccessibility) {
            this.bookmarkAccessibility.setupBookmarkIcon(
                bookmarkIcon,
                archive.videoId,
                isBookmarked,
                archive
            );
        } else {
            // フォールバック
            bookmarkIcon.title = isBookmarked
                ? (this.lang === 'en' ? 'Remove from bookmarks' : 'ブックマークから削除')
                : (this.lang === 'en' ? 'Add to bookmarks' : 'ブックマークに追加');
        }

        bookmarkIcon.addEventListener('click', async (e) => {
            e.stopPropagation();

            if (this.bookmarkManager) {
                // 即座にUIを更新（楽観的更新）
                const currentState = this.bookmarkManager.hasBookmark(archive.videoId);
                const newState = !currentState;

                // アイコンの状態を即座に変更
                if (newState) {
                    bookmarkIcon.classList.add('active');
                } else {
                    bookmarkIcon.classList.remove('active');
                }

                // アクセシビリティ状態も即座に更新
                if (this.bookmarkAccessibility) {
                    this.bookmarkAccessibility.updateBookmarkIconState(
                        bookmarkIcon,
                        newState,
                        archive
                    );
                }

                // 実際のブックマーク操作を実行
                try {
                    const success = await this.bookmarkManager.toggleBookmark(archive.videoId);

                    if (success) {
                        // 成功時の通知表示（1回のみ）
                        if (this.notificationSystem) {
                            this.notificationSystem.showBookmarkSuccess(newState, archive);
                        }

                        // アクセシビリティアナウンス
                        if (this.bookmarkAccessibility) {
                            this.bookmarkAccessibility.announceBookmarkAction(newState, archive);
                        }

                        // ブックマークモードの場合はリストを更新
                        if (this.isWatchLaterMode) {
                            this.updateWatchLaterMode();
                        }
                    } else {
                        // 失敗した場合は元に戻す
                        if (currentState) {
                            bookmarkIcon.classList.add('active');
                        } else {
                            bookmarkIcon.classList.remove('active');
                        }

                        if (this.bookmarkAccessibility) {
                            this.bookmarkAccessibility.updateBookmarkIconState(
                                bookmarkIcon,
                                currentState,
                                archive
                            );
                        }
                    }
                } catch (error) {
                    // エラーの場合も元に戻す
                    if (currentState) {
                        bookmarkIcon.classList.add('active');
                    } else {
                        bookmarkIcon.classList.remove('active');
                    }

                    if (this.bookmarkAccessibility) {
                        this.bookmarkAccessibility.updateBookmarkIconState(
                            bookmarkIcon,
                            currentState,
                            archive
                        );
                    }

                    // エラー通知
                    if (this.notificationSystem) {
                        this.notificationSystem.showBookmarkError(error.message, archive);
                    }

                    console.error('ブックマーク操作エラー:', error);
                }
            } else {
                // フォールバック: 基本的なブックマーク機能
                console.warn('BookmarkManagerが利用できません');
            }
        });

        const content = this._createCardContent(archive);
        const footer = this._createCardFooter(archive);

        card.appendChild(bookmarkIcon);
        card.appendChild(img);
        card.appendChild(content);
        card.appendChild(footer);

        return card;
    }

    _createCardContent(archive) {
        const content = document.createElement('div');
        content.className = 'archive-card-content';

        const title = document.createElement('h2');
        title.textContent = archive.title;
        title.classList.add('clickable-title');
        title.title = this.lang === 'en' ? 'Go to details page' : '詳細ページへ';
        title.addEventListener('click', () => {
            const detailPage = this.lang === 'en' ? 'en/' : '';
            const url = `${getBasePath()}${detailPage}pages/${archive.videoId}.html`;
            history.pushState({ page: 'detail' }, '', url);
            window.location.href = url;
        });

        const dateElement = document.createElement('p');
        dateElement.className = 'archive-date';
        dateElement.textContent = `📅 ${this.lang === 'en' ? 'Stream Date' : '配信日時'}: ${new Date(archive.date).toISOString().slice(0, 19).replace('T', ' ')}`;

        const duration = document.createElement('p');
        duration.className = 'duration';
        duration.textContent = `⏱️ ${this.lang === 'en' ? 'Duration' : '配信時間'}: ${formatDuration(archive.duration, this.lang)}`;

        const viewCount = document.createElement('p');
        viewCount.className = 'view-count';
        viewCount.textContent = `👀 ${this.lang === 'en' ? 'Views' : '再生数'}: ${formatNumber(archive.viewCount)}`;

        const likeCount = document.createElement('p');
        likeCount.className = 'like-count';
        likeCount.textContent = `👍 ${this.lang === 'en' ? 'Likes' : '高評価数'}: ${formatNumber(archive.likeCount)}`;

        const streamer = document.createElement('p');
        streamer.className = 'streamer-name clickable-streamer';
        streamer.textContent = `🎭 ${this.lang === 'en' ? 'Streamer' : '配信者'}: ${archive.streamer}`;
        streamer.title = this.lang === 'en' ? `Filter by streamer: "${archive.streamer}"` : `配信者「${archive.streamer}」で絞り込む`;
        streamer.addEventListener('click', () => this.filterByStreamer(archive.streamer));

        const overview = document.createElement('div');
        overview.className = 'overview';

        const overviewData = this.lang === 'en' && archive.overview_en ? archive.overview_en : archive.overview;

        const overviewSummary = document.createElement('p');
        overviewSummary.className = 'overview-summary';
        overviewSummary.textContent = overviewData.summary;

        const overviewMood = document.createElement('p');
        overviewMood.className = 'overview-mood';
        overviewMood.textContent = `🎨 ${this.lang === 'en' ? 'Mood' : '配信の雰囲気'}：${overviewData.mood}`;

        overview.appendChild(dateElement);
        overview.appendChild(duration);
        overview.appendChild(viewCount);
        overview.appendChild(likeCount);
        overview.appendChild(overviewSummary);
        overview.appendChild(overviewMood);

        const highlightsSection = this._createCollapsibleSection(archive, 'highlights');
        const tagsSection = this._createCollapsibleSection(archive, 'tags');

        content.appendChild(title);
        content.appendChild(streamer);
        content.appendChild(overview);
        content.appendChild(highlightsSection);
        content.appendChild(tagsSection);

        return content;
    }

    _createCardFooter(archive) {
        const footer = document.createElement('div');
        footer.className = 'card-footer';

        const detailPage = this.lang === 'en' ? 'en/' : '';
        const detailUrl = `${getBasePath()}${detailPage}pages/${archive.videoId}.html`;
        const shareUrl = `${location.origin}${detailUrl}`;

        const copyButton = document.createElement('button');
        copyButton.textContent = this.lang === 'en' ? 'Copy' : 'コピー';
        copyButton.className = 'copy-button';
        copyButton.title = this.lang === 'en' ? 'Copy title and URL' : 'タイトルとURLをコピー';
        copyButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const copyText = `${archive.title}
${shareUrl}`;
            navigator.clipboard.writeText(copyText).then(() => {
                copyButton.textContent = this.lang === 'en' ? 'Copied!' : 'コピー完了！';
                setTimeout(() => {
                    copyButton.textContent = this.lang === 'en' ? 'Copy' : 'コピー';
                }, 2000);
            }).catch(err => {
                console.error('クリップボードへのコピーに失敗しました:', err);
                copyButton.textContent = this.lang === 'en' ? 'Failed' : '失敗';
                setTimeout(() => {
                    copyButton.textContent = this.lang === 'en' ? 'Copy' : 'コピー';
                }, 2000);
            });
        });

        const shareButton = document.createElement('button');
        shareButton.textContent = this.lang === 'en' ? 'Share on 𝕏' : '𝕏で共有';
        shareButton.className = 'share-button';
        shareButton.title = this.lang === 'en' ? 'Share this stream on 𝕏' : 'この配信を𝕏で共有する';
        shareButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const shareText = `${archive.title}
${shareUrl}`;
            const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
            window.open(twitterIntentUrl, '_blank');
        });

        const detailButton = document.createElement('button');
        detailButton.textContent = this.lang === 'en' ? 'Details' : '詳細';
        detailButton.className = 'detail-button';
        detailButton.title = this.lang === 'en' ? 'View details page' : '詳細ページを表示';
        detailButton.addEventListener('click', (e) => {
            e.stopPropagation();
            history.pushState({ page: 'detail' }, '', detailUrl);
            window.location.href = detailUrl;
        });
        footer.appendChild(detailButton);

        const rightButtons = document.createElement('div');
        rightButtons.className = 'card-footer-right-buttons';
        rightButtons.appendChild(copyButton);
        rightButtons.appendChild(shareButton);
        footer.appendChild(rightButtons);

        return footer;
    }

    _createCollapsibleSection(archive, type) {
        const container = document.createElement('div');
        container.className = `${type}-container collapsible`;

        const title = document.createElement('strong');
        title.textContent = type === 'highlights'
            ? (this.lang === 'en' ? '✨ Highlights:' : '✨ 見どころ：')
            : (this.lang === 'en' ? '🏷️ Tags:' : '🏷️ タグ：');
        title.className = 'collapsible-trigger';

        const listContainer = document.createElement('div');
        listContainer.className = `${type}-list collapsible-content`;

        if (type === 'highlights') {
            const highlights = this.lang === 'en' && archive.highlights_en ? archive.highlights_en : archive.highlights;
            if (highlights) {
                highlights.forEach(highlight => {
                    const li = document.createElement('li');
                    li.classList.add('clickable-highlight', 'highlight-item');
                    li.title = this.lang === 'en' ? `Click to play from ${highlight.timestamp}` : `クリックして ${highlight.timestamp} から再生`;
                    li.addEventListener('click', (e) => {
                        const seconds = timestampToSeconds(highlight.timestamp);
                        const detailPage = this.lang === 'en' ? 'en/' : '';
                        const url = `${getBasePath()}${detailPage}pages/${archive.videoId}.html?t=${seconds}`;
                        history.pushState({ page: 'detail' }, '', url);
                        window.location.href = url;
                    });

                    const h3 = document.createElement('h3');
                    h3.textContent = highlight.title;

                    const timestamp = document.createElement('span');
                    timestamp.className = 'timestamp';
                    timestamp.textContent = highlight.timestamp;

                    const highlightType = document.createElement('span');
                    highlightType.className = `highlight-type ${highlight.type}`;
                    highlightType.textContent = highlight.type;

                    const description = document.createElement('p');
                    description.textContent = highlight.description;

                    li.appendChild(h3);
                    li.appendChild(timestamp);
                    li.appendChild(document.createTextNode(' / '));
                    li.appendChild(highlightType);
                    li.appendChild(description);
                    listContainer.appendChild(li);
                });
            }
        } else { // tags
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'tags';
            const tags = this.lang === 'en' && archive.tags_en ? archive.tags_en : archive.tags;
            if (tags) {
                tags.forEach(tag => {
                    const tagSpan = document.createElement('span');
                    tagSpan.className = 'tag clickable-tag';
                    tagSpan.textContent = `#${tag}`;
                    tagSpan.title = this.lang === 'en' ? `Filter by tag: "${tag}"` : `タグ「${tag}」で絞り込む`;
                    tagSpan.addEventListener('click', () => this.filterByTag(tag));
                    tagsContainer.appendChild(tagSpan);
                });
            }
            listContainer.appendChild(tagsContainer);
        }

        const toggleButton = document.createElement('button');
        toggleButton.className = `toggle-${type}`;
        toggleButton.textContent = this.lang === 'en' ? 'Show More' : 'もっと見る';

        const toggleSection = () => {
            const isOpen = container.classList.toggle('open');
            toggleButton.textContent = isOpen
                ? (this.lang === 'en' ? 'Close' : '閉じる')
                : (this.lang === 'en' ? 'Show More' : 'もっと見る');

            if (isOpen) {
                listContainer.style.maxHeight = listContainer.scrollHeight + 'px';
                listContainer.classList.remove('has-overflow');
            } else {
                listContainer.style.maxHeight = null;
                this.checkContentOverflow(listContainer);
                if (type === 'highlights') {
                    container.closest('.archive-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        };

        title.addEventListener('click', toggleSection);
        toggleButton.addEventListener('click', toggleSection);

        container.appendChild(title);
        container.appendChild(listContainer);
        container.appendChild(toggleButton);

        this.checkContentOverflow(listContainer);

        return container;
    }

    setupHintDialog() {
        const hintIcon = document.getElementById('streamer-filter-hint');
        const dialog = document.getElementById('hint-dialog');
        const closeButton = document.getElementById('close-dialog');

        if (hintIcon && dialog && closeButton) {
            hintIcon.addEventListener('click', () => {
                dialog.style.display = 'flex';
            });

            closeButton.addEventListener('click', () => {
                dialog.style.display = 'none';
            });

            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    dialog.style.display = 'none';
                }
            });
        }

        const watchLaterDialog = document.getElementById('watch-later-dialog');
        const closeWatchLaterButton = document.getElementById('close-watch-later-dialog');

        if (watchLaterDialog && closeWatchLaterButton) {
            closeWatchLaterButton.addEventListener('click', () => {
                watchLaterDialog.style.display = 'none';
            });

            watchLaterDialog.addEventListener('click', (e) => {
                if (e.target === watchLaterDialog) {
                    watchLaterDialog.style.display = 'none';
                }
            });
        }
    }

    setupServiceWorker() {
        // 通知の許可をリクエスト
        this.requestNotificationPermission();

        if ('serviceWorker' in navigator) {
            const basePath = getBasePath();

            const showUpdateSnackbar = (worker) => {
                const snackbar = document.getElementById('update-snackbar');
                const updateButton = document.getElementById('update-button');
                if (snackbar && updateButton) {
                    snackbar.classList.add('show');
                    updateButton.onclick = () => {
                        worker.postMessage({ type: 'SKIP_WAITING' });
                    };
                }
            };

            const checkForUpdate = () => {
                navigator.serviceWorker.ready.then(registration => {
                    registration.update();
                }).catch(error => {
                    console.error('Error during service worker update check:', error);
                });
            };

            navigator.serviceWorker.register(`${basePath}service-worker.js`, { scope: basePath })
                .then(registration => {
                    if (registration.waiting) {
                        showUpdateSnackbar(registration.waiting);
                    }
                    registration.onupdatefound = () => {
                        const installingWorker = registration.installing;
                        if (installingWorker) {
                            installingWorker.onstatechange = () => {
                                if (installingWorker.state === 'installed') {
                                    if (navigator.serviceWorker.controller) {
                                        showUpdateSnackbar(installingWorker);
                                    }
                                }
                            };
                        }
                    };
                })
                .catch(error => {
                    console.error('Error during service worker registration:', error);
                });

            let refreshing;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                window.location.reload();
                refreshing = true;
            });

            // PWAの表示状態が変わった際の処理
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    // PWAがフォアグラウンドになった際に更新をチェックする
                    checkForUpdate();
                } else if (document.visibilityState === 'hidden') {
                    // PWAがバックグラウンドに移動した際に、待機中の更新があれば適用する
                    navigator.serviceWorker.getRegistration().then(registration => {
                        if (registration && registration.waiting) {
                            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                        }
                    });
                }
            });
        }
    }

    requestNotificationPermission() {
        if ('Notification' in window) {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    console.log('Notification permission granted.');
                } else {
                    console.log('Notification permission denied.');
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ArchiveManager();
});
