"""importData.json にネット全月追加＆精算データ追加"""
import json
from pathlib import Path

src = Path(__file__).parent.parent / "src" / "data" / "importData.json"
with open(src, "r", encoding="utf-8") as f:
    data = json.load(f)

expenses = data["expenses"]
all_months = sorted(set(e["yearMonth"] for e in expenses))
net_months = set(e["yearMonth"] for e in expenses if e["categoryId"] == "cat_3")

# 2026年シートにネット行がない月にネットを追加
for ym in all_months:
    if ym not in net_months:
        expenses.append({
            "yearMonth": ym,
            "categoryId": "cat_3",
            "categoryName": "ネット",
            "amount": 5130,
            "paidBy": "yuka",
            "split": [50, 50],
            "note": "",
        })
        print(f"  ネット追加: {ym}")

# 精算データ: 2024-09 ～ 2026-02 は振込済み
# エクセルの振込日を反映
settlement_months = [
    "2024-09", "2024-10", "2024-11", "2024-12",
    "2025-01", "2025-02", "2025-03", "2025-04",
    "2025-05", "2025-06", "2025-07", "2025-08",
    "2025-09", "2025-10", "2025-11", "2025-12",
    "2026-01", "2026-02",
]

settlements = []
for ym in settlement_months:
    settlements.append({
        "yearMonth": ym,
        "confirmed": True,
        "confirmedBy": ["__manager__"],  # プレースホルダー、インポート時にm1に置換
        "paidAt": True,   # プレースホルダー、インポート時にTimestamp.now()に置換
        "paidBy": "__member2__",  # インポート時にm2に置換
    })
    print(f"  精算追加: {ym}")

data["expenses"] = expenses
data["settlements"] = settlements

with open(src, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\n合計: {len(expenses)} expenses, {len(settlements)} settlements")
