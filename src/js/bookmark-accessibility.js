/**
 * ブックマーク機能のアクセシビリティ対応を管理するクラス
 * ARIA属性、キーボードナビゲーション、スクリーンリーダー対応を担当
 */
class BookmarkAccessibility {
    constructor() {
        this.lang = document.documentElement.lang || 'ja';
        this.announcements = new Map();
        this.focusedElement = null;
        
        this.setupGlobalKeyboardHandlers();
        this.setupAriaLiveRegion();
    }

    /**
     * ブックマークアイコンのアクセシビリティ属性を設定
     * @param {HTMLElement} iconElement - ブックマークアイコン要素
     * @param {string} videoId - 動画ID
     * @param {boolean} isActive - アクティブ状態
     * @param {Object} archiveData - アーカイブデータ（タイトル等）
     */
    setupBookmarkIcon(iconElement, videoId, isActive, archiveData = null) {
        if (!iconElement) return;

        // 基本的なARIA属性
        iconElement.setAttribute('role', 'button');
        iconElement.setAttribute('tabindex', '0');
        iconElement.setAttribute('data-video-id', videoId);
        
        // 状態に応じたラベルとaria-pressed
        this.updateBookmarkIconState(iconElement, isActive, archiveData);
        
        // キーボードイベントハンドラー
        this.setupKeyboardHandler(iconElement, videoId);
        
        // フォーカスイベントハンドラー
        this.setupFocusHandler(iconElement, archiveData);
        

    }

    /**
     * ブックマークアイコンの状態を更新
     * @param {HTMLElement} iconElement - ブックマークアイコン要素
     * @param {boolean} isActive - アクティブ状態
     * @param {Object} archiveData - アーカイブデータ
     */
    updateBookmarkIconState(iconElement, isActive, archiveData = null) {
        if (!iconElement) return;

        const title = archiveData?.title || 'この配信';
        
        // aria-pressed属性
        iconElement.setAttribute('aria-pressed', isActive.toString());
        
        // aria-label属性
        const label = isActive 
            ? (this.lang === 'en' 
                ? `Remove "${title}" from bookmarks` 
                : `「${title}」をブックマークから削除`)
            : (this.lang === 'en' 
                ? `Add "${title}" to bookmarks` 
                : `「${title}」をブックマークに追加`);
        
        iconElement.setAttribute('aria-label', label);
        
        // aria-describedby（詳細説明）
        const descriptionId = `bookmark-desc-${iconElement.dataset.videoId}`;
        iconElement.setAttribute('aria-describedby', descriptionId);
        
        // 説明要素を作成または更新
        this.createOrUpdateDescription(descriptionId, isActive, archiveData);
        

    }

    /**
     * 説明要素の作成または更新
     * @param {string} descriptionId - 説明要素のID
     * @param {boolean} isActive - アクティブ状態
     * @param {Object} archiveData - アーカイブデータ
     */
    createOrUpdateDescription(descriptionId, isActive, archiveData = null) {
        let descElement = document.getElementById(descriptionId);
        
        if (!descElement) {
            descElement = document.createElement('div');
            descElement.id = descriptionId;
            descElement.className = 'sr-only';
            document.body.appendChild(descElement);
        }
        
        const streamer = archiveData?.streamer || '';
        const date = archiveData?.date ? new Date(archiveData.date).toLocaleDateString() : '';
        
        const description = this.lang === 'en'
            ? `Stream by ${streamer}${date ? ` from ${date}` : ''}. ${isActive ? 'Currently bookmarked' : 'Not bookmarked'}.`
            : `${streamer}の配信${date ? `（${date}）` : ''}。${isActive ? '現在ブックマーク済み' : 'ブックマーク未登録'}。`;
        
        descElement.textContent = description;
    }

