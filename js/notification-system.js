const VAPID_PUBLIC_KEY = 'BNwCsdDI5d5pHqITS3xxzCdtpd7feeGyu2jjEQZz1XsPw_QcoaeEGkwJd8wDd6AZNPeFsHNVilxgIkj5ovO6CO4';
const SUBSCRIBE_ENDPOINT_URL = 'https://holosumm-pusher.aegisfleet.workers.dev/subscribe';

/**
 * Base64文字列をUint8Arrayに変換
 * @param {string} base64String
 * @returns {Uint8Array}
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}


/**
 * 通知システムを管理するクラス
 * トースト通知、フィードバック、ハプティック効果、Push通知を担当
 */
class NotificationSystem {
    constructor() {
        this.lang = document.documentElement.lang || 'ja';
        this.activeToasts = new Map();
        this.toastContainer = null;
        this.maxToasts = 5;
        this.defaultDuration = 2500;
        this.isSubscribed = false;
        this.swRegistration = null;

        this.init();
    }

    /**
     * 初期化処理
     */
    init() {
        this.createToastContainer();
        this.setupGlobalStyles();
        this.loadUserPreferences();
        this.initPushNotifications();
    }

    /**
     * トーストコンテナの作成
     */
    createToastContainer() {
        this.toastContainer = document.createElement('div');
        this.toastContainer.id = 'toast-container';
        this.toastContainer.className = 'toast-container';
        this.toastContainer.setAttribute('aria-live', 'polite');
        this.toastContainer.setAttribute('aria-atomic', 'false');
        document.body.appendChild(this.toastContainer);
    }

    /**
     * グローバルスタイルの設定
     */
    setupGlobalStyles() {
        if (document.getElementById('notification-styles')) return;

        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .toast-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 3000;
                display: flex;
                flex-direction: column;
                gap: 12px;
                max-width: 400px;
                pointer-events: none;
            }

            .toast {
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                padding: 16px;
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 300px;
                transform: translateX(400px);
                opacity: 1;
                transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: auto;
                border-left: 4px solid #e0e0e0;
                position: relative;
                overflow: hidden;
            }

            .toast.show {
                transform: translateX(0);
                opacity: 1;
            }

            .toast.hide {
                transform: translateX(400px);
                opacity: 0;
            }

