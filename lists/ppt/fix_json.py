import json
import re
import glob
import os
import argparse

def process_json_recursively(obj, master_items):
    """Recursively finds subsets and updates them based on letter count."""
    if isinstance(obj, dict):
        # 1. Check if this dictionary is a subset (has 'name' and 'items')
        name = obj.get('name', '')
        if 'items' in obj and isinstance(obj['items'], list):
            # Regex catches "7 Letters Long", "9-Letter", etc.
            match = re.search(r'(\d+)\s*Letters?', name, re.IGNORECASE)
            if match:
                target_len = int(match.group(1))
                for item in master_items:
                    # Clean the item: remove spaces, hyphens, and periods
                    clean_item = item.replace(" ", "").replace("-", "").replace(".", "")
                    
                    if len(clean_item) == target_len:
                        # Add if not already present
                        if item not in obj['items']:
                            obj['items'].append(item)
                            obj['items'].sort()

        # 2. Scrub the 'count' key if it exists
        obj.pop('count', None)

        # 3. Continue recursion through the dictionary
        for key in list(obj.keys()):
            process_json_recursively(obj[key], master_items)

    elif isinstance(obj, list):
        for element in obj:
            process_json_recursively(element, master_items)

def process_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            print(f"Skipping {file_path}: Invalid JSON.")
            return

    # UPDATED: Use 'master_list' as the source for items
    master_items = data.get('master_list', [])
    if not master_items:
        # Fallback to 'items' if 'master_list' isn't there
        master_items = data.get('items', [])

    if not master_items:
        print(f"Warning: No source list found in {file_path}")
        return

    # Process the entire structure
    process_json_recursively(data, master_items)

    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)
    print(f"Updated: {os.path.basename(file_path)}")

def main():
    parser = argparse.ArgumentParser(description="Update JSON subsets based on master_list letter counts.")
    parser.add_argument("directory", help="Path to the directory containing JSON files")
    args = parser.parse_args()

    if not os.path.isdir(args.directory):
        print(f"Error: {args.directory} is not a valid directory.")
        return

    files = glob.glob(os.path.join(args.directory, "*.json"))
    for file in files:
        process_file(file)

if __name__ == "__main__":
    main()