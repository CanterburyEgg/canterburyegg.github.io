def intersect_word_lists(file1, file2, output_file):
    try:
        # Using sets for O(1) lookup and automatic duplicate removal
        with open(file1, 'r', encoding='utf-8') as f1:
            words1 = set(line.strip().upper() for line in f1 if line.strip())
            
        with open(file2, 'r', encoding='utf-8') as f2:
            words2 = set(line.strip().upper() for line in f2 if line.strip())

        # Find the common words
        intersection = sorted(list(words1.intersection(words2)))

        # Write to the final file
        with open(output_file, 'w', encoding='utf-8') as out:
            for word in intersection:
                out.write(f"{word}\n")
        
        print(f"Success! {len(intersection)} words saved to {output_file}.")

    except FileNotFoundError as e:
        print(f"Error: Could not find file - {e}")

# Run the script
intersect_word_lists('lists/words.txt', 'lists/xwords_stripped.txt', 'lists/words_final.txt')