            .toast-success {
                border-left-color: #4caf50;
                background: linear-gradient(135deg, #ffffff, #f8fff8);
            }

            .toast-error {
                border-left-color: #f44336;
                background: linear-gradient(135deg, #ffffff, #fff8f8);
            }

            .toast-warning {
                border-left-color: #ff9800;
                background: linear-gradient(135deg, #ffffff, #fffaf8);
            }

            .toast-info {
                border-left-color: #2196f3;
                background: linear-gradient(135deg, #ffffff, #f8faff);
            }

            .toast-icon {
                font-size: 24px;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                border-radius: 50%;
            }

            .toast-success .toast-icon {
                background: rgba(76, 175, 80, 0.1);
                color: #4caf50;
            }

            .toast-error .toast-icon {
                background: rgba(244, 67, 54, 0.1);
                color: #f44336;
            }

            .toast-warning .toast-icon {
                background: rgba(255, 152, 0, 0.1);
                color: #ff9800;
            }

            .toast-info .toast-icon {
                background: rgba(33, 150, 243, 0.1);
                color: #2196f3;
            }

            .toast-content {
                flex: 1;
                min-width: 0;
            }

            .toast-title {
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 4px;
                color: #333;
            }

            .toast-message {
                font-size: 14px;
                color: #666;
                line-height: 1.4;
                word-wrap: break-word;
            }

            .toast-actions {
                display: flex;
                gap: 8px;
                margin-top: 8px;
            }

            .toast-button {
                background: none;
                border: 1px solid #ddd;
                border-radius: 6px;
                padding: 4px 12px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .toast-button:hover {
                background: #f5f5f5;
            }

            .toast-button.primary {
                background: #007bff;
                color: white;
                border-color: #007bff;
            }

            .toast-button.primary:hover {
                background: #0056b3;
            }

            .toast-close {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: #999;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: all 0.2s ease;
                flex-shrink: 0;
            }

            .toast-close:hover {
                background: rgba(0, 0, 0, 0.1);
                color: #666;
            }

            .toast-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 3px;
                background: rgba(0, 0, 0, 0.1);
                transition: width linear;
            }

            .toast-success .toast-progress {
                background: #4caf50;
            }

            .toast-error .toast-progress {
                background: #f44336;
            }

            .toast-warning .toast-progress {
                background: #ff9800;
            }

            .toast-info .toast-progress {
                background: #2196f3;
            }

            /* モバイル対応 */
            @media (max-width: 768px) {
                .toast-container {
                    bottom: 10px;
                    right: 10px;
                    left: 10px;
                    max-width: none;
                }

                .toast {
                    min-width: auto;
                    transform: translateY(100px);
                    opacity: 1;
                }

                .toast.show {
                    transform: translateY(0);
                    opacity: 1;
                }

                .toast.hide {
                    transform: translateY(100px);
                    opacity: 0;
                }
            }

            /* 動きを減らす設定への対応 */
            @media (prefers-reduced-motion: reduce) {
                .toast {
                    transition: opacity 0.2s ease;
                    transform: none;
                }

                .toast.show {
                    opacity: 1;
                }

                .toast.hide {
                    opacity: 0;
                }
            }

            /* ハイコントラストモード対応 */
            @media (prefers-contrast: high) {
                .toast {
                    border: 2px solid #000;
                    background: #fff;
                }

                .toast-title,
                .toast-message {
                    color: #000;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * ユーザー設定の読み込み
     */
    loadUserPreferences() {
        try {
            const prefs = localStorage.getItem('holoSummary_notification_prefs');
            if (prefs) {
                this.preferences = JSON.parse(prefs);
            } else {
                this.preferences = {
                    showNotifications: true,
                    enableHaptics: this.supportsHaptics(),
                    enableSounds: false,
                    duration: this.defaultDuration
                };
                this.saveUserPreferences();
            }
        } catch (error) {
            console.warn('通知設定の読み込みに失敗:', error);
            this.preferences = {
                showNotifications: true,
                enableHaptics: false,
                enableSounds: false,
                duration: this.defaultDuration
            };
        }
    }

    /**
     * ユーザー設定の保存
     */
    saveUserPreferences() {
        try {
            localStorage.setItem('holoSummary_notification_prefs', JSON.stringify(this.preferences));
        } catch (error) {
            console.warn('通知設定の保存に失敗:', error);
        }
    }

    /**
     * トースト通知の表示
     * @param {string} message - メッセージ
     * @param {string} type - 通知タイプ（success, error, warning, info）
     * @param {Object} options - オプション
     * @returns {string} トーストID
     */
    showToast(message, type = 'info', options = {}) {
        if (!this.preferences.showNotifications) {
            return null;
        }

        // 重複する通知をチェック
        const duplicateToast = this.findDuplicateToast(message, type, options);
        if (duplicateToast) {
            // 既存の通知のタイマーをリセット
            this.resetToastTimer(duplicateToast.id, options.duration);
            return duplicateToast.id;
        }

        const toastId = this.generateToastId();
        const toast = this.createToastElement(toastId, message, type, options);
        
        // 最大数を超える場合は古いトーストを削除
        this.enforceMaxToasts();
        
        // コンテナに追加
        this.toastContainer.appendChild(toast);
        this.activeToasts.set(toastId, toast);
        
        // アニメーション開始
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        // 自動削除タイマー
        const duration = options.duration !== undefined ? options.duration : this.preferences.duration;
        if (duration > 0) {
            this.startAutoHideTimer(toastId, duration);
        }
        
        // ハプティックフィードバック
        if (this.preferences.enableHaptics && (type === 'success' || type === 'error')) {
            this.triggerHapticFeedback(type);
        }
        
        // 音声フィードバック
        if (this.preferences.enableSounds) {
            this.playNotificationSound(type);
        }
        
        return toastId;
    }

    /**
     * トースト要素の作成
     * @param {string} toastId - トーストID
     * @param {string} message - メッセージ
     * @param {string} type - 通知タイプ
     * @param {Object} options - オプション
     * @returns {HTMLElement} トースト要素
     */
    createToastElement(toastId, message, type, options) {
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
        
        // アイコン
        const icon = document.createElement('div');
        icon.className = 'toast-icon';
        icon.innerHTML = this.getTypeIcon(type);
        
        // コンテンツ
        const content = document.createElement('div');
        content.className = 'toast-content';
        
        if (options.title) {
            const title = document.createElement('div');
            title.className = 'toast-title';
            title.textContent = options.title;
            content.appendChild(title);
        }
        
        const messageEl = document.createElement('div');
        messageEl.className = 'toast-message';
        messageEl.textContent = message;
        content.appendChild(messageEl);
        
        // アクションボタン
        if (options.actions && options.actions.length > 0) {
            const actionsEl = document.createElement('div');
            actionsEl.className = 'toast-actions';
            
            options.actions.forEach(action => {
                const button = document.createElement('button');
                button.className = `toast-button ${action.primary ? 'primary' : ''}`;
                button.textContent = action.text;
                button.addEventListener('click', () => {
                    if (action.handler) action.handler();
                    this.hideToast(toastId);
                });
                actionsEl.appendChild(button);
            });
            
            content.appendChild(actionsEl);
        }
        
        // 閉じるボタン
        const closeButton = document.createElement('button');
        closeButton.className = 'toast-close';
        closeButton.innerHTML = '×';
        closeButton.setAttribute('aria-label', this.lang === 'en' ? 'Close notification' : '通知を閉じる');
        closeButton.addEventListener('click', () => this.hideToast(toastId));
        
        // プログレスバー
        const progress = document.createElement('div');
        progress.className = 'toast-progress';
        progress.style.width = '100%';
        
        toast.appendChild(icon);
        toast.appendChild(content);
        toast.appendChild(closeButton);
        toast.appendChild(progress);
        
        return toast;
    }

    /**
     * タイプ別アイコンの取得
     * @param {string} type - 通知タイプ
     * @returns {string} アイコンHTML
     */
    getTypeIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }

    /**
     * 自動非表示タイマーの開始
     * @param {string} toastId - トーストID
     * @param {number} duration - 表示時間（ミリ秒）
     */
    startAutoHideTimer(toastId, duration) {
        const toast = this.activeToasts.get(toastId);
        if (!toast) return;
        
        // 既存のタイマーをクリア
        if (toast.hideTimer) {
            clearTimeout(toast.hideTimer);
        }
        
        const progress = toast.querySelector('.toast-progress');
        
        // プログレスバーのアニメーション
        if (progress) {
            progress.style.transition = `width ${duration}ms linear`;
            progress.style.width = '0%';
        }
        
        // 自動非表示タイマーを設定
        toast.hideTimer = setTimeout(() => {
            this.hideToast(toastId);
        }, duration);
    }

    /**
     * 重複する通知を検索
     * @param {string} message - メッセージ
     * @param {string} type - 通知タイプ
     * @param {Object} options - オプション
     * @returns {Object|null} 重複する通知の情報
     */
    findDuplicateToast(message, type, options) {
        for (const [toastId, toast] of this.activeToasts) {
            const toastMessage = toast.querySelector('.toast-message')?.textContent;
            const toastTitle = toast.querySelector('.toast-title')?.textContent;
            const toastType = Array.from(toast.classList).find(cls => cls.startsWith('toast-'))?.replace('toast-', '');
            
            if (toastMessage === message && 
                toastType === type && 
                toastTitle === options.title) {
                return { id: toastId, element: toast };
            }
        }
        return null;
    }

    /**
     * 通知のタイマーをリセット
     * @param {string} toastId - トーストID
     * @param {number} duration - 新しい表示時間
     */
    resetToastTimer(toastId, duration) {
        const toast = this.activeToasts.get(toastId);
        if (!toast) return;
        
        // 既存のタイマーをクリア
        if (toast.hideTimer) {
            clearTimeout(toast.hideTimer);
        }
        
        const progress = toast.querySelector('.toast-progress');
        
        // プログレスバーをリセット
        if (progress) {
            progress.style.transition = 'none';
            progress.style.width = '100%';
            
            // 少し待ってからアニメーション再開
            requestAnimationFrame(() => {
                const finalDuration = duration !== undefined ? duration : this.preferences.duration;
                progress.style.transition = `width ${finalDuration}ms linear`;
                progress.style.width = '0%';
                
                // 新しいタイマーを設定
                toast.hideTimer = setTimeout(() => {
                    this.hideToast(toastId);
                }, finalDuration);
            });
        }
    }

    /**
     * トーストの非表示
     * @param {string} toastId - トーストID
     */
    hideToast(toastId) {
        const toast = this.activeToasts.get(toastId);
        if (!toast) return;
        
        // 既に非表示処理中の場合はスキップ
        if (toast.classList.contains('hide')) return;
        
        // タイマーをクリア
        if (toast.hideTimer) {
            clearTimeout(toast.hideTimer);
            toast.hideTimer = null;
        }
        
        toast.classList.add('hide');
        
        // トランジション完了を待ってから削除
        const handleTransitionEnd = (event) => {
            // 対象の要素のトランジションのみ処理
            if (event.target === toast && (event.propertyName === 'transform' || event.propertyName === 'opacity')) {
                toast.removeEventListener('transitionend', handleTransitionEnd);
                
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                this.activeToasts.delete(toastId);
            }
        };
        
        toast.addEventListener('transitionend', handleTransitionEnd);
        
        // フォールバック: トランジションが発生しない場合のタイムアウト
        setTimeout(() => {
            if (this.activeToasts.has(toastId)) {
                toast.removeEventListener('transitionend', handleTransitionEnd);
                
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                this.activeToasts.delete(toastId);
            }
        }, 500); // CSSのトランジション時間より少し長めに設定
    }

    /**
     * 全てのトーストを非表示
     */
    hideAllToasts() {
        Array.from(this.activeToasts.keys()).forEach(toastId => {
            this.hideToast(toastId);
        });
    }

    /**
     * 最大トースト数の制限
     */
    enforceMaxToasts() {
        if (this.activeToasts.size >= this.maxToasts) {
            const oldestToastId = this.activeToasts.keys().next().value;
            this.hideToast(oldestToastId);
        }
    }

    /**
     * トーストIDの生成
     * @returns {string} ユニークなトーストID
     */
    generateToastId() {
        return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * ブックマーク成功通知
     * @param {boolean} added - 追加されたかどうか
     * @param {Object} archiveData - アーカイブデータ
     */
    showBookmarkSuccess(added, archiveData = null) {
        const title = archiveData?.title || 'この配信';
        const streamer = archiveData?.streamer || '';
        
        const message = added
            ? (this.lang === 'en' 
                ? `Added to bookmarks` 
                : 'ブックマークに追加しました')
            : (this.lang === 'en' 
                ? `Removed from bookmarks` 
                : 'ブックマークから削除しました');
        
        const toastTitle = this.lang === 'en' 
            ? `${title}${streamer ? ` by ${streamer}` : ''}` 
            : `${title}${streamer ? `（${streamer}）` : ''}`;
        
        this.showToast(message, 'success', {
            title: toastTitle,
            duration: 1500
        });
    }

    /**
     * ブックマークエラー通知
     * @param {string} error - エラーメッセージ
     * @param {Object} archiveData - アーカイブデータ
     */
    showBookmarkError(error, archiveData = null) {
        const title = this.lang === 'en' ? 'Bookmark Error' : 'ブックマークエラー';
        
        this.showToast(error, 'error', {
            title,
            duration: 1500,
            actions: [
                {
                    text: this.lang === 'en' ? 'Retry' : '再試行',
                    primary: true,
                    handler: () => {
                        // 再試行ロジックは呼び出し元で実装
                        const retryEvent = new CustomEvent('bookmark-retry', {
                            detail: { archiveData }
                        });
                        document.dispatchEvent(retryEvent);
                    }
                }
            ]
        });
    }

    /**
     * ストレージ警告通知
     * @param {string} message - 警告メッセージ
     */
    showStorageWarning(message) {
        const title = this.lang === 'en' ? 'Storage Warning' : 'ストレージ警告';
        
        this.showToast(message, 'warning', {
            title,
            duration: 8000,
            actions: [
                {
                    text: this.lang === 'en' ? 'Clear Old Data' : '古いデータを削除',
                    primary: true,
                    handler: () => {
                        const clearEvent = new CustomEvent('storage-cleanup');
                        document.dispatchEvent(clearEvent);
                    }
                }
            ]
        });
    }

    /**
     * ハプティックフィードバックの実行
     * @param {string} type - フィードバックタイプ
     */
    triggerHapticFeedback(type) {
        if (!this.supportsHaptics()) return;
        
        try {
            const patterns = {
                success: [50],
                error: [100, 50, 100],
                warning: [50, 50, 50],
                info: [30]
            };
            
            const pattern = patterns[type] || patterns.info;
            navigator.vibrate(pattern);
            
        } catch (error) {
            console.debug('ハプティックフィードバック失敗:', error);
        }
    }

    /**
     * 通知音の再生
     * @param {string} type - 通知タイプ
     */
    playNotificationSound(type) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // タイプ別の音程設定
            const frequencies = {
                success: [523, 659, 784], // C-E-G
                error: [392, 330], // G-E (下降)
                warning: [440, 440, 440], // A-A-A
                info: [523] // C
            };
            
            const freqs = frequencies[type] || frequencies.info;
            const duration = 0.1;
            
            freqs.forEach((freq, index) => {
                const startTime = audioContext.currentTime + (index * duration);
                
                oscillator.frequency.setValueAtTime(freq, startTime);
                gainNode.gain.setValueAtTime(0.1, startTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            });
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + (freqs.length * duration));
            
        } catch (error) {
            console.debug('通知音の再生に失敗:', error);
        }
    }

    /**
     * ハプティックフィードバック対応チェック
     * @returns {boolean} 対応しているかどうか
     */
    supportsHaptics() {
        return 'vibrate' in navigator && /Mobi|Android/i.test(navigator.userAgent);
    }

    /**
     * 設定の更新
     * @param {Object} newPreferences - 新しい設定
     */
    updatePreferences(newPreferences) {
        this.preferences = { ...this.preferences, ...newPreferences };
        this.saveUserPreferences();
    }

    /**
     * 設定の取得
     * @returns {Object} 現在の設定
     */
    getPreferences() {
        return { ...this.preferences };
    }

    /**
     * クリーンアップ処理
     */
    cleanup() {
        this.hideAllToasts();
        
        if (this.toastContainer && this.toastContainer.parentNode) {
            this.toastContainer.parentNode.removeChild(this.toastContainer);
        }
        
        const styles = document.getElementById('notification-styles');
        if (styles && styles.parentNode) {
            styles.parentNode.removeChild(styles);
        }
    }

    // --- Push Notification Methods ---

    /**
     * Push通知機能の初期化
     */
    initPushNotifications() {
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        if (!('serviceWorker' in navigator) || !('PushManager' in window) || isSafari) {
            console.warn('Push通知は、このブラウザではサポートされていません。');
            const button = document.getElementById('top-push-notification-toggle');
            if(button) button.style.display = 'none';
            return;
        }

        navigator.serviceWorker.ready.then(registration => {
            this.swRegistration = registration;
            this.updateSubscriptionStatus();
        });
    }

    /**
     * 現在の購読状態を確認し、UIを更新
     */
    async updateSubscriptionStatus() {
        const subscription = await this.swRegistration.pushManager.getSubscription();
        this.isSubscribed = !(subscription === null);
        this.updatePushToggleButton();
    }

    /**
     * Push通知の購読/購読解除をトグル
     */
    togglePushSubscription() {
        if (this.isSubscribed) {
            this.unsubscribeUserFromPush();
        } else {
            this.subscribeUserToPush();
        }
    }

    /**
     * ユーザーをPush通知に購読させる
     */
    async subscribeUserToPush() {
        try {
            const subscription = await this.swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            await this.sendSubscriptionToServer(subscription);
            this.showToast(this.lang === 'en' ? 'Push notifications enabled!' : 'Push通知を有効にしました！', 'success');
            this.isSubscribed = true;
            this.updatePushToggleButton();

        } catch (error) {
            console.error('Push購読に失敗しました:', error);
            this.showToast(this.lang === 'en' ? 'Failed to enable push notifications.' : 'Push通知を有効にできませんでした。', 'error');
            this.isSubscribed = false;
            this.updatePushToggleButton();
        }
    }

    /**
     * ユーザーのPush通知購読を解除する
     */
    async unsubscribeUserFromPush() {
        const subscription = await this.swRegistration.pushManager.getSubscription();
        if (subscription) {
            try {
                await subscription.unsubscribe();
                // TODO: サーバー側で購読情報を削除するエンドポイントも呼び出す
                this.showToast(this.lang === 'en' ? 'Push notifications disabled.' : 'Push通知を無効にしました。', 'info');
                this.isSubscribed = false;
                this.updatePushToggleButton();
            } catch (error) {
                console.error('Push購読解除に失敗しました:', error);
                this.showToast(this.lang === 'en' ? 'Failed to disable push notifications.' : 'Push通知を無効にできませんでした。', 'error');
            }
        }
    }

    /**
     * 購読情報をサーバーに送信
     * @param {PushSubscription} subscription
     */
    async sendSubscriptionToServer(subscription) {
        try {
            const response = await fetch(SUBSCRIBE_ENDPOINT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription),
            });
            if (!response.ok) {
                throw new Error('サーバーへの購読情報送信に失敗しました。');
            }
            console.log('Push購読情報をサーバーに送信しました。');
        } catch (error) {
            console.error(error);
            // 購読解除処理をここで行う必要はない。サーバーがダウンしていても、
            // ブラウザ側の購読は成功しているため。
        }
    }

    /**
     * Push通知ボタンの表示を更新
     */
    updatePushToggleButton() {
        const button = document.getElementById('top-push-notification-toggle');
        if (!button) return;

        if (this.isSubscribed) {
            button.textContent = this.lang === 'en' ? '🔕 Disable Notifications' : '🔕 通知を無効化';
            button.title = this.lang === 'en' ? 'Disable new summary push notifications' : '新しい要約のPush通知を無効にします';
            button.classList.add('disabled');
        } else {
            button.textContent = this.lang === 'en' ? '🔔 Enable Notifications' : '🔔 通知を有効化';
            button.title = this.lang === 'en' ? 'Enable new summary push notifications' : '新しい要約のPush通知を有効にします';
            button.classList.remove('disabled');
        }
        button.disabled = false;
    }
}

export default NotificationSystem;
