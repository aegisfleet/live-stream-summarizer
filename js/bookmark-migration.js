/**
 * ブックマークデータの移行を管理するクラス
 * 既存のwatchLaterListから新形式への移行を担当
 */
class BookmarkMigration {
    constructor() {
        this.legacyKeys = [
            'watchLaterList',
            'holoSummary_watchLater',
            'holo_summary_bookmarks' // 過去のバージョンがあった場合
        ];
        
        this.newStorageKey = 'holoSummary_bookmarks';
        this.migrationLogKey = 'holoSummary_migration_log';
    }

    /**
     * 移行が必要かどうかをチェック
     * @returns {Promise<Object>} 移行情報
     */
    async checkMigrationNeeded() {
        try {
            // 新形式のデータが既に存在するかチェック
            const newData = localStorage.getItem(this.newStorageKey);
            if (newData) {
                const parsed = JSON.parse(newData);
                if (parsed.version === '2.0') {
                    return {
                        needed: false,
                        reason: 'Already migrated to v2.0'
                    };
                }
            }
            
            // 既存のlegacyデータをチェック
            const legacyData = this.findLegacyData();
            
            if (legacyData.found) {
                return {
                    needed: true,
                    legacyKey: legacyData.key,
                    dataCount: legacyData.count,
                    dataType: legacyData.type
                };
            }
            
            return {
                needed: false,
                reason: 'No legacy data found'
            };
            
        } catch (error) {
            console.error('移行チェックエラー:', error);
            return {
                needed: false,
                reason: 'Error during migration check',
                error: error.message
            };
        }
    }

