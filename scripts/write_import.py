import json, pathlib

d = json.load(open("expenses.json", "r", encoding="utf-8"))
out = pathlib.Path(r"c:\py\kakeibo-app\src\data\importData.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(d["expenses"], ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Written {len(d['expenses'])} items")
