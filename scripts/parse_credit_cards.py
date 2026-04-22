r"""クレカ明細パーサー
scripts/credit_card_sample/ 内の CSV/XLSX を読み込み、
日付・店舗名・金額を正規化して scripts/credit_card_items.json に出力する。
yearMonth はファイル名の請求月（例: 202409確定分.csv → 2024-09）を使用。
店舗名からカテゴリを自動分類する。

対応フォーマット（ヘッダーで自動判別）:
  A: 利用日,利用者,利用内容,利用区分,新規利用額  (UTF-8, 金額にカンマ)
  B: 利用日,利用内容,新規利用額,今回請求額       (UTF-8, 今回請求額=※ は除外)
  C: [index],利用日,利用者,利用内容,利用区分,新規利用額,今回請求額  (CP932)
  D: 利用日,利用者,利用内容,新規利用額           (CP932)
  E: 利用日,利用者,利用内容,金額[,]             (UTF-8, 末尾空列)
  F: XLSX 日付,コード,店舗名,金額
  G: XLSX 利用日,利用者,利用内容,金額
"""

import csv
import json
import re
from pathlib import Path

import openpyxl


BASE_DIR = Path(__file__).resolve().parent
SAMPLE_DIR = BASE_DIR / "credit_card_sample"
OUTPUT_PATH = BASE_DIR / "credit_card_items.json"


def billing_month_from_filename(filename: str) -> str | None:
    """202409確定分.csv → '2024-09'"""
    match = re.match(r"(\d{4})(\d{2})", filename)
    if match:
        year, month = match.groups()
        return f"{year}-{month}"
    return None


