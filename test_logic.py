import re

def calculate_promo_depth(promo_text):
    if not isinstance(promo_text, str):
        return 0.0
    
    promo_depth = 0.0
    
    # Normalize text
    text = promo_text.lower()
    
    # 1. "Save X%"
    # Matches "save 33%" or "save 33 %"
    save_matches = re.findall(r'save\s+(\d+(?:\.\d+)?)\s*%', text)
    for match in save_matches:
        promo_depth += float(match)
        
    # 2. "Buy X & Get Y Free"
    # Matches "buy 2 & get 1 free", "buy 2 get 1 free", "buy 2 and get 1 free"
    # Also handles "buy a bottle" as "buy 1" if needed, but let's stick to numbers first
    buy_get_matches = re.findall(r'buy\s+(\d+)\s*(?:&|and)?\s*get\s+(\d+)\s*free', text)
    for buy, get in buy_get_matches:
        buy_qty = float(buy)
        get_qty = float(get)
        if buy_qty + get_qty > 0:
            depth = (get_qty / (buy_qty + get_qty)) * 100
            promo_depth += depth

    return round(promo_depth, 2)

# Test Cases
test_cases = [
    ("400 - Save 33%", 33.0),
    ("200 - Buy 2 & Get 1 Free", 33.33),
    ("0 - Save 33%, Buy 2 & Get 1 Free", 66.33),
    ("259 - Buy a bottle, get Free Bag", 0.0), # Current logic returns 0
    ("Save 10%, Buy 1 Get 1 Free", 60.0),
    ("No Promo", 0.0),
    (None, 0.0)
]

print("Running Tests...")
all_passed = True
for text, expected in test_cases:
    result = calculate_promo_depth(text)
    if abs(result - expected) > 0.01:
        print(f"FAIL: '{text}' -> Expected {expected}, Got {result}")
        all_passed = False
    else:
        print(f"PASS: '{text}' -> {result}")

if all_passed:
    print("\nAll tests passed!")
else:
    print("\nSome tests failed.")
