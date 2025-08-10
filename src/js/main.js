function getBasePath() {
    const repoName = 'live-stream-summarizer';
    if (location.hostname === 'github.io' || location.hostname.endsWith('.github.io')) {
        return `/${repoName}`;
    }
    return '';
}

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
        this.watchLaterList = new Set();
        this.isWatchLaterMode = false;
        
        this.init();
    }
    
    async init() {
        await this.loadData();
        this.loadWatchLaterList();
        // あとで見るリストのクリーンアップ（loadDataの後に実行）
        this.cleanupWatchLaterList();
        const hasUrlParams = this.filterByUrlParams();
        
        // watchLaterパラメータがある場合でも、フィルターのセットアップは行う
        if (!hasUrlParams || new URLSearchParams(window.location.search).get('watchLater') === 'true') {
            this.setupStreamerFilter();
            this.setupTagFilter();
        }
        
        // watchLaterパラメータがある場合は、フィルタリングを再適用
        const params = new URLSearchParams(window.location.search);
        if (params.get('watchLater') === 'true' && this.watchLaterList.size > 0) {
            this.isWatchLaterMode = true;
            this.filteredData = this.archiveData.filter(archive => 
                this.watchLaterList.has(archive.videoId)
            );
            document.getElementById('filter-container').style.display = 'none';
            document.querySelector('.filter-group.collapsible').style.display = 'none';
        }
        
        this.setupSiteDescriptionToggle();
        this.setupBackToTopButton();
        this.setupBackToHomeButton();
        this.setupWatchLaterButton();
        this.setupLoadMoreButton();
        this.setupHintDialog();
        this.renderArchives();
        this.updateTitle();
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
            document.title = `${streamerName}の配信一覧 - ${this.originalTitle}`;
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
            // videoIdがある場合は「あとで見る」ボタンを非表示にする
            const watchLaterButton = document.getElementById('watch-later');
            if (watchLaterButton) {
                watchLaterButton.classList.remove('show');
            }
            return true;
        }

        // watchLaterパラメータがある場合は「あとで見る」モードを有効にする
        const watchLater = params.get('watchLater');
        if (watchLater === 'true' && this.watchLaterList.size > 0) {
            this.isWatchLaterMode = true;
            this.filteredData = this.archiveData.filter(archive => 
                this.watchLaterList.has(archive.videoId)
            );
            document.getElementById('filter-container').style.display = 'none';
            document.querySelector('.filter-group.collapsible').style.display = 'none';
            // watchLaterパラメータの場合は、フィルターのセットアップは後で行うため、falseを返す
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
            window.location.href = window.location.pathname;
        });
    }

    setupWatchLaterButton() {
        const watchLaterButton = document.getElementById('watch-later');
        const params = new URLSearchParams(window.location.search);
        const videoId = params.get('videoId');

        if (!watchLaterButton) {
            console.error('Watch later button not found.');
            return;
        }

        // videoIdがある場合は「あとで見る」ボタンを非表示にする
        if (videoId) {
            watchLaterButton.classList.remove('show');
        } else {
            watchLaterButton.classList.add('show');
        }

        watchLaterButton.addEventListener('click', () => {
            this.toggleWatchLaterMode();
        });
    }
    
    async loadData() {
        try {
            const response = await fetch('data/summaries.json');
            this.archiveData = await response.json();
            this.filteredData = [...this.archiveData];
            
            this.archiveData.forEach(archive => {
                this.streamers.add(archive.streamer);
                archive.tags.forEach(tag => this.tags.add(tag));
            });
        } catch (error) {
            console.error('データの読み込みに失敗しました:', error);
        }
    }

    loadWatchLaterList() {
        try {
            const savedList = localStorage.getItem('watchLaterList');
            if (savedList) {
                this.watchLaterList = new Set(JSON.parse(savedList));
            }
        } catch (error) {
            console.error('あとで見るリストの読み込みに失敗しました:', error);
        }
    }

    cleanupWatchLaterList() {
        // 現在のJSONデータに存在するvideoIdのセットを作成
        const existingVideoIds = new Set(this.archiveData.map(archive => archive.videoId));
        
        console.log('クリーンアップ前のあとで見るリスト:', [...this.watchLaterList]);
        console.log('現在のJSONデータのvideoId:', [...existingVideoIds]);
        
        // あとで見るリストから存在しないvideoIdを削除
        const originalSize = this.watchLaterList.size;
        const removedItems = [];
        for (const videoId of this.watchLaterList) {
            if (!existingVideoIds.has(videoId)) {
                this.watchLaterList.delete(videoId);
                removedItems.push(videoId);
            }
        }
        
        // 削除された項目がある場合は、更新されたリストを保存
        if (this.watchLaterList.size !== originalSize) {
            this.saveWatchLaterList();
            console.log(`あとで見るリストから ${originalSize - this.watchLaterList.size} 個の存在しない項目を削除しました:`, removedItems);
            console.log('クリーンアップ後のあとで見るリスト:', [...this.watchLaterList]);
        } else {
            console.log('削除される項目はありませんでした。');
        }
    }

    saveWatchLaterList() {
        try {
            localStorage.setItem('watchLaterList', JSON.stringify([...this.watchLaterList]));
        } catch (error) {
            console.error('あとで見るリストの保存に失敗しました:', error);
        }
    }

    toggleWatchLaterMode() {
        // あとで見るリストが空の場合はダイアログを表示
        if (this.watchLaterList.size === 0) {
            this.showWatchLaterDialog();
            return;
        }
        
        this.isWatchLaterMode = !this.isWatchLaterMode;
        
        if (this.isWatchLaterMode) {
            // あとで見るモードに切り替え
            this.filteredData = this.archiveData.filter(archive => 
                this.watchLaterList.has(archive.videoId)
            );
            // フィルターコンテナを非表示にする
            document.getElementById('filter-container').style.display = 'none';
            document.querySelector('.filter-group.collapsible').style.display = 'none';
            
            // URLにwatchLaterパラメータを追加
            const params = new URLSearchParams(window.location.search);
            params.set('watchLater', 'true');
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            history.pushState(null, '', newUrl);
        } else {
            // 通常モードに戻る
            this.filteredData = [...this.archiveData];
            // フィルターコンテナを表示する
            document.getElementById('filter-container').style.display = 'block';
            document.querySelector('.filter-group.collapsible').style.display = 'block';
            
            // URLからwatchLaterパラメータを削除
            const params = new URLSearchParams(window.location.search);
            params.delete('watchLater');
            const newUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
            history.pushState(null, '', newUrl);
            
            // フィルタを完全にリセット
            this.selectedStreamers = new Set(this.streamers);
            this.selectedTags = new Set(this.tags);
            
            // 配信者フィルタのボタンをすべてアクティブにする
            const streamerButtons = document.querySelectorAll('#filter-buttons button');
            streamerButtons.forEach(button => button.classList.add('active'));
            
            // タグフィルタのボタンをすべてアクティブにする
            const tagButtons = document.querySelectorAll('#tag-filter-buttons button');
            tagButtons.forEach(button => button.classList.add('active'));
        }
        
        this.currentPage = 1;
        this.renderArchives(true);
        
        // カードの先頭位置にスクロール
        const archiveGrid = document.getElementById('archive-grid');
        if (archiveGrid) {
            archiveGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    showWatchLaterDialog() {
        const dialog = document.getElementById('watch-later-dialog');
        if (dialog) {
            dialog.style.display = 'flex';
        }
    }

    toggleWatchLater(videoId, bookmarkIcon) {
        if (this.watchLaterList.has(videoId)) {
            // リストから削除
            this.watchLaterList.delete(videoId);
            bookmarkIcon.classList.remove('active');
            bookmarkIcon.title = 'あとで見るに追加';
        } else {
            // リストに追加
            this.watchLaterList.add(videoId);
            bookmarkIcon.classList.add('active');
            bookmarkIcon.title = 'あとで見るから削除';
        }
        
        this.saveWatchLaterList();
        
        // あとで見るモードの場合は、リストを更新
        if (this.isWatchLaterMode) {
            // リストが空になった場合は、フィルタを解除してすべての動画を表示
            if (this.watchLaterList.size === 0) {
                this.isWatchLaterMode = false;
                this.filteredData = [...this.archiveData];
                // フィルターコンテナを表示する
                document.getElementById('filter-container').style.display = 'block';
                document.querySelector('.filter-group.collapsible').style.display = 'block';
                
                // URLからwatchLaterパラメータを削除
                const params = new URLSearchParams(window.location.search);
                params.delete('watchLater');
                const newUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
                history.pushState(null, '', newUrl);
                
                // フィルタを完全にリセット
                this.selectedStreamers = new Set(this.streamers);
                this.selectedTags = new Set(this.tags);
                
                // 配信者フィルタのボタンをすべてアクティブにする
                const streamerButtons = document.querySelectorAll('#filter-buttons button');
                streamerButtons.forEach(button => button.classList.add('active'));
                
                // タグフィルタのボタンをすべてアクティブにする
                const tagButtons = document.querySelectorAll('#tag-filter-buttons button');
                tagButtons.forEach(button => button.classList.add('active'));
            } else {
                this.filteredData = this.archiveData.filter(archive => 
                    this.watchLaterList.has(archive.videoId)
                );
            }
            this.currentPage = 1;
            this.renderArchives(true);
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
        
        Array.from(this.streamers).sort().forEach(streamer => {
            const button = document.createElement('button');
            button.textContent = streamer;
            button.addEventListener('click', () => this.filterByStreamer(streamer));
            filterContainer.appendChild(button);
        });
        
        selectAllButton.addEventListener('click', () => {
            if (new URLSearchParams(window.location.search).has('videoId')) {
                window.location.href = window.location.pathname;
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
            history.pushState(null, '', newUrl);
            this.setupStreamerFilter();
            this.setupTagFilter();
        } else if (this.selectedStreamers.has(clickedStreamer) && this.selectedStreamers.size === 1) {
            this.selectAllStreamers();
        } else {
            this.selectedStreamers.clear();
            this.selectedStreamers.add(clickedStreamer);
            params.set('streamer', clickedStreamer);
            const newUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
            history.pushState(null, '', newUrl);
        }

        const buttons = document.querySelectorAll('#filter-buttons button');
        buttons.forEach(button => {
            button.classList.toggle('active', this.selectedStreamers.has(button.textContent));
        });

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
            history.pushState(null, '', newUrl);
        }
        
        this.updateTagFilter();
        this.updateTitle();
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

        selectAllButton.addEventListener('click', () => this.selectAllTags());

        const toggleTags = () => {
            const isOpen = collapsibleContainer.classList.toggle('open');
            toggleButton.textContent = isOpen ? '閉じる' : 'もっと見る';

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
            archive.tags.forEach(tag => visibleTags.add(tag));
        });

        this.tags = visibleTags;

        Array.from(this.tags).sort().forEach(tag => {
            const button = document.createElement('button');
            button.textContent = tag;
            button.addEventListener('click', () => this.filterByTag(tag));
            filterContainer.appendChild(button);
        });

        this.checkTagOverflow();
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

        const toggleDescription = () => {
            const isOpen = siteDescription.classList.toggle('open');
            toggleButton.textContent = isOpen ? '閉じる' : 'もっと見る';

            if (isOpen) {
                collapsibleContent.style.maxHeight = collapsibleContent.scrollHeight + 'px';
                collapsibleContent.classList.remove('has-overflow');
            } else {
                collapsibleContent.style.maxHeight = null;
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
    }

    checkTagOverflow() {
        const content = document.querySelector('.filter-group.collapsible .collapsible-content');
        if (!content) return;

        const originalMaxHeight = content.style.maxHeight;
        content.style.maxHeight = 'none';
        const scrollHeight = content.scrollHeight;
        content.style.maxHeight = originalMaxHeight;

        const currentMaxHeight = parseInt(window.getComputedStyle(content).maxHeight);
        
        if (scrollHeight > currentMaxHeight) {
            content.classList.add('has-overflow');
        } else {
            content.classList.remove('has-overflow');
        }
    }

    filterByTag(clickedTag) {
        if (new URLSearchParams(window.location.search).has('videoId')) {
            history.pushState(null, '', window.location.pathname);
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
    }

    filterArchives() {
        this.currentPage = 1;
        this.filteredData = this.archiveData.filter(archive => {
            const streamerMatch = this.selectedStreamers.has(archive.streamer);
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
        
        const img = document.createElement('img');
        img.src = archive.thumbnailUrl;
        img.alt = archive.title;
        img.classList.add('clickable-thumbnail');
        img.title = '詳細ページへ';
        img.addEventListener('click', () => {
            window.location.href = `${getBasePath()}/pages/${archive.videoId}.html`;
        });

        // ブックマークアイコンを追加
        const bookmarkIcon = document.createElement('button');
        bookmarkIcon.className = 'bookmark-icon';
        bookmarkIcon.innerHTML = '🔖';
        bookmarkIcon.title = 'あとで見るに追加';
        
        // 既に追加されている場合はアクティブ状態にする
        if (this.watchLaterList.has(archive.videoId)) {
            bookmarkIcon.classList.add('active');
            bookmarkIcon.title = 'あとで見るから削除';
        }
        
        bookmarkIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleWatchLater(archive.videoId, bookmarkIcon);
        });
        
        card.appendChild(bookmarkIcon);
        
        const content = document.createElement('div');
        content.className = 'archive-card-content';
        
        const title = document.createElement('h2');
        title.textContent = archive.title;
        title.classList.add('clickable-title');
        title.title = '詳細ページへ';
        title.addEventListener('click', () => {
            window.location.href = `${getBasePath()}/pages/${archive.videoId}.html`;
        });
        
        const dateElement = document.createElement('p');
        dateElement.className = 'archive-date';
        dateElement.textContent = `配信日時: ${new Date(archive.date).toISOString().slice(0, 19).replace('T', ' ')}`;

        const duration = document.createElement('p');
        duration.className = 'duration';
        duration.textContent = `配信時間：${this.formatDuration(archive.duration)}`;

        const streamer = document.createElement('p');
        streamer.className = 'streamer-name clickable-streamer';
        streamer.textContent = `配信者: ${archive.streamer}`;
        streamer.title = `配信者「${archive.streamer}」で絞り込む`;
        streamer.addEventListener('click', () => this.filterByStreamer(archive.streamer));

        const overview = document.createElement('div');
        overview.className = 'overview';
        
        const overviewSummary = document.createElement('p');
        overviewSummary.className = 'overview-summary';
        overviewSummary.textContent = archive.overview.summary;
        
        const overviewMood = document.createElement('p');
        overviewMood.className = 'overview-mood';
        overviewMood.textContent = `配信の雰囲気：${archive.overview.mood}`;
        
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
                window.location.href = `${getBasePath()}/pages/${archive.videoId}.html?t=${seconds}`;
            });

            const h3 = document.createElement('h3');
            h3.textContent = highlight.title;
            
            const timestamp = document.createElement('span');
            timestamp.className = 'timestamp';
            timestamp.textContent = highlight.timestamp;
            
            const type = document.createElement('span');
            type.className = `highlight-type ${highlight.type}`;
            type.textContent = highlight.type;
            
            const description = document.createElement('p');
            description.textContent = highlight.description;
            
            li.appendChild(h3);
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
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        highlightsTitle.addEventListener('click', toggleHighlights);
        toggleButton.addEventListener('click', toggleHighlights);
        
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
        
        const footer = document.createElement('div');
        footer.className = 'card-footer';

        const copyButton = document.createElement('button');
        copyButton.textContent = 'コピー';
        copyButton.className = 'copy-button';
        copyButton.title = 'タイトルとURLをコピー';
        copyButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const shareUrl = `https://aegisfleet.github.io/live-stream-summarizer/pages/${archive.videoId}.html`;
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
            const shareUrl = `https://aegisfleet.github.io/live-stream-summarizer/pages/${archive.videoId}.html`;
            const shareText = `${archive.title}\n${shareUrl}`;
            const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
            window.open(twitterIntentUrl, '_blank');
        });

        const detailButton = document.createElement('button');
        detailButton.textContent = '詳細';
        detailButton.className = 'detail-button';
        detailButton.title = '詳細ページを表示';
        detailButton.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = `${getBasePath()}/pages/${archive.videoId}.html`;
        });
        footer.appendChild(detailButton);

        const rightButtons = document.createElement('div');
        rightButtons.className = 'card-footer-right-buttons';
        rightButtons.appendChild(copyButton);
        rightButtons.appendChild(shareButton);
        footer.appendChild(rightButtons);

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
        const parts = timestamp.split(':').map(Number).reverse();
        return parts.reduce((total, part, index) => total + part * Math.pow(60, index), 0);
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
        if (seconds > 0 || durationStr === "") {
            durationStr += `${seconds}秒`;
        }
        return durationStr.trim();
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

        // あとで見るダイアログの設定
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
}

document.addEventListener('DOMContentLoaded', () => {
    new ArchiveManager();
});