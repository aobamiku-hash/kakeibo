/**
 * クレカ明細一括インポートスクリプト（Firestore REST API 版）
 * 解決された credit_card_items.json を読み込み、
 * Firestore の households/{id}/expenses に個別取引として追加する。
 *
 * 使い方:
 *   node scripts/import_credit_cards.cjs              # 通常実行
 *   node scripts/import_credit_cards.cjs --dry-run    # ドライラン（書き込みなし）
 *   node scripts/import_credit_cards.cjs --delete-aggregates  # 集計行を削除後インポート
 *   node scripts/import_credit_cards.cjs --items-path C:\\path\\to\\credit_card_items.json
 */
const fs = require('fs');
const path = require('path');
const {
  getCreditCardItemsPathHelp,
  resolveCreditCardItemsPath,
} = require('./credit_card_items_path.cjs');

const { itemsPath: ITEMS_PATH } = resolveCreditCardItemsPath();
const PROJECT_ID = 'kakeibo-f4a7a';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const OLD_CATEGORY_ID = 'cat_4'; // 既存の集計行のカテゴリID
const SPLIT = [60, 40];

// cat_credit_* → cat_4 + subcategory マッピング
const SUBCATEGORY_MAP = {
  cat_credit_grocery:   { subcategory: 'grocery',   subcategoryName: '食費' },
  cat_credit_dining:    { subcategory: 'dining',    subcategoryName: '外食' },
  cat_credit_daily:     { subcategory: 'daily',     subcategoryName: '日用品' },
  cat_credit_shopping:  { subcategory: 'shopping',  subcategoryName: '買い物' },
  cat_credit_transport: { subcategory: 'transport', subcategoryName: '交通・車' },
  cat_credit_leisure:   { subcategory: 'leisure',   subcategoryName: 'レジャー' },
  cat_credit_other:     { subcategory: 'other',     subcategoryName: 'その他' },
};

// paidBy 名前 → Firebase UID マッピング
const PAIDBY_UID_MAP = {
  shinpei: 'A6H88EKmW3X4S1jmpNNNsFWDGh52',
  yuka: 'gc994X7gigSHjx1DOCsEZqyyIw03',
};

const isDryRun = process.argv.includes('--dry-run');
const deleteAggregates = process.argv.includes('--delete-aggregates');

if (isDryRun) {
  console.log('🔍 ドライランモード — Firestore への書き込みは行いません\n');
}

// ── Firebase CLI のトークンを取得・リフレッシュ ──
const credPath = path.join(
  process.env.USERPROFILE || process.env.HOME,
  '.config', 'configstore', 'firebase-tools.json'
);

async function getAccessToken() {
  const config = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
  const tokens = config.tokens;
  if (!tokens) throw new Error('firebase-tools.json に tokens がありません');

  // 有効期限チェック（余裕を持って60秒前に判定）
  const expiresAt = tokens.expires_at || 0;
  if (Date.now() < expiresAt - 60000) {
    return tokens.access_token;
  }

  // トークンをリフレッシュ
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
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`トークンリフレッシュ失敗: ${t}`);
  }
  const data = await resp.json();

  // 更新したトークンを保存
  config.tokens.access_token = data.access_token;
  config.tokens.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
  fs.writeFileSync(credPath, JSON.stringify(config, null, 2), 'utf-8');
  return data.access_token;
}

