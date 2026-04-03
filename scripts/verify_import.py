import json

with open("src/data/importData.json", "r", encoding="utf-8") as f:
    data = json.load(f)

net = [e for e in data["expenses"] if e["categoryId"] == "cat_3"]
print(f"ネット件数: {len(net)}")
for e in net:
    print(f"  {e['yearMonth']}  {e['amount']}")

settlements = data.get("settlements", [])
print(f"\n精算件数: {len(settlements)}")
for s in settlements:
    print(f"  {s['yearMonth']}  confirmed={s['confirmed']}  paidAt={s['paidAt']}")
