class ArchiveManager {
    constructor() {
        this.archiveData = [];
        this.filteredData = [];
        this.streamers = new Set();
        this.selectedStreamers = new Set();
        
        this.init();
    }
    
    async init() {
        await this.loadData();
        this.setupFilterButtons();
        this.renderArchives();
    }
    
    async loadData() {
        try {
            const response = await fetch('/data/summaries.json');
            this.archiveData = await response.json();
            this.filteredData = [...this.archiveData];
            
            // ストリーマー一覧の取得
            this.archiveData.forEach(archive => {
                this.streamers.add(archive.streamer);
            });
        } catch (error) {
            console.error('データの読み込みに失敗しました:', error);
        }
    }
    
    setupFilterButtons() {
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
        this.streamers.forEach(streamer => {
            const button = document.createElement('button');
            button.textContent = streamer;
            button.addEventListener('click', () => this.toggleStreamer(streamer, button));
            filterContainer.appendChild(button);
        });
        
        // すべて表示ボタンの設定
        selectAllButton.addEventListener('click', () => this.selectAll());
        
        // 初期状態ですべて選択
        this.selectAll();
    }
    
    toggleStreamer(streamer, button) {
        if (this.selectedStreamers.has(streamer)) {
            this.selectedStreamers.delete(streamer);
            button.classList.remove('active');
        } else {
            this.selectedStreamers.add(streamer);
            button.classList.add('active');
        }
        
        this.filterArchives();
    }
    
    selectAll() {
        const buttons = document.querySelectorAll('#filter-buttons button');
        this.selectedStreamers = new Set(this.streamers);
        buttons.forEach(button => button.classList.add('active'));
        this.filterArchives();
    }
    
    filterArchives() {
        this.filteredData = this.archiveData.filter(archive =>
            this.selectedStreamers.has(archive.streamer)
        );
        this.renderArchives();
    }
    
    renderArchives() {
        const grid = document.getElementById('archive-grid');
        if (!grid) {
            console.error('アーカイブグリッド要素が見つかりません。要素ID: archive-grid');
            return;
        }
        
        grid.innerHTML = '';
        
        // 日付降順でソート
        this.filteredData
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .forEach(archive => {
                const card = this.createArchiveCard(archive);
                grid.appendChild(card);
            });
    }
    
    createArchiveCard(archive) {
        const card = document.createElement('div');
        card.className = 'archive-card';
        // カード全体のクリックイベントを削除し、クリック可能な要素を明確にします。
        // これにより、ユーザーがどこをクリックすればよいか分かりやすくなります。
        const openVideo = (startTime = 0) => {
            const url = `https://www.youtube.com/watch?v=${archive.videoId}` + (startTime > 0 ? `&t=${startTime}s` : '');
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
        
        // 概要セクション
        const overview = document.createElement('div');
        overview.className = 'overview';
        
        const overviewSummary = document.createElement('p');
        overviewSummary.className = 'overview-summary';
        overviewSummary.textContent = archive.overview.summary;
        
        const overviewMood = document.createElement('p');
        overviewMood.className = 'overview-mood';
        overviewMood.textContent = `配信の雰囲気：${archive.overview.mood}`;
        
        const duration = document.createElement('p');
        duration.className = 'duration';
        duration.textContent = `配信時間：${archive.overview.duration}`;
        
        overview.appendChild(overviewSummary);
        overview.appendChild(overviewMood);
        overview.appendChild(duration);
        
        // 見どころセクション
        const highlights = document.createElement('div');
        highlights.className = 'highlights';
        
        const highlightsTitle = document.createElement('strong');
        highlightsTitle.textContent = '見どころ：';
        
        const highlightsList = document.createElement('ul');
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
            li.appendChild(type);
            li.appendChild(description);
            highlightsList.appendChild(li);
        });
        
        // タグセクション
        const tags = document.createElement('div');
        tags.className = 'tags';
        archive.tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'tag';
            tagSpan.textContent = `#${tag}`;
            tags.appendChild(tagSpan);
        });
        
        // 最終更新日
        const lastUpdated = document.createElement('div');
        lastUpdated.className = 'last-updated';
        lastUpdated.textContent = `最終更新：${new Date(archive.lastUpdated).toLocaleString('ja-JP')}`;
        
        // 要素の組み立て
        highlights.appendChild(highlightsTitle);
        highlights.appendChild(highlightsList);
        
        content.appendChild(title);
        content.appendChild(overview);
        content.appendChild(highlights);
        content.appendChild(tags);
        content.appendChild(lastUpdated);
        
        card.appendChild(img);
        card.appendChild(content);
        
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
}

// アプリケーションの初期化
document.addEventListener('DOMContentLoaded', () => {
    new ArchiveManager();
});
