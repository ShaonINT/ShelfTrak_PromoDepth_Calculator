
// Global state
let processedData = [];
let downloadId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Drag and drop logic
    document.querySelectorAll(".drop-zone__input").forEach((inputElement) => {
        const dropZoneElement = inputElement.closest(".drop-zone");

        dropZoneElement.addEventListener("click", (e) => {
            inputElement.click();
        });

        inputElement.addEventListener("change", (e) => {
            if (inputElement.files.length) {
                updateThumbnail(dropZoneElement, inputElement.files[0]);
            }
        });

        dropZoneElement.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZoneElement.classList.add("drop-zone--over");
        });

        ["dragleave", "dragend"].forEach((type) => {
            dropZoneElement.addEventListener(type, (e) => {
                dropZoneElement.classList.remove("drop-zone--over");
            });
        });

        dropZoneElement.addEventListener("drop", (e) => {
            e.preventDefault();

            if (e.dataTransfer.files.length) {
                inputElement.files = e.dataTransfer.files;
                updateThumbnail(dropZoneElement, e.dataTransfer.files[0]);
            }

            dropZoneElement.classList.remove("drop-zone--over");
        });
    });

    // Download button handler
    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', generateExcel);
    }
});

function updateThumbnail(dropZoneElement, file) {
    let thumbnailElement = dropZoneElement.querySelector(".drop-zone__thumb");

    // First time - remove the prompt
    if (dropZoneElement.querySelector(".drop-zone__prompt")) {
        dropZoneElement.querySelector(".drop-zone__prompt").remove();
    }

    // First time - there is no thumbnail element, so lets create it
    if (!thumbnailElement) {
        thumbnailElement = document.createElement("div");
        thumbnailElement.classList.add("drop-zone__thumb");
        dropZoneElement.appendChild(thumbnailElement);
    }

    thumbnailElement.style.display = 'block';
    thumbnailElement.dataset.label = file.name;
}

