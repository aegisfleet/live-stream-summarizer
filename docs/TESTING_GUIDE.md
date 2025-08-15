# ローカルテスト環境セットアップガイド

このドキュメントでは、Cypress を使用してフロントエンドの変更を検証するためのローカルテスト環境をセットアップする手順を説明します。

## 前提条件

- Node.js と npm
- `jq` (コマンドライン JSON プロセッサ)

## セットアップ手順

### 1. プロジェクトの依存関係をインストールする

`package.json` で定義されている必要な Node.js パッケージをインストールします。

```bash
npm install
```

### 2. 日本語フォントのインストール (スクリーンショット検証用)

失敗時のスクリーンショットで日本語が正しく表示されるように、日本語フォントパッケージをインストールすることをお勧めします。

```bash
# Debian/Ubuntu ベースのシステムの場合
sudo apt-get update
sudo apt-get install -y fonts-takao-pgothic fonts-ipaexfont-gothic
```

### 3. アプリケーションサーバーを起動する

ウェブサイトを配信するためにローカル開発サーバーを起動します。これは別のターミナルウィンドウで実行するのが最適です。

```bash
npm start
```

サーバーは `http://localhost:3000` で実行されます。

## テストスクリプトの実行

環境がセットアップされ、サーバーが実行されたら、Cypress テストを実行できます。

### テストスクリプトの例

`cypress/e2e/verification.cy.js` に以下の内容でファイルを作成します。

```javascript
describe('Frontend Verification', () => {
  it('should allow navigation to a detail page and back to home', () => {
    // a. メインページに移動する
    cy.visit('/');

    // メインコンテンツがロードされるのを待ち、最初のビデオを見つける
    cy.get('#archive-grid .archive-card', { timeout: 30000 }).should('have.length.gt', 0);

    // b. 最初のビデオリンクをクリックして詳細ページに移動する
    cy.get('#archive-grid .archive-card .clickable-thumbnail').first().click();

    // d. 「みどころ」リストを見つけ、最初の3つの項目をクリックする
    cy.get('#highlights-list .highlight-item').should('have.length.gt', 0);
    cy.get('#highlights-list .highlight-item').then($items => {
        const itemsToClick = Math.min(3, $items.length);
        for (let i = 0; i < itemsToClick; i++) {
            cy.wrap($items[i]).click();
            cy.wait(500); // JSが実行されるのを待つための短い遅延
        }
    });

    // e. 「ホームに戻る」ボタンをクリックする
    cy.get('#back-to-home').should('be.visible').click();

    // f. 現在のURLがホームページのURLであることを確認する
    cy.url().should('eq', 'http://localhost:3000/');
  });
});
```

### テストの実行

ターミナルから Cypress テストを実行します。Cypress は `verification.cy.js` ファイルを自動的に見つけて実行します。

```bash
npx cypress run
```

ターミナル出力にテスト結果が表示されます。
