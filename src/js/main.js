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
        card.addEventListener('click', () => window.open(archive.videoUrl, '_blank'));
        
        // サムネイル画像の作成
        const img = document.createElement('img');
        img.src = archive.thumbnailUrl;
        img.alt = archive.title;
        
        // カードコンテンツの作成
        const content = document.createElement('div');
        content.className = 'archive-card-content';
        
        // タイトル
        const title = document.createElement('h2');
        title.textContent = archive.title;
        
        // ストリーマー名
        const streamer = document.createElement('div');
        streamer.className = 'streamer';
        streamer.textContent = archive.streamer;
        
        // 日付
        const date = document.createElement('div');
        date.className = 'date';
        date.textContent = new Date(archive.date).toLocaleString('ja-JP');
        
        // サマリー
        const summary = document.createElement('div');
        summary.className = 'summary';
        summary.textContent = archive.summary;
        
        // 見どころセクション
        const highlights = document.createElement('div');
        highlights.className = 'highlights';
        
        const highlightsTitle = document.createElement('strong');
        highlightsTitle.textContent = '見どころ：';
        
        const highlightsList = document.createElement('ul');
        archive.highlights.forEach(point => {
            const li = document.createElement('li');
            li.textContent = point;
            highlightsList.appendChild(li);
        });
        
        // 要素の組み立て
        highlights.appendChild(highlightsTitle);
        highlights.appendChild(highlightsList);
        
        content.appendChild(title);
        content.appendChild(streamer);
        content.appendChild(date);
        content.appendChild(summary);
        content.appendChild(highlights);
        
        card.appendChild(img);
        card.appendChild(content);
        
        return card;
    }
}

// アプリケーションの初期化
document.addEventListener('DOMContentLoaded', () => {
    new ArchiveManager();
});
