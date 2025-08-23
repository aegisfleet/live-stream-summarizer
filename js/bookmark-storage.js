/**
 * ブックマークデータの永続化を管理するクラス
 * localStorage、sessionStorage、エラーハンドリングを担当
 */
class BookmarkStorage {
    constructor() {
        this.storageKey = 'holoSummary_bookmarks';
        this.backupKey = 'holoSummary_bookmarks_backup';
        this.sessionKey = 'holoSummary_bookmarks_session';
        this.legacyKey = 'watchLaterList';
        
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1秒
    }

    /**
     * ブックマークデータの保存
     * @param {Set} bookmarks - ブックマークのSet
     * @param {Object} archiveData - アーカイブデータ（メタ情報取得用）
     * @returns {Promise<boolean>} 保存成功可否
     */
    async save(bookmarks, archiveData = null) {
        const data = this.createBookmarkData(bookmarks, archiveData);
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                // メインストレージに保存
                localStorage.setItem(this.storageKey, JSON.stringify(data));
                
                // バックアップ作成
                await this.createBackup(data);
                
                return true;
                
            } catch (error) {
                console.warn(`保存試行 ${attempt}/${this.maxRetries} 失敗:`, error);
                
                if (error.name === 'QuotaExceededError') {
                    // 容量不足の場合の処理
                    const recovered = await this.handleQuotaExceeded(data, attempt);
                    if (recovered) continue;
                    
                    // 最終手段: セッションストレージ
                    if (attempt === this.maxRetries) {
                        return await this.saveToSession(bookmarks);
                    }
                }
                
                if (attempt === this.maxRetries) {
                    throw new Error(`ブックマーク保存に失敗しました: ${error.message}`);
                }
                
                // リトライ前の待機
                await this.delay(this.retryDelay * attempt);
            }
        }
        
        return false;
    }

    /**
     * ブックマークデータの読み込み
     * @returns {Promise<Object>} 読み込んだデータ
     */
    async load() {
        try {
            // メインストレージから読み込み
            const data = localStorage.getItem(this.storageKey);
            
            if (data) {
                const parsed = JSON.parse(data);
                
                // データ整合性チェック
                if (this.validateData(parsed)) {
                    return parsed;
                } else {
                    console.warn('データが破損しています。バックアップから復元を試行します。');
                    return await this.restoreFromBackup();
                }
            }
            
            // 既存のlegacyデータをチェック
            return await this.loadLegacyData();
            
        } catch (error) {
            console.error('データ読み込みエラー:', error);
            
            // バックアップから復元を試行
            try {
                return await this.restoreFromBackup();
            } catch (backupError) {
                console.error('バックアップからの復元も失敗:', backupError);
                return this.createEmptyData();
            }
        }
    }

    /**
     * ブックマークデータオブジェクトの作成
     * @param {Set} bookmarks - ブックマークのSet
     * @param {Array} archiveData - アーカイブデータ
     * @returns {Object} ブックマークデータオブジェクト
     */
    createBookmarkData(bookmarks, archiveData = null) {
        const bookmarkArray = Array.from(bookmarks).map(videoId => {
            let archive = null;
            
            if (archiveData) {
                archive = archiveData.find(item => item.videoId === videoId);
            }
            
            return {
                videoId,
                addedAt: new Date().toISOString(),
                title: archive?.title || null,
                streamer: archive?.streamer || null,
                thumbnailUrl: archive?.thumbnailUrl || null
            };
        });
        
        return {
            version: '2.0',
            bookmarks: bookmarkArray,
            settings: {
                sortOrder: 'dateAdded',
                showNotifications: true,
                enableHaptics: this.supportsHaptics()
            },
            timestamp: Date.now()
        };
    }

    /**
     * データの整合性チェック
     * @param {Object} data - チェック対象のデータ
     * @returns {boolean} データが有効かどうか
     */
    validateData(data) {
        try {
            // 基本構造チェック
            if (!data || typeof data !== 'object') return false;
            if (!data.version || !data.bookmarks || !Array.isArray(data.bookmarks)) return false;
            
            // バージョンチェック
            if (data.version !== '2.0') return false;
            
            // ブックマークデータチェック
            for (const bookmark of data.bookmarks) {
                if (!bookmark.videoId || typeof bookmark.videoId !== 'string') return false;
                if (!bookmark.addedAt || !this.isValidDate(bookmark.addedAt)) return false;
            }
            
            return true;
            
        } catch (error) {
            console.error('データ検証エラー:', error);
            return false;
        }
    }

    /**
     * 日付の有効性チェック
     * @param {string} dateString - 日付文字列
     * @returns {boolean} 有効な日付かどうか
     */
    isValidDate(dateString) {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    }

    /**
     * バックアップの作成
     * @param {Object} data - バックアップするデータ
     * @returns {Promise<boolean>} バックアップ成功可否
     */
    async createBackup(data) {
        try {
            const backupData = {
                ...data,
                backupTimestamp: Date.now()
            };
            
            localStorage.setItem(this.backupKey, JSON.stringify(backupData));
            return true;
            
        } catch (error) {
            console.warn('バックアップ作成失敗:', error);
            return false;
        }
    }

    /**
     * バックアップからの復元
     * @returns {Promise<Object>} 復元されたデータ
     */
    async restoreFromBackup() {
        try {
            const backupData = localStorage.getItem(this.backupKey);
            
            if (backupData) {
                const parsed = JSON.parse(backupData);
                
                if (this.validateData(parsed)) {
                    console.log('バックアップからデータを復元しました');
                    
                    // メインストレージに復元
                    localStorage.setItem(this.storageKey, JSON.stringify(parsed));
                    
                    return parsed;
                }
            }
            
            throw new Error('有効なバックアップが見つかりません');
            
        } catch (error) {
            console.error('バックアップ復元エラー:', error);
            throw error;
        }
    }

    /**
     * 既存のlegacyデータの読み込み
     * @returns {Promise<Object>} 移行されたデータ
     */
    async loadLegacyData() {
        try {
            const legacyData = localStorage.getItem(this.legacyKey);
            
            if (legacyData) {
                const parsed = JSON.parse(legacyData);
                const videoIds = Array.isArray(parsed) ? parsed : Array.from(parsed);
                
                console.log(`${videoIds.length}件のlegacyデータを発見しました`);
                
                // 新形式に変換
                const migratedData = {
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
                        enableHaptics: this.supportsHaptics()
                    },
                    timestamp: Date.now()
                };
                
                // 新形式で保存
                await this.save(new Set(videoIds));
                
                // 古いデータを削除
                localStorage.removeItem(this.legacyKey);
                
                console.log('legacyデータの移行が完了しました');
                
                return migratedData;
            }
            
            return this.createEmptyData();
            
        } catch (error) {
            console.error('legacyデータ読み込みエラー:', error);
            return this.createEmptyData();
        }
    }

    /**
     * 空のデータオブジェクトを作成
     * @returns {Object} 空のブックマークデータ
     */
    createEmptyData() {
        return {
            version: '2.0',
            bookmarks: [],
            settings: {
                sortOrder: 'dateAdded',
                showNotifications: true,
                enableHaptics: this.supportsHaptics()
            },
            timestamp: Date.now()
        };
    }

    /**
     * 容量不足エラーの処理
     * @param {Object} data - 保存しようとしたデータ
     * @param {number} attempt - 試行回数
     * @returns {Promise<boolean>} 回復成功可否
     */
    async handleQuotaExceeded(data, attempt) {
        try {
            console.log(`容量不足エラー - 回復試行 ${attempt}`);
            
            // 1. 不要なデータを削除
            await this.cleanupStorage();
            
            // 2. データを圧縮
            const compressedData = this.compressData(data);
            
            // 3. 再試行
            localStorage.setItem(this.storageKey, JSON.stringify(compressedData));
            
            console.log('容量不足から回復しました');
            return true;
            
        } catch (error) {
            console.warn(`容量不足回復失敗 (試行 ${attempt}):`, error);
            return false;
        }
    }

    /**
     * ストレージのクリーンアップ
     * @returns {Promise<void>}
     */
    async cleanupStorage() {
        const keysToRemove = [
            'holoSummary_old_bookmarks',
            'holoSummary_temp_data',
            'watchLaterList_backup'
        ];
        
        keysToRemove.forEach(key => {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.warn(`キー削除失敗: ${key}`, error);
            }
        });
        
        // 古いバックアップを削除（7日以上前）
        try {
            const backup = localStorage.getItem(this.backupKey);
            if (backup) {
                const backupData = JSON.parse(backup);
                const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                
                if (backupData.backupTimestamp && backupData.backupTimestamp < weekAgo) {
                    localStorage.removeItem(this.backupKey);
                    console.log('古いバックアップを削除しました');
                }
            }
        } catch (error) {
            console.warn('バックアップクリーンアップ失敗:', error);
        }
    }

    /**
     * データの圧縮
     * @param {Object} data - 圧縮対象のデータ
     * @returns {Object} 圧縮されたデータ
     */
    compressData(data) {
        // メタ情報を削除してサイズを削減
        const compressed = {
            version: data.version,
            bookmarks: data.bookmarks.map(bookmark => ({
                videoId: bookmark.videoId,
                addedAt: bookmark.addedAt
                // title, streamer, thumbnailUrlは削除
            })),
            settings: data.settings,
            timestamp: data.timestamp
        };
        
        return compressed;
    }

    /**
     * セッションストレージへの保存
     * @param {Set} bookmarks - ブックマークのSet
     * @returns {Promise<boolean>} 保存成功可否
     */
    async saveToSession(bookmarks) {
        try {
            const data = Array.from(bookmarks);
            sessionStorage.setItem(this.sessionKey, JSON.stringify(data));
            
            console.log('セッションストレージに保存しました');
            return true;
            
        } catch (error) {
            console.error('セッションストレージ保存エラー:', error);
            return false;
        }
    }

    /**
     * セッションストレージからの読み込み
     * @returns {Promise<Array>} ブックマークの配列
     */
    async loadFromSession() {
        try {
            const data = sessionStorage.getItem(this.sessionKey);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('セッションストレージ読み込みエラー:', error);
            return [];
        }
    }

    /**
     * 無効なブックマークのクリーンアップ
     * @param {Set} bookmarks - 現在のブックマーク
     * @param {Array} validVideoIds - 有効な動画IDの配列
     * @returns {Promise<Set>} クリーンアップ後のブックマーク
     */
    async cleanup(bookmarks, validVideoIds) {
        const validIds = new Set(validVideoIds);
        const originalSize = bookmarks.size;
        
        const cleanedBookmarks = new Set();
        
        for (const videoId of bookmarks) {
            if (validIds.has(videoId)) {
                cleanedBookmarks.add(videoId);
            }
        }
        
        const removedCount = originalSize - cleanedBookmarks.size;
        
        if (removedCount > 0) {
            console.log(`${removedCount}件の無効なブックマークを削除しました`);
            await this.save(cleanedBookmarks);
        }
        
        return cleanedBookmarks;
    }

    /**
     * ハプティックフィードバック対応チェック
     * @returns {boolean} ハプティックフィードバックが利用可能かどうか
     */
    supportsHaptics() {
        return 'vibrate' in navigator && /Mobi|Android/i.test(navigator.userAgent);
    }

    /**
     * 遅延処理
     * @param {number} ms - 遅延時間（ミリ秒）
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * ストレージ使用量の取得
     * @returns {Object} ストレージ使用量情報
     */
    getStorageInfo() {
        try {
            const used = new Blob(Object.values(localStorage)).size;
            const quota = 5 * 1024 * 1024; // 5MB (概算)
            
            return {
                used,
                quota,
                available: quota - used,
                usagePercent: Math.round((used / quota) * 100)
            };
        } catch (error) {
            console.warn('ストレージ情報取得エラー:', error);
            return {
                used: 0,
                quota: 0,
                available: 0,
                usagePercent: 0
            };
        }
    }

    /**
     * データのエクスポート
     * @returns {Promise<string>} エクスポートされたJSONデータ
     */
    async exportData() {
        try {
            const data = await this.load();
            return JSON.stringify(data, null, 2);
        } catch (error) {
            console.error('データエクスポートエラー:', error);
            throw error;
        }
    }

    /**
     * データのインポート
     * @param {string} jsonData - インポートするJSONデータ
     * @returns {Promise<boolean>} インポート成功可否
     */
    async importData(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            
            if (!this.validateData(data)) {
                throw new Error('無効なデータ形式です');
            }
            
            // バックアップを作成
            const currentData = await this.load();
            await this.createBackup(currentData);
            
            // 新しいデータを保存
            localStorage.setItem(this.storageKey, JSON.stringify(data));
            
            console.log('データのインポートが完了しました');
            return true;
            
        } catch (error) {
            console.error('データインポートエラー:', error);
            throw error;
        }
    }
}

export default BookmarkStorage;