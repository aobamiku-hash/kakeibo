"""Read tatekae cell formulas from Numbers file"""
from numbers_parser import Document

doc = Document("data2.numbers")

# Sheet 0 (2026) - Row 5 = 立て替え
table_2026 = doc.sheets[0].tables[0]
print("=== 2026 立て替え (Row 5) ===")
for col in range(1, 5):
    cell = table_2026.cell(5, col)
    formula = getattr(cell, "formula", "N/A")
    print(f"  Col {col}: value={cell.value}, formula={formula}")

# Sheet 1 (2025) - Row 7 = 立て替え
table_2025 = doc.sheets[1].tables[0]
print("=== 2025 立て替え (Row 7) ===")
for col in range(1, 17):
    cell = table_2025.cell(7, col)
    formula = getattr(cell, "formula", "N/A")
    print(f"  Col {col}: value={cell.value}, formula={formula}")