CATEGORY_RULES = [
    ("grocery", [
        "ヨークベニマル", "ヨ－クベニマル",
        "とりせん", "かましん", "マルエツ",
        "オータニ", "ジョイフーズ", "ジヨイフ－ズ",
        "イオングル", "イオンモ－ル", "イオンモール",
        "セブン－イレブン", "セブン-イレブン",
        "ローソン", "フアミリーマート", "ファミリーマート",
        "ツルヤ", "センリヨウオヤマ",
        "ヨークベニマル\u3000食品",
        "イトーヨーカドー",
        "エキユ－トエデイシヨン", "エキュートエディション",
    ]),
    ("dining", [
        "マルガメセイメン", "丸亀製麺",
        "幸楽苑", "コウラクエン",
        "フライングガーデン",
        "びっくりドンキ", "ビツクリドンキ",
        "マクドナルド",
        "ココイチバンヤ", "CoCo壱番屋",
        "サイゼリヤ",
        "バーミヤン", "バ－ミヤン",
        "デニ－ズ", "デニーズ",
        "ココス",
        "ヨシノヤ", "吉野家",
        "モスバ－ガ－", "モスバーガー",
        "ケンタツキ－", "ケンタッキー",
        "シエイクシヤツク", "シェイクシャック",
        "コメダコーヒー", "コメダ",
        "スターバックス",
        "VANSAN", "ＶＡＮＳＡＮ",
        "イチラン", "一蘭",
        "ラ－メン", "ラーメン",
        "カリ－ヤ", "カレー",
        "ギヨウザノオウシヨ", "餃子の王将",
        "ナポリノシヨクタク",
        "ウマミ\u3000バ－ガ－",
        "ほっともっと",
        "しゃぶしゃぶ",
        "TGI FRIDAY", "ＴＧＩ",
        "FONDA", "ＦＯＮＤＡ",
        "RASA MALAYSIA", "ＲＡＳＡ",
        "ピツツエリア", "ピッツェリア", "PIZZERIA", "ＰＩＺＺＥＲＩＡ",
        "スポンテイ－ニ", "スポンティ",
        "カプリシャス",
        "圓子カフェ",
        "ロンハーマン",
        "ベ－カリ－", "ベーカリー",
        "グリンコ－ヒ－", "グリーンコーヒー",
        "アオ\u3000カフエ",
        "エリツクサウス",
        "カシツカサ", "菓子匠",
        "日本橋からり",
        "カンパ－ナロツカテイ",
        "バルオヤマ",
        "ワイルドバ－ン",
        "５５１蓬莱",
        "荻野屋",
        "東川ペリカン",
        "スミレ\u3000ホンテン",
        "モンテドール",
        "マスノスシ",
        "STORYLINE",
        "イレブンシス",
        "カイリキヤ",
        "シンリンノボクジヨ",
        "どうとんぼり神座",
        "トウキヨウエキヤエキタシヨクドウ",
        "オニタコ",
        "サ－モンアトリエ", "サーモンアトリエ",
        "フ－ジンツリ－", "フージンツリー",
    ]),
    ("daily", [
        "ウエルシア",
        "スギドラッグ", "スギヤツキヨク", "スギヤツキョク",
        "サンドラツグ", "サンドラッグ",
        "無印良品",
        "シヤトレ－ゼ", "シャトレーゼ",
    ]),
    ("shopping", [
        "AMAZON", "ＡＭＡＺＯＮ", "ＡＭＺ", "Amazon", "Ａｍａｚｏｎ",
        "ニトリ",
        "カインズ",
        "イケア", "IKEA",
        "ジヨイフルホンダ", "ジョイフル本田",
        "阪急百貨店",
        "阪神百貨店",
        "伊勢丹",
        "ミツコシ", "三越",
        "大和\u3000富山", "大丸",
        "ルミネ",
        "渋谷スクランブルスクエア",
        "渋谷ストリーム",
        "トウキユウプラザ", "東急プラザ",
        "トウブヒヤツカテン", "トウブウツノミヤ", "百貨店",
        "ＮＥＷｏＭａｎ",
        "クロスポイントマークト",
        "ＪＲ東日本グループ",
        "アツプル",
        "アールアンドエー",
        "ブシキョウスタヂオ",
        "イオン\u3000レイクタウン",
        "ウイング\u3000シンバシ",
        "ゴテンバ\u3000プレミア",
        "サノ\u3000プレミアム",
        "ユーネクスト",
    ]),
    ("transport", [
        "タイムズ",
        "ENEOS", "ＥＮＥＯＳ",
        "アポロステ", "イデミツ", "エネオス",
        "タクシ", "トモイタクシ",
        "オリツクスレンタカ", "レンタカー",
    ]),
    ("leisure", [
        "シンチトセ\u3000クウコウ", "新千歳空港",
        "ハネダウコウ", "羽田空港",
        "ウツノミヤパセオ",
        "EXPO", "ＥＸＰＯ", "エキスポ",
        "グランドシネマ", "映画",
        "ＡＭＺ＊ＫＩＮＥＺＯ",
        "ライジングサン",
        "フラノマルシエ",
        "道の駅",
        "東部湯の丸",
        "サンエー宜野湾",
        "ポータマオキナワ",
        "タウンプ ラザ",
        "マタタビヤ",
        "イベントゴリヨウ",
        "SQ*特定非営利", "ＳＱ＊特定非営利",
        "ナカバリシヨウシュ",
        "トウキヨウエキグラ",
        "トウキヨウミツドタ",
        "シンジユクバルト",
        "スクエアティダク",
        "オオヤグランドセンタ",
    ]),
]


CATEGORY_MAP = {
    "grocery": {"id": "cat_credit_grocery", "name": "食費（クレカ）", "emoji": "🛒"},
    "dining": {"id": "cat_credit_dining", "name": "外食（クレカ）", "emoji": "🍽️"},
    "daily": {"id": "cat_credit_daily", "name": "日用品（クレカ）", "emoji": "🏪"},
    "shopping": {"id": "cat_credit_shopping", "name": "買い物（クレカ）", "emoji": "🛍️"},
    "transport": {"id": "cat_credit_transport", "name": "交通・車（クレカ）", "emoji": "🚗"},
    "leisure": {"id": "cat_credit_leisure", "name": "レジャー（クレカ）", "emoji": "🎯"},
    "other": {"id": "cat_credit_other", "name": "その他（クレカ）", "emoji": "❓"},
}


def classify(store_name: str) -> str:
    for category, keywords in CATEGORY_RULES:
        for keyword in keywords:
            if keyword in store_name:
                return category
    return "other"


