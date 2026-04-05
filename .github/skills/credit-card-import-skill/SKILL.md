---
name: credit-card-import-skill
description: >
  **CREDIT CARD IMPORT SKILL** — クレジットカード明細（CSV/XLSX）をパースし、
  カテゴリ自動分類してFirestoreにインポートする。
  USE FOR: 毎月のクレカ明細ファイルの取り込み; 新しい店舗のカテゴリ追加;
  インポート状態の確認; カテゴリ分類ルールの更新。
  DO NOT USE FOR: アプリUI開発; Firestore構造の変更; 精算処理。
---

# Credit Card Import Skill

## Overview

クレジットカード明細ファイル（CSV/XLSX）をパースし、店舗名からカテゴリを自動分類して
Firestore の `households/{id}/expenses` に個別取引として登録する。
毎月のルーティン作業をスキルとして標準化する。

**Keywords**: クレカ, クレジットカード, 明細, インポート, カテゴリ分類, Firestore, CSV, XLSX

## Role

クレジットカード明細の取り込み担当。ファイルフォーマットの自動判別、店舗名によるカテゴリ分類、
Firestore への安全なインポート（重複防止・集計行削除）を行う。

## ファイル配置

| ファイル | パス | 用途 |
|---|---|---|
| パーサー | `C:\py\kakeibo\parse_credit_cards.py` | CSV/XLSX → JSON 変換 + カテゴリ分類 |
| インポーター | `scripts/import_credit_cards.cjs` | JSON → Firestore REST API |
| 確認スクリプト | `scripts/check_credit_data.cjs` | Firestore 状態確認 |
| 入力ファイル | `C:\py\kakeibo\sample\` | 明細ファイル保管先 |
| 中間JSON | `C:\py\kakeibo\credit_card_items.json` | パーサー出力 |

## 毎月のインポート手順

### Step 1: ファイル配置
ユーザーからクレカ明細ファイル（CSV or XLSX）を `C:\py\kakeibo\sample\` に配置してもらう。
ファイル名は `YYYYMM確定分.csv` or `YYYYMM確定分.xlsx` の形式。

### Step 2: パース
```powershell
C:/Users/aobam/AppData/Local/Programs/Python/Python313/python.exe C:\py\kakeibo\parse_credit_cards.py
```
- yearMonth はファイル名の請求月を使用
- 店舗名からカテゴリを自動分類
- 重複除去（同一日付・店舗名・金額）
- 出力: `C:\py\kakeibo\credit_card_items.json`
- **「その他」分類の店舗があればユーザーにカテゴリ確認し、`parse_credit_cards.py` の CATEGORY_RULES に追加してから再パース**

### Step 3: ドライラン確認
```powershell
cd C:\py\kakeibo-app
node scripts/import_credit_cards.cjs --dry-run
```

### Step 4: 本番インポート
```powershell
# 既存集計行を削除してからインポート（推奨）
node scripts/import_credit_cards.cjs --delete-aggregates