// ── Firestore REST ヘルパー ──
async function firestoreGet(path_, token) {
  const r = await fetch(`${BASE_URL}/${path_}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`GET ${path_} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function firestoreQuery(parentPath, collectionId, query, token) {
  const r = await fetch(`${BASE_URL}/${parentPath}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], ...query } }),
  });
  if (!r.ok) throw new Error(`runQuery ${parentPath}/${collectionId} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function firestoreCreate(collPath, docData, token) {
  const r = await fetch(`${BASE_URL}/${collPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: docData }),
  });
  if (!r.ok) throw new Error(`CREATE ${collPath} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function firestoreDelete(docPath, token) {
  const r = await fetch(`${BASE_URL}/${docPath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`DELETE ${docPath} → ${r.status} ${await r.text()}`);
}

// ── Firestore 値変換 ──
function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number' && Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number') return { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFsValue(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function toFsDoc(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFsValue(v);
  return fields;
}

// ── メイン ──
async function main() {
  let token;
  try {
    token = await getAccessToken();
  } catch (e) {
    console.error('認証エラー:', e.message);
    console.error('npx firebase login を実行してください');
    process.exit(1);
  }

  // 明細 JSON 読み込み
  if (!fs.existsSync(ITEMS_PATH)) {
    console.error(`ファイルが見つかりません: ${ITEMS_PATH}`);
    console.error(getCreditCardItemsPathHelp());
    process.exit(1);
  }
  console.log(`📄 明細JSON: ${ITEMS_PATH}`);
  const { items, totalItems, totalAmount, byYearMonth } = JSON.parse(
    fs.readFileSync(ITEMS_PATH, 'utf-8')
  );
  console.log(`📂 読み込み: ${totalItems} 件 / ¥${totalAmount.toLocaleString()}`);
  console.log('月別件数:');
  for (const [ym, amt] of Object.entries(byYearMonth)) {
    const cnt = items.filter(i => i.yearMonth === ym).length;
    console.log(`  ${ym}  ¥${String(amt.toLocaleString()).padStart(10)}  (${cnt}件)`);
  }
  console.log();

  // 世帯 ID 取得
  const hhResp = await firestoreGet('households', token);
  if (!hhResp.documents || hhResp.documents.length === 0) {
    console.error('世帯が見つかりません');
    process.exit(1);
  }
  const hhPath = hhResp.documents[0].name; // full resource path
  const householdId = hhPath.split('/').pop();
  console.log(`🏠 世帯: ${householdId}`);

  const expCollPath = `households/${householdId}/expenses`;
  const expParentPath = `households/${householdId}`;

  // --delete-aggregates: CSVがある月の既存 cat_4 集計行を削除
  if (deleteAggregates && !isDryRun) {
    const targetMonths = Object.keys(byYearMonth);
    console.log('\n🗑️  既存の集計クレジット行を削除中...');
    for (const ym of targetMonths) {
      const queryResult = await firestoreQuery(expParentPath, 'expenses', {
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'yearMonth' }, op: 'EQUAL', value: { stringValue: ym } } },
              { fieldFilter: { field: { fieldPath: 'categoryId' }, op: 'EQUAL', value: { stringValue: OLD_CATEGORY_ID } } },
            ],
          },
        },
      }, token);
      for (const r of (queryResult || [])) {
        if (!r.document) continue;
        const note = r.document.fields?.note?.stringValue || '';
        const isAggregate = !note.match(/^\d{4}\/\d{2}\/\d{2}\s/);
        if (isAggregate) {
          const docRelPath = r.document.name.split('/documents/')[1];
          await firestoreDelete(docRelPath, token);
          const amt = r.document.fields?.amount?.integerValue || '?';
          console.log(`  削除: ${ym} note="${note}" ¥${amt}`);
        }
      }
    }
    console.log('  完了\n');
  }

  // 既存の個別取引キーを収集（重複防止）
  console.log('🔎 既存の個別取引を確認中...');
  const existingKeys = new Set();
  let pageToken = null;
  do {
    const url = `${BASE_URL}/${expCollPath}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await resp.json();
    for (const doc of (data.documents || [])) {
      const note = doc.fields?.note?.stringValue || '';
      const amt = doc.fields?.amount?.integerValue || doc.fields?.amount?.doubleValue || '';
      const m = note.match(/^(\d{4}\/\d{2}\/\d{2}) (.+)$/);
      if (m) existingKeys.add(`${m[1]}|${m[2]}|${amt}`);
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  console.log(`  既存個別取引: ${existingKeys.size} 件\n`);

  // 書き込み対象をフィルタ
  let skipped = 0;
  const toWrite = items.filter(item => {
    const key = `${item.date}|${item.storeName}|${item.amount}`;
    if (existingKeys.has(key)) { skipped++; return false; }
    return true;
  });

  console.log(`📝 書き込み予定: ${toWrite.length} 件 / スキップ(重複): ${skipped} 件`);

  if (isDryRun) {
    console.log('\n[ドライラン] 書き込み対象の先頭20件:');
    for (const item of toWrite.slice(0, 20)) {
      console.log(`  ${item.yearMonth}  ¥${String(item.amount).padStart(7)}  [${item.paidBy}]  ${item.date} ${item.storeName}`);
    }
    console.log(`\n✅ ドライラン完了。実際に書き込むには --dry-run を外して実行してください。`);
    return;
  }

  // 書き込み（並列で最大5件同時）
  const CONCURRENCY = 5;
  let added = 0;
  for (let i = 0; i < toWrite.length; i += CONCURRENCY) {
    const chunk = toWrite.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(item => {
      const sub = SUBCATEGORY_MAP[item.categoryId] || { subcategory: 'other', subcategoryName: 'その他' };
      return firestoreCreate(expCollPath, toFsDoc({
        yearMonth: item.yearMonth,
        categoryId: 'cat_4',
        amount: item.amount,
        paidBy: PAIDBY_UID_MAP[item.paidBy] || item.paidBy,
        split: SPLIT,
        note: `${item.date} ${item.storeName}`,
        subcategory: sub.subcategory,
        subcategoryName: sub.subcategoryName,
        createdAt: new Date().toISOString(),
        createdBy: 'credit_card_import',
      }), token);
    }));
    added += chunk.length;
    process.stdout.write(`  書き込み中: ${added}/${toWrite.length} 件\r`);
  }

  console.log(`\n\n✅ インポート完了！`);
  console.log(`   追加: ${added} 件`);
  console.log(`   スキップ（重複）: ${skipped} 件`);
}

main().catch(err => {
  console.error('\nエラー:', err.message || err);
  process.exit(1);
});
