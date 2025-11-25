from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch

def create_rules_pdf(filename):
    c = canvas.Canvas(filename, pagesize=letter)
    width, height = letter
    
    # Title
    c.setFont("Helvetica-Bold", 18)
    c.drawString(1 * inch, height - 1 * inch, "Promo Depth Calculation Rules (v15)")
    
    # Content
    c.setFont("Helvetica", 10)
    y = height - 1.5 * inch
    line_height = 14
    
    rules = [
        "1. Normalization: Thousands separators removed (2,199 -> 2199), decimal commas to dots (12,50 -> 12.50).",
        "2. Base Price: Extracted from left side of '-' (e.g., '400 - ...').",
        "3. Hard Special Cases:",
        "   - 'SGD 60 ANY 2 BOTTLES' -> (1 - 60 / (2 * Base)) * 100",
        "   - '60 SGD OFF 2 Bottles' -> (60 / (2 * Base)) * 100",
        "   - 'Receive a free bottle' -> 0% (Gift)",
        "   - Device/Sticks bundles -> 0%",
        "   - Generic Combo without keywords -> 0%",
        "   - Rating-only messages -> 0%",
        "   - 'UP TO X% OFF' -> X%",
        "4. AxB Patterns: '4x3' -> (1 - 3/4) * 100",
        "5. Direct %: 'Save 33%' -> 33%",
        "6. Chinese Discount: '8折' -> (1 - 8/10) * 100 = 20%",
        "7. Was/Now: 'Was 100 Now 80' -> (1 - 80/100) * 100 = 20%",
        "8. Save X: 'Save 10' -> (10 / (Base + 10)) * 100",
        "9. Money Off: '10 Off' -> (10 / (Base + 10)) * 100",
        "10. Yen Off: '1000円引き' -> (1000 / (Base + 1000)) * 100",
        "11. Buy X Get Y: 'Buy 2 Get 1 Free' -> (1 / (2+1)) * 100 = 33.33%",
        "12. Any N Get M Free: 'Any 3 Get 1 Free' -> 25%",
        "13. X + Y Free: '2 + 1 Free' -> 33.33%",
        "14. Leve X Pague Y: 'Leve 3 Pague 2' -> (1 - 2/3) * 100 = 33.33%",
        "15. Quantity For: '2 For 15' (Base 10) -> (1 - (15/2)/10) * 100 = 25%",
        "16. Buy N Pay X: 'Buy 3 Pay 20' -> Similar logic to Quantity For",
        "17. X Each: '9.99 Each' (Base 12) -> (1 - 9.99/12) * 100",
        "18. Unit Price X: 'Unit Price 9.99' -> Same as above",
        "19. Buy 1 Get 2nd for X: Calculates effective unit price for 2 items.",
        "20. Buy 1 For X when purchase 2: Special bundle logic.",
        "21. Buy 1 for X, 2 for Y: Uses the '2 for Y' price.",
        "22. Buy N For P Save S: Uses the saving amount.",
        "23. Each ... X for N: Handles 'each 10 for 2' patterns.",
        "24. Special: 'Any 3/4 Get 1 Free' -> Forced to 25%.",
        "",
        "FINAL RULE: If multiple rules match, the LOWEST calculated discount % is used."
    ]
    
    for line in rules:
        if y < 1 * inch:
            c.showPage()
            c.setFont("Helvetica", 10)
            y = height - 1 * inch
        
        c.drawString(1 * inch, y, line)
        y -= line_height
        
    c.save()

if __name__ == "__main__":
    create_rules_pdf("static/Promo_Depth_Rules.pdf")
