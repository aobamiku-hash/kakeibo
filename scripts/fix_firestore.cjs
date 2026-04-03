/**
 * Firestore 直接修正スクリプト
 * 1. household の __pending_member2__ を pending_member2 に移行
 * 2. 全精算データを作成（2024-09 ～ 2026-02 は振込済み）
 * 3. expenses の paidBy が __pending_member2__ のものを pending_member2 に変更
 */
const admin = require('firebase-admin');
const { execSync } = require('child_process');

// Firebase CLI のトークンを取得して credential として使用
const projectId = 'kakeibo-f4a7a';

// firebase-tools の内部トークンを利用
let accessToken;
try {
  accessToken = execSync('npx firebase login:ci --no-localhost 2>nul', { encoding: 'utf-8' }).trim();
} catch {
  // Firebase CLI の認証情報ファイルから直接読む
}

// Google Application Default Credentials 代替: firebase login の refresh token を使う
const credPath = require('path').join(
  process.env.USERPROFILE || process.env.HOME,
  '.config',
  'configstore',
  'firebase-tools.json'
);
const fs = require('fs');
let credential;
try {
  const config = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
  const refreshToken = config.tokens?.refresh_token;
  if (refreshToken) {
    credential = admin.credential.refreshToken({
      type: 'authorized_user',
      client_id: config.tokens.client_id || '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: config.tokens.client_secret || 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: refreshToken,
    });
  }
} catch (e) {
  console.error('Firebase CLI 認証情報が見つかりません。npx firebase login を実行してください。');
  process.exit(1);
}

admin.initializeApp({
  projectId,
  credential,
});

const db = admin.firestore();

async function main() {
  // 世帯ドキュメントを取得
  const householdsSnap = await db.collection('households').get();
  
  for (const hDoc of householdsSnap.docs) {
    const hData = hDoc.data();
    console.log(`\n=== Household: ${hDoc.id} ===`);
    console.log('  memberOrder:', hData.memberOrder);
    console.log('  memberNames:', hData.memberNames);
    
    const m1 = hData.memberOrder[0];
    const m2 = hData.memberOrder[1];
    const oldPlaceholder = '__pending_member2__';
    const newPlaceholder = 'pending_member2';
    
    // 1. __pending_member2__ を pending_member2 に移行
    if (m2 === oldPlaceholder || hData.memberNames[oldPlaceholder]) {
      console.log('\n[1] プレースホルダー移行...');
      const newNames = {};
      for (const [k, v] of Object.entries(hData.memberNames)) {
        if (k === oldPlaceholder) {
          newNames[newPlaceholder] = v;
          console.log(`  ${oldPlaceholder} -> ${newPlaceholder}: ${v}`);
        } else {
          newNames[k] = v;
        }
      }
      const newOrder = hData.memberOrder.map(id => id === oldPlaceholder ? newPlaceholder : id);
      
      await hDoc.ref.update({
        memberOrder: newOrder,
        memberNames: newNames,
      });
      console.log('  done.');
    } else {
      console.log('  プレースホルダー移行不要');
    }
    
    const effectiveM2 = (m2 === oldPlaceholder) ? newPlaceholder : m2;
    
    // 2. expenses の paidBy を修正
    console.log('\n[2] expenses paidBy 修正...');
    const expSnap = await db.collection('households').doc(hDoc.id).collection('expenses')
      .where('paidBy', '==', oldPlaceholder).get();
    
    if (!expSnap.empty) {
      const batch = db.batch();
      let count = 0;
      expSnap.docs.forEach(d => {
        batch.update(d.ref, { paidBy: newPlaceholder });
        count++;
      });
      await batch.commit();
      console.log(`  ${count} 件修正`);
    } else {
      console.log('  修正対象なし');
    }
    
    // 3. 精算データ作成 (2024-09 ～ 2026-02 振込済み)
    console.log('\n[3] 精算データ作成...');
    const paidMonths = [
      '2024-09', '2024-10', '2024-11', '2024-12',
      '2025-01', '2025-02', '2025-03', '2025-04',
      '2025-05', '2025-06', '2025-07', '2025-08',
      '2025-09', '2025-10', '2025-11', '2025-12',
      '2026-01', '2026-02',
    ];
    
    for (const ym of paidMonths) {
      const ref = db.collection('households').doc(hDoc.id).collection('settlements').doc(ym);
      await ref.set({
        yearMonth: ym,
        confirmed: true,
        confirmedBy: [m1],
        confirmedAt: admin.firestore.Timestamp.now(),
        paidAt: admin.firestore.Timestamp.now(),
        paidBy: effectiveM2,
      });
      console.log(`  ${ym}: 振込済み ✓`);
    }
    
    // 4. 全 expenses 件数確認
    const allExp = await db.collection('households').doc(hDoc.id).collection('expenses').get();
    console.log(`\n合計: ${allExp.size} expenses`);
    
    // ネットの件数
    let netCount = 0;
    allExp.docs.forEach(d => {
      if (d.data().categoryId === 'cat_3') netCount++;
    });
    console.log(`  うちネット: ${netCount} 件`);
  }
}

main().then(() => {
  console.log('\n完了!');
  process.exit(0);
}).catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
