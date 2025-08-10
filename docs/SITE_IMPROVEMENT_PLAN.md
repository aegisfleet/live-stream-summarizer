# サイト改修計画：SEO向上のための個別ページ生成

## 概要

現在のサイトはトップページのみの構成となっており、各配信の詳細情報はクエリパラメータ（`?videoId=xxx`）で表示されています。SEO向上とユーザビリティ改善のため、各配信に対して個別のHTMLページを生成し、専用URLでのアクセスを可能にする改修を行います。

## 現状分析

### 現在の構造
- **トップページ**: `index.html` - 全配信の一覧表示
- **詳細表示**: `index.html?videoId=xxx` - クエリパラメータによる個別表示
- **データソース**: `src/data/summaries.json` - 全配信データ
- **フレームワーク**: バニラJavaScript + Express.js

### 現在の問題点
1. **SEO面**: 個別ページが存在しないため、検索エンジンでの発見性が低い
2. **URL構造**: クエリパラメータベースのため、SNSでの共有時に見た目が悪い
3. **ユーザビリティ**: 個別ページのブックマークが困難
4. **メタデータ**: 個別ページ用のOGPやメタタグが不十分

## 改修計画

### 1. 個別ページ生成システムの構築

#### 1.1 静的ページ生成スクリプトの作成
```javascript
// scripts/generate-pages/index.js
```
- `summaries.json`を読み込み、各配信に対して個別HTMLファイルを生成
- テンプレートベースの生成システムを構築
- 生成されたファイルは `src/pages/` ディレクトリに配置

#### 1.2 URL構造の設計
```
現在: /?videoId=xxx
改修後: /pages/xxx.html
```

#### 1.3 ページテンプレートの作成
- `src/templates/detail-page.html` - 個別ページ用テンプレート
- 既存のCSSとJavaScriptを再利用
- 個別ページ専用のメタデータとOGP設定

### 2. フロントエンド改修

#### 2.1 ボタン変更
- **「修正依頼」ボタン** → **「詳細」ボタン**に変更
- ボタンクリック時に個別ページに遷移するよう修正

#### 2.2 共有機能の更新
- **コピー機能**: 新しい個別ページURLを使用
- **𝕏で共有**: 新しい個別ページURLを使用

#### 2.3 ナビゲーション改善
- 個別ページからトップページへの戻るボタン
- 関連配信へのリンク機能

### 3. GitHub Pages対応

#### 3.1 静的サイト生成
- GitHub Pagesは静的サイトホスティングのため、サーバーサイド処理は不要
- 個別ページは事前生成された静的HTMLファイルとして配信
- `src/pages/` ディレクトリに生成されたファイルがそのまま公開される

#### 3.2 GitHub Actions統合
- `update-summaries.yml`ワークフローにページ生成ステップを追加
- 要約生成後に個別ページを自動生成
- 生成されたページもGitHub Pagesに自動デプロイ

### 4. SEO対策

#### 4.1 メタデータ最適化
- 各ページに適切なtitle、description、keywords
- 構造化データ（JSON-LD）の追加
- カノニカルURLの設定

#### 4.2 OGP設定
- 個別ページ用のOGP画像生成
- 動的OGPメタタグの設定

#### 4.3 サイトマップ生成
- `sitemap.xml`の自動生成
- 個別ページのURLを含むサイトマップ

## 実装詳細

### Phase 1: 基盤構築

#### 1.1 ディレクトリ構造の作成
```
src/
├── templates/
│   └── detail-page.html
├── pages/
│   └── [生成された個別ページ]
└── scripts/
    └── generate-pages/
        └── index.js
```

