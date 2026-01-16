import json
import sys
import os
import argparse

def get_sort_key(text, is_name):
    """
    Returns the string used for 'Starts With' and sorting.
    If is_name is True, it attempts to find the last name.
    If False, it just strips articles (the, a, an).
    """
    text = text.strip().lower()
    
    if is_name:
        # Strip common suffixes so they don't count as the last name
        suffixes = {", jr.", " jr.", ", sr.", " sr.", " iii", " ii", " iv"}
        for s in suffixes:
            if text.endswith(s):
                text = text[:-len(s)].strip().rstrip(',')
        
        parts = text.split()
        return parts[-1] if parts else text
    else:
        # General logic: strip articles for better sorting
        articles = ["the ", "a ", "an "]
        for article in articles:
            if text.startswith(article):
                return text[len(article):]
        return text

def generate_logic_subsets(words, is_name):
    subsets_dict = {}
    
    if is_name:
        # Logic: First Name Starts With
        for w in words:
            first_name = w.strip().split()[0]
            letter = first_name[0].upper()
            label = f"First Name Starts with {letter}"
            subsets_dict.setdefault(label, []).append(w)
            
        # Logic: Last Name Starts With
        for w in words:
            last_name_key = get_sort_key(w, is_name=True)
            letter = last_name_key[0].upper()
            label = f"Last Name Starts with {letter}"
            subsets_dict.setdefault(label, []).append(w)
    else:
        # Logic: Starts With (General)
        for w in words:
            key_part = get_sort_key(w, is_name=False)
            if key_part:
                letter = key_part[0].upper()
                label = f"Starts with {letter}"
                subsets_dict.setdefault(label, []).append(w)

        # Logic: Word Length (Only for non-name mode)
        for w in words:
            key = f"{len(w)} Letters Long"
            subsets_dict.setdefault(key, []).append(w)

    # Filter for Minimum 3 and format for JSON
    final_subsets = []
    for label, items in subsets_dict.items():
        if len(items) >= 3:
            final_subsets.append({
                "name": label,
                "count": len(items),
                # Sort items using the appropriate context
                "items": sorted(items, key=lambda x: get_sort_key(x, is_name))
            })
            
    return final_subsets

def process_file(file_path, is_name):
    if not os.path.exists(file_path):
        print(f"Error: File '{file_path}' not found.")
        return

    base_name = os.path.basename(file_path).split('.')[0]
    category_name = base_name.replace('_', ' ').title()

    with open(file_path, 'r') as f:
        words = [line.strip() for line in f if line.strip()]

    data = {
        "category_name": category_name,
        "master_list": words,
        "auto_subsets": generate_logic_subsets(words, is_name),
        "manual_subsets": []
    }

    output_filename = f"{base_name}.json"
    with open(output_filename, 'w') as out_f:
        json.dump(data, out_f, indent=2)
    
    print(f"Success! {output_filename} created (Name Mode: {is_name}).")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert text lists to JSON with logic subsets.")
    parser.add_argument("file", help="The .txt file to process")
    parser.add_argument("--names", action="store_true", help="Enable 'First/Last Name' logic for people lists")
    
    args = parser.parse_args()
    process_file(args.file, args.names)