/**
 * Firestore の既存クレジットデータ状態を確認するスクリプト
 */
const fs = require('fs');
const path = require('path');
const {
  getCreditCardItemsPathHelp,
  resolveCreditCardItemsPath,
} = require('./credit_card_items_path.cjs');

const credPath = path.join(process.env.USERPROFILE, '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
const tokens = config.tokens;

async function getToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: tokens.client_id || '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: tokens.client_secret || 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  return (await resp.json()).access_token;
}

async function main() {
  let itemsPath;
  try {
    ({ itemsPath } = resolveCreditCardItemsPath());
  } catch (e) {
    console.error(e.message);
    console.error(getCreditCardItemsPathHelp());
    process.exit(1);
  }

  const token = await getToken();
  const BASE = 'https://firestore.googleapis.com/v1/projects/kakeibo-f4a7a/databases/(default)/documents';

  // Get household
  const hh = await (await fetch(`${BASE}/households`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const hhId = hh.documents[0].name.split('/').pop();
  console.log('household:', hhId);

  // Get ALL expenses (paginate)
  const all = [];
  let pageToken = null;
  do {
    const url = `${BASE}/households/${hhId}/expenses?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
    const data = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json();
    for (const doc of (data.documents || [])) {
      const f = doc.fields;
      all.push({
        ym: f.yearMonth?.stringValue || '',
        catId: f.categoryId?.stringValue || '',
        catName: f.categoryName?.stringValue || '',
        amount: parseInt(f.amount?.integerValue || '0'),
        note: f.note?.stringValue || '',
        paidBy: f.paidBy?.stringValue || '',
      });
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  console.log(`\n全 expense レコード: ${all.length} 件\n`);

  // cat_4 だけ抽出
  const credit = all.filter(x => x.catId === 'cat_4');
  const isDetail = n => /^\d{4}\/\d{2}\/\d{2}\s/.test(n);
  const agg = credit.filter(x => !isDetail(x.note));
  const detail = credit.filter(x => isDetail(x.note));

  console.log(`=== クレジット(cat_4) ===`);
  console.log(`  集計行: ${agg.length} 件`);
  console.log(`  個別取引: ${detail.length} 件`);

  console.log(`\n--- 集計行（月別合計）---`);
  agg.sort((a, b) => a.ym.localeCompare(b.ym));
  for (const a of agg) {
    const n = a.note ? `"${a.note}"` : '(empty)';
    console.log(`  ${a.ym}  ${String(a.amount).padStart(8)}  note=${n}  paidBy=${a.paidBy}`);
  }

  // importData.json と比較
  console.log(`\n--- credit_card_items.json との比較 ---`);
  if (fs.existsSync(itemsPath)) {
    console.log(`  参照ファイル: ${itemsPath}`);
    const { byYearMonth } = JSON.parse(fs.readFileSync(itemsPath, 'utf-8'));
    console.log('  yearMonth | Firestore集計 | CSVパース | 差分');
    const allYm = new Set([...agg.map(a => a.ym), ...Object.keys(byYearMonth)]);
    for (const ym of [...allYm].sort()) {
      const fsAmt = agg.filter(a => a.ym === ym).reduce((s, a) => s + a.amount, 0);
      const csvAmt = byYearMonth[ym] || 0;
      const diff = csvAmt - fsAmt;
      const mark = diff === 0 ? '==' : diff > 0 ? `+${diff}` : `${diff}`;
      console.log(`  ${ym}  | ${String(fsAmt).padStart(8)} | ${String(csvAmt).padStart(8)} | ${mark}`);
    }
  } else {
    console.log(`  明細 JSON が見つかりません: ${itemsPath}`);
    console.log(getCreditCardItemsPathHelp());
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
