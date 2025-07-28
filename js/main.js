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
        
        this.init();
    }
    
    async init() {
        await this.loadData();
        if (!this.filterByUrlParams()) {
            this.setupStreamerFilter();
            this.setupTagFilter();
        }
        this.setupSiteDescriptionToggle();
        this.setupBackToTopButton();
        this.setupLoadMoreButton();
        this.renderArchives();
    }

    filterByUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const videoId = params.get('videoId');
        if (videoId) {
            this.filteredData = this.archiveData.filter(archive => archive.videoId === videoId);
            // フィルターボタンを非表示にするか、選択状態を解除するなどUI調整
            document.getElementById('filter-container').style.display = 'none';
            document.querySelector('.filter-group.collapsible').style.display = 'none';
            return true; // パラメータによるフィルタリングが行われたことを示す
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

        // When the user scrolls down 20px from the top of the document, show the button
        window.onscroll = function() {
            if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
                backToTopButton.classList.add('show');
            } else {
                backToTopButton.classList.remove('show');
            }
        };

        // When the user clicks on the button, scroll to the top of the document
        backToTopButton.addEventListener('click', () => {
            backToTopButton.classList.remove('show'); // Immediately hide the button
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
    
    async loadData() {
        try {
            const response = await fetch('data/summaries.json');
            this.archiveData = await response.json();
            this.filteredData = [...this.archiveData];
            
            // ストリーマーとタグ一覧の取得
            this.archiveData.forEach(archive => {
                this.streamers.add(archive.streamer);
                archive.tags.forEach(tag => this.tags.add(tag));
            });
        } catch (error) {
            console.error('データの読み込みに失敗しました:', error);
        }
    }
    
    setupStreamerFilter() {
        const filterContainer = document.getElementById('filter-buttons');
        const selectAllButton = document.getElementById('select-all');
        
        if (!filterContainer || !selectAllButton) {
            console.error('必要なDOM要素が見つかりません:', {
                filterContainer: !!filterContainer,
                selectAllButton: !!selectAllButton
            });
            return;
        }
        
        // ストリーマーごとのフィルターボタンを作成
        Array.from(this.streamers).sort().forEach(streamer => {
            const button = document.createElement('button');
            button.textContent = streamer;
            button.addEventListener('click', () => this.filterByStreamer(streamer));
            filterContainer.appendChild(button);
        });
        
        // すべて表示ボタンの設定
        selectAllButton.addEventListener('click', () => {
            // URLパラメータがある状態で「すべて表示」が押された場合、ページをリロードして全件表示に戻す
            if (new URLSearchParams(window.location.search).has('videoId')) {
                window.location.href = window.location.pathname;
            } else {
                this.selectAllStreamers();
            }
        });
        
        // 初期状態ですべて選択
        this.selectAllStreamers();
    }
    
    filterByStreamer(clickedStreamer) {
        // If the clicked streamer is already the only selected streamer,
        // then clear the selection (effectively "select all").
        if (this.selectedStreamers.has(clickedStreamer) && this.selectedStreamers.size === 1) {
            this.selectAllStreamers(); // Call existing selectAllStreamers to reset
        } else {
            // Otherwise, select only the clicked streamer.
            this.selectedStreamers.clear();
            this.selectedStreamers.add(clickedStreamer);

            // Update UI for streamer filter buttons
            const buttons = document.querySelectorAll('#filter-buttons button');
            buttons.forEach(button => {
                if (button.textContent === clickedStreamer) {
                    button.classList.add('active');
                } else {
                    button.classList.remove('active');
                }
            });

            // Update tag filter and re-filter archives
            this.updateTagFilter();

            // Scroll to archive grid only when filtering by a specific streamer
            const archiveGrid = document.getElementById('archive-grid');
            if (archiveGrid) {
                archiveGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }
    
    selectAllStreamers() {
        const buttons = document.querySelectorAll('#filter-buttons button');
        this.selectedStreamers = new Set(this.streamers);
        buttons.forEach(button => button.classList.add('active'));
        
        // タグフィルターを更新し、アーカイブを再フィルタリングする
        this.updateTagFilter();
    }
    
    setupTagFilter() {
        const filterContainer = document.getElementById('tag-filter-buttons');
        const selectAllButton = document.getElementById('select-all-tags');
        const toggleButton = document.querySelector('.toggle-tags');
        const collapsibleContainer = document.querySelector('.filter-group.collapsible');

        if (!filterContainer || !selectAllButton || !toggleButton || !collapsibleContainer) {
            console.error('タグフィルターに必要なDOM要素が見つかりません:', {
                filterContainer: !!filterContainer,
                selectAllButton: !!selectAllButton,
                toggleButton: !!toggleButton,
                collapsibleContainer: !!collapsibleContainer
            });
            return;
        }

        // 「すべて選択」ボタンは、現在表示されているタグをすべて選択するように変更
        selectAllButton.addEventListener('click', () => this.selectAllTags());

        const toggleTags = () => {
            const isOpen = collapsibleContainer.classList.toggle('open');
            toggleButton.textContent = isOpen ? '閉じる' : 'もっと見る';

            const content = collapsibleContainer.querySelector('.collapsible-content');
            if (isOpen) {
                content.style.maxHeight = content.scrollHeight + 'px';
            } else {
                content.style.maxHeight = null;
                // 「閉じる」が押された際に、「タグで絞り込み」セクションにスクロール
                collapsibleContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        toggleButton.addEventListener('click', toggleTags);
        collapsibleContainer.querySelector('.collapsible-trigger').addEventListener('click', toggleTags);

        // 初期タグ表示
        this.updateTagFilter();
    }

    updateTagFilter() {
        const filterContainer = document.getElementById('tag-filter-buttons');
        filterContainer.innerHTML = ''; // 既存のタグボタンをクリア

        // 選択中の配信者に関連するタグのみを抽出
        const relevantArchives = this.archiveData.filter(archive => this.selectedStreamers.has(archive.streamer));
        const visibleTags = new Set();
        relevantArchives.forEach(archive => {
            archive.tags.forEach(tag => visibleTags.add(tag));
        });

        // this.tags を更新して、現在表示されているタグのセットを保持
        this.tags = visibleTags;

        // タグごとのフィルターボタンを作成
        Array.from(this.tags).sort().forEach(tag => {
            const button = document.createElement('button');
            button.textContent = tag;
            // クリックすると、そのタグのみでフィルタリングする
            button.addEventListener('click', () => this.filterByTag(tag));
            filterContainer.appendChild(button);
        });

        // オーバーフロー状態をチェックして適切なクラスを適用
        this.checkTagOverflow();

        // 表示されているタグをすべて選択状態にして、アーカイブをフィルタリング
        this.selectAllTags();
    }

    setupSiteDescriptionToggle() {
        const siteDescription = document.getElementById('site-description');
        const toggleButton = siteDescription.querySelector('.toggle-site-description');
        const collapsibleContent = siteDescription.querySelector('.collapsible-content');
        const collapsibleTrigger = siteDescription.querySelector('.collapsible-trigger');

        if (!siteDescription || !toggleButton || !collapsibleContent || !collapsibleTrigger) {
            console.error('サイト説明のDOM要素が見つかりません:', {
                siteDescription: !!siteDescription,
                toggleButton: !!toggleButton,
                collapsibleContent: !!collapsibleContent,
                collapsibleTrigger: !!collapsibleTrigger
            });
            return;
        }

        const toggleDescription = () => {
            const isOpen = siteDescription.classList.toggle('open');
            toggleButton.textContent = isOpen ? '閉じる' : 'もっと見る';

            if (isOpen) {
                collapsibleContent.style.maxHeight = collapsibleContent.scrollHeight + 'px';
                collapsibleContent.classList.remove('has-overflow');
            } else {
                collapsibleContent.style.maxHeight = null;
            }
        };

        toggleButton.addEventListener('click', toggleDescription);
        collapsibleTrigger.addEventListener('click', toggleDescription);
    }

    selectAllTags() {
        const buttons = document.querySelectorAll('#tag-filter-buttons button');
        // this.tags は updateTagFilter で更新された、現在表示されているタグのセットを指す
        this.selectedTags = new Set(this.tags);
        buttons.forEach(button => button.classList.add('active'));
        this.filterArchives();
    }

    checkTagOverflow() {
        // タグフィルターのコンテンツがオーバーフローしているかチェック
        const content = document.querySelector('.filter-group.collapsible .collapsible-content');
        if (!content) return;

        // 一時的にmax-heightを解除してスクロール高さを測定
        const originalMaxHeight = content.style.maxHeight;
        content.style.maxHeight = 'none';
        const scrollHeight = content.scrollHeight;
        content.style.maxHeight = originalMaxHeight;

        // 現在のmax-heightと比較してオーバーフローを判定
        const currentMaxHeight = parseInt(window.getComputedStyle(content).maxHeight);
        
        if (scrollHeight > currentMaxHeight) {
            content.classList.add('has-overflow');
        } else {
            content.classList.remove('has-overflow');
        }
    }

    filterByTag(clickedTag) {
        // 既にそのタグのみが選択されている場合は、不要な再描画を防ぐ
        if (this.selectedTags.has(clickedTag) && this.selectedTags.size === 1) {
            return;
        }

        // 選択されているタグをクリアし、クリックされたタグのみを選択状態にする
        this.selectedTags.clear();
        this.selectedTags.add(clickedTag);

        // 上部のタグフィルターボタンのUIを更新する
        const buttons = document.querySelectorAll('#tag-filter-buttons button');
        buttons.forEach(button => {
            if (button.textContent === clickedTag) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });

        // アーカイブを再フィルタリングする
        this.filterArchives();
    }

    filterArchives() {
        this.currentPage = 1;
        this.filteredData = this.archiveData.filter(archive => {
            const streamerMatch = this.selectedStreamers.has(archive.streamer);
            
            // タグフィルターの条件：選択されたタグがなければtrue、あればいずれかのタグにマッチするか (OR条件)
            const tagMatch = this.selectedTags.size === 0 || 
                             archive.tags.some(tag => this.selectedTags.has(tag));

            return streamerMatch && tagMatch;
        });
        this.renderArchives(true);
    }
    
    renderArchives(clearGrid = true) {
        const grid = document.getElementById('archive-grid');
        const loadMoreButton = document.getElementById('load-more');

        if (!grid) {
            console.error('アーカイブグリッド要素が見つかりません。要素ID: archive-grid');
            return;
        }
        
        if (clearGrid) {
            grid.innerHTML = '';
        }
        
        const sortedData = this.filteredData.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const archivesToRender = sortedData.slice(startIndex, endIndex);

        archivesToRender.forEach(archive => {
            const card = this.createArchiveCard(archive);
            grid.appendChild(card);
        });

        // Show or hide the "load more" button
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
        
        const openVideo = (startTime = 0) => {
            const url = `https://www.youtube.com/watch?v=${archive.videoId}&t=${startTime}s`;
            window.open(url, '_blank');
        };
        
        // サムネイル画像の作成
        const img = document.createElement('img');
        img.src = archive.thumbnailUrl;
        img.alt = archive.title;
        img.classList.add('clickable-thumbnail');
        img.title = 'クリックして動画を再生';
        img.addEventListener('click', () => openVideo());
        
        // カードコンテンツの作成
        const content = document.createElement('div');
        content.className = 'archive-card-content';
        
        // タイトル
        const title = document.createElement('h2');
        title.textContent = archive.title;
        title.classList.add('clickable-title');
        title.title = 'クリックして動画を再生';
        title.addEventListener('click', () => openVideo());
        
        // 配信日時
        const dateElement = document.createElement('p');
        dateElement.className = 'archive-date';
        dateElement.textContent = `配信日時: ${new Date(archive.date).toISOString().slice(0, 19).replace('T', ' ')}`;

        // 配信時間
        const duration = document.createElement('p');
        duration.className = 'duration';
        duration.textContent = `配信時間：${this.formatDuration(archive.duration)}`;

        // 配信者名
        const streamer = document.createElement('p');
        streamer.className = 'streamer-name clickable-streamer'; // clickable-streamer クラスを追加
        streamer.textContent = `配信者: ${archive.streamer}`;
        streamer.title = `配信者「${archive.streamer}」で絞り込む`; // ツールチップを追加
        streamer.addEventListener('click', () => this.filterByStreamer(archive.streamer)); // クリックイベントを追加

        // 概要セクション
        const overview = document.createElement('div');
        overview.className = 'overview';
        
        const overviewSummary = document.createElement('p');
        overviewSummary.className = 'overview-summary';
        overviewSummary.textContent = archive.overview.summary;
        
        const overviewMood = document.createElement('p');
        overviewMood.className = 'overview-mood';
        overviewMood.textContent = `配信の雰囲気：${archive.overview.mood}`;
        
        // 見どころセクション
        const highlights = document.createElement('div');
        highlights.className = 'highlights collapsible';
        
        const highlightsTitle = document.createElement('strong');
        highlightsTitle.textContent = '見どころ：';
        highlightsTitle.className = 'collapsible-trigger';
        
        const highlightsList = document.createElement('ul');
        highlightsList.className = 'highlights-list collapsible-content';
        archive.highlights.forEach(highlight => {
            const li = document.createElement('li');
            li.classList.add('clickable-highlight');
            li.title = `クリックして ${highlight.timestamp} から再生`;
            li.addEventListener('click', (e) => {
                const seconds = this.timestampToSeconds(highlight.timestamp);
                openVideo(seconds);
            });

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
            highlightsList.appendChild(li);
        });

        const toggleButton = document.createElement('button');
        toggleButton.className = 'toggle-highlights';
        toggleButton.textContent = 'もっと見る';

        const toggleHighlights = () => {
            const isOpen = highlights.classList.toggle('open');
            toggleButton.textContent = isOpen ? '閉じる' : 'もっと見る';

            const content = highlights.querySelector('.collapsible-content');
            if (isOpen) {
                content.style.maxHeight = content.scrollHeight + 'px';
            } else {
                content.style.maxHeight = null;
                // 「閉じる」が押された際に、カードの先頭にスクロール
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        highlightsTitle.addEventListener('click', toggleHighlights);
        toggleButton.addEventListener('click', toggleHighlights);
        
        // タグセクション
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'tags-container collapsible';

        const tagsTitle = document.createElement('strong');
        tagsTitle.textContent = 'タグ：';
        tagsTitle.className = 'collapsible-trigger';

        const tagsList = document.createElement('div');
        tagsList.className = 'tags-list collapsible-content';
        
        const tags = document.createElement('div');
        tags.className = 'tags';
        archive.tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            // クリック可能であることを示すクラスとイベントリスナーを追加
            tagSpan.className = 'tag clickable-tag';
            tagSpan.textContent = `#${tag}`;
            tagSpan.title = `タグ「${tag}」で絞り込む`;
            tagSpan.addEventListener('click', () => this.filterByTag(tag));
            tags.appendChild(tagSpan);
        });
        tagsList.appendChild(tags);

        const toggleTagsButton = document.createElement('button');
        toggleTagsButton.className = 'toggle-tags';
        toggleTagsButton.textContent = 'もっと見る';

        const toggleTags = () => {
            const isOpen = tagsContainer.classList.toggle('open');
            toggleTagsButton.textContent = isOpen ? '閉じる' : 'もっと見る';

            const content = tagsContainer.querySelector('.collapsible-content');
            if (isOpen) {
                content.style.maxHeight = content.scrollHeight + 'px';
            } else {
                content.style.maxHeight = null;
            }
        };

        tagsTitle.addEventListener('click', toggleTags);
        toggleTagsButton.addEventListener('click', toggleTags);

        tagsContainer.appendChild(tagsTitle);
        tagsContainer.appendChild(tagsList);
        tagsContainer.appendChild(toggleTagsButton);
        
        // シェアボタンのフッター
        const footer = document.createElement('div');
        footer.className = 'card-footer';

        const copyButton = document.createElement('button');
        copyButton.textContent = 'コピー';
        copyButton.className = 'copy-button';
        copyButton.title = 'タイトルとURLをコピー';
        copyButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const shareUrl = `${window.location.origin}${window.location.pathname}?videoId=${archive.videoId}`;
            const copyText = `${archive.title}\n${shareUrl}`;
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

        const shareButton = document.createElement('button');
        shareButton.textContent = '𝕏で共有';
        shareButton.className = 'share-button';
        shareButton.title = 'この配信を𝕏で共有する';
        shareButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const shareUrl = `${window.location.origin}${window.location.pathname}?videoId=${archive.videoId}`;
            const shareText = `${archive.title}\n${shareUrl}`;
            const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
            window.open(twitterIntentUrl, '_blank');
        });

        footer.appendChild(copyButton);
        footer.appendChild(shareButton);

        // 要素の組み立て
        highlights.appendChild(highlightsTitle);
        highlights.appendChild(highlightsList);
        highlights.appendChild(toggleButton);

        overview.appendChild(dateElement);
        overview.appendChild(duration);
        overview.appendChild(overviewSummary);
        overview.appendChild(overviewMood);
        
        content.appendChild(title);
        content.appendChild(streamer);
        content.appendChild(overview);
        content.appendChild(highlights);
        content.appendChild(tags);
        
        card.appendChild(img);
        card.appendChild(content);
        card.appendChild(footer);
        
        return card;
    }

    timestampToSeconds(timestamp) {
        // H:M:S or M:S形式のタイムスタンプを秒に変換する
        const parts = timestamp.split(':').map(Number).reverse();
        const seconds = parts.reduce((total, part, index) => {
            return total + part * Math.pow(60, index);
        }, 0);
        return seconds;
    }

    formatDuration(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        let durationStr = "";
        if (hours > 0) {
            durationStr += `${hours}時間`;
        }
        if (minutes > 0) {
            durationStr += `${minutes}分`;
        }
        if (seconds > 0 || durationStr === "") { // Include seconds if no hours/minutes, or if it's 0 seconds
            durationStr += `${seconds}秒`;
        }
        return durationStr.trim();
    }
}

// アプリケーションの初期化
document.addEventListener('DOMContentLoaded', () => {
    new ArchiveManager();
});
