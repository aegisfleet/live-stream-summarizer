/**
 * ブックマーク機能を管理するクラス
 * 既存のwatchLater機能を拡張し、より使いやすいブックマーク機能を提供
 */
class BookmarkManager {
    constructor(archiveManager) {
        this.archiveManager = archiveManager;
        this.bookmarks = new Set();
        this.isFirstVisit = this.checkFirstVisit();
        this.lang = document.documentElement.lang || 'ja';

        // イベントリスナーの管理
        this.eventListeners = new Map();

        this.init();
    }

    /**
     * 初期化処理
     */
    async init() {
        try {
            await this.loadBookmarks();
            this.setupEventListeners();

            if (this.isFirstVisit) {
                this.showFirstVisitGuidance();
            }
        } catch (error) {
            console.error('BookmarkManager初期化エラー:', error);
            this.handleInitError(error);
        }
    }

    /**
     * ブックマークデータの読み込み
     */
    async loadBookmarks() {
        try {
            const savedData = localStorage.getItem('holoSummary_bookmarks');

            if (savedData) {
                const data = JSON.parse(savedData);

                // バージョン確認とマイグレーション
                if (data.version === '2.0') {
                    // 新形式のデータ
                    this.bookmarks = new Set(data.bookmarks.map(b => b.videoId));
                } else {
                    // 既存のwatchLaterListからの移行
                    await this.migrateFromLegacyData(data);
                }
            } else {
                // 既存のwatchLaterListをチェック
                const legacyData = localStorage.getItem('watchLaterList');
                if (legacyData) {
                    await this.migrateFromLegacyData(JSON.parse(legacyData));
                }
            }

            // 無効なブックマークのクリーンアップ
            this.cleanupInvalidBookmarks();

        } catch (error) {
            console.error('ブックマークデータ読み込みエラー:', error);
            this.bookmarks = new Set();
        }
    }

    /**
     * 既存のwatchLaterListからの移行処理
     */
    async migrateFromLegacyData(legacyData) {
        try {
            const videoIds = Array.isArray(legacyData) ? legacyData : Array.from(legacyData);

            const bookmarkData = {
                version: '2.0',
                bookmarks: videoIds.map(videoId => ({
                    videoId,
                    addedAt: new Date().toISOString(),
                    title: null,
                    streamer: null,
                    thumbnailUrl: null
                })),
                settings: {
                    sortOrder: 'dateAdded',
                    showNotifications: true,
                    enableHaptics: true
                }
            };

            // 新形式で保存
            localStorage.setItem('holoSummary_bookmarks', JSON.stringify(bookmarkData));

            // 古いデータを削除
            localStorage.removeItem('watchLaterList');

            this.bookmarks = new Set(videoIds);

            console.log(`${videoIds.length}件のブックマークを移行しました`);

        } catch (error) {
            console.error('データ移行エラー:', error);
            throw error;
        }
    }

    /**
     * 無効なブックマークのクリーンアップ
     */
    cleanupInvalidBookmarks() {
        if (!this.archiveManager || !this.archiveManager.archiveData) {
            return;
        }

        const validVideoIds = new Set(
            this.archiveManager.archiveData.map(archive => archive.videoId)
        );

        const originalSize = this.bookmarks.size;

        for (const videoId of this.bookmarks) {
            if (!validVideoIds.has(videoId)) {
                this.bookmarks.delete(videoId);
            }
        }

        if (this.bookmarks.size !== originalSize) {
            this.saveBookmarks();
            console.log(`${originalSize - this.bookmarks.size}件の無効なブックマークを削除しました`);
        }
    }

    /**
     * ブックマークの追加
     */
    async addBookmark(videoId) {
        try {
            if (this.bookmarks.has(videoId)) {
                return false; // 既に追加済み
            }

            this.bookmarks.add(videoId);
            await this.saveBookmarks();

            // UI更新
            this.updateBookmarkIcon(videoId, true);
            this.updateBookmarkCounter();

            // 通知は呼び出し元で処理するため、ここでは表示しない

            // アニメーション効果
            this.animateBookmarkIcon(videoId, 'added');

            return true;

        } catch (error) {
            console.error('ブックマーク追加エラー:', error);
            this.showNotification(
                this.lang === 'en' ? 'Failed to add bookmark' : 'ブックマークの追加に失敗しました',
                'error'
            );
            return false;
        }
    }

