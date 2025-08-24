const fs = require('fs').promises;
const path = require('path');

/**
 * 配信者のカテゴリを判定するエンジン
 */
class CategoryEngine {
  constructor() {
    this.talentData = null;
    this.normalizedMap = new Map();
  }

  /**
   * タレントマスターデータを読み込む
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      const talentDataPath = path.join(__dirname, '..', '..', 'data', 'master', 'talents.json');
      const data = await fs.readFile(talentDataPath, 'utf8');
      this.talentData = JSON.parse(data);
      this._buildNormalizedMap();
    } catch (error) {
      console.error('タレントマスターデータの読み込みに失敗:', error);
      throw error;
    }
  }

  /**
   * 正規化されたタレント名とカテゴリの対応マップを構築
   */
  _buildNormalizedMap() {
    Object.entries(this.talentData.categories).forEach(([categoryId, category]) => {
      Object.values(category.talents).forEach(generation => {
        generation.members.forEach(member => {
          // 正式名称（日本語）を登録
          const normalizedJa = this._normalizeName(member.name.ja);
          this.normalizedMap.set(normalizedJa, {
            categoryId,
            categoryName: {
              ja: category.ja,
              en: category.en
            },
            talent: member
          });

          // 正式名称（英語）を登録
          const normalizedEn = this._normalizeName(member.name.en);
          this.normalizedMap.set(normalizedEn, {
            categoryId,
            categoryName: {
              ja: category.ja,
              en: category.en
            },
            talent: member
          });

          // エイリアスを登録
          member.aliases.forEach(alias => {
            const normalizedAlias = this._normalizeName(alias);
            this.normalizedMap.set(normalizedAlias, {
              categoryId,
              categoryName: {
                ja: category.ja,
                en: category.en
              },
              talent: member
            });
          });
        });
      });
    });
  }

  /**
   * 配信者名を正規化する
   * @param {string} name 配信者名
   * @returns {string} 正規化された名前
   */
  _normalizeName(name) {
    return name
      .toLowerCase()
      // 絵文字とその前後のスペースを除去
      .replace(/\s*[\u{1F300}-\u{1F9FF}][\u{FE00}-\u{FE0F}]?\s*/gu, '')
      .replace(/\s*[\u{2600}-\u{26FF}][\u{FE00}-\u{FE0F}]?\s*/gu, '')
      // 各種記号を除去
      .replace(/[\s\-_・.]/g, '')
      .replace(/[！!？?]/g, '');
  }

  /**
   * 配信者のカテゴリを判定する
   * @param {string} streamerName 配信者名
   * @returns {Object|null} カテゴリ情報
   */
  determineCategory(streamerName) {
    if (!this.talentData) {
      throw new Error('タレントマスターデータが読み込まれていません');
    }

    const normalizedName = this._normalizeName(streamerName);
    const result = this.normalizedMap.get(normalizedName);

    if (result) {
      // Find the generation info for the talent
      let generationInfo = null;
      const category = this.talentData.categories[result.categoryId];
      if (category && category.talents) {
        for (const [genKey, genData] of Object.entries(category.talents)) {
          if (genData.members.some(member => member.id === result.talent.id)) {
            generationInfo = {
              ja: genData.ja,
              en: genData.en
            };
            break;
          }
        }
      }

      return {
        categoryId: result.categoryId,
        categoryName: result.categoryName,
        talent: result.talent,
        generationInfo: generationInfo
      };
    }

    // マッチしない場合は "その他" カテゴリを返す
    return {
      categoryId: 'others',
      categoryName: {
        ja: 'その他',
        en: 'Others'
      },
      talent: null
    };
  }

  /**
   * すべてのカテゴリ情報を取得する
   * @returns {Object[]} カテゴリ情報の配列
   */
  getAllCategories() {
    if (!this.talentData) {
      throw new Error('タレントマスターデータが読み込まれていません');
    }

    return Object.entries(this.talentData.categories).map(([id, category]) => ({
      id,
      name: {
        ja: category.ja,
        en: category.en
      }
    }));
  }
}

// シングルトンインスタンスをエクスポート
module.exports = new CategoryEngine();
