const fs = require('fs');
const path = require('path');

function validateTalentMaster() {
  try {
    const data = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'data', 'master', 'talents.json'),
      'utf8'
    ));

    // バージョン情報の検証
    if (!data.version || !data.lastUpdated) {
      throw new Error('バージョン情報または最終更新日が未設定です');
    }

    // カテゴリの検証
    const requiredCategories = ['hololive_jp', 'hololive_dev_is', 'hololive_en', 'hololive_id'];
    for (const category of requiredCategories) {
      if (!data.categories[category]) {
        throw new Error(`必須カテゴリ ${category} が見つかりません`);
      }
      
      const categoryData = data.categories[category];
      if (!categoryData.ja || !categoryData.en) {
        throw new Error(`カテゴリ ${category} の言語名称が不完全です`);
      }
      
      if (!categoryData.talents || typeof categoryData.talents !== 'object') {
        throw new Error(`カテゴリ ${category} のtalentsが不正です`);
      }
    }

    // タレントデータの検証
    Object.values(data.categories).forEach(category => {
      Object.values(category.talents).forEach(generation => {
        if (!generation.ja || !generation.en) {
          throw new Error('世代情報の言語名称が不完全です');
        }
        
        if (!Array.isArray(generation.members)) {
          throw new Error('membersが配列ではありません');
        }
        
        generation.members.forEach(member => {
          if (!member.name || !member.name.ja || !member.name.en) {
            throw new Error('タレント名の言語名称が不完全です');
          }
          
          if (!Array.isArray(member.aliases)) {
            throw new Error('aliasesが配列ではありません');
          }
          
          if (!member.id || !/^UC[\w-]{22}$/.test(member.id)) {
            throw new Error('YouTube Channel IDが不正です');
          }
        });
      });
    });

    console.log('バリデーション成功: タレントマスターデータは有効です');
    return true;
  } catch (error) {
    console.error('バリデーションエラー:', error.message);
    return false;
  }
}

// スクリプト実行
validateTalentMaster();