    /**
     * キーボードハンドラーの設定
     * @param {HTMLElement} iconElement - ブックマークアイコン要素
     * @param {string} videoId - 動画ID
     */
    setupKeyboardHandler(iconElement, videoId) {
        iconElement.addEventListener('keydown', (event) => {
            // Enter または Space キーでブックマーク切り替え
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                
                // カスタムイベントを発火
                const toggleEvent = new CustomEvent('bookmark-toggle', {
                    detail: { videoId, element: iconElement }
                });
                document.dispatchEvent(toggleEvent);
                
                // 操作音（オプション）
                this.playInteractionSound();
            }
            
            // Escape キーでフォーカスを外す
            if (event.key === 'Escape') {
                iconElement.blur();
            }
        });
    }

    /**
     * フォーカスハンドラーの設定
     * @param {HTMLElement} iconElement - ブックマークアイコン要素
     * @param {Object} archiveData - アーカイブデータ
     */
    setupFocusHandler(iconElement, archiveData = null) {
        iconElement.addEventListener('focus', () => {
            this.focusedElement = iconElement;
            
            // フォーカス時の説明をアナウンス
            const title = archiveData?.title || 'この配信';
            const isActive = iconElement.getAttribute('aria-pressed') === 'true';
            
            const announcement = this.lang === 'en'
                ? `Bookmark button for "${title}". ${isActive ? 'Currently bookmarked' : 'Not bookmarked'}. Press Enter or Space to toggle.`
                : `「${title}」のブックマークボタン。${isActive ? '現在ブックマーク済み' : 'ブックマーク未登録'}。EnterキーまたはSpaceキーで切り替えできます。`;
            
            this.announceToScreenReader(announcement, 'polite');
        });
        
        iconElement.addEventListener('blur', () => {
            if (this.focusedElement === iconElement) {
                this.focusedElement = null;
            }
        });
    }



    /**
     * グローバルキーボードハンドラーの設定
     */
    setupGlobalKeyboardHandlers() {
        document.addEventListener('keydown', (event) => {
            // Alt + B でブックマーク一覧を開く
            if (event.altKey && event.key === 'b') {
                event.preventDefault();
                const bookmarkListEvent = new CustomEvent('bookmark-list-toggle');
                document.dispatchEvent(bookmarkListEvent);
            }
            
            // F6 でブックマークアイコン間を移動
            if (event.key === 'F6') {
                event.preventDefault();
                this.navigateBookmarkIcons(event.shiftKey ? -1 : 1);
            }
        });
    }

    /**
     * ブックマークアイコン間のナビゲーション
     * @param {number} direction - 移動方向（1: 次へ, -1: 前へ）
     */
    navigateBookmarkIcons(direction) {
        const bookmarkIcons = Array.from(document.querySelectorAll('.bookmark-icon'));
        
        if (bookmarkIcons.length === 0) return;
        
        let currentIndex = -1;
        
        if (this.focusedElement) {
            currentIndex = bookmarkIcons.indexOf(this.focusedElement);
        }
        
        let nextIndex = currentIndex + direction;
        
        // 循環ナビゲーション
        if (nextIndex >= bookmarkIcons.length) {
            nextIndex = 0;
        } else if (nextIndex < 0) {
            nextIndex = bookmarkIcons.length - 1;
        }
        
        bookmarkIcons[nextIndex].focus();
    }

    /**
     * ARIA Live Regionの設定
     */
    setupAriaLiveRegion() {
        // polite用のlive region
        let politeRegion = document.getElementById('bookmark-announcements-polite');
        if (!politeRegion) {
            politeRegion = document.createElement('div');
            politeRegion.id = 'bookmark-announcements-polite';
            politeRegion.setAttribute('aria-live', 'polite');
            politeRegion.setAttribute('aria-atomic', 'true');
            politeRegion.className = 'sr-only';
            document.body.appendChild(politeRegion);
        }
        
        // assertive用のlive region
        let assertiveRegion = document.getElementById('bookmark-announcements-assertive');
        if (!assertiveRegion) {
            assertiveRegion = document.createElement('div');
            assertiveRegion.id = 'bookmark-announcements-assertive';
            assertiveRegion.setAttribute('aria-live', 'assertive');
            assertiveRegion.setAttribute('aria-atomic', 'true');
            assertiveRegion.className = 'sr-only';
            document.body.appendChild(assertiveRegion);
        }
    }

    /**
     * スクリーンリーダーへのアナウンス
     * @param {string} message - アナウンスメッセージ
     * @param {string} priority - 優先度（'polite' または 'assertive'）
     */
    announceToScreenReader(message, priority = 'polite') {
        const regionId = `bookmark-announcements-${priority}`;
        const region = document.getElementById(regionId);
        
        if (region) {
            // 既存のメッセージをクリア
            region.textContent = '';
            
            // 少し遅延してからメッセージを設定（確実にアナウンスされるため）
            setTimeout(() => {
                region.textContent = message;
            }, 100);
            
            // 一定時間後にクリア
            setTimeout(() => {
                region.textContent = '';
            }, 5000);
        }
    }

    /**
     * ブックマーク操作の成功をアナウンス
     * @param {boolean} added - 追加されたかどうか
     * @param {Object} archiveData - アーカイブデータ
     */
    announceBookmarkAction(added, archiveData = null) {
        const title = archiveData?.title || 'この配信';
        
        const message = added
            ? (this.lang === 'en' 
                ? `"${title}" added to bookmarks` 
                : `「${title}」をブックマークに追加しました`)
            : (this.lang === 'en' 
                ? `"${title}" removed from bookmarks` 
                : `「${title}」をブックマークから削除しました`);
        
        this.announceToScreenReader(message, 'assertive');
    }

    /**
     * エラーメッセージのアナウンス
     * @param {string} error - エラーメッセージ
     */
    announceError(error) {
        const message = this.lang === 'en'
            ? `Error: ${error}`
            : `エラー: ${error}`;
        
        this.announceToScreenReader(message, 'assertive');
    }

    /**
     * 操作音の再生（オプション）
     */
    playInteractionSound() {
        // Web Audio APIを使用した軽い操作音
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
            
        } catch (error) {
            // 音声再生に失敗しても処理を続行
            console.debug('操作音の再生に失敗:', error);
        }
    }

    /**
     * ハイコントラストモードの検出
     * @returns {boolean} ハイコントラストモードかどうか
     */
    isHighContrastMode() {
        return window.matchMedia('(prefers-contrast: high)').matches;
    }

    /**
     * 動きを減らす設定の検出
     * @returns {boolean} 動きを減らす設定が有効かどうか
     */
    isPrefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /**
     * フォーカス可能な要素の検索
     * @param {HTMLElement} container - 検索対象のコンテナ
     * @returns {Array} フォーカス可能な要素の配列
     */
    getFocusableElements(container) {
        const focusableSelectors = [
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            'a[href]',
            '[tabindex]:not([tabindex="-1"])'
        ];
        
        return Array.from(container.querySelectorAll(focusableSelectors.join(', ')));
    }



    /**
     * クリーンアップ処理
     */
    cleanup() {
        // 説明要素を削除
        const descriptions = document.querySelectorAll('[id^="bookmark-desc-"]');
        descriptions.forEach(desc => desc.remove());
        
        // Live regionをクリア
        const politeRegion = document.getElementById('bookmark-announcements-polite');
        const assertiveRegion = document.getElementById('bookmark-announcements-assertive');
        
        if (politeRegion) politeRegion.textContent = '';
        if (assertiveRegion) assertiveRegion.textContent = '';
    }
}

export default BookmarkAccessibility;