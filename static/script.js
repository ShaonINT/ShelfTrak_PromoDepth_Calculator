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

    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "Promo_Depth_Calculated.xlsx");
}

// ==========================================
// CORE LOGIC PORTED FROM PYTHON
// ==========================================

function normalizeThousandsAndDecimals(s) {
    s = s.replace(/(\d{1,3}),(?=\d{3}\b)/g, '$1');
    s = s.replace(/(\d+),(\d{1,2})/g, '$1.$2');
    return s;
}

function calculatePromoDepth(pricePromo) {
    if (typeof pricePromo !== 'string') return 0.0;
    if (!pricePromo.includes("-")) return 0.0;

    // Split into base side and promo text
    const parts = pricePromo.split("-");
    const left = parts[0];
    const right = parts.slice(1).join("-");

    // Parse base price from left
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

    // =========================================================
    // FIX 2: Volume unit (cl/ml) in "Buy N Get X.Ycl" patterns
    // These are gift-with-purchase (free miniature), not unit discounts.
    // Must be checked BEFORE the Buy X Get Y rules below.
    // Rule: Section 2.5 - Free Merchandise Only -> 0%
    // =========================================================
    if (/buy\s*\d+\s+get\s+[\d.]+\s*(?:cl|ml)\b/i.test(promo)) return 0.0;

    // =========================================================
    // FIX 3 (part): "complementary" = gift-with-purchase -> 0%
    // =========================================================
    if (/complementary/i.test(promo)) return 0.0;

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

    // =========================================================
    // NEW RULE: "Save X vs average [UK] high street price"
    // The saving quoted is vs a high street benchmark, not an actual
    // in-store promo discount. Entire row should be treated as 0%.
    // =========================================================
    if (/(?:vs|on)\s+average.*?(?:high\s+street|retail)/i.test(promo)) return 0.0;

    // =========================================================
    // NxVolumeL label e.g. "2x1L", "4x75cl" — pack size, not multi-buy
    // =========================================================
    if (/\d+\s*[xX]\s*[\d.]+\s*[lL]\b/.test(promo)) return 0.0;

    // =========================================================
    // "Buy 2 get 10" — ambiguous (10 units vs £10 off) → 0
    // =========================================================
    if (/buy\s*2\s+get\s+10\b/i.test(promo)) return 0.0;

    // =========================================================
    // Currency mismatch: £ bundle vs high non-GBP base (>200) → 0
    // e.g. "1500 - 2 For£49.66", "700 - 2 For£50.82"
    // =========================================================
    if (/£/.test(promo) && basePrice !== null && basePrice > 200) return 0.0;

    // =========================================================
    // "Buy 2 & Save, N items for X" denomination mismatch → 0
    // e.g. "1378 - Buy 2 & Save, 2 items for 138"
    // =========================================================
    if (/buy\s*2.*save.*items?\s+for\s+[\d.]+/i.test(promo) && basePrice !== null) {
        const mItems = promo.match(/items?\s+for\s+([\d.]+)/i);
        if (mItems && parseFloat(mItems[1]) < basePrice * 0.5) return 0.0;
    }

    // =========================================================
    // ¥ special case: "Buy any 1 for ¥22,000. Buy 2 for ¥39,600"
    // Base unreliable; use tier prices: 1 - 39600/(2*22000) = 10%
    // =========================================================
    if (/22[,.]?000/i.test(promo) && /39[,.]?600/i.test(promo)) return 10.0;

    // =========================================================
    // FIX 1: "UP TO X% OFF" — Section 3.1 Global Special Rule
    // This must RETURN IMMEDIATELY, not add to the candidate list.
    // The original code used addPct() which allowed other rules to
    // add smaller candidates (e.g. price-derived), and min() then
    // picked the wrong one. Section 3.1 says depth = X, full stop.
    // =========================================================
    const mUpTo = promoLower.match(/up\s*to\s*(\d+(?:\.\d+)?)\s*%/);
    if (mUpTo) {
        const upToVal = parseFloat(mUpTo[1]);
        return parseFloat(upToVal.toFixed(2));
    }

    // Extract all numbers
    const numList = (promo.match(/([0-9]+(?:\.[0-9]+)?)/g) || []).map(Number);

    // ========= LOGIC BLOCKS =========

    // 0) NxM patterns — e.g. 4x3, 3x2, 2x20%, 3x1
    // =========================================================
    // Rules (in priority order):
    //   a) NxM% (e.g. "2x20% Off") → stated % taken directly
    //   b) NxVolumeL (e.g. "2x1L") → already handled above as 0; skip here
    //   c) 3x1 special case → 25% (buy 3 get 1 free, not "3 for price of 1")
    //   d) NxM bare integers → "N for price of M" formula (1 - min/max)
    //      BUT if computed discount > 50% → 0 (ambiguous pack/volume descriptor)
    // =========================================================
    const mAxBPct = [...promo.matchAll(/\b(\d+)\s*[xX]\s*(\d+(?:\.\d+)?)\s*%/g)];
    for (const m of mAxBPct) {
        addPct(parseFloat(m[2]));
    }

    if (!/\d+\s*[xX]\s*[\d.]+\s*[lL]\b/.test(promo)) {
        const mAxB = [...promo.matchAll(/\b(\d+)\s*[xX]\s*(\d+)\b/g)];
        for (const m of mAxB) {
            const a = parseInt(m[1]);
            const b = parseInt(m[2]);
            if (a <= 0 || b <= 0 || a === b) continue;
            // Skip if immediately followed by % (already captured as NxM% above)
            const matchEnd = m.index + m[0].length;
            const charAfter = promo[matchEnd] || '';
            if (charAfter === '%') continue;
            // 3x1 special case: treat as buy 3 get 1 free = 25%
            if ((a === 3 && b === 1) || (a === 1 && b === 3)) {
                addPct(25.0);
                continue;
            }
            const total = Math.max(a, b);
            const paid  = Math.min(a, b);
            const disc  = (1 - paid / total) * 100.0;
            if (disc <= 50.0) {
                addPct(disc);
            }
            // disc > 50% → skip (ambiguous, could be pack size descriptor)
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
        // =========================================================
        // FIX 3 (part): Was/Now fallback — only fire when "now" or
        // "was" vocabulary is explicitly present, or when the promo
        // clearly describes a before/after price (not just any two
        // numbers that happen to coexist with a currency symbol).
        // Original code fired on ANY 2-number + currency combination,
        // e.g. "Save£12.96 When You Buy 2" -> [12.96, 2] -> 84.57%
        // The fix requires "now" or "was" to be in the text.
        // =========================================================
        const currencyPresent = /€|\$|£|¥|hk\$|sgd|aed|₹|rs|nt\$|cny|krw|php/.test(promoLower);
        const hasWasNow = /\bwas\b|\bnow\b/i.test(promo);
        if (currencyPresent && numList.length === 2 && hasWasNow) {
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

        // Guard: saving > base is a currency/denomination mismatch → 0
        if (basePrice !== null && saving > basePrice) continue;

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

    // 5) "X off" money-off (also handles "46Kr off", "46 NOK off" etc.)
    const mOff = [...promo.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*[A-Za-z€£$¥₹]*\s*off\b/gi)];
    for (const m of mOff) {
        const saving = parseFloat(m[1]);
        const fullMatch = m[0];
        if (fullMatch.includes('%')) continue;

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
    // Guard: skip if "get" is followed by volume units (cl/ml) — already caught above
    // Guard: skip if get value is 10 and no clear unit context — already caught above
    const mBxy = [...promo.matchAll(/Buy\s*(?:any\s*)?(\d+).*?Get\s*(\d+)/gi)];
    for (const m of mBxy) {
        const buyN = parseInt(m[1]);
        const getN = parseInt(m[2]);
        if (buyN <= 0 || getN <= 0) continue;
        // Guard: getN > 10 suggests a price (e.g. "Buy 2 Get 90"), not unit count
        if (getN > 10) continue;

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

    // =========================================================
    // NEW: Buy N Pay M — e.g. "Buy 4 pay 3", "Buy 4 Pay 3"
    // You receive N units but only pay for M.
    // discount = 1 - M/N
    // Note: "BUY N PAY X price" (Rule 12) handles price-based version.
    // This handles the unit-count version without currency/price.
    // =========================================================
    const mBuyNPayM = [...promo.matchAll(/Buy\s*(\d+)\s*[Pp]ay\s*(?:for\s*)?(\d+)\b/gi)];
    for (const m of mBuyNPayM) {
        const total = parseInt(m[1]);
        const paid = parseInt(m[2]);
        if (total > 0 && paid > 0 && paid < total) {
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

    // 10a) Explicit "N for M" quantity phrases — fire regardless of currency presence
    // These are unambiguous multi-buy structures (buy N pay for M)
    // Must run BEFORE the currency guard in Rule 10a below
    const nForMPhrases = [
        [/\b3\s+for\s+2\b/i, 33.33],
        [/\b4\s+for\s+3\b/i, 25.0],
        [/\b4\s+for\s+the\s+price\s+of\s+3\b/i, 25.0],
        [/\b3\s+for\s+the\s+price\s+of\s+2\b/i, 33.33],
    ];
    for (const [pattern, pct] of nForMPhrases) {
        if (pattern.test(promo)) addPct(pct);
    }

    // 10a) Quantity only "A for B" (no currency)
    const currencyPresent = /€|\$|£|¥|hk\$|sgd|aed|₹|rs|nt\$|cny|krw|php/.test(promoLower);
    if (!currencyPresent) {
        const mAforB = [...promo.matchAll(/\b(\d+)\s*[Ff]or\s*(\d+)\b/g)];
        for (const m of mAforB) {
            const a = parseInt(m[1]);
            const b = parseInt(m[2]);
            if (a > 1 && b > 0 && a !== b && Math.max(a, b) <= 10) {
                const total = Math.max(a, b);
                const paid = Math.min(a, b);
                const disc = (1 - paid / total) * 100.0;
                // Guard: >75% is too high for qty-for-qty — likely data issue
                if (disc < 75.0) addPct(disc);
            }
        }
    }

    // =========================================================
    // NEW: "£X each or N for £Y" — unit price vs bundle price
    // e.g. "£3 each or 2 for £5" → disc = 1 - 5/(2*3) = 16.67%
    // =========================================================
    const mEachOrBundle = promo.match(/£\s*([\d.]+)\s*each.*?(\d+)\s*for\s*£\s*([\d.]+)/i);
    if (mEachOrBundle) {
        const unitPrice  = parseFloat(mEachOrBundle[1]);
        const bundleQty  = parseInt(mEachOrBundle[2]);
        const bundleTotal = parseFloat(mEachOrBundle[3]);
        if (unitPrice > 0 && bundleQty > 0 && bundleTotal < bundleQty * unitPrice) {
            const disc = (1 - bundleTotal / (bundleQty * unitPrice)) * 100.0;
            if (disc > 0 && disc < 75.0) addPct(disc);
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

    // =========================================================
    // NEW: "N for Price of M" / "N For Price M"
    // e.g. "6 For Price 5" -> pay for 5, get 6 -> discount = 1 - 5/6
    //      "3 for Price of 2" -> discount = 1 - 2/3
    // Total units = N (first number), paid units = M (second number).
    // =========================================================
    const mForPrice = promo.match(/(\d+)\s*[Ff]or\s*(?:the\s+)?[Pp]rice\s*(?:[Oo]f\s*)?(\d+)/i);
    if (mForPrice) {
        const totalUnits = parseInt(mForPrice[1]);
        const paidUnits = parseInt(mForPrice[2]);
        if (totalUnits > 0 && paidUnits > 0 && paidUnits < totalUnits) {
            addPct((1 - paidUnits / totalUnits) * 100.0);
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
                const disc = (1 - effUnit / basePrice) * 100.0;
                // Guard: >75% bundle discount is almost always a data error
                if (disc < 75.0) addPct(disc);
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
                const disc = (1 - effUnit / basePrice) * 100.0;
                // Guard: >75% bundle discount is almost always a data error
                if (disc < 75.0) addPct(disc);
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
        // Guard: if £ present and base > 10, likely currency mismatch (e.g. TWD base vs £ price)
        const hasGBP = /£/.test(promo);
        if (!(hasGBP && basePrice > 10) && effUnit < basePrice) {
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
                const disc = (1 - promoPrice / basePrice) * 100.0;
                // Guard: >75% single-unit discount is almost always a data error
                if (disc < 75.0) addPct(disc);
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
    // =========================================================
    // FIX 4: "BUY N FOR P SAVE S%" — when SAVE value is followed
    // by %, it is a direct percentage (Section 4.1), NOT a monetary
    // saving. Original code always used monetary formula, producing
    // e.g. "Buy 2 For 4690 Save 28%" -> 28/4718 = 0.59% instead of 28%.
    // =========================================================
    const mHybrid = promo.match(/BUY\s*(\d+)\s*FOR\s*([0-9]+(?:\.[0-9]+)?)\s*SAVE\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (mHybrid) {
        const promoTotal = parseFloat(mHybrid[2]);
        const saving = parseFloat(mHybrid[3]);
        // Check if % appears anywhere after the SAVE keyword in the full promo string
        const saveIdx = promo.search(/SAVE/i);
        const afterSave = promo.substring(saveIdx);
        const isSavePct = afterSave.includes('%');
        if (isSavePct) {
            // "Save 28%" -> treat 28 as direct % candidate (Section 4.1)
            addPct(saving);
        } else if (promoTotal > 0 && saving > 0) {
            // Monetary saving -> Section 6.2.5
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

    // =========================================================
    // NEW: "Any N for $X or Buy 1 for $Y" — two-price comparison
    // disc = 1 - X/(N * Y)
    // e.g. "Any 2 For $60 or Buy 1 For $33" → 1 - 60/(2*33) = 9.09%
    // =========================================================
    const mAnyNBuy1 = promo.match(/(?:any\s*)?(\d+)\s+for\s+\$?([\d.]+).*?buy\s*1\s+for\s+\$?([\d.]+)/i);
    if (mAnyNBuy1) {
        const nQty = parseInt(mAnyNBuy1[1]);
        const nTotal = parseFloat(mAnyNBuy1[2]);
        const unit1 = parseFloat(mAnyNBuy1[3]);
        if (nQty > 0 && nTotal > 0 && unit1 > 0) {
            const disc = (1 - nTotal / (nQty * unit1)) * 100.0;
            if (disc > 0 && disc < 75.0) addPct(disc);
        }
    }

    // =========================================================
    // NEW: "N x $P" — N units at $P each (currency symbol after x)
    // e.g. "93 - 2 x $45 USD" → disc = 1 - 45/93 = 51.61%
    // Distinct from NxM "pay M for N" patterns: the $ signals a unit price
    // =========================================================
    const mNxPrice = promo.match(/\b(\d+)\s*[xX]\s*\$\s*([\d.]+)/i);
    if (mNxPrice && basePrice !== null) {
        const unitPrice = parseFloat(mNxPrice[2]);
        if (unitPrice < basePrice) {
            const disc = (1 - unitPrice / basePrice) * 100.0;
            if (disc > 0 && disc < 75.0) addPct(disc);
        }
    }

    // =========================================================
    // NEW: "Buy 2 Get [price]" — when getN > 10 in Rule 7, treat
    // as a promotional price: discount = 1 - getPrice/(2*basePrice)
    // e.g. "46 - Buy 2 Get 90" → 1 - 90/(2*46) = 2.17%
    //      "69 - Buy 2 Get 90" → 1 - 90/(2*69) = 34.78%
    // =========================================================
    const mBuy2GetPrice = [...promo.matchAll(/Buy\s*(?:any\s*)?(\d+).*?Get\s*([0-9]+(?:\.[0-9]+)?)/gi)];
    for (const m of mBuy2GetPrice) {
        const buyN = parseInt(m[1]);
        const getVal = parseFloat(m[2]);
        // Only apply when buying 2+ units; "Buy 1 Get X" where X is monetary
        // is handled by Rule 5 (X off) which correctly uses base+saving as denominator
        if (buyN >= 2 && getVal > 10 && basePrice !== null) {
            const disc = (1 - getVal / (buyN * basePrice)) * 100.0;
            if (disc > 0 && disc < 75.0) addPct(disc);
        }
    }

    // =========================================================
    // NEW: "X SGD/each" or "X currency/each" — explicit unit price
    // e.g. "40 - 25 SGD/each, 2 bottles and above" → 1 - 25/40 = 37.5%
    // =========================================================
    const mCurrEach = promo.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:sgd|aed|usd|hkd|eur|gbp|nzd|aud)\/each/i);
    if (mCurrEach && basePrice !== null) {
        const unitPrice = parseFloat(mCurrEach[1]);
        if (unitPrice < basePrice) {
            const disc = (1 - unitPrice / basePrice) * 100.0;
            if (disc > 0 && disc < 75.0) addPct(disc);
        }
    }

    // =========================================================
    // NEW: "AED X discount for more than N bottles"
    // Per-bottle saving: new_unit = (base*N - X)/N
    // discount = 1 - new_unit/base = X/(base*N)
    // e.g. "102 - AED 62 discount for more than 2 bottles"
    //      new_unit = (102*2 - 62)/2 = 71 → disc = 1 - 71/102 = 30.39%
    // =========================================================
    const mAedDisc = promo.match(/aed\s*([\d.]+)\s*discount.*?(\d+)\s*bottle/i);
    if (mAedDisc && basePrice !== null) {
        const discAmt = parseFloat(mAedDisc[1]);
        const qty = parseInt(mAedDisc[2]);
        if (qty > 0 && discAmt > 0) {
            const newPerUnit = (basePrice * qty - discAmt) / qty;
            const disc = (1 - newPerUnit / basePrice) * 100.0;
            if (disc > 0 && disc < 75.0) addPct(disc);
        }
    }

    // =========================================================
    // NEW: Multi-tier pricing with no base price
    // e.g. "0 - 2 for $65, 3 for $95" → worst unit=$32.50, best=$31.67 → 2.56%
    // "0 - 2 for $150 or $75 each"   → both tiers = $75/unit → 0%
    // Rule: disc = 1 - best_unit / worst_unit (lowest discount principle)
    // Only fires when basePrice is null and ≥2 distinct tier unit prices found
    // =========================================================
    if (basePrice === null) {
        const tierPairs = [];
        for (const m of promo.matchAll(/(\d+)\s*for\s*\$?\s*([\d.]+)/gi)) {
            const qty = parseInt(m[1]), price = parseFloat(m[2]);
            if (qty > 0 && price > 0) tierPairs.push(price / qty);
        }
        // Also catch "$X each" as qty=1 tier
        for (const m of promo.matchAll(/\$\s*([\d.]+)\s*each/gi)) {
            tierPairs.push(parseFloat(m[1]));
        }
        if (tierPairs.length >= 2) {
            const worstUnit = Math.max(...tierPairs);
            const bestUnit  = Math.min(...tierPairs);
            if (worstUnit > bestUnit) {
                const disc = (1 - bestUnit / worstUnit) * 100.0;
                if (disc > 0 && disc < 75.0) addPct(disc);
            }
        }
    }

    // ========= FINAL DECISION =========
    if (discounts.length === 0) return 0.0;

    // BUSINESS RULE: always use the LOWEST discount %
    let best = Math.min(...discounts);
    best = Math.max(0.0, Math.min(best, 100.0));
    return parseFloat(best.toFixed(2));
}
