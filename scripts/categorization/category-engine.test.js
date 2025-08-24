const path = require('path');
const fs = require('fs').promises;

// モックの設定
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn()
  }
}));

describe('CategoryEngine', () => {
  let categoryEngine;

  beforeEach(async () => {
    // テスト用のモックデータをセットアップ
    fs.readFile.mockResolvedValue(JSON.stringify({
      categories: {
        hololive_jp: {
          ja: 'ホロライブJP',
          en: 'Hololive JP',
          talents: {
            generation_0: {
              members: [{
                name: {
                  ja: 'ときのそら',
                  en: 'Tokino Sora'
                },
                aliases: ['そらちゃん', 'Sora-chan'],
                id: 'UCp6993wxpyDPHUpavwDFqgg'
              }]
            }
          }
        }
      }
    }));

    categoryEngine = require('./category-engine');
    await categoryEngine.initialize();
  });

  test('正式名称（日本語）で配信者を検索できる', () => {
    const result = categoryEngine.determineCategory('ときのそら');
    expect(result.categoryId).toBe('hololive_jp');
    expect(result.talent.name.ja).toBe('ときのそら');
  });

  test('正式名称（英語）で配信者を検索できる', () => {
    const result = categoryEngine.determineCategory('Tokino Sora');
    expect(result.categoryId).toBe('hololive_jp');
    expect(result.talent.name.en).toBe('Tokino Sora');
  });

  test('エイリアスで配信者を検索できる', () => {
    const result = categoryEngine.determineCategory('そらちゃん');
    expect(result.categoryId).toBe('hololive_jp');
    expect(result.talent.name.ja).toBe('ときのそら');
  });

  test('表記揺れを含む名前で配信者を検索できる', () => {
    const result = categoryEngine.determineCategory('Tokino  Sora');
    expect(result.categoryId).toBe('hololive_jp');
    expect(result.talent.name.en).toBe('Tokino Sora');
  });

  test('未知の配信者は"その他"カテゴリに分類される', () => {
    const result = categoryEngine.determineCategory('Unknown Streamer');
    expect(result.categoryId).toBe('others');
    expect(result.categoryName.ja).toBe('その他');
    expect(result.categoryName.en).toBe('Others');
  });

  test('全カテゴリ一覧を取得できる', () => {
    const categories = categoryEngine.getAllCategories();
    expect(categories).toHaveLength(1);
    expect(categories[0].id).toBe('hololive_jp');
    expect(categories[0].name.ja).toBe('ホロライブJP');
    expect(categories[0].name.en).toBe('Hololive JP');
  });
});
