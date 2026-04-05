/**
 * クレカ個別取引のcategoryIdをcat_credit_*からcat_4に移行し、
 * subcategory / subcategoryName フィールドを追加するスクリプト。
 *
 * 使い方:
 *   node scripts/migrate_credit_categories.cjs --dry-run   # 確認のみ
 *   node scripts/migrate_credit_categories.cjs              # 本番実行
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'kakeibo-f4a7a';
const HOUSEHOLD_ID = 'YMRsnyEODKRR23HIgd5D';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const PARENT_PATH = `households/${HOUSEHOLD_ID}`;
const COLLECTION_ID = 'expenses';

const isDryRun = process.argv.includes('--dry-run');

// cat_credit_* → subcategory マッピング
const SUBCATEGORY_MAP = {
  cat_credit_grocery:   { subcategory: 'grocery',   subcategoryName: '食費',     emoji: '🛒' },
  cat_credit_dining:    { subcategory: 'dining',    subcategoryName: '外食',     emoji: '🍽️' },
  cat_credit_daily:     { subcategory: 'daily',     subcategoryName: '日用品',   emoji: '🏪' },
  cat_credit_shopping:  { subcategory: 'shopping',  subcategoryName: '買い物',   emoji: '🛍️' },
  cat_credit_transport: { subcategory: 'transport', subcategoryName: '交通・車', emoji: '🚗' },
  cat_credit_leisure:   { subcategory: 'leisure',   subcategoryName: 'レジャー', emoji: '🎯' },
  cat_credit_other:     { subcategory: 'other',     subcategoryName: 'その他',   emoji: '❓' },
};

// ── Firebase CLI のトークンを取得・リフレッシュ ──
const credPath = path.join(
  process.env.USERPROFILE || process.env.HOME,
  '.config', 'configstore', 'firebase-tools.json'
);

async function getAccessToken() {
  const config = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
  const tokens = config.tokens;
  if (!tokens) throw new Error('firebase-tools.json に tokens がありません');
  const expiresAt = tokens.expires_at || 0;
  if (Date.now() < expiresAt - 60000) return tokens.access_token;

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
  if (!resp.ok) throw new Error(`トークンリフレッシュ失敗: ${await resp.text()}`);
  const data = await resp.json();
  config.tokens.access_token = data.access_token;
  config.tokens.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
  fs.writeFileSync(credPath, JSON.stringify(config, null, 2), 'utf-8');
  return data.access_token;
}

// ── Firestore REST ヘルパー ──
async function firestoreQuery(parentPath, collectionId, structuredQuery, token) {
  const r = await fetch(`${BASE_URL}/${parentPath}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], ...structuredQuery } }),
  });
  if (!r.ok) throw new Error(`runQuery失敗: ${r.status} ${await r.text()}`);
  return r.json();
}

async function firestorePatch(docPath, fields, token) {
  const params = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const r = await fetch(`${BASE_URL}/${docPath}?${params}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`PATCH ${docPath} → ${r.status} ${await r.text()}`);
  return r.json();
}

// ── メイン処理 ──
async function main() {
  if (isDryRun) console.log('🔍 ドライランモード\n');

  const token = await getAccessToken();

  // cat_credit_* で始まるcategoryIdの全ドキュメントを取得
  // Firestore REST APIではstartsWith的なフィルタがないので、全expenses取得してフィルタ
  console.log('📥 expenses コレクションを取得中...');
  const results = await firestoreQuery(PARENT_PATH, COLLECTION_ID, {
    select: { fields: [
      { fieldPath: 'categoryId' },
      { fieldPath: 'yearMonth' },
      { fieldPath: 'note' },
    ]},
    limit: 1000,
  }, token);

  const targets = results
    .filter(r => r.document)
    .filter(r => {
      const catId = r.document.fields?.categoryId?.stringValue || '';
      return catId.startsWith('cat_credit_');
    });

  console.log(`🎯 移行対象: ${targets.length} 件\n`);

  if (targets.length === 0) {
    console.log('移行対象がありません。');
    return;
  }

  // カテゴリ別集計
  const byCat = {};
  for (const t of targets) {
    const catId = t.document.fields.categoryId.stringValue;
    byCat[catId] = (byCat[catId] || 0) + 1;
  }
  console.log('カテゴリ別内訳:');
  for (const [catId, count] of Object.entries(byCat)) {
    const sub = SUBCATEGORY_MAP[catId];
    console.log(`  ${catId} → ${sub?.subcategoryName || '?'} : ${count}件`);
  }
  console.log('');

  if (isDryRun) {
    console.log('ドライラン完了。--dry-run を外して本番実行してください。');
    return;
  }

  // バッチ更新（5並列）
  let success = 0;
  let errors = 0;
  const BATCH_SIZE = 5;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (t) => {
      const docName = t.document.name;
      // households/XXX/expenses/YYY のパス部分を抽出
      const docPath = docName.split('/documents/')[1];
      const oldCatId = t.document.fields.categoryId.stringValue;
      const sub = SUBCATEGORY_MAP[oldCatId];

      if (!sub) {
        console.error(`⚠️ 未知のカテゴリ: ${oldCatId}`);
        errors++;
        return;
      }

      try {
        await firestorePatch(docPath, {
          categoryId: { stringValue: 'cat_4' },
          subcategory: { stringValue: sub.subcategory },
          subcategoryName: { stringValue: sub.subcategoryName },
        }, token);
        success++;
      } catch (err) {
        console.error(`❌ ${docPath}: ${err.message}`);
        errors++;
      }
    });
    await Promise.all(promises);

    if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= targets.length) {
      console.log(`  進捗: ${Math.min(i + BATCH_SIZE, targets.length)}/${targets.length}`);
    }
  }

  console.log(`\n✅ 移行完了: 成功 ${success}件, エラー ${errors}件`);
}

main().catch(err => {
  console.error('致命的エラー:', err.message);
  process.exit(1);
});
