"""Numbers ファイルから生活費データを読み取り、JSON に変換する"""
import json
from pathlib import Path
from numbers_parser import Document

filepath = Path(__file__).parent / "data2.numbers"
print(f"Reading: {filepath}")
doc = Document(filepath)

# 全シート・テーブルの情報を出力
for sheet in doc.sheets:
    print(f"\n=== Sheet: {sheet.name} ===")
    for table in sheet.tables:
        print(f"  Table: {table.name} ({table.num_rows}x{table.num_cols})")
        # 最初の10行を表示
        for row_idx in range(min(10, table.num_rows)):
            row_data = []
            for col_idx in range(table.num_cols):
                cell = table.cell(row_idx, col_idx)
                row_data.append(str(cell.value) if cell.value is not None else "")
            print(f"    Row {row_idx}: {row_data}")
