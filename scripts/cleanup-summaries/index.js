const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../../src/data/summaries.json');
const DAYS_LIMIT = 14;

function main() {
  const now = new Date();
  const limit = new Date(now.getTime() - DAYS_LIMIT * 24 * 60 * 60 * 1000);

  // ファイル読み込み
  const raw = fs.readFileSync(FILE_PATH, 'utf-8');
  const data = JSON.parse(raw);

  // 14日以内のデータだけ残す
  const filtered = data.filter(item => {
    if (!item.date) return false;
    const itemDate = new Date(item.date);
    return itemDate >= limit;
  });

  // 上書き保存
  fs.writeFileSync(FILE_PATH, JSON.stringify(filtered, null, 2), 'utf-8');
  console.log(`Deleted ${data.length - filtered.length} old entries.`);
}

main();