# 集計行を残す場合
node scripts/import_credit_cards.cjs
```

> **Note**: インポートスクリプトは自動的に `cat_credit_*` → `cat_4` + subcategory に変換して書き込みます。
> マイグレーションスクリプト (`migrate_credit_categories.cjs`) の実行は不要です。

### Step 5: 確認
```powershell
node scripts/check_credit_data.cjs
```

### Step 6: バックアップ
インポート完了後、必ずFirestoreのバックアップを取得する。
```powershell
node scripts/backup_firestore.cjs
```
出力先: `c:\py\kakeibo-app\backups\backup_YYYYMMDD_HHMMSS.json`

## CSVフォーマット対応表

| パターン | ヘッダー | エンコーディング | 備考 |
|---|---|---|---|
| A | 利用日,利用者,利用内容,利用区分,新規利用額 | UTF-8 | 金額にカンマ |
| B | 利用日,利用内容,新規利用額,今回請求額 | UTF-8 | 利用者なし |
| C | [index],利用日,利用者,利用内容,利用区分,新規利用額,備考 | UTF-8/CP932 | 先頭インデックス列 |
| D | 利用日,利用者,利用内容,新規利用額 | CP932 | |
| E | 利用日,利用者,利用内容,金額, | UTF-8 | 末尾空列 |
| F1 | 日付,コード,店舗名,金額 | XLSX | |
| F2 | 利用日,利用者,利用内容,金額 | XLSX | |

日付形式: `2024/9/4`, `2025年10月18日` の2パターンに対応。

## カテゴリ分類ルール

| カテゴリキー | カテゴリID | 表示名 | 主なキーワード |
|---|---|---|---|
| grocery | cat_credit_grocery | 🛒 食費（クレカ） | ヨークベニマル, とりせん, かましん, マルエツ, イオン, セブンイレブン, ローソン |
| dining | cat_credit_dining | 🍽️ 外食（クレカ） | 丸亀製麺, 幸楽苑, マクドナルド, ココイチ, サイゼリヤ, コメダ, スタバ |
| daily | cat_credit_daily | 🏪 日用品（クレカ） | ウエルシア, スギドラッグ, サンドラッグ, 無印良品, シャトレーゼ |
| shopping | cat_credit_shopping | 🛍️ 買い物（クレカ） | Amazon, ニトリ, カインズ, IKEA, 百貨店, ルミネ |
| transport | cat_credit_transport | 🚗 交通・車（クレカ） | タイムズ, ENEOS, ガソリン, タクシー, レンタカー |
| leisure | cat_credit_leisure | 🎯 レジャー（クレカ） | 空港, 映画, EXPO, 道の駅, 旅行 |
| other | cat_credit_other | ❓ その他（クレカ） | 上記に該当しないもの |

### 新しい店舗を追加する場合
`C:\py\kakeibo\parse_credit_cards.py` の `CATEGORY_RULES` リストに
該当カテゴリのキーワードを追加する。

## paidBy マッピング

| 利用者列の値 | パーサー出力 | Firestore UID |
|---|---|---|
| V4010, 空, なし | shinpei | A6H88EKmW3X4S1jmpNNNsFWDGh52 |
| 古舘ユカ, ユカ, yuka | yuka | gc994X7gigSHjx1DOCsEZqyyIw03 |

> **Note**: インポートスクリプトが自動的にパーサーの名前出力をUID に変換します。

## Firestore データ構造

```json
{
  "yearMonth": "2026-01",      // 請求月（ファイル名ベース）
  "categoryId": "cat_4",       // クレジットカード統合カテゴリ
  "subcategory": "grocery",    // サブカテゴリキー
  "subcategoryName": "食費",   // サブカテゴリ表示名
  "amount": 3693,
  "paidBy": "shinpei",
  "split": [60, 40],
  "note": "2024/09/04 フライングガーデン",  // "利用日 店舗名" 形式
  "createdAt": "2026-04-04T...",
  "createdBy": "credit_card_import"
}
```

## 注意事項

- CSVなし月（2024-10, 2025-07〜09）は既存の cat_4 集計行がそのまま残っている
- `--delete-aggregates` は `note` が `YYYY/MM/DD ` で始まらない行を集計行とみなして削除
- 重複防止: `date|storeName|amount` のキーで Firestore 既存データと照合
- Firestore 認証: Firebase CLI の refresh token を使用（`~/.config/configstore/firebase-tools.json`）

## Output Format

```
## インポート結果

| 項目 | 値 |
|---|---|
| 入力ファイル | [ファイル名] |
| パース件数 | [N]件 |
| 新規追加 | [N]件 |
| スキップ（重複） | [N]件 |
| 削除（集計行） | [N]件 |

### カテゴリ別内訳
[カテゴリ別の件数・金額テーブル]
```

## Instructions

1. ユーザーから明細ファイルを受け取ったら `C:\py\kakeibo\sample\` に配置を依頼
2. パーサーを実行し、件数・金額・カテゴリ分類結果をユーザーに報告
3. 「その他」に分類された取引があれば、カテゴリ提案をユーザーに確認
4. ドライランで書き込み予定をユーザーに確認してから本番実行
5. 新しい店舗名が出現した場合、CATEGORY_RULES への追加を提案

## Constraints

- Always respond in Japanese
- ドライランなしで本番実行しない
- Firestore への書き込み前に必ずユーザーの承認を得る
- カテゴリ分類ルールの変更はユーザー確認後に行う
- `Invoke-Expression` / `iex` 使用禁止（コーディング規約準拠）
