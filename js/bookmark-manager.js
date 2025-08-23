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
            
            // UI更新
            this.updateBookmarkIcon(videoId, false);
            this.updateBookmarkCounter();
            
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
        const icons = document.querySelectorAll(`[data-video-id="${videoId}"] .bookmark-icon`);
        
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