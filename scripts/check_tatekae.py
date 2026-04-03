import json

with open("expenses.json", "r", encoding="utf-8") as f:
    data = json.load(f)

print("=== 立て替え entries ===")
for e in data["expenses"]:
    if e["categoryName"] == "立て替え":
        print(f"  {e['yearMonth']}: {e['amount']:,} paidBy={e['paidBy']} split={e['split']}")
