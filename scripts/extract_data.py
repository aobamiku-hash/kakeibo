"""Numbers ファイルから生活費データを JSON に変換する"""
import json
from pathlib import Path
from numbers_parser import Document

filepath = Path(__file__).parent / "data2.numbers"
doc = Document(filepath)

# カテゴリ名のマッピング（文字化けを元に戻す）
CATEGORY_MAP = {
    0: "家賃",
    1: "電気ガス",
    2: "水道",
    3: "クレジット",
    4: "立て替え",
}

CATEGORY_MAP_2025 = {
    0: "家賃",
    1: "電気ガス",
    2: "水道",
    3: "クレジット",
    4: "ネット",
    5: "その他",
    6: "立て替え",
}

# カテゴリごとの割り勘比率 [しんぺい%, ゆか%]
SPLITS = {
    "家賃":       [50, 50],
    "電気ガス":   [50, 50],
    "水道":       [50, 50],
    "ネット":     [50, 50],
    "クレジット": [60, 40],
    "立て替え":   [0, 100],
    "その他":     [50, 50],
}

# カテゴリごとの支払者 ("shinpei" or "yuka")
PAYERS = {
    "家賃": "shinpei",
    "電気ガス": "shinpei",
    "水道": "shinpei",
    "ネット": "yuka",
    "クレジット": "shinpei",
    "立て替え": "shinpei",
    "その他": "shinpei",
}

# カテゴリIDのマッピング（アプリのデフォルトに合わせる）
CATEGORY_IDS = {
    "家賃": "cat_0",
    "電気ガス": "cat_1",
    "水道": "cat_2",
    "ネット": "cat_3",
    "クレジット": "cat_4",
    "立て替え": "cat_5",
    "その他": "cat_6",
}

all_expenses = []

# ── Sheet: 2026 ──
sheet_2026 = doc.sheets[0]
table_2026 = sheet_2026.tables[0]

# 列 1-12 = 2026年1月～12月, 列13以降 = 2027年以降
for col_idx in range(1, table_2026.num_cols):
    date_cell = table_2026.cell(0, col_idx)
    if date_cell.value is None:
        continue
    date_str = str(date_cell.value)[:10]  # "2026-01-01" -> "2026-01"
    parts = date_str.split("-")
    year_month = f"{parts[0]}-{parts[1]}"
    
    # Row 1-5: 家賃, 電気ガス, 水道, クレジット, 立て替え
    for row_idx in range(1, 6):
        cat_name = CATEGORY_MAP.get(row_idx - 1, f"row_{row_idx}")
        cell = table_2026.cell(row_idx, col_idx)
        if cell.value is None or str(cell.value).strip() == "":
            continue
        
        amount = float(str(cell.value))
        if amount == 0:
            continue

        # 立て替え: + = しんぺいが立替(ゆか負担), - = ゆかが立替(しんぺい負担)
        if cat_name == "立て替え" and amount < 0:
            paidBy = "yuka"
            split = [100, 0]  # 100%しんぺい負担
        else:
            paidBy = PAYERS.get(cat_name, "shinpei")
            split = SPLITS.get(cat_name, [50, 50])

        all_expenses.append({
            "yearMonth": year_month,
            "categoryId": CATEGORY_IDS.get(cat_name, cat_name),
            "categoryName": cat_name,
            "amount": int(round(abs(amount))),
            "paidBy": paidBy,
            "split": split,
            "note": "",
        })

# ── Sheet: 2025 ──
sheet_2025 = doc.sheets[1]
table_2025 = sheet_2025.tables[0]

for col_idx in range(1, table_2025.num_cols):
    date_cell = table_2025.cell(0, col_idx)
    if date_cell.value is None:
        continue
    date_str = str(date_cell.value)
    if "合" in date_str or len(date_str) < 10:
        # 合計列はスキップ
        continue
    parts = date_str[:10].split("-")
    year_month = f"{parts[0]}-{parts[1]}"
    
    # Row 1-7: 家賃, 電気ガス, 水道, クレジット, ネット, その他, 立て替え
    for row_idx in range(1, 8):
        cat_name = CATEGORY_MAP_2025.get(row_idx - 1, f"row_{row_idx}")
        cell = table_2025.cell(row_idx, col_idx)
        if cell.value is None or str(cell.value).strip() == "":
            continue
        
        amount = float(str(cell.value))
        if amount == 0:
            continue

        # ネットの -2565 はゆかが5130払って半額分を控除するロジック
        # アプリでは「5130円、ゆか支払い、5:5」として登録
        if cat_name == "ネット":
            amount = abs(amount) * 2  # 2565 * 2 = 5130

        # 立て替え: + = しんぺいが立替(ゆか負担), - = ゆかが立替(しんぺい負担)
        if cat_name == "立て替え" and amount < 0:
            paidBy = "yuka"
            split = [100, 0]  # 100%しんぺい負担
        else:
            paidBy = PAYERS.get(cat_name, "shinpei")
            split = SPLITS.get(cat_name, [50, 50])
        
        all_expenses.append({
            "yearMonth": year_month,
            "categoryId": CATEGORY_IDS.get(cat_name, cat_name),
            "categoryName": cat_name,
            "amount": int(round(abs(amount))),
            "paidBy": paidBy,
            "split": split,
            "note": "",
        })

# 出力
output = {
    "expenses": all_expenses,
    "summary": {
        "totalExpenses": len(all_expenses),
        "months": sorted(set(e["yearMonth"] for e in all_expenses)),
    }
}

out_path = Path(__file__).parent / "expenses.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"Exported {len(all_expenses)} expenses to {out_path}")
print(f"Months: {output['summary']['months']}")

# カテゴリ別の集計
from collections import Counter
cat_count = Counter(e["categoryName"] for e in all_expenses)
for cat, count in cat_count.most_common():
    total = sum(e["amount"] for e in all_expenses if e["categoryName"] == cat)
    print(f"  {cat}: {count} entries, total ¥{total:,}")