    /**
     * ブックマークの削除
     */
    async removeBookmark(videoId) {
        try {
            if (!this.bookmarks.has(videoId)) {
                return false; // 存在しない
            }

            this.bookmarks.delete(videoId);
            await this.saveBookmarks();

            // UI更新を確実に実行
            setTimeout(() => {
                this.updateBookmarkIcon(videoId, false);
                this.updateBookmarkCounter();
            }, 0);

            // 通知は呼び出し元で処理するため、ここでは表示しない

            // アニメーション効果
            this.animateBookmarkIcon(videoId, 'removed');

            return true;

        } catch (error) {
            console.error('ブックマーク削除エラー:', error);
            this.showNotification(
                this.lang === 'en' ? 'Failed to remove bookmark' : 'ブックマークの削除に失敗しました',
                'error'
            );
            return false;
        }
    }

    /**
     * ブックマークの切り替え
     */
    async toggleBookmark(videoId) {
        if (this.hasBookmark(videoId)) {
            return await this.removeBookmark(videoId);
        } else {
            return await this.addBookmark(videoId);
        }
    }

    /**
     * ブックマークの存在確認
     */
    hasBookmark(videoId) {
        return this.bookmarks.has(videoId);
    }

    /**
     * ブックマーク数の取得
     */
    getBookmarkCount() {
        return this.bookmarks.size;
    }

    /**
     * 全ブックマークの取得
     */
    getBookmarks() {
        return Array.from(this.bookmarks);
    }

    /**
     * ブックマーク一覧の表示
     */
    showBookmarkList() {
        const modal = document.getElementById('bookmark-modal');
        const listContainer = document.getElementById('bookmark-list');
        const emptyState = document.getElementById('bookmark-empty');

        if (!modal || !listContainer || !emptyState) {
            console.error('ブックマークモーダル要素が見つかりません');
            return;
        }

        // モーダルを表示
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);

        // ブックマークリストを更新
        this.updateBookmarkList();