#### 1.2 ページ生成スクリプト
```javascript
// scripts/generate-pages/index.js
const fs = require('fs');
const path = require('path');

class PageGenerator {
    constructor() {
        this.templatePath = path.join(__dirname, '../../src/templates/detail-page.html');
        this.outputDir = path.join(__dirname, '../../src/pages');
        this.dataPath = path.join(__dirname, '../../src/data/summaries.json');
        this.sitemapPath = path.join(__dirname, '../../src/sitemap.xml');
    }

    async generatePages() {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
        
        // 出力ディレクトリの作成
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        for (const archive of data) {
            await this.generatePage(archive);
        }
        
        // サイトマップ生成
        this.generateSitemap(data);
        
        console.log(`Generated ${data.length} individual pages and sitemap`);
    }

    async generatePage(archive) {
        const template = fs.readFileSync(this.templatePath, 'utf8');
        const pageContent = this.replaceTemplateVariables(template, archive);
        const outputPath = path.join(this.outputDir, `${archive.videoId}.html`);
        
        fs.writeFileSync(outputPath, pageContent);
        console.log(`Generated: ${archive.videoId}.html`);
    }

    replaceTemplateVariables(template, archive) {
        return template
            .replace(/\{\{TITLE\}\}/g, archive.title)
            .replace(/\{\{DESCRIPTION\}\}/g, archive.overview.summary)
            .replace(/\{\{VIDEO_ID\}\}/g, archive.videoId)
            .replace(/\{\{STREAMER\}\}/g, archive.streamer)
            .replace(/\{\{DATE\}\}/g, archive.date)
            .replace(/\{\{DURATION\}\}/g, archive.duration)
            .replace(/\{\{THUMBNAIL_URL\}\}/g, archive.thumbnailUrl)
            .replace(/\{\{TAGS\}\}/g, archive.tags.join(', '));
    }

    generateSitemap(archives) {
        const baseUrl = 'https://aegisfleet.github.io/live-stream-summarizer';
        let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
        sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
        
        // トップページ
        sitemap += `  <url>\n    <loc>${baseUrl}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
        
        // 個別ページ
        archives.forEach(archive => {
            sitemap += `  <url>\n    <loc>${baseUrl}/pages/${archive.videoId}.html</loc>\n    <lastmod>${archive.date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
        });
        
        sitemap += '</urlset>';
        
        fs.writeFileSync(this.sitemapPath, sitemap);
        console.log('Generated sitemap.xml');
    }
}

// スクリプト実行
if (require.main === module) {
    const generator = new PageGenerator();
    generator.generatePages().catch(console.error);
}
```

### Phase 2: フロントエンド改修

#### 2.1 main.jsの修正
```javascript
// 修正依頼ボタンを詳細ボタンに変更
const detailButton = document.createElement('button');
detailButton.textContent = '詳細';
detailButton.className = 'detail-button';
detailButton.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.href = `/pages/${archive.videoId}.html`;
});

// 共有URLの更新
const shareUrl = `${window.location.origin}/pages/${archive.videoId}.html`;
```

#### 2.2 個別ページ用JavaScript
```javascript
// src/js/detail-page.js
class DetailPageManager {
    constructor() {
        this.videoId = this.extractVideoId();
        this.archiveData = null;
        this.init();
    }

    extractVideoId() {
        const path = window.location.pathname;
        const match = path.match(/\/pages\/(.+)\.html$/);
        return match ? match[1] : null;
    }

    async init() {
        await this.loadData();
        this.renderDetailPage();
        this.setupShareButtons();
        this.setupNavigation();
    }

    async loadData() {
        try {
            const response = await fetch('../data/summaries.json');
            const data = await response.json();
            this.archiveData = data.find(archive => archive.videoId === this.videoId);
            
            if (!this.archiveData) {
                this.showNotFound();
                return;
            }
        } catch (error) {
            console.error('データの読み込みに失敗しました:', error);
            this.showError();
        }
    }

    renderDetailPage() {
        if (!this.archiveData) return;
        
        // ページタイトルの更新
        document.title = `${this.archiveData.title} - ホロライブ配信アーカイブサマリー`;
        
        // メタデータの更新
        this.updateMetaData();
        
        // コンテンツの表示
        this.renderContent();
    }

    updateMetaData() {
        // OGPメタタグの更新
        const ogTitle = document.querySelector('meta[property="og:title"]');
        const ogDescription = document.querySelector('meta[property="og:description"]');
        const ogUrl = document.querySelector('meta[property="og:url"]');
        const ogImage = document.querySelector('meta[property="og:image"]');
        
        if (ogTitle) ogTitle.setAttribute('content', this.archiveData.title);
        if (ogDescription) ogDescription.setAttribute('content', this.archiveData.overview.summary);
        if (ogUrl) ogUrl.setAttribute('content', window.location.href);
        if (ogImage) ogImage.setAttribute('content', this.archiveData.thumbnailUrl);
        
        // 構造化データの追加
        this.addStructuredData();
    }

    addStructuredData() {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": this.archiveData.title,
            "description": this.archiveData.overview.summary,
            "thumbnailUrl": this.archiveData.thumbnailUrl,
            "uploadDate": this.archiveData.date,
            "duration": `PT${Math.floor(this.archiveData.duration / 3600)}H${Math.floor((this.archiveData.duration % 3600) / 60)}M`,
            "url": `https://www.youtube.com/watch?v=${this.archiveData.videoId}`
        });
        document.head.appendChild(script);
    }

    setupNavigation() {
        // トップページへの戻るボタン
        const backButton = document.getElementById('back-to-home');
        if (backButton) {
            backButton.classList.add('show');
            backButton.addEventListener('click', () => {
                window.location.href = '../';
            });
        }
    }
}
```

### Phase 3: GitHub Actions統合

#### 3.1 ワークフロー修正
```yaml
# .github/workflows/update-summaries.yml に追加
- name: Generate individual pages
  run: npm run generate-pages