    /**
     * 既存のlegacyデータを検索
     * @returns {Object} 発見されたlegacyデータの情報
     */
    findLegacyData() {
        for (const key of this.legacyKeys) {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    
                    // データ形式を判定
                    let videoIds = [];
                    let dataType = 'unknown';
                    
                    if (Array.isArray(parsed)) {
                        videoIds = parsed;
                        dataType = 'array';
                    } else if (parsed && typeof parsed === 'object') {
                        if (parsed.constructor === Object && Object.keys(parsed).length === 0) {
                            // 空のオブジェクト
                            continue;
                        } else if (parsed.bookmarks && Array.isArray(parsed.bookmarks)) {
                            // 古いバージョンの構造化データ
                            videoIds = parsed.bookmarks.map(b => b.videoId || b);
                            dataType = 'structured';
                        } else {
                            // Set形式のデータ（JSON.stringify(Array.from(Set))）
                            try {
                                videoIds = Array.from(parsed);
                                dataType = 'set';
                            } catch (e) {
                                console.warn(`不明なデータ形式: ${key}`, parsed);
                                continue;
                            }
                        }
                    } else if (typeof parsed === 'string') {
                        // 単一の動画ID
                        videoIds = [parsed];
                        dataType = 'string';
                    }
                    
                    // 有効な動画IDのみをフィルタ
                    const validVideoIds = videoIds.filter(id => 
                        typeof id === 'string' && id.length > 0
                    );
                    
                    if (validVideoIds.length > 0) {
                        return {
                            found: true,
                            key,
                            count: validVideoIds.length,
                            type: dataType,
                            videoIds: validVideoIds
                        };
                    }
                }
            } catch (error) {
                console.warn(`legacyデータ解析エラー (${key}):`, error);
                continue;
            }
        }
        
        return { found: false };
    }

    /**
     * データ移行の実行
     * @param {Array} archiveData - 現在のアーカイブデータ（メタ情報補完用）
     * @returns {Promise<Object>} 移行結果
     */
    async migrate(archiveData = null) {
        try {
            const migrationInfo = await this.checkMigrationNeeded();
            
            if (!migrationInfo.needed) {
                return {
                    success: true,
                    migrated: false,
                    reason: migrationInfo.reason
                };
            }
            
            console.log(`データ移行を開始: ${migrationInfo.legacyKey} (${migrationInfo.dataCount}件)`);
            
            // legacyデータを取得
            const legacyData = this.findLegacyData();
            if (!legacyData.found) {
                throw new Error('移行対象のlegacyデータが見つかりません');
            }
            
            // 新形式のデータを作成
            const newData = this.createNewFormatData(legacyData.videoIds, archiveData);
            
            // バックアップを作成
            await this.createMigrationBackup(legacyData);
            
            // 新形式で保存
            localStorage.setItem(this.newStorageKey, JSON.stringify(newData));
            
            // 移行ログを記録
            await this.logMigration(legacyData, newData);
            
            // 古いデータを削除
            await this.cleanupLegacyData(legacyData.key);
            
            console.log(`データ移行完了: ${legacyData.videoIds.length}件のブックマークを移行しました`);
            
            return {
                success: true,
                migrated: true,
                migratedCount: legacyData.videoIds.length,
                legacyKey: legacyData.key,
                dataType: legacyData.type
            };
            
        } catch (error) {
            console.error('データ移行エラー:', error);
            
            // エラー時は移行を中断し、既存データを保持
            return {
                success: false,
                migrated: false,
                error: error.message
            };
        }
    }

    /**
     * 新形式のデータオブジェクトを作成
     * @param {Array} videoIds - 動画IDの配列
     * @param {Array} archiveData - アーカイブデータ
     * @returns {Object} 新形式のブックマークデータ
     */
    createNewFormatData(videoIds, archiveData = null) {
        const bookmarks = videoIds.map(videoId => {
            let archive = null;
            
            // アーカイブデータからメタ情報を取得
            if (archiveData && Array.isArray(archiveData)) {
                archive = archiveData.find(item => item.videoId === videoId);
            }
            
            return {
                videoId,
                addedAt: new Date().toISOString(),
                title: archive?.title || null,
                streamer: archive?.streamer || null,
                thumbnailUrl: archive?.thumbnailUrl || null,
                // 移行フラグ
                migrated: true
            };
        });
        
        return {
            version: '2.0',
            bookmarks,
            settings: {
                sortOrder: 'dateAdded',
                showNotifications: true,
                enableHaptics: this.supportsHaptics()
            },
            migrationInfo: {
                migratedAt: new Date().toISOString(),
                originalCount: videoIds.length,
                migratedCount: bookmarks.length
            },
            timestamp: Date.now()
        };
    }

    /**
     * 移行前のバックアップを作成
     * @param {Object} legacyData - legacyデータ情報
     * @returns {Promise<void>}
     */
    async createMigrationBackup(legacyData) {
        try {
            const backupKey = `holoSummary_migration_backup_${Date.now()}`;
            const backupData = {
                originalKey: legacyData.key,
                originalData: localStorage.getItem(legacyData.key),
                dataType: legacyData.type,
                videoIds: legacyData.videoIds,
                backupTimestamp: Date.now()
            };
            
            localStorage.setItem(backupKey, JSON.stringify(backupData));
            console.log(`移行バックアップを作成: ${backupKey}`);
            
        } catch (error) {
            console.warn('移行バックアップ作成失敗:', error);
            // バックアップ失敗は移行を中断しない
        }
    }

    /**
     * 移行ログの記録
     * @param {Object} legacyData - legacyデータ情報
     * @param {Object} newData - 新形式データ
     * @returns {Promise<void>}
     */
    async logMigration(legacyData, newData) {
        try {
            const migrationLog = {
                timestamp: Date.now(),
                date: new Date().toISOString(),
                legacyKey: legacyData.key,
                legacyDataType: legacyData.type,
                originalCount: legacyData.videoIds.length,
                migratedCount: newData.bookmarks.length,
                newVersion: newData.version,
                success: true
            };
            
            // 既存のログを取得
            const existingLog = localStorage.getItem(this.migrationLogKey);
            const logs = existingLog ? JSON.parse(existingLog) : [];
            
            // 新しいログを追加
            logs.push(migrationLog);
            
            // 最新の5件のみ保持
            const recentLogs = logs.slice(-5);
            
            localStorage.setItem(this.migrationLogKey, JSON.stringify(recentLogs));
            
        } catch (error) {
            console.warn('移行ログ記録失敗:', error);
        }
    }

    /**
     * legacyデータのクリーンアップ
     * @param {string} legacyKey - 削除するlegacyキー
     * @returns {Promise<void>}
     */
    async cleanupLegacyData(legacyKey) {
        try {
            // 段階的削除（安全のため）
            const data = localStorage.getItem(legacyKey);
            if (data) {
                // 一時的に別キーに移動
                const tempKey = `${legacyKey}_temp_${Date.now()}`;
                localStorage.setItem(tempKey, data);
                
                // 元のキーを削除
                localStorage.removeItem(legacyKey);
                
                // 少し待ってから一時キーも削除
                setTimeout(() => {
                    try {
                        localStorage.removeItem(tempKey);
                    } catch (error) {
                        console.warn('一時キー削除失敗:', error);
                    }
                }, 5000);
                
                console.log(`legacyデータを削除: ${legacyKey}`);
            }
            
        } catch (error) {
            console.warn('legacyデータ削除失敗:', error);
        }
    }

    /**
     * 移行の巻き戻し
     * @returns {Promise<Object>} 巻き戻し結果
     */
    async rollback() {
        try {
            // 最新の移行バックアップを検索
            const backupKey = this.findLatestMigrationBackup();
            
            if (!backupKey) {
                throw new Error('移行バックアップが見つかりません');
            }
            
            const backupData = JSON.parse(localStorage.getItem(backupKey));
            
            // 元のデータを復元
            localStorage.setItem(backupData.originalKey, backupData.originalData);
            
            // 新形式データを削除
            localStorage.removeItem(this.newStorageKey);
            
            // バックアップを削除
            localStorage.removeItem(backupKey);
            
            console.log('データ移行を巻き戻しました');
            
            return {
                success: true,
                restoredKey: backupData.originalKey,
                restoredCount: backupData.videoIds.length
            };
            
        } catch (error) {
            console.error('移行巻き戻しエラー:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 最新の移行バックアップキーを検索
     * @returns {string|null} バックアップキー
     */
    findLatestMigrationBackup() {
        const backupKeys = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('holoSummary_migration_backup_')) {
                backupKeys.push(key);
            }
        }
        
        if (backupKeys.length === 0) {
            return null;
        }
        
        // タイムスタンプでソートして最新を取得
        backupKeys.sort((a, b) => {
            const timestampA = parseInt(a.split('_').pop());
            const timestampB = parseInt(b.split('_').pop());
            return timestampB - timestampA;
        });
        
        return backupKeys[0];
    }

    /**
     * 移行履歴の取得
     * @returns {Array} 移行履歴
     */
    getMigrationHistory() {
        try {
            const log = localStorage.getItem(this.migrationLogKey);
            return log ? JSON.parse(log) : [];
        } catch (error) {
            console.error('移行履歴取得エラー:', error);
            return [];
        }
    }

    /**
     * データ整合性の検証
     * @param {Array} archiveData - 現在のアーカイブデータ
     * @returns {Promise<Object>} 検証結果
     */
    async validateMigration(archiveData = null) {
        try {
            const newData = localStorage.getItem(this.newStorageKey);
            if (!newData) {
                return {
                    valid: false,
                    reason: 'New format data not found'
                };
            }
            
            const parsed = JSON.parse(newData);
            
            // 基本構造チェック
            if (parsed.version !== '2.0' || !Array.isArray(parsed.bookmarks)) {
                return {
                    valid: false,
                    reason: 'Invalid data structure'
                };
            }
            
            // ブックマークデータの検証
            const invalidBookmarks = [];
            
            for (const bookmark of parsed.bookmarks) {
                if (!bookmark.videoId || typeof bookmark.videoId !== 'string') {
                    invalidBookmarks.push(bookmark);
                } else if (!bookmark.addedAt || !this.isValidDate(bookmark.addedAt)) {
                    invalidBookmarks.push(bookmark);
                }
            }
            
            // アーカイブデータとの整合性チェック
            let orphanedBookmarks = [];
            if (archiveData && Array.isArray(archiveData)) {
                const validVideoIds = new Set(archiveData.map(a => a.videoId));
                orphanedBookmarks = parsed.bookmarks.filter(b => !validVideoIds.has(b.videoId));
            }
            
            return {
                valid: invalidBookmarks.length === 0,
                totalBookmarks: parsed.bookmarks.length,
                invalidBookmarks: invalidBookmarks.length,
                orphanedBookmarks: orphanedBookmarks.length,
                migrationInfo: parsed.migrationInfo || null
            };
            
        } catch (error) {
            console.error('移行検証エラー:', error);
            return {
                valid: false,
                reason: 'Validation error',
                error: error.message
            };
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
     * ハプティックフィードバック対応チェック
     * @returns {boolean} ハプティックフィードバックが利用可能かどうか
     */
    supportsHaptics() {
        return 'vibrate' in navigator && /Mobi|Android/i.test(navigator.userAgent);
    }

    /**
     * 移行統計の取得
     * @returns {Object} 移行統計情報
     */
    getMigrationStats() {
        try {
            const history = this.getMigrationHistory();
            
            if (history.length === 0) {
                return {
                    hasMigrated: false,
                    totalMigrations: 0
                };
            }
            
            const latestMigration = history[history.length - 1];
            
            return {
                hasMigrated: true,
                totalMigrations: history.length,
                latestMigration: {
                    date: latestMigration.date,
                    originalCount: latestMigration.originalCount,
                    migratedCount: latestMigration.migratedCount,
                    legacyKey: latestMigration.legacyKey
                },
                allMigrations: history
            };
            
        } catch (error) {
            console.error('移行統計取得エラー:', error);
            return {
                hasMigrated: false,
                totalMigrations: 0,
                error: error.message
            };
        }
    }
}

export default BookmarkMigration;