def parse_date(raw) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip()
    match = re.match(r"(\d{4})年(\d{1,2})月(\d{1,2})日", value)
    if match:
        year, month, day = match.groups()
        return f"{year}/{int(month):02d}/{int(day):02d}"

    match = re.match(r"(\d{4})/(\d{1,2})/(\d{1,2})", value)
    if match:
        year, month, day = match.groups()
        return f"{year}/{int(month):02d}/{int(day):02d}"
    return None


def parse_amount(raw) -> int | None:
    if raw is None:
        return None
    value = str(raw).strip().replace(",", "").replace("，", "")
    if value in ["", "※", "*", "−", "-"]:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def parse_paid_by(user_col: str | None) -> str:
    if user_col is None:
        return "shinpei"
    value = str(user_col).strip()
    if re.search(r"ユカ|yuka|Yuka|ゆか", value, re.IGNORECASE):
        return "yuka"
    return "shinpei"


def read_csv(path: Path) -> list[dict]:
    items = []
    rows = None
    for encoding in ("utf-8-sig", "utf-8", "cp932"):
        try:
            with open(path, encoding=encoding, newline="") as handle:
                rows = list(csv.reader(handle))
            break
        except (UnicodeDecodeError, UnicodeError):
            continue

    if rows is None:
        print(f"  [WARN] エンコード不明: {path.name}")
        return []

    if not rows:
        return []

    header_row_index = 0
    for index, row in enumerate(rows):
        joined = ",".join(str(cell) for cell in row)
        if "利用日" in joined or "日付" in joined:
            header_row_index = index
            break

    header = [str(cell).strip() for cell in rows[header_row_index]]
    data_rows = rows[header_row_index + 1 :]

    def col(names: list[str]) -> int | None:
        for name in names:
            if name in header:
                return header.index(name)
        return None

    idx_date = col(["利用日", "日付"])
    idx_name = col(["利用内容", "店舗名"])
    idx_amount = col(["新規利用額", "金額"])
    idx_user = col(["利用者", "コード"])

    if idx_date is None or idx_name is None or idx_amount is None:
        print(f"  [WARN] 列が特定できません: {path.name} header={header}")
        return []

    for row in data_rows:
        if not row or all(cell == "" for cell in row):
            continue
        while len(row) <= max(idx_date, idx_name, idx_amount):
            row.append("")

        date_str = parse_date(row[idx_date])
        if date_str is None:
            continue
        amount = parse_amount(row[idx_amount])
        if amount is None or amount <= 0:
            continue
        name = str(row[idx_name]).strip()
        if not name:
            continue
        user = str(row[idx_user]).strip() if idx_user is not None and idx_user < len(row) else None
        paid_by = parse_paid_by(user)

        items.append(
            {
                "date": date_str,
                "storeName": name,
                "amount": amount,
                "paidBy": paid_by,
                "sourceFile": path.name,
            }
        )

    return items


def read_xlsx(path: Path) -> list[dict]:
    items = []
    workbook = openpyxl.load_workbook(path, data_only=True)
    worksheet = workbook.active
    rows = list(worksheet.iter_rows(values_only=True))
    if not rows:
        return []

    header_index = 0
    for index, row in enumerate(rows):
        joined = ",".join(str(cell) for cell in row if cell is not None)
        if "利用日" in joined or "日付" in joined:
            header_index = index
            break

    header = [str(cell).strip() if cell is not None else "" for cell in rows[header_index]]
    data_rows = rows[header_index + 1 :]

    def col(names: list[str]) -> int | None:
        for name in names:
            if name in header:
                return header.index(name)
        return None

    idx_date = col(["利用日", "日付"])
    idx_name = col(["利用内容", "店舗名"])
    idx_amount = col(["金額", "新規利用額"])
    idx_user = col(["利用者", "コード"])

    if idx_date is None or idx_name is None or idx_amount is None:
        print(f"  [WARN] 列が特定できません: {path.name} header={header}")
        return []

    for row in data_rows:
        if row is None or all(cell is None for cell in row):
            continue
        row = list(row)
        while len(row) <= max(idx_date, idx_name, idx_amount):
            row.append(None)

        date_str = parse_date(row[idx_date])
        if date_str is None:
            continue
        amount = parse_amount(row[idx_amount])
        if amount is None or amount <= 0:
            continue
        name = str(row[idx_name]).strip() if row[idx_name] is not None else ""
        if not name or name == "None":
            continue
        user = (
            str(row[idx_user]).strip()
            if idx_user is not None and idx_user < len(row) and row[idx_user] is not None
            else None
        )
        paid_by = parse_paid_by(user)

        items.append(
            {
                "date": date_str,
                "storeName": name,
                "amount": amount,
                "paidBy": paid_by,
                "sourceFile": path.name,
            }
        )

    return items


