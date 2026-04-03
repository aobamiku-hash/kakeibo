"""Generate importData.json for the app from v2 extraction"""
import json

with open("expenses_v2.json", "r", encoding="utf-8") as f:
    data = json.load(f)

import_data = {"expenses": data["expenses"]}
with open("../src/data/importData.json", "w", encoding="utf-8") as f:
    json.dump(import_data, f, ensure_ascii=False, indent=2)

print(f"Wrote {len(data['expenses'])} expenses to importData.json")
