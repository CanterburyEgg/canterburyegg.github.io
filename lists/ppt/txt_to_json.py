import json
import sys
import os

def generate_logic_subsets(words):
    subsets = []
    
    # 1. Logic: Starts With (Min 4)
    starts = {}
    for w in words:
        key = f"Starts with {get_sortable_name(w)[0].upper()}"
        starts.setdefault(key, []).append(w)

    # 2. Logic: Ends With (CUT)
        
    # 3. Logic: Word Length (Min 4)
    lengths = {}
    for w in words:
        key = f"{len(w)} Letters Long"
        lengths.setdefault(key, []).append(w)

    # Compile and Filter for Minimum 4
    all_logic = {**starts, **lengths}
    for label, items in all_logic.items():
        if len(items) >= 3:
            subsets.append({
                "name": label,
                "count": len(items),
                "items": sorted(items)
            })
            
    return subsets

def get_sortable_name(name):
    articles = ["the ", "a ", "an "]
    for article in articles:
        if name.lower().startswith(article):
            return name[len(article):]
    return name

def process_file(file_path):
    if not os.path.exists(file_path):
        print(f"Error: File '{file_path}' not found.")
        return

    # Extract Category Name from filename (e.g., 'anniversary_gifts.txt' -> 'Anniversary Gifts')
    base_name = os.path.basename(file_path).split('.')[0]
    category_name = base_name.replace('_', ' ').title()

    with open(file_path, 'r') as f:
        # Read lines, strip whitespace, remove empty lines
        words = [line.strip().lower() for line in f if line.strip()]

    data = {
        "category_name": category_name,
        "master_list": words,
        "auto_subsets": generate_logic_subsets(words),
        "manual_subsets": []  # Space for us to add "Metals", "Gemstones", etc. later
    }

    # Output to a JSON file named after the input
    output_filename = f"{base_name}.json"
    with open(output_filename, 'w') as out_f:
        json.dump(data, out_f, indent=2)
    
    print(f"Success! {output_filename} has been created.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python text_to_json.py <your_list_file.txt>")
    else:
        process_file(sys.argv[1])