def main() -> None:
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    all_items: list[dict] = []
    files = sorted(path for path in SAMPLE_DIR.glob("*") if path.is_file())
    if not files:
        print(f"入力ファイルがありません: {SAMPLE_DIR}")
        print("CSV または XLSX を配置して再実行してください。")
        return

    for path in files:
        if path.suffix.lower() == ".csv":
            print(f"CSV: {path.name}")
            items = read_csv(path)
        elif path.suffix.lower() in (".xlsx", ".xls"):
            print(f"XLS: {path.name}")
            items = read_xlsx(path)
        else:
            continue

        billing_ym = billing_month_from_filename(path.name)
        for item in items:
            item["yearMonth"] = billing_ym or "unknown"
            category_key = classify(item["storeName"])
            category_info = CATEGORY_MAP[category_key]
            item["category"] = category_key
            item["categoryId"] = category_info["id"]
            item["categoryName"] = category_info["name"]
        print(f"  → {len(items)} 件 (billing: {billing_ym})")
        all_items.extend(items)

    seen = set()
    unique_items = []
    for item in all_items:
        key = (item["date"], item["storeName"], item["amount"])
        if key not in seen:
            seen.add(key)
            unique_items.append(item)

    by_ym: dict[str, int] = {}
    for item in unique_items:
        year_month = item["yearMonth"]
        by_ym[year_month] = by_ym.get(year_month, 0) + item["amount"]

    by_cat: dict[str, dict] = {}
    for item in unique_items:
        category = item["category"]
        if category not in by_cat:
            by_cat[category] = {"count": 0, "amount": 0}
        by_cat[category]["count"] += 1
        by_cat[category]["amount"] += item["amount"]

    unique_items.sort(key=lambda item: item["date"])

    result = {
        "totalItems": len(unique_items),
        "totalAmount": sum(item["amount"] for item in unique_items),
        "byYearMonth": {key: value for key, value in sorted(by_ym.items())},
        "byCategory": by_cat,
        "categoryMap": CATEGORY_MAP,
        "items": unique_items,
    }

    OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n✅ 出力: {OUTPUT_PATH}")
    print(f"   合計件数: {len(unique_items)} 件")
    print(f"   合計金額: ¥{result['totalAmount']:,}")
    print("\n請求月別サマリー:")
    for year_month, total in sorted(by_ym.items()):
        count = sum(1 for item in unique_items if item["yearMonth"] == year_month)
        print(f"  {year_month}  ¥{total:>10,}  ({count}件)")

    labels = {
        "grocery": "🛒食費",
        "dining": "🍽️外食",
        "daily": "🏪日用品",
        "shopping": "🛍️買い物",
        "transport": "🚗交通",
        "leisure": "🎯レジャー",
        "other": "❓その他",
    }
    print("\nカテゴリ別サマリー:")
    for category in ["grocery", "dining", "daily", "shopping", "transport", "leisure", "other"]:
        info = by_cat.get(category, {"count": 0, "amount": 0})
        percent = info["amount"] / result["totalAmount"] * 100 if result["totalAmount"] > 0 else 0
        print(f"  {labels[category]:10s}  {info['count']:>4}件  ¥{info['amount']:>10,}  ({percent:.1f}%)")

    others = [item for item in unique_items if item["category"] == "other"]
    if others:
        print("\nその他内訳:")
        for item in others:
            print(f"  {item['date']}  ¥{item['amount']:>6}  {item['storeName']}  [{item['sourceFile']}]")


if __name__ == "__main__":
    main()