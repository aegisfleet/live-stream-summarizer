# ホロライブ配信アーカイブサマリー

ホロライブプロダクションのYouTubeライブ配信アーカイブを自動で要約し、一覧で閲覧できるWebサイトです。

## 概要

日々数多くのライブ配信が行われており、すべてのアーカイブを視聴することは時間的に困難です。このサイトでは、配信内容をAIによって自動で要約し提供することで、ファンがより多くのコンテンツに触れる機会を創出することを目指しています。

### 主な機能

- 配信アーカイブの要約閲覧
  - 配信の概要（200字程度）
  - 主要なトピックや見どころ（3〜5点）
- 配信者名によるフィルタリング
- レスポンシブデザイン対応

### 対象範囲

- ✅ ホロライブプロダクション所属タレントのYouTubeライブ配信アーカイブ
- ❌ メンバーシップ限定配信
- ❌ YouTube以外のプラットフォームでの配信
- ❌ プレミア公開された動画

## システム構成

- フロントエンド: HTML, CSS, JavaScript
- ホスティング: GitHub Pages
- CI/CD・自動化: GitHub Actions
- コンテンツ生成: Gemini API
- データソース:
  - 配信スケジュール: schedule.hololive.tv
  - 動画情報: YouTube Data API v3
  - 文字起こし: YouTube Transcript API

## セットアップ

1. 必要な環境変数を設定

    ```bash
    YOUTUBE_API_KEY=your_youtube_api_key
    GEMINI_API_KEY=your_gemini_api_key
    ```

2. 依存パッケージのインストール

    ```bash
    npm install
    ```

3. ローカルでの実行

    ```bash
    # 配信スケジュールの取得
    npm run fetch-schedule

    # アーカイブの確認
    npm run check-archive

    # 要約の生成
    npm run summarize

    # サイトのビルド
    npm run build

    # 開発サーバーの起動
    npm start
    ```

## 自動更新

- GitHub Actionsにより1時間ごとに自動で更新
- 新規アーカイブの検出と要約の生成
- GitHub Pagesへの自動デプロイ

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。