        // イベントリスナーを設定
        this.setupModalEventListeners();
    }

    /**
     * ブックマーク一覧の非表示
     */
    hideBookmarkList() {
        const modal = document.getElementById('bookmark-modal');
        if (!modal) return;

        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }

    /**
     * ブックマークリストの更新
     */
    updateBookmarkList() {
        const listContainer = document.getElementById('bookmark-list');
        const emptyState = document.getElementById('bookmark-empty');

        if (!listContainer || !emptyState) return;

        // ブックマークが空の場合
        if (this.bookmarks.size === 0) {
            listContainer.style.display = 'none';
            emptyState.style.display = 'flex';
            return;
        }

        // ブックマークリストを表示
        listContainer.style.display = 'block';
        emptyState.style.display = 'none';

        // ブックマークアイテムを生成
        const bookmarkItems = this.getBookmarksWithData();
        this.renderBookmarkItems(bookmarkItems);
    }

    /**
     * ブックマークデータと共にブックマークを取得
     */
    getBookmarksWithData() {
        const bookmarks = [];

        for (const videoId of this.bookmarks) {
            const archive = this.getArchiveData(videoId);
            if (archive) {
                bookmarks.push({
                    videoId,
                    title: archive.title,
                    streamer: archive.streamer,
                    thumbnailUrl: archive.thumbnailUrl,
                    publishedAt: archive.date, // 実際のデータフィールドは'date'
                    viewCount: archive.viewCount || 0, // 再生数
                    likeCount: archive.likeCount || 0, // 高評価数
                    addedAt: new Date() // 実際の追加日時は後で実装
                });
            }
        }

        return bookmarks;
    }

    /**
     * ブックマークアイテムのレンダリング
     */
    renderBookmarkItems(bookmarks) {
        const listContainer = document.getElementById('bookmark-list');
        if (!listContainer) return;

        // ソート処理
        const sortOrder = this.getSortOrder();
        const sortedBookmarks = this.sortBookmarks(bookmarks, sortOrder);

        // HTMLを生成
        listContainer.innerHTML = sortedBookmarks.map((bookmark, index) =>
            this.createBookmarkItemHTML(bookmark, index)
        ).join('');

        // アニメーション効果
        this.animateBookmarkItems();
    }

    /**
     * ブックマークアイテムのHTML生成
     */
    createBookmarkItemHTML(bookmark, index) {
        // 日付の安全な処理
        let publishedDate = '';
        try {
            if (bookmark.publishedAt) {
                const date = new Date(bookmark.publishedAt);
                if (!isNaN(date.getTime())) {
                    publishedDate = date.toLocaleDateString(this.lang === 'en' ? 'en-US' : 'ja-JP');
                } else {
                    publishedDate = this.lang === 'en' ? 'Unknown date' : '日付不明';
                }
            } else {
                publishedDate = this.lang === 'en' ? 'Unknown date' : '日付不明';
            }
        } catch (error) {
            console.warn('日付処理エラー:', error);
            publishedDate = this.lang === 'en' ? 'Unknown date' : '日付不明';
        }

        const thumbnailUrl = bookmark.thumbnailUrl || 'images/no-thumbnail.png';

        // 再生数と高評価数のフォーマット
        const viewCount = this.formatNumber(bookmark.viewCount || 0);
        const likeCount = this.formatNumber(bookmark.likeCount || 0);

        return `
            <div class="bookmark-item" data-video-id="${bookmark.videoId}" data-index="${index}">
                <img class="bookmark-item-thumbnail" 
                     src="${thumbnailUrl}" 
                     alt="${bookmark.title}"
                     loading="lazy">
                <div class="bookmark-item-info">
                    <div class="bookmark-item-title">${bookmark.title}</div>
                    <div class="bookmark-item-meta">
                        <div class="bookmark-item-streamer">${bookmark.streamer}</div>
                        <div class="bookmark-item-date-stats">
                            <span class="bookmark-item-date">${publishedDate}</span>
                            <div class="bookmark-item-stats">
                                <span class="bookmark-item-views">👁 ${viewCount}</span>
                                <span class="bookmark-item-likes">👍 ${likeCount}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="bookmark-item-actions">
                    <button class="bookmark-remove-btn" 
                            data-video-id="${bookmark.videoId}"
                            aria-label="${this.lang === 'en' ? 'Remove bookmark' : 'ブックマークを削除'}">
                        ${this.lang === 'en' ? 'Remove' : '削除'}
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * ブックマークのソート
     */
    sortBookmarks(bookmarks, sortOrder) {
        return bookmarks.sort((a, b) => {
            switch (sortOrder) {
                case 'datePublished':
                    // 日付の安全な比較
                    const dateA = new Date(a.publishedAt);
                    const dateB = new Date(b.publishedAt);

                    // 無効な日付の場合は最後に配置
                    if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
                    if (isNaN(dateA.getTime())) return 1;
                    if (isNaN(dateB.getTime())) return -1;

                    return dateB - dateA;

                case 'viewCount':
                    // 再生数の安全な比較（降順）
                    const viewA = parseInt(a.viewCount) || 0;
                    const viewB = parseInt(b.viewCount) || 0;
                    return viewB - viewA;

                case 'likeCount':
                    // 高評価数の安全な比較（降順）
                    const likeA = parseInt(a.likeCount) || 0;
                    const likeB = parseInt(b.likeCount) || 0;
                    return likeB - likeA;

                case 'streamer':
                    return a.streamer.localeCompare(b.streamer);

                default:
                    // デフォルトは配信日順
                    const defaultDateA = new Date(a.publishedAt);
                    const defaultDateB = new Date(b.publishedAt);

                    if (isNaN(defaultDateA.getTime()) && isNaN(defaultDateB.getTime())) return 0;
                    if (isNaN(defaultDateA.getTime())) return 1;
                    if (isNaN(defaultDateB.getTime())) return -1;

                    return defaultDateB - defaultDateA;
            }
        });
    }

    /**
     * ソート順の取得
     */
    getSortOrder() {
        const sortSelect = document.getElementById('bookmark-sort');
        return sortSelect ? sortSelect.value : 'datePublished';
    }

    /**
     * ブックマークアイテムのアニメーション
     */
    animateBookmarkItems() {
        const items = document.querySelectorAll('.bookmark-item');
        items.forEach((item, index) => {
            setTimeout(() => {
                item.classList.add('slide-in');
            }, index * 50);
        });
    }

    /**
     * モーダルのイベントリスナー設定
     */
    setupModalEventListeners() {
        // 閉じるボタン
        const closeBtn = document.getElementById('bookmark-close');
        if (closeBtn) {
            closeBtn.onclick = () => this.hideBookmarkList();
        }

        // バックドロップクリック
        const backdrop = document.querySelector('.bookmark-modal-backdrop');
        if (backdrop) {
            backdrop.onclick = () => this.hideBookmarkList();
        }

        // ESCキーで閉じる
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.hideBookmarkList();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // ソート変更
        const sortSelect = document.getElementById('bookmark-sort');
        if (sortSelect) {
            sortSelect.onchange = () => this.updateBookmarkList();
        }

        // すべて削除ボタン
        const clearAllBtn = document.getElementById('bookmark-clear-all');
        if (clearAllBtn) {
            clearAllBtn.onclick = () => this.showClearAllConfirmation();
        }

        // アイテムクリック（詳細ページへ遷移）
        const listContainer = document.getElementById('bookmark-list');
        if (listContainer) {
            listContainer.onclick = (e) => this.handleBookmarkItemClick(e);
        }
    }

    /**
     * ブックマークアイテムのクリック処理
     */
    handleBookmarkItemClick(e) {
        // 削除ボタンのクリックは除外
        if (e.target.classList.contains('bookmark-remove-btn')) {
            this.handleRemoveButtonClick(e);
            return;
        }

        // アイテム全体のクリック
        const item = e.target.closest('.bookmark-item');
        if (item) {
            const videoId = item.dataset.videoId;
            if (videoId) {
                // 詳細ページに遷移
                this.navigateToDetail(videoId);
            }
        }
    }

    /**
     * 削除ボタンのクリック処理
     */
    async handleRemoveButtonClick(e) {
        e.stopPropagation();

        const videoId = e.target.dataset.videoId;
        if (!videoId) return;

        // 確認ダイアログ
        const confirmed = confirm(
            this.lang === 'en'
                ? 'Are you sure you want to remove this bookmark?'
                : 'このブックマークを削除しますか？'
        );

        if (confirmed) {
            const success = await this.removeBookmark(videoId);
            if (success) {
                // リストを更新
                this.updateBookmarkList();

                // メインページのアイコンを確実に更新
                this.updateBookmarkIcon(videoId, false);
                this.updateBookmarkCounter();

                // 通知表示
                this.showNotification(
                    this.lang === 'en' ? 'Bookmark removed' : 'ブックマークを削除しました',
                    'success'
                );
            }
        }
    }

    /**
     * 詳細ページへの遷移
     */
    navigateToDetail(videoId) {
        // モーダルを閉じる
        this.hideBookmarkList();

        // PWAを意識した詳細ページへの遷移（main.jsと同じ方式）
        const detailPage = this.lang === 'en' ? 'en/' : '';
        const basePath = this.getBasePath();
        const detailUrl = `${basePath}${detailPage}pages/${videoId}.html`;

        // ブラウザ履歴を更新してからページ遷移
        history.pushState({ page: 'detail' }, '', detailUrl);
        window.location.href = detailUrl;
    }

    /**
     * ベースパスの取得（utils.jsのgetBasePathと同じ実装）
     */
    getBasePath() {
        const repoName = 'live-stream-summarizer';
        if (location.hostname === 'github.io' || location.hostname.endsWith('.github.io')) {
            return `/${repoName}/`;
        }
        return '/';
    }

    /**
     * 数値のフォーマット（カンマ区切り）
     */
    formatNumber(num) {
        if (num === undefined || num === null || num === 0) return '0';
        return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
    }

    /**
     * 全削除確認ダイアログ
     */
    showClearAllConfirmation() {
        const confirmed = confirm(
            this.lang === 'en'
                ? 'Are you sure you want to remove all bookmarks? This action cannot be undone.'
                : 'すべてのブックマークを削除しますか？この操作は取り消せません。'
        );

        if (confirmed) {
            this.clearAllBookmarks();
        }
    }

    /**
     * 全ブックマークの削除
     */
    async clearAllBookmarks() {
        try {
            this.bookmarks.clear();
            await this.saveBookmarks();

            // UI更新
            this.updateBookmarkList();
            this.updateBookmarkCounter();

            // 全てのアイコンを更新
            document.querySelectorAll('.bookmark-icon.active').forEach(icon => {
                icon.classList.remove('active');
                icon.setAttribute('aria-pressed', 'false');
                icon.setAttribute('aria-label',
                    this.lang === 'en' ? 'Add to bookmarks' : 'ブックマークに追加'
                );
            });

            // 通知表示
            this.showNotification(
                this.lang === 'en' ? 'All bookmarks removed' : 'すべてのブックマークを削除しました',
                'success'
            );

        } catch (error) {
            console.error('全削除エラー:', error);
            this.showNotification(
                this.lang === 'en' ? 'Failed to remove all bookmarks' : 'ブックマークの削除に失敗しました',
                'error'
            );
        }
    }

    /**
     * ブックマークデータの保存
     */
    async saveBookmarks() {
        try {
            const bookmarkData = {
                version: '2.0',
                bookmarks: Array.from(this.bookmarks).map(videoId => {
                    const archive = this.getArchiveData(videoId);
                    return {
                        videoId,
                        addedAt: new Date().toISOString(),
                        title: archive?.title || null,
                        streamer: archive?.streamer || null,
                        thumbnailUrl: archive?.thumbnailUrl || null
                    };
                }),
                settings: {
                    sortOrder: 'dateAdded',
                    showNotifications: true,
                    enableHaptics: true
                },
                timestamp: Date.now()
            };

            localStorage.setItem('holoSummary_bookmarks', JSON.stringify(bookmarkData));

            // バックアップ作成
            this.createBackup(bookmarkData);

        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                this.handleStorageQuotaExceeded();
            } else {
                throw error;
            }
        }
    }

    /**
     * アーカイブデータの取得
     */
    getArchiveData(videoId) {
        if (!this.archiveManager || !this.archiveManager.archiveData) {
            return null;
        }

        return this.archiveManager.archiveData.find(archive => archive.videoId === videoId);
    }

    /**
     * バックアップの作成
     */
    createBackup(data) {
        try {
            localStorage.setItem('holoSummary_bookmarks_backup', JSON.stringify(data));
        } catch (error) {
            console.warn('バックアップ作成に失敗:', error);
        }
    }

    /**
     * ストレージ容量不足の処理
     */
    handleStorageQuotaExceeded() {
        try {
            // 古いデータを削除して容量を確保
            this.cleanupOldData();

            // 再試行
            this.saveBookmarks();

        } catch (retryError) {
            // セッションストレージにフォールバック
            this.saveToSessionStorage();

            this.showNotification(
                this.lang === 'en'
                    ? 'Storage full. Bookmarks saved for this session only.'
                    : 'ストレージ容量不足のため、セッション中のみ保存されます',
                'warning'
            );
        }
    }

    /**
     * セッションストレージへの保存
     */
    saveToSessionStorage() {
        try {
            const data = JSON.stringify(Array.from(this.bookmarks));
            sessionStorage.setItem('holoSummary_bookmarks_session', data);
        } catch (error) {
            console.error('セッションストレージ保存エラー:', error);
        }
    }

    /**
     * 古いデータのクリーンアップ
     */
    cleanupOldData() {
        // 不要なキーを削除
        const keysToRemove = [
            'holoSummary_bookmarks_backup',
            'watchLaterList' // 既に移行済みの場合
        ];

        keysToRemove.forEach(key => {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.warn(`キー削除失敗: ${key}`, error);
            }
        });
    }

    /**
     * ブックマークアイコンの更新
     */
    updateBookmarkIcon(videoId, isActive) {
        // より広範囲でアイコンを検索
        const selectors = [
            `[data-video-id="${videoId}"] .bookmark-icon`,
            `.bookmark-icon[data-video-id="${videoId}"]`,
            `#video-${videoId} .bookmark-icon`,
            `.video-item[data-video-id="${videoId}"] .bookmark-icon`
        ];

        let icons = [];
        selectors.forEach(selector => {
            const found = document.querySelectorAll(selector);
            icons = icons.concat(Array.from(found));
        });

        // 重複を除去
        icons = [...new Set(icons)];

        console.log(`Updating ${icons.length} bookmark icons for video ${videoId} to ${isActive ? 'active' : 'inactive'}`);

        icons.forEach(icon => {
            if (isActive) {
                icon.classList.add('active');
                icon.setAttribute('aria-pressed', 'true');
                icon.setAttribute('aria-label',
                    this.lang === 'en' ? 'Remove from bookmarks' : 'ブックマークから削除'
                );
            } else {
                icon.classList.remove('active');
                icon.setAttribute('aria-pressed', 'false');
                icon.setAttribute('aria-label',
                    this.lang === 'en' ? 'Add to bookmarks' : 'ブックマークに追加'
                );
            }
        });
    }

    /**
     * ブックマークカウンターの更新
     */
    updateBookmarkCounter() {
        // ArchiveManagerのメソッドを使用
        if (this.archiveManager && this.archiveManager.updateBookmarkButtonDisplay) {
            this.archiveManager.updateBookmarkButtonDisplay();
        } else {
            // フォールバック
            const counter = document.querySelector('.bookmark-count');
            const mainButton = document.getElementById('watch-later');

            if (counter) {
                const count = this.getBookmarkCount();
                counter.textContent = count;
                counter.setAttribute('data-count', count);

                // アニメーション効果
                counter.classList.add('updated');
                setTimeout(() => {
                    counter.classList.remove('updated');
                }, 300);
            }

            // メインボタンの表示/非表示
            if (mainButton) {
                if (this.getBookmarkCount() > 0) {
                    mainButton.classList.add('show');
                } else {
                    mainButton.classList.remove('show');
                }
            }
        }
    }

    /**
     * アニメーション効果
     */
    animateBookmarkIcon(videoId, type) {
        const icons = document.querySelectorAll(`[data-video-id="${videoId}"] .bookmark-icon`);

        icons.forEach(icon => {
            icon.classList.add(`animate-${type}`);

            setTimeout(() => {
                icon.classList.remove(`animate-${type}`);
            }, 400);
        });
    }

    /**
     * 通知の表示
     */
    showNotification(message, type = 'info') {
        // NotificationSystemが利用可能な場合は使用
        if (this.archiveManager && this.archiveManager.notificationSystem) {
            this.archiveManager.notificationSystem.showToast(message, type);
        } else {
            // フォールバック
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * 初回訪問チェック
     */
    checkFirstVisit() {
        const hasVisited = localStorage.getItem('holoSummary_hasVisited');
        if (!hasVisited) {
            localStorage.setItem('holoSummary_hasVisited', 'true');
            return true;
        }
        return false;
    }

    /**
     * 初回訪問ガイダンス
     */
    showFirstVisitGuidance() {
        // 後でUI実装時に詳細を追加
        console.log('初回訪問ガイダンスを表示');
    }

    /**
     * イベントリスナーの設定
     */
    setupEventListeners() {
        // ページ離脱時の保存
        const beforeUnloadHandler = () => {
            this.saveBookmarks();
        };

        window.addEventListener('beforeunload', beforeUnloadHandler);
        this.eventListeners.set('beforeunload', beforeUnloadHandler);
    }

    /**
     * 初期化エラーの処理
     */
    handleInitError(error) {
        console.error('BookmarkManager初期化に失敗しました:', error);

        // フォールバック: 基本機能のみ提供
        this.bookmarks = new Set();

        this.showNotification(
            this.lang === 'en'
                ? 'Bookmark feature partially unavailable'
                : 'ブックマーク機能が一部利用できません',
            'warning'
        );
    }

    /**
     * クリーンアップ処理
     */
    destroy() {
        // イベントリスナーの削除
        this.eventListeners.forEach((handler, event) => {
            window.removeEventListener(event, handler);
        });
        this.eventListeners.clear();

        // 最終保存
        this.saveBookmarks();
    }
}

export default BookmarkManager;