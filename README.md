# かけいぼ 💰

夫婦の家計簿アプリ。支出を登録して、割り勘して、月末に精算。

## 技術スタック

- **React 18** + TypeScript
- **Firebase** (Auth + Firestore + Hosting)
- **Framer Motion** (アニメーション)
- **Vite** (ビルド)
- **PWA** (iPhoneホーム画面対応)

## セットアップ

### 1. Firebase プロジェクトを作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」→ プロジェクト名を入力
3. **Authentication** → 「始める」→ Google を有効化
4. **Firestore Database** → 「データベースを作成」→ 本番モードで開始
5. **セキュリティルール** → `firestore.rules` の内容をコピペして公開
6. プロジェクト設定 → ウェブアプリを追加 → Firebase SDK の設定値をコピー

### 2. 環境変数を設定

```bash
cp .env.example .env
```

`.env` ファイルに Firebase の設定値を貼り付け:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

### 3. Firestore インデックスを作成

Firebase Console → Firestore → インデックス → 複合インデックスを追加:

| コレクション | フィールド1 | フィールド2 |
|-------------|-----------|-----------|
| `households/{id}/expenses` | `yearMonth` (Ascending) | `createdAt` (Descending) |

### 4. 開発サーバーを起動

```bash
npm install
npm run dev
```

### 5. デプロイ(Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting  # dist ディレクトリを指定、SPA=Yes
npm run build
firebase deploy
```

## 使い方

1. **しんぺい** が Google ログイン → 「新しい世帯を作成」→ 表示名を入力
2. 表示された **招待コード** を **ゆか** に共有
3. **ゆか** が Google ログイン → 「招待コードで参加」→ コードと表示名を入力
4. 完了！支出を追加して割り勘精算を始めましょう

## デフォルトカテゴリ

| カテゴリ | 絵文字 | デフォルト割り勘 |
|---------|-------|----------------|
| 家賃 | 🏠 | 5:5 |
| 電気ガス | ⚡ | 5:5 |
| 水道 | 💧 | 5:5 |
| ネット | 📡 | 5:5 |
| クレジット | 💳 | 6:4 |
| 立て替え | 🔄 | 0:100 |

※ 設定画面からカテゴリ・割り勘比率はいつでも変更可能

## 精算の計算ロジック

1. 各支出について、割り勘比率に基づき各メンバーの負担額を算出
2. 各メンバーの「支払った額」と「負担すべき額」の差分を計算
3. 差分が精算額（誰が誰にいくら振り込むか）