- name: Generate sitemap
  run: npm run generate-sitemap
```

#### 3.2 package.jsonスクリプト追加
```json
{
  "scripts": {
    "generate-pages": "node scripts/generate-pages",
    "generate-sitemap": "node scripts/generate-sitemap"
  }
}
```

#### 3.3 静的ファイル配信
- GitHub Pagesが自動的に `src/pages/` 内のHTMLファイルを配信
- `src/sitemap.xml` も自動的に公開される
- カスタム404ページの設定（`src/404.html`）

## 追加提案

### 1. パフォーマンス最適化
- **画像最適化**: サムネイル画像のWebP変換
- **遅延読み込み**: 画像とコンテンツの遅延読み込み
- **GitHub Pagesキャッシュ**: 適切なファイル名とディレクトリ構造によるキャッシュ最適化

### 2. ユーザビリティ向上
- **関連配信表示**: 同じ配信者の他の配信へのリンク
- **検索機能**: タイトルやタグでの検索機能
- **フィルター保持**: 個別ページから戻る際のフィルター状態保持

### 3. アクセシビリティ改善
- **ARIA属性**: 適切なARIA属性の追加
- **キーボードナビゲーション**: キーボードでの操作対応
- **スクリーンリーダー対応**: 音声読み上げ対応

### 4. 分析・監視
- **Google Analytics**: 個別ページのトラッキング
- **エラー監視**: 404エラーやその他のエラー監視
- **パフォーマンス監視**: Core Web Vitalsの監視

## 実装スケジュール

### Week 1: 基盤構築
- ディレクトリ構造作成
- ページ生成スクリプト開発
- テンプレート作成
- package.jsonスクリプト追加

### Week 2: フロントエンド改修
- main.jsの修正（ボタン変更、URL更新）
- 個別ページ用JavaScript開発
- ナビゲーション改善

### Week 3: GitHub Actions統合
- update-summaries.ymlワークフロー修正
- ページ生成スクリプト統合
- 自動デプロイ設定確認

### Week 4: SEO対策
- メタデータ最適化
- 構造化データ追加
- サイトマップ生成
- OGP設定

### Week 5: テスト・デプロイ
- ローカル環境でのテスト
- GitHub Actionsでの動作確認
- 本番デプロイと動作確認

## 期待される効果

### SEO効果
- **検索エンジンでの発見性向上**: 個別ページの存在により検索結果での露出増加
- **構造化データ**: リッチスニペット表示の可能性
- **内部リンク強化**: 関連配信へのリンクによるSEO効果

### ユーザビリティ向上
- **ブックマーク可能**: 個別ページの直接ブックマーク
- **SNS共有改善**: 見やすいURLでの共有
- **ナビゲーション改善**: 直感的なページ遷移

### 技術的改善
- **保守性向上**: テンプレートベースの管理
- **拡張性**: 新機能追加時の柔軟性
- **パフォーマンス**: 適切なキャッシュ戦略

## リスクと対策

### リスク
1. **ファイル数増加**: 大量のHTMLファイル生成
2. **生成時間**: GitHub Actionsでのページ生成処理時間
3. **ストレージ容量**: 生成ファイルの容量増加
4. **GitHub Pages制限**: ファイル数や容量の制限

### 対策
1. **段階的生成**: 必要に応じた段階的ページ生成
2. **GitHub Actions最適化**: 並列処理とキャッシュ活用
3. **定期的クリーンアップ**: 古いファイルの自動削除
4. **ファイル圧縮**: 不要な空白や改行の削除

## 結論

この改修により、サイトのSEO効果とユーザビリティが大幅に向上し、より多くのユーザーにアクセスしていただけるサイトとなります。段階的な実装により、リスクを最小限に抑えながら効果的な改善を実現できます。
