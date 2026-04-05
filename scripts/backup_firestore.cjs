/**
 * Firestoreバックアップスクリプト
 * 世帯の全データ（expenses, settlements, messages, trips）をローカルJSONに保存する。
 *
 * 使い方:
 *   node scripts/backup_firestore.cjs              # バックアップ実行
 *   node scripts/backup_firestore.cjs --quiet      # ログ最小限
 *
 * 出力先: c:\py\kakeibo-app\backups\backup_YYYYMMDD_HHMMSS.json
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'kakeibo-f4a7a';
const HOUSEHOLD_ID = 'YMRsnyEODKRR23HIgd5D';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const isQuiet = process.argv.includes('--quiet');

function log(...args) {
  if (!isQuiet) console.log(...args);
}

// ── Firebase CLI のトークンを取得・リフレッシュ ──
const credPath = path.join(
  process.env.USERPROFILE || process.env.HOME,
  '.config', 'configstore', 'firebase-tools.json'
);

async function getAccessToken() {
  const config = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
  const tokens = config.tokens;
  if (!tokens) throw new Error('firebase-tools.json に tokens がありません。firebase login を実行してください。');

  const expiresAt = tokens.expires_at || 0;
  if (Date.now() < expiresAt - 60000) {
    return tokens.access_token;
  }

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

  config.tokens.access_token = data.access_token;
  config.tokens.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
  fs.writeFileSync(credPath, JSON.stringify(config, null, 2), 'utf-8');
  return data.access_token;
}

// ── Firestoreコレクション全件取得（ページネーション対応） ──
async function fetchCollection(collectionPath, token) {
  const docs = [];
  let pageToken = null;

  do {
    const url = new URL(`${BASE_URL}/${collectionPath}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.status === 404) return docs; // コレクションが存在しない

    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`GET ${collectionPath} → ${resp.status}: ${t}`);
    }

    const data = await resp.json();
    if (data.documents) {
      for (const doc of data.documents) {
        const id = doc.name.split('/').pop();
        docs.push({ id, fields: doc.fields });
      }
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return docs;
}

// ── Firestoreフィールドを簡潔なJSONに変換 ──
function simplifyFields(fields) {
  const result = {};
  for (const [key, val] of Object.entries(fields)) {
    result[key] = simplifyValue(val);
  }
  return result;
}

function simplifyValue(val) {
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(simplifyValue);
  }
  if ('mapValue' in val) {
    return simplifyFields(val.mapValue.fields || {});
  }
  return val;
}

// ── メイン ──
async function main() {
  log('🔑 認証中…');
  const token = await getAccessToken();

  const householdPath = `households/${HOUSEHOLD_ID}`;

  // 世帯ドキュメント自体を取得
  log('📋 世帯情報を取得中…');
  const hhResp = await fetch(`${BASE_URL}/${householdPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!hhResp.ok) throw new Error(`世帯取得失敗: ${hhResp.status}`);
  const hhDoc = await hhResp.json();

  // サブコレクション取得
  const collections = ['expenses', 'settlements', 'messages', 'trips'];
  const backup = {
    exportedAt: new Date().toISOString(),
    householdId: HOUSEHOLD_ID,
    household: simplifyFields(hhDoc.fields || {}),
  };

  for (const col of collections) {
    log(`📦 ${col} を取得中…`);
    const docs = await fetchCollection(`${householdPath}/${col}`, token);
    backup[col] = docs.map((d) => ({ id: d.id, ...simplifyFields(d.fields) }));
    log(`   → ${backup[col].length} 件`);
  }

  // ディレクトリ作成
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // タイムスタンプ付きファイル名（JST）
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const ts = `${jst.getUTCFullYear()}${pad(jst.getUTCMonth() + 1)}${pad(jst.getUTCDate())}_${pad(jst.getUTCHours())}${pad(jst.getUTCMinutes())}${pad(jst.getUTCSeconds())}`;
  const filePath = path.join(BACKUP_DIR, `backup_${ts}.json`);

  const content = JSON.stringify(backup, null, 2);
  fs.writeFileSync(filePath, content, 'utf-8');

  const total = collections.reduce((s, c) => s + (backup[c]?.length || 0), 0);
  console.log(`✅ バックアップ完了: ${total} 件 → ${filePath}`);
  return filePath;
}

main().catch((err) => {
  console.error('❌ バックアップ失敗:', err.message);
  process.exit(1);
});
