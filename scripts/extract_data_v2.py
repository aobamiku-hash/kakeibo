"""Numbers ファイルから生活費データを JSON に変換する（v2: 立替を個別展開）"""
import json
import re
from pathlib import Path
from numbers_parser import Document

filepath = Path(__file__).parent / "data2.numbers"
doc = Document(filepath)

# カテゴリ名のマッピング
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
    "その他":     [50, 50],
}

# カテゴリごとの支払者
PAYERS = {
    "家賃": "shinpei",
    "電気ガス": "shinpei",
    "水道": "shinpei",
    "ネット": "yuka",
    "クレジット": "shinpei",
    "その他": "shinpei",
}

# カテゴリIDのマッピング
CATEGORY_IDS = {
    "家賃": "cat_0",
    "電気ガス": "cat_1",
    "水道": "cat_2",
    "ネット": "cat_3",
    "クレジット": "cat_4",
    "立て替え": "cat_5",
    "その他": "cat_6",
}


def parse_tatekae_formula(formula_str):
    """立て替え式を個別金額に展開する。
    
    式例: "-1800+92500+980-1100+700-1400+360635"
    +値 → しんぺい立替（ゆか負担）: paidBy=shinpei, split=[0,100]
    -値 → ゆか立替（しんぺい負担）: paidBy=yuka, split=[100,0]
    
    Returns: list of (amount, paidBy, split)
    """
    if not formula_str:
        return []

    entries = []
    # 式をパース: 符号付き数値のリスト
    # "−1800+92500" → ["-1800", "+92500", ...]
    tokens = re.findall(r'[+-]?\d+(?:\.\d+)?', formula_str)
    
    for tok in tokens:
        val = float(tok)
        if val == 0:
            continue
        amount = int(round(abs(val)))
        if val > 0:
            # しんぺいが立替 → ゆかが負担
            entries.append((amount, "shinpei", [0, 100]))
        else:
            # ゆかが立替 → しんぺいが負担
            entries.append((amount, "yuka", [100, 0]))
    
    return entries


all_expenses = []

# ── Sheet: 2026 ──
sheet_2026 = doc.sheets[0]
table_2026 = sheet_2026.tables[0]

for col_idx in range(1, table_2026.num_cols):
    date_cell = table_2026.cell(0, col_idx)
    if date_cell.value is None:
        continue
    date_str = str(date_cell.value)[:10]
    parts = date_str.split("-")
    year_month = f"{parts[0]}-{parts[1]}"
    
    for row_idx in range(1, 6):
        cat_name = CATEGORY_MAP.get(row_idx - 1, f"row_{row_idx}")
        cell = table_2026.cell(row_idx, col_idx)
        
        if cat_name == "立て替え":
            # 式があれば個別展開
            formula = getattr(cell, "formula", None)
            if formula:
                items = parse_tatekae_formula(formula)
                for i, (amount, paidBy, split) in enumerate(items):
                    all_expenses.append({
                        "yearMonth": year_month,
                        "categoryId": "cat_5",
                        "categoryName": "立て替え",
                        "amount": amount,
                        "paidBy": paidBy,
                        "split": split,
                        "note": f"エクセルより (#{i+1})",
                    })
            elif cell.value is not None and float(str(cell.value)) != 0:
                # 式なし、値のみの場合は合計額1件
                amount = float(str(cell.value))
                if amount > 0:
                    all_expenses.append({
                        "yearMonth": year_month,
                        "categoryId": "cat_5",
                        "categoryName": "立て替え",
                        "amount": int(round(abs(amount))),
                        "paidBy": "shinpei",
                        "split": [0, 100],
                        "note": "エクセルより",
                    })
                elif amount < 0:
                    all_expenses.append({
                        "yearMonth": year_month,
                        "categoryId": "cat_5",
                        "categoryName": "立て替え",
                        "amount": int(round(abs(amount))),
                        "paidBy": "yuka",
                        "split": [100, 0],
                        "note": "エクセルより",
                    })
            continue
        
        # 通常カテゴリ
        if cell.value is None or str(cell.value).strip() == "":
            continue
        amount = float(str(cell.value))
        if amount == 0:
            continue

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
        continue
    parts = date_str[:10].split("-")
    year_month = f"{parts[0]}-{parts[1]}"
    
    for row_idx in range(1, 8):
        cat_name = CATEGORY_MAP_2025.get(row_idx - 1, f"row_{row_idx}")
        cell = table_2025.cell(row_idx, col_idx)
        
        if cat_name == "立て替え":
            formula = getattr(cell, "formula", None)
            if formula:
                items = parse_tatekae_formula(formula)
                for i, (amount, paidBy, split) in enumerate(items):
                    all_expenses.append({
                        "yearMonth": year_month,
                        "categoryId": "cat_5",
                        "categoryName": "立て替え",
                        "amount": amount,
                        "paidBy": paidBy,
                        "split": split,
                        "note": f"エクセルより (#{i+1})",
                    })
            elif cell.value is not None and float(str(cell.value)) != 0:
                amount = float(str(cell.value))
                if amount > 0:
                    all_expenses.append({
                        "yearMonth": year_month,
                        "categoryId": "cat_5",
                        "categoryName": "立て替え",
                        "amount": int(round(abs(amount))),
                        "paidBy": "shinpei",
                        "split": [0, 100],
                        "note": "エクセルより",
                    })
                elif amount < 0:
                    all_expenses.append({
                        "yearMonth": year_month,
                        "categoryId": "cat_5",
                        "categoryName": "立て替え",
                        "amount": int(round(abs(amount))),
                        "paidBy": "yuka",
                        "split": [100, 0],
                        "note": "エクセルより",
                    })
            continue
        
        # ネットは固定5130円に変換
        if cat_name == "ネット":
            if cell.value is None:
                continue
            all_expenses.append({
                "yearMonth": year_month,
                "categoryId": "cat_3",
                "categoryName": "ネット",
                "amount": 5130,
                "paidBy": "yuka",
                "split": [50, 50],
                "note": "",
            })
            continue
        
        # 通常カテゴリ
        if cell.value is None or str(cell.value).strip() == "":
            continue
        amount = float(str(cell.value))
        if amount == 0:
            continue

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

out_path = Path(__file__).parent / "expenses_v2.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"Exported {len(all_expenses)} expenses to {out_path}")
print(f"Months: {output['summary']['months']}")

# カテゴリ別の集計
from collections import Counter
cat_count = Counter(e["categoryName"] for e in all_expenses)
for cat, count in cat_count.most_common():
    total = sum(e["amount"] for e in all_expenses if e["categoryName"] == cat)
    print(f"  {cat}: {count} entries, total {total:,}")

# 立て替え詳細
print("\n=== 立て替え 個別一覧 ===")
for e in all_expenses:
    if e["categoryName"] == "立て替え":
        who = "しんぺい" if e["paidBy"] == "shinpei" else "ゆか"
        print(f"  {e['yearMonth']}: {e['amount']:>8,}円 ({who}立替) {e['note']}")