async function handleFormSubmit(event) {
    event.preventDefault();

    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];

    if (!file) {
        alert("Please select a file first.");
        return;
    }

    // Show loading state (optional)
    const btn = document.getElementById('calculate-btn');
    const originalText = btn.innerText;
    btn.innerText = "Calculating...";
    btn.disabled = true;

    try {
        const data = await readExcel(file);
        processData(data);
    } catch (error) {
        console.error(error);
        alert("Error processing file: " + error.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function readExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);
                resolve(json);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

function processData(data) {
    if (!data || data.length === 0) {
        alert("File appears to be empty.");
        return;
    }

    // Find target column
    const firstRow = data[0];
    let targetColumn = null;
    if ('Price & Promo' in firstRow) {
        targetColumn = 'Price & Promo';
    } else if ('Price & Promo Details' in firstRow) {
        targetColumn = 'Price & Promo Details';
    }

    if (!targetColumn) {
        alert("Error: Column 'Price & Promo' or 'Price & Promo Details' not found.");
        return;
    }

    // Calculate Promo Depth
    processedData = data.map(row => {
        const promoString = row[targetColumn] ? String(row[targetColumn]) : "";
        const depth = calculatePromoDepth(promoString);
        return {
            ...row,
            'Promo Depth': depth
        };
    });

    // Update UI
    document.getElementById('row-count').innerText = processedData.length;
    document.getElementById('results-section').style.display = 'block';

    // Render Preview (first 50)
    const tbody = document.querySelector('#preview-table tbody');
    tbody.innerHTML = '';

    processedData.slice(0, 50).forEach(row => {
        const tr = document.createElement('tr');
        const promoText = row[targetColumn] || "";
        const depth = row['Promo Depth'];

        tr.innerHTML = `
            <td>${promoText}</td>
            <td>${depth}</td>
        `;
        tbody.appendChild(tr);
    });

    // Scroll to results
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
}

function generateExcel() {
    if (!processedData || processedData.length === 0) return;

    // Create new workbook
    const wb = XLSX.utils.book_new();

    // Filter columns: Price & Promo, Promo Depth
    // The requirement says "Select only the required columns"
    // output_df = df[[target_column, 'Promo Depth']]

    // Find target column again
    const firstRow = processedData[0];
    let targetColumn = null;
    if ('Price & Promo' in firstRow) targetColumn = 'Price & Promo';
    else if ('Price & Promo Details' in firstRow) targetColumn = 'Price & Promo Details';

    const exportData = processedData.map(row => ({
        [targetColumn]: row[targetColumn],
        'Promo Depth': row['Promo Depth']
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);

    // Highlight > 85% (This is harder in SheetJS basic, skipping conditional formatting for now or using cell styles if pro)
    // Basic SheetJS doesn't support writing conditional formatting easily without Pro version.
    // We will skip the red highlight for now.

    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "Promo_Depth_Calculated.xlsx");
}

// ==========================================
// CORE LOGIC PORTED FROM PYTHON
// ==========================================

function normalizeThousandsAndDecimals(s) {
    // remove thousand separators: 2,199 -> 2199
    // Python: re.sub(r'(\d{1,3}),(?=\d{3}\b)', lambda m: m.group(1), s)
    s = s.replace(/(\d{1,3}),(?=\d{3}\b)/g, '$1');

    // decimal comma -> dot: 12,50 -> 12.50
    // Python: re.sub(r'(\d+),(\d{1,2})', r'\1.\2', s)
    s = s.replace(/(\d+),(\d{1,2})/g, '$1.$2');
    return s;
}

function calculatePromoDepth(pricePromo) {
    if (typeof pricePromo !== 'string') return 0.0;
    if (!pricePromo.includes("-")) return 0.0;

    // Split into base side and promo text
    // Python: left, right = price_promo.split("-", 1)
    const parts = pricePromo.split("-");
    const left = parts[0];
    const right = parts.slice(1).join("-"); // Join back if multiple dashes

    // Parse base price from left
    // Python: m = re.search(r"[-+]?\d*\.?\d+", left)
    const mBase = left.match(/[-+]?\d*\.?\d+/);
    let basePrice = null;
    if (mBase) {
        const val = parseFloat(mBase[0]);
        if (val > 0) basePrice = val;
    }

    let promoRaw = right.replace(/\t/g, " ").trim();
    if (!promoRaw) return 0.0;

    // One-off OCR glitch
    if (promoRaw.includes("Buy 1 For 7.950 On Purchase Of 2 Bottles")) {
        return parseFloat(((1 - 10590 / (2 * 7950)) * 100.0).toFixed(2));
    }

    let promo = normalizeThousandsAndDecimals(promoRaw);
    let promoLower = promo.toLowerCase();

    // Fix common OCR typos
    promo = promo.replace(/\b[Bb]ut\b/g, "Buy");
    promo = promo.replace(/\b[Gg][Rr][Tt]\b/g, "Get");
    // Update lower after replace
    promoLower = promo.toLowerCase();

    const discounts = [];

    function addPct(p) {
        if (p !== null && p > 0) {
            discounts.push(p);
        }
    }

    // ========= HARD SPECIAL CASES =========

    // SGD 60 ANY 2 BOTTLES
    if (basePrice !== null) {
        if (/(sgd\s*60|60\s*sgd).*any\s*2\s*bottles/.test(promoLower)) {
            let disc = (1 - 60.0 / (2.0 * basePrice)) * 100.0;
            disc = Math.max(0.0, Math.min(disc, 100.0));
            return parseFloat(disc.toFixed(2));
        }

        // "60 SGD OFF 2 Bottles"
        if (/60\s*sgd\s*off.*2\s*bottle/.test(promoLower)) {
            let disc = 60.0 / (2.0 * basePrice) * 100.0;
            disc = Math.max(0.0, Math.min(disc, 100.0));
            return parseFloat(disc.toFixed(2));
        }
    }

    // Gift-with-purchase -> 0%
    if (/receive a free bottle/i.test(promo)) return 0.0;

    // Device + sticks -> 0%
    if (/device/.test(promoLower) && /stick|sticks|carton|pods?|capsules?/.test(promoLower)) return 0.0;

    // Generic combo
    if (promoLower.includes("combo") && (promo.includes("+") || promo.includes("&") || promoLower.includes(" and "))) {
        if (!/get|free|glass|backpack|trolley|gift|save|off/.test(promoLower)) return 0.0;
    }

    // Rating-only messages -> 0
    const ratingKeywords = ["points", "decanter", "world wine awards", "iwsc", "james suckling", "wine spectator", "robert parker", "medal"];
    const promoKeywords = ["save", "off", "buy", "get", "free", "was", "now", "discount", "offer", "deal", "pay", " for ", "%", "x", "@"];

    const hasRating = ratingKeywords.some(k => promoLower.includes(k));
    const hasPromo = promoKeywords.some(k => promoLower.includes(k));

    if (hasRating && !hasPromo) return 0.0;

    // UP TO X% OFF
    const mUpTo = promoLower.match(/up\s*to\s*(\d+(?:\.\d+)?)\s*%/);
    if (mUpTo) {
        addPct(parseFloat(mUpTo[1]));
    }

    // Extract all numbers
    const numList = (promo.match(/([0-9]+(?:\.[0-9]+)?)/g) || []).map(Number);

    // ========= LOGIC BLOCKS =========

    // 0) AxB patterns like 4x3, 3x2
    // Python: re.finditer(r"\b(\d+)\s*[xX]\s*(\d+)\b", promo)
    const mAxB = [...promo.matchAll(/\b(\d+)\s*[xX]\s*(\d+)\b/g)];
    for (const m of mAxB) {
        const total = parseInt(m[1]);
        const paid = parseInt(m[2]);
        if (total > 0 && paid > 0 && total > paid) {
            addPct((1 - paid / total) * 100.0);
        }
    }

    // 1) Direct % values
    const mPct = [...promo.matchAll(/(\d+(?:\.\d+)?)\s*%/gi)];
    for (const m of mPct) {
        addPct(parseFloat(m[1]));
    }

    // 2) Chinese 折 (e.g. 8折)
    const mZhe = [...promo.matchAll(/(\d+(?:\.[0-9]+)?)\s*折/g)];
    for (const m of mZhe) {
        const z = parseFloat(m[1]);
        if (z > 0 && z <= 10) {
            addPct((1 - z / 10.0) * 100.0);
        }
    }

    // 3) Was / Now
    const wasMatch = promo.match(/[Ww]as[^\d]*([0-9]+(?:\.[0-9]+)?)/);
    if (wasMatch) {
        const oldP = parseFloat(wasMatch[1]);
        const nowMatch = promo.match(/[Nn]ow[^\d]*([0-9]+(?:\.[0-9]+)?)/);
        let newP = null;
        if (nowMatch) newP = parseFloat(nowMatch[1]);
        else if (basePrice !== null) newP = basePrice;

        if (newP !== null && oldP > newP && newP > 0) {
            addPct((1 - newP / oldP) * 100.0);
        }
    } else {
        // fallback Y (X) with currency
        const currencyPresent = /€|\$|£|¥|hk\$|sgd|aed|₹|rs|nt\$|cny|krw|php/.test(promoLower);
        if (currencyPresent && numList.length === 2) {
            const [oldP, newP] = numList;
            if (oldP > newP && newP > 0) {
                addPct((1 - newP / oldP) * 100.0);
            }
        }
    }

    // 4) "Save X"
    const mSave = [...promo.matchAll(/save[^\d]*([0-9]+(?:\.[0-9]+)?)/gi)];
    for (const m of mSave) {
        const numText = m[1];
        const endIdx = m.index + m[0].length;
        const tail = promo.substring(endIdx, endIdx + 3);
        if (tail.includes("%")) continue;

        const saving = parseFloat(numText);

        // If "Now Y"
        const nowMatch = promo.match(/[Nn]ow[^\d]*([0-9]+(?:\.[0-9]+)?)/);
        if (nowMatch) {
            const nowPrice = parseFloat(nowMatch[1]);
            const oldPrice = nowPrice + saving;
            addPct(saving / oldPrice * 100.0);
            continue;
        }

        if (basePrice !== null) {
            const orig = basePrice + saving;
            addPct(saving / orig * 100.0);
        }
    }

    // 5) "X off" money-off
    // Python: r"([0-9]+(?:\.[0-9]+)?)\s*(?!%)\s*off\b"
    // JS doesn't support negative lookahead in all browsers? Actually modern JS does.
    // But let's be safe.
    const mOff = [...promo.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*off\b/gi)];
    for (const m of mOff) {
        // Check if followed by %
        const idx = m.index + m[0].length;
        // Look at original string around match
        // Actually the regex `\s*off` consumes the off.
        // We need to check if the number was followed by %.
        // Let's re-implement carefully.
        // The python regex `\s*(?!%)` checks right after the number.

        // Simpler approach: match number then check context
        const saving = parseFloat(m[1]);
        // Check if '%' is between number and 'off'
        const fullMatch = m[0];
        if (fullMatch.includes('%')) continue; // Should be caught by regex but just in case

        // We need to ensure it wasn't "20% off"
        // The python regex `(?<!%)` lookbehind is also tricky.
        // Let's rely on the fact that we handled % in step 1.

        // Wait, the python regex `([0-9]+...)\s*(?!%)\s*off` means:
        // Number, then whitespace, then NOT %, then whitespace, then off.
        // So "20 % off" would fail. "20 off" passes.

        // Let's check the character immediately following the number in the match
        const numStr = m[1];
        const afterNum = m[0].substring(numStr.length);
        if (afterNum.includes('%')) continue;

        if (basePrice !== null) {
            const orig = basePrice + saving;
            addPct(saving / orig * 100.0);
        }
    }

    // 6) Yen off
    const mYen = [...promo.matchAll(/([0-9]+)\s*円引き/g)];
    for (const m of mYen) {
        const saving = parseFloat(m[1]);
        if (basePrice !== null) {
            const orig = basePrice + saving;
            addPct(saving / orig * 100.0);
        }
    }

    // 7) Buy X Get Y
    const mBxy = [...promo.matchAll(/Buy\s*(?:any\s*)?(\d+).*?Get\s*(\d+)/gi)];
    for (const m of mBxy) {
        const buyN = parseInt(m[1]);
        const getN = parseInt(m[2]);
        if (buyN <= 0 || getN <= 0) continue;

        let total, paid;
        if (buyN === 2 && getN === 3) {
            total = 3; paid = 2;
        } else {
            total = buyN + getN;
            paid = buyN;
        }
        addPct((1 - paid / total) * 100.0);
    }

    // 7b) Any N Get M Free
    const mAnyFree = [...promo.matchAll(/Any\s*(\d+).*?Get\s*(\d+)\s*[Ff]ree/gi)];
    for (const m of mAnyFree) {
        const buyN = parseInt(m[1]);
        const freeN = parseInt(m[2]);
        if (buyN > 0 && freeN > 0) {
            const total = buyN + freeN;
            const paid = buyN;
            addPct((1 - paid / total) * 100.0);
        }
    }

    // 8) X + Y Free
    const mPlusFree = [...promo.matchAll(/(\d+)\s*\+\s*(\d+)\s*[Ff]ree/g)];
    for (const m of mPlusFree) {
        const buyN = parseInt(m[1]);
        const freeN = parseInt(m[2]);
        if (buyN > 0 && freeN > 0) {
            const total = buyN + freeN;
            const paid = buyN;
            addPct((1 - paid / total) * 100.0);
        }
    }

    // 9) Leve X Pague Y
    const mLp = promo.match(/[Ll]eve\s*(\d+)\s*[Pp]ague\s*(\d+)/);
    if (mLp) {
        const total = parseInt(mLp[1]);
        const paid = parseInt(mLp[2]);
        if (total > 0 && paid > 0 && paid <= total) {
            addPct((1 - paid / total) * 100.0);
        }
    }

    // 10a) Quantity only "A for B" (no currency)
    const currencyPresent = /€|\$|£|¥|hk\$|sgd|aed|₹|rs|nt\$|cny|krw|php/.test(promoLower);
    if (!currencyPresent) {
        const mAforB = [...promo.matchAll(/\b(\d+)\s*[Ff]or\s*(\d+)\b/g)];
        for (const m of mAforB) {
            const a = parseInt(m[1]);
            const b = parseInt(m[2]);
            if (a > 0 && b > 0 && a !== b && Math.max(a, b) <= 10) {
                const total = Math.max(a, b);
                const paid = Math.min(a, b);
                addPct((1 - paid / total) * 100.0);
            }
        }
    }

    // 10b) "2 for get 1"
    const m2fg1 = promo.match(/(\d+)\s*[Ff]or\s*[Gg]et\s*(\d+)/);
    if (m2fg1) {
        const total = parseInt(m2fg1[1]);
        const paid = parseInt(m2fg1[2]);
        if (total > 0 && paid > 0 && total > paid) {
            addPct((1 - paid / total) * 100.0);
        }
    }

    // 10c) Buy N For Pay M
    const mBnPm = [...promo.matchAll(/Buy\s*(\d+)[^\d]+For[^\d]+Pay\s*(\d+)/gi)];
    for (const m of mBnPm) {
        const total = parseInt(m[1]);
        const paid = parseInt(m[2]);
        if (total > 0 && paid > 0 && total > paid) {
            addPct((1 - paid / total) * 100.0);
        }
    }

    // 11) qty for total_price
    const mQtyForTotal = [...promo.matchAll(/(\d+)\s*(?:for|For|FOR|x|X|@)\s*[^\d]*([0-9]+(?:\.[0-9]+)?)/g)];
    for (const m of mQtyForTotal) {
        const qty = parseInt(m[1]);
        const totalPrice = parseFloat(m[2]);
        if (basePrice !== null && qty > 0 && qty <= 10 && totalPrice > 0) {
            const effUnit = totalPrice / qty;
            if (effUnit < basePrice) {
                addPct((1 - effUnit / basePrice) * 100.0);
            }
        }
    }

    // 11b) total_price for qty
    const mTotalForQty = [...promo.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*[^\d]*[Ff]or\s*(\d+)\b/g)];
    for (const m of mTotalForQty) {
        const totalPrice = parseFloat(m[1]);
        const qty = parseInt(m[2]);
        if (basePrice !== null && qty > 0 && qty <= 10 && totalPrice > 0) {
            const effUnit = totalPrice / qty;
            if (effUnit < basePrice) {
                addPct((1 - effUnit / basePrice) * 100.0);
            }
        }
    }

    // 12) BUY N PAY X
    const mBuyNPayX = [...promo.matchAll(/BUY\s*(\d+)\s*PAY[^\d]*([0-9]+(?:\.[0-9]+)?)/gi)];
    for (const m of mBuyNPayX) {
        const qty = parseInt(m[1]);
        const totalPrice = parseFloat(m[2]);
        if (basePrice !== null && qty > 0 && totalPrice > 0) {
            const effUnit = totalPrice / qty;
            if (effUnit < basePrice) {
                addPct((1 - effUnit / basePrice) * 100.0);
            }
        }
    }

    // 13) X each
    const mEach = promo.match(/([0-9]+(?:\.[0-9]+)?)\s*each/i);
    if (mEach && basePrice !== null) {
        const effUnit = parseFloat(mEach[1]);
        if (effUnit < basePrice) {
            addPct((1 - effUnit / basePrice) * 100.0);
        }
    }

    // 14) Unit Price X
    const mUnit = promo.match(/Unit Price\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (mUnit && basePrice !== null) {
        const effUnit = parseFloat(mUnit[1]);
        if (effUnit < basePrice) {
            addPct((1 - effUnit / basePrice) * 100.0);
        }
    }

    // 15) Buy 1 Get 2nd for X
    const mB1g2 = promo.match(/Buy\s*1[^0-9]+Get\s*2nd[^\d]*([0-9]+(?:\.[0-9]+)?)/i);
    if (mB1g2 && basePrice !== null) {
        const secondPrice = parseFloat(mB1g2[1]);
        const totalForTwo = basePrice + secondPrice;
        const effUnit = totalForTwo / 2.0;
        if (effUnit < basePrice) {
            addPct((1 - effUnit / basePrice) * 100.0);
        }
    }

    // 16) Buy 1 For X when purchase 2
    const mB1When2 = promo.match(/Buy\s*1\s*For[^\d]*([0-9]+(?:\.[0-9]+)?)\s*(?:On Purchase Of|when purchase|when purches|when pueches)\s*2/i);
    if (mB1When2 && basePrice !== null) {
        const promoUnit = parseFloat(mB1When2[1]);
        const disc = (1 - basePrice / (2 * promoUnit)) * 100.0;
        if (disc > 0) addPct(disc);
    }

    // 16b) Simple Buy 1 For X
    if (/Buy\s*1\s*For/i.test(promo) && !/(On Purchase Of|when purchase|when purches|when pueches)\s*2/i.test(promo)) {
        const mB1Simple = promo.match(/Buy\s*1\s*For[^\d]*([0-9]+(?:\.[0-9]+)?)/i);
        if (mB1Simple && basePrice !== null) {
            const promoPrice = parseFloat(mB1Simple[1]);
            if (promoPrice < basePrice) {
                addPct((1 - promoPrice / basePrice) * 100.0);
            }
        }
    }

    // 17) Buy 1 for X, 2 for Y
    const mMulti = promo.match(/Buy\s*1\s*for[^\d]*([0-9]+(?:\.[0-9]+)?)[^\d]+2\s*for[^\d]*([0-9]+(?:\.[0-9]+)?)/i);
    if (mMulti) {
        const base1 = parseFloat(mMulti[1]);
        const twoTotal = parseFloat(mMulti[2]);
        const effUnit = twoTotal / 2.0;
        if (effUnit < base1) {
            addPct((1 - effUnit / base1) * 100.0);
        }
    }

    // 18) BUY N FOR P SAVE S
    const mHybrid = promo.match(/BUY\s*(\d+)\s*FOR\s*([0-9]+(?:\.[0-9]+)?)\s*SAVE\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (mHybrid) {
        // const qty = parseInt(mHybrid[1]);
        const promoTotal = parseFloat(mHybrid[2]);
        const saving = parseFloat(mHybrid[3]);
        if (promoTotal > 0 && saving > 0) {
            const origTotal = promoTotal + saving;
            addPct(saving / origTotal * 100.0);
        }
    }

    // 19) each ... X for N
    const mEachOr = promo.match(/each.*?([0-9]+(?:\.[0-9]+)?)\s*[^\d]*[Ff]or\s*(\d+)\b/i);
    if (mEachOr && basePrice !== null) {
        const promoTotal = parseFloat(mEachOr[1]);
        const qty = parseInt(mEachOr[2]);
        if (qty > 0 && promoTotal > 0) {
            const effUnit = promoTotal / qty;
            if (effUnit < basePrice) {
                addPct((1 - effUnit / basePrice) * 100.0);
            }
        }
    }

    // 20) any 3/4 get 1 free
    if (/any\s*3[^0-9]*get\s*1\s*free/i.test(promo)) addPct(25.0);
    if (/any\s*4[^0-9]*get\s*1\s*free/i.test(promo)) addPct(25.0);

    // ========= FINAL DECISION =========
    if (discounts.length === 0) return 0.0;

    // BUSINESS RULE: always use the LOWEST discount %
    let best = Math.min(...discounts);
    best = Math.max(0.0, Math.min(best, 100.0));
    return parseFloat(best.toFixed(2));
}
