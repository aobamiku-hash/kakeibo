import json

with open("expenses.json", "r", encoding="utf-8") as f:
    d = json.load(f)

for ym in ["2024-09", "2025-06", "2025-12", "2026-01", "2027-04"]:
    items = [x for x in d["expenses"] if x["yearMonth"] == ym]
    if items:
        print(f"=== {ym} ===")
        for x in items:
            print(f"  {x['categoryName']}: ¥{x['amount']:,} ({x['paidBy']}, {x['split'][0]}:{x['split'][1]})")
