import os
import re
import pandas as pd
import uuid
import tempfile
from flask import Flask, render_template, request, send_file, flash, redirect, url_for
from io import BytesIO
from xlsxwriter.utility import xl_col_to_name

app = Flask(__name__)
app.secret_key = 'supersecretkey'  # Needed for flash messages

# Dictionary to store temp file paths (in a real app, use a proper cache/db)
TEMP_FILES = {}

def normalize_thousands_and_decimals(s: str) -> str:
    """
    Normalise number formats inside a promo string:
    - Remove thousands separators like 2,199 -> 2199
    - Convert decimal commas to dots like 12,50 -> 12.50
    """
    # remove thousand separators
    s = re.sub(r'(\d{1,3}),(?=\d{3}\b)', lambda m: m.group(1), s)
    # decimal comma -> dot
    s = re.sub(r'(\d+),(\d{1,2})', r'\1.\2', s)
    return s

def calculate_promo_depth(price_promo: str) -> float:
    """
    Promo depth function (v15).
    Input: cell from "Price & Promo", formatted like "BASE - promo text".
    Output: discount percentage (0–100, two decimals).
    """
    if not isinstance(price_promo, str):
        return 0.0
    if "-" not in price_promo:
        return 0.0

    # Split into base side and promo text
    left, right = price_promo.split("-", 1)

    # Parse base price from the left-hand side
    m = re.search(r"[-+]?\d*\.?\d+", left)
    base_price = None
    if m:
        try:
            val = float(m.group())
            if val > 0:
                base_price = val
        except ValueError:
            pass

    promo_raw = right.replace("\t", " ").strip()
    if not promo_raw:
        return 0.0

    # One-off OCR glitch override (optional)
    if "Buy 1 For 7.950 On Purchase Of 2 Bottles" in promo_raw:
        return round((1 - 10590 / (2 * 7950)) * 100.0, 2)

    promo = normalize_thousands_and_decimals(promo_raw)
    promo_lower = promo.lower()

    # Fix common OCR typos
    promo = re.sub(r"\b[Bb]ut\b", "Buy", promo)   # "but 2 get 1" -> "Buy 2 get 1"
    promo = re.sub(r"\b[Gg][Rr][Tt]\b", "Get", promo)  # "grt" -> "Get"

    discounts: list[float] = []

    def add_pct(p: float):
        if p is None or p <= 0:
            return
        discounts.append(p)

    # ========= HARD SPECIAL CASES =========

    # SGD 60 ANY 2 BOTTLES (order "SGD 60" or "60 SGD")
    if base_price is not None:
        if re.search(r"(sgd\s*60|60\s*sgd).*any\s*2\s*bottles", promo_lower):
            disc = (1 - 60.0 / (2.0 * base_price)) * 100.0
            disc = max(0.0, min(disc, 100.0))
            return round(disc, 2)

        # "60 SGD OFF 2 Bottles" / "60 sgd off for 2 Bottle"
        if re.search(r"60\s*sgd\s*off.*2\s*bottle", promo_lower):
            disc = 60.0 / (2.0 * base_price) * 100.0
            disc = max(0.0, min(disc, 100.0))
            return round(disc, 2)

    # Gift-with-purchase Absolut offers -> treat as 0% discount
    if re.search(r"receive a free bottle", promo, flags=re.I):
        return 0.0

    # Device + sticks/carton bundles -> cannot isolate product discount
    if re.search(r"device", promo_lower) and re.search(
        r"stick|sticks|carton|pods?|capsules?", promo_lower
    ):
        return 0.0

    # Generic combo A + B for X with no explicit save/off/free/glass/backpack/trolley/gift -> 0
    if "combo" in promo_lower and (
        "+" in promo or "&" in promo or " and " in promo_lower
    ):
        if not re.search(r"get|free|glass|backpack|trolley|gift|save|off", promo_lower):
            return 0.0

    # Rating-only messages (Decanter, IWSC, points, medals etc.) -> 0
    rating_keywords = [
        "points",
        "decanter",
        "world wine awards",
        "iwsc",
        "james suckling",
        "wine spectator",
        "robert parker",
        "medal",
    ]
    promo_keywords = [
        "save",
        "off",
        "buy",
        "get",
        "free",
        "was",
        "now",
        "discount",
        "offer",
        "deal",
        "pay",
        " for ",
        "%",
        "x",
        "@",
    ]
    if any(k in promo_lower for k in rating_keywords) and not any(
        k in promo_lower for k in promo_keywords
    ):
        return 0.0

    # "UP TO X% OFF" – treat as X% even without base price
    m_up_to = re.search(r"up\s*to\s*(\d+(?:\.\d+)?)\s*%", promo_lower)
    if m_up_to:
        try:
            add_pct(float(m_up_to.group(1)))
        except ValueError:
            pass

    # Extract all numbers for some fallbacks
    num_list = [float(x) for x in re.findall(r"([0-9]+(?:\.[0-9]+)?)", promo)]

    # ========= LOGIC BLOCKS =========

    # 0) AxB patterns like 4x3, 3x2
    for m in re.finditer(r"\b(\d+)\s*[xX]\s*(\d+)\b", promo):
        total = int(m.group(1))
        paid = int(m.group(2))
        if total > 0 and paid > 0 and total > paid:
            add_pct((1 - paid / total) * 100.0)

    # 1) Direct % values
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*%", promo, flags=re.I):
        try:
            pct = float(m.group(1))
            add_pct(pct)
        except ValueError:
            pass

    # 2) Chinese 折 (e.g. 8折)
    for m in re.finditer(r"(\d+(?:\.[0-9]+)?)\s*折", promo):
        try:
            z = float(m.group(1))
            if 0 < z <= 10:
                add_pct((1 - z / 10.0) * 100.0)
        except ValueError:
            pass

    # 3) Was / Now & "old (was new)" structures
    was_match = re.search(r"[Ww]as[^\d]*([0-9]+(?:\.[0-9]+)?)", promo)
    if was_match:
        old = float(was_match.group(1))
        now_match = re.search(r"[Nn]ow[^\d]*([0-9]+(?:\.[0-9]+)?)", promo)
        if now_match:
            new = float(now_match.group(1))
        else:
            new = base_price if base_price is not None else None
        if new and old > new > 0:
            add_pct((1 - new / old) * 100.0)
    else:
        # fallback for "Y (X)" with currency
        currency_present = bool(
            re.search(r"€|\$|£|¥|hk\$|sgd|aed|₹|rs|nt\$|cny|krw|php", promo_lower)
        )
        if currency_present and len(num_list) == 2:
            old, new = num_list
            if old > new > 0:
                add_pct((1 - new / old) * 100.0)

    # 4) "Save X"
    for m in re.finditer(r"save[^\d]*([0-9]+(?:\.[0-9]+)?)", promo, flags=re.I):
        num_text = m.group(1)
        end_idx = m.end(1)
        tail = promo[end_idx : end_idx + 3]
        if "%" in tail:
            continue  # already handled as percentage discount

        try:
            saving = float(num_text)
        except ValueError:
            continue

        # If we see a "Now Y" with it
        now_match = re.search(r"[Nn]ow[^\d]*([0-9]+(?:\.[0-9]+)?)", promo)
        if now_match:
            try:
                now_price = float(now_match.group(1))
                old_price = now_price + saving
                add_pct(saving / old_price * 100.0)
                continue
            except ValueError:
                pass

        # Else assume left-hand base is the new price
        if base_price is not None:
            orig = base_price + saving
            add_pct(saving / orig * 100.0)

    # 5) "X off" money-off
    for m in re.finditer(
        r"([0-9]+(?:\.[0-9]+)?)\s*(?!%)\s*off\b", promo, flags=re.I
    ):
        try:
            saving = float(m.group(1))
        except ValueError:
            continue
        if base_price is not None:
            orig = base_price + saving
            add_pct(saving / orig * 100.0)

    # 6) 円引き
    for m in re.finditer(r"([0-9]+)\s*円引き", promo):
        saving = float(m.group(1))
        if base_price is not None:
            orig = base_price + saving
            add_pct(saving / orig * 100.0)

    # 7) "Buy X Get Y"
    for m in re.finditer(r"Buy\s*(?:any\s*)?(\d+).*?Get\s*(\d+)", promo, flags=re.I):
        buy_n = int(m.group(1))
        get_n = int(m.group(2))
        if buy_n <= 0 or get_n <= 0:
            continue

        # Special override: Buy 2 Get 3 → 3 for price of 2
        if buy_n == 2 and get_n == 3:
            total, paid = 3, 2
        else:
            total, paid = buy_n + get_n, buy_n

        add_pct((1 - paid / total) * 100.0)

    # 7b) "Any N Get M Free"
    for m in re.finditer(r"Any\s*(\d+).*?Get\s*(\d+)\s*[Ff]ree", promo, flags=re.I):
        buy_n = int(m.group(1))
        free_n = int(m.group(2))
        if buy_n > 0 and free_n > 0:
            total, paid = buy_n + free_n, buy_n
            add_pct((1 - paid / total) * 100.0)

    # 8) "X + Y Free"
    for m in re.finditer(r"(\d+)\s*\+\s*(\d+)\s*[Ff]ree", promo):
        buy_n = int(m.group(1))
        free_n = int(m.group(2))
        if buy_n > 0 and free_n > 0:
            total, paid = buy_n + free_n, buy_n
            add_pct((1 - paid / total) * 100.0)

    # 9) "Leve X Pague Y"
    m_lp = re.search(r"[Ll]eve\s*(\d+)\s*[Pp]ague\s*(\d+)", promo)
    if m_lp:
        total = int(m_lp.group(1))
        paid = int(m_lp.group(2))
        if total > 0 and paid > 0 and paid <= total:
            add_pct((1 - paid / total) * 100.0)

    # 10a) Quantity-only "A for B" (no currency)
    currency_present = bool(
        re.search(r"€|\$|£|¥|hk\$|sgd|aed|₹|rs|nt\$|cny|krw|php", promo_lower)
    )
    if not currency_present:
        for m in re.finditer(r"\b(\d+)\s*[Ff]or\s*(\d+)\b", promo):
            a = int(m.group(1))
            b = int(m.group(2))
            if a > 0 and b > 0 and a != b and max(a, b) <= 10:
                total = max(a, b)
                paid = min(a, b)
                add_pct((1 - paid / total) * 100.0)

    # 10b) "2 for get 1"
    m_2fg1 = re.search(r"(\d+)\s*[Ff]or\s*[Gg]et\s*(\d+)", promo)
    if m_2fg1:
        total = int(m_2fg1.group(1))
        paid = int(m_2fg1.group(2))
        if total > 0 and paid > 0 and total > paid:
            add_pct((1 - paid / total) * 100.0)

    # 10c) "Buy N For Pay M"
    for m in re.finditer(r"Buy\s*(\d+)[^\d]+For[^\d]+Pay\s*(\d+)", promo, flags=re.I):
        total = int(m.group(1))
        paid = int(m.group(2))
        if total > 0 and paid > 0 and total > paid:
            add_pct((1 - paid / total) * 100.0)

    # 11) "qty for total_price"
    for m in re.finditer(
        r"(\d+)\s*(?:for|For|FOR|x|X|@)\s*[^\d]*([0-9]+(?:\.[0-9]+)?)", promo
    ):
        qty = int(m.group(1))
        total_price = float(m.group(2))
        if base_price is not None and 0 < qty <= 10 and total_price > 0:
            eff_unit = total_price / qty
            if eff_unit < base_price:
                add_pct((1 - eff_unit / base_price) * 100.0)

    # 11b) "total_price for qty"
    for m in re.finditer(r"([0-9]+(?:\.[0-9]+)?)\s*[^\d]*[Ff]or\s*(\d+)\b", promo):
        total_price = float(m.group(1))
        qty = int(m.group(2))
        if base_price is not None and 0 < qty <= 10 and total_price > 0:
            eff_unit = total_price / qty
            if eff_unit < base_price:
                add_pct((1 - eff_unit / base_price) * 100.0)

    # 12) "BUY N PAY X"
    for m in re.finditer(
        r"BUY\s*(\d+)\s*PAY[^\d]*([0-9]+(?:\.[0-9]+)?)", promo, flags=re.I
    ):
        qty = int(m.group(1))
        total_price = float(m.group(2))
        if base_price is not None and qty > 0 and total_price > 0:
            eff_unit = total_price / qty
            if eff_unit < base_price:
                add_pct((1 - eff_unit / base_price) * 100.0)

    # 13) "X each"
    m_each = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*each", promo, flags=re.I)
    if m_each and base_price is not None:
        eff_unit = float(m_each.group(1))
        if eff_unit < base_price:
            add_pct((1 - eff_unit / base_price) * 100.0)

    # 14) "Unit Price X"
    m_unit = re.search(r"Unit Price\s*([0-9]+(?:\.[0-9]+)?)", promo, flags=re.I)
    if m_unit and base_price is not None:
        eff_unit = float(m_unit.group(1))
        if eff_unit < base_price:
            add_pct((1 - eff_unit / base_price) * 100.0)

    # 15) "Buy 1 Get 2nd for X"
    m_b1g2 = re.search(
        r"Buy\s*1[^0-9]+Get\s*2nd[^\d]*([0-9]+(?:\.[0-9]+)?)", promo, flags=re.I
    )
    if m_b1g2 and base_price is not None:
        second_price = float(m_b1g2.group(1))
        total_for_two = base_price + second_price
        eff_unit = total_for_two / 2.0
        if eff_unit < base_price:
            add_pct((1 - eff_unit / base_price) * 100.0)

    # 16) "Buy 1 For X when purchase 2"
    m_b1_when2 = re.search(
        r"Buy\s*1\s*For[^\d]*([0-9]+(?:\.[0-9]+)?)\s*(?:On Purchase Of|when purchase|when purches|when pueches)\s*2",
        promo,
        flags=re.I,
    )
    if m_b1_when2 and base_price is not None:
        promo_unit = float(m_b1_when2.group(1))
        disc = (1 - base_price / (2 * promo_unit)) * 100.0
        if disc > 0:
            add_pct(disc)

    # 16b) Simple "Buy 1 For X"
    if re.search(r"Buy\s*1\s*For", promo, flags=re.I) and not re.search(
        r"(On Purchase Of|when purchase|when purches|when pueches)\s*2",
        promo,
        flags=re.I,
    ):
        m_b1_simple = re.search(
            r"Buy\s*1\s*For[^\d]*([0-9]+(?:\.[0-9]+)?)", promo, flags=re.I
        )
        if m_b1_simple and base_price is not None:
            promo_price = float(m_b1_simple.group(1))
            if promo_price < base_price:
                add_pct((1 - promo_price / base_price) * 100.0)

    # 17) "Buy 1 for X, 2 for Y"
    m_multi = re.search(
        r"Buy\s*1\s*for[^\d]*([0-9]+(?:\.[0-9]+)?)[^\d]+2\s*for[^\d]*([0-9]+(?:\.[0-9]+)?)",
        promo,
        flags=re.I,
    )
    if m_multi:
        base1 = float(m_multi.group(1))
        two_total = float(m_multi.group(2))
        eff_unit = two_total / 2.0
        if eff_unit < base1:
            add_pct((1 - eff_unit / base1) * 100.0)

    # 18) "BUY N FOR P SAVE S"
    m_hybrid = re.search(
        r"BUY\s*(\d+)\s*FOR\s*([0-9]+(?:\.[0-9]+)?)\s*SAVE\s*([0-9]+(?:\.[0-9]+)?)",
        promo,
        flags=re.I,
    )
    if m_hybrid:
        qty = int(m_hybrid.group(1))
        promo_total = float(m_hybrid.group(2))
        saving = float(m_hybrid.group(3))
        if promo_total > 0 and saving > 0:
            orig_total = promo_total + saving
            add_pct(saving / orig_total * 100.0)

    # 19) "each ... X for N"
    m_each_or = re.search(
        r"each.*?([0-9]+(?:\.[0-9]+)?)\s*[^\d]*[Ff]or\s*(\d+)\b", promo, flags=re.I
    )
    if m_each_or and base_price is not None:
        promo_total = float(m_each_or.group(1))
        qty = int(m_each_or.group(2))
        if qty > 0 and promo_total > 0:
            eff_unit = promo_total / qty
            if eff_unit < base_price:
                add_pct((1 - eff_unit / base_price) * 100.0)

    # 20) Special: any 3/4 get 1 free → force 25%
    if re.search(r"any\s*3[^0-9]*get\s*1\s*free", promo, flags=re.I):
        add_pct(25.0)
    if re.search(r"any\s*4[^0-9]*get\s*1\s*free", promo, flags=re.I):
        add_pct(25.0)

    # ========= FINAL DECISION =========
    if not discounts:
        return 0.0

    # BUSINESS RULE: always use the LOWEST discount %
    best = min(discounts)
    best = max(0.0, min(best, 100.0))
    return round(best, 2)

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        flash('No file part')
        return redirect(request.url)
    
    file = request.files['file']
    
    if file.filename == '':
        flash('No selected file')
        return redirect(request.url)
    
    if file:
        try:
            # Read the Excel file
            df = pd.read_excel(file)
            
            # Check if required column exists
            target_column = None
            if 'Price & Promo' in df.columns:
                target_column = 'Price & Promo'
            elif 'Price & Promo Details' in df.columns:
                target_column = 'Price & Promo Details'
            
            if not target_column:
                flash("Error: Column 'Price & Promo' or 'Price & Promo Details' not found in the uploaded file.")
                return redirect(url_for('index'))
            
            # Calculate Promo Depth
            df['Promo Depth'] = df[target_column].apply(calculate_promo_depth)
            
            # Select only the required columns
            output_df = df[[target_column, 'Promo Depth']]
            
            # Save to temp file
            download_id = str(uuid.uuid4())
            temp_dir = tempfile.gettempdir()
            filename = f"Promo_Depth_Calculated_{download_id}.xlsx"
            filepath = os.path.join(temp_dir, filename)
            
            # Store filepath in global dict (for simplicity)
            TEMP_FILES[download_id] = filepath
            
            with pd.ExcelWriter(filepath, engine='xlsxwriter') as writer:
                output_df.to_excel(writer, index=False, sheet_name='Sheet1')
                workbook = writer.book
                worksheet = writer.sheets['Sheet1']
                
                # Get column index for Promo Depth
                # It's the 2nd column (index 1) in output_df
                promo_col_idx = 1 
                promo_col_letter = xl_col_to_name(promo_col_idx)
                last_row = len(output_df) + 1
                
                # QC: highlight very high discounts (>85%) in red
                red_format = workbook.add_format(
                    {"bg_color": "#FFC7CE", "font_color": "#9C0006"}
                )
                worksheet.conditional_format(
                    f"{promo_col_letter}2:{promo_col_letter}{last_row}",
                    {"type": "cell", "criteria": ">", "value": 85, "format": red_format},
                )
            
            # Prepare preview data (first 50 rows)
            preview_df = output_df.head(50)
            preview_data = preview_df.to_dict(orient='records')
            
            # Render index with stats, preview, and download id
            return render_template('index.html', 
                                   row_count=len(df), 
                                   preview_data=preview_data,
                                   download_id=download_id)
            
        except Exception as e:
            flash(f"An error occurred: {str(e)}")
            return redirect(url_for('index'))

@app.route('/download/<download_id>')
def download_file(download_id):
    if download_id in TEMP_FILES:
        filepath = TEMP_FILES[download_id]
        if os.path.exists(filepath):
            return send_file(
                filepath,
                as_attachment=True,
                download_name='Promo_Depth_Calculated.xlsx',
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
    flash("File not found or expired.")
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True)
