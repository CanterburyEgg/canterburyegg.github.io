import json

# Load the file
print("Loading data...")
with open('jsons/tv_vectors.json', 'r') as f:
    data = json.load(f)

titles = data['titles']
vectors = data['vectors']

ids = data.get('ids', [])

seen_titles = set()
unique_titles = []
unique_vectors = []
removed_count = 0

print(f"Scanning {len(titles)} shows for duplicates...")

for i, title in enumerate(titles):
    if title not in seen_titles:
        seen_titles.add(title)
        unique_titles.append(title)
        unique_vectors.append(vectors[i])
        if ids:
            unique_ids.append(ids[i])
    else:
        print(f"✂️ Cutting duplicate: {title}")
        removed_count += 1

print(f"\nRemoved {removed_count} duplicates.")
with open('jsons/tv_vectors.json', 'w') as f:
    json.dump({'titles': unique_titles, 'vectors': unique_vectors, 'ids': unique_ids}, f, indent=4)
print("✅ File updated successfully.")