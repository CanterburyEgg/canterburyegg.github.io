import json
import collections

def export_puzzles_fast(input_file, output_json):
    print("Loading dictionary and pre-indexing...")
    with open(input_file, 'r', encoding='utf-8') as f:
        # Standardize words
        all_words = [line.strip().upper() for line in f if len(line.strip()) >= 5]

    # Pre-index words by their unique letter sets
    word_set_map = collections.defaultdict(list)
    for w in all_words:
        word_set_map[frozenset(w)].append(w)

    # Patterns that disqualify a puzzle if they appear in ANY solution word
    POISON_PATTERNS = ["IGN", "EDNU"]

    def is_word_poisoned(word):
        """Returns True if the word contains all letters of a poison pattern."""
        word_set = set(word)
        for pattern in POISON_PATTERNS:
            if set(pattern).issubset(word_set):
                return True
        return False

    # 1. Identify pivotal cores (No S)
    print("Finding pivotal cores...")
    # We take all 7-letter sets first without pre-filtering poison
    pangram_sets = [u_set for u_set in word_set_map.keys() if len(u_set) == 7 and 'S' not in u_set]
    
    core_to_sets = collections.defaultdict(set)
    for u_set in pangram_sets:
        for char in u_set:
            core = frozenset(u_set - {char})
            core_to_sets[core].add(u_set)

    final_puzzles = []

    # 2. Process cores
    print("Evaluating centers and checking for poison words...")
    for core, sets in core_to_sets.items():
        if len(sets) != 2: 
            continue
        
        wildcards = [list(s - core)[0] for s in sets]
        best_center = None
        max_balance = -1
        best_solutions = {}

        possible_sets = [s for s in word_set_map.keys() if s.issubset(core | set(wildcards))]

        for center in core:
            sol_a = []
            sol_b = []
            common = []
            puzzle_poisoned = False

            for s in possible_sets:
                if center not in s: continue
                
                words = word_set_map[s]
                
                # CHECK FOR POISON: If any word in this set is poisoned, kill the center
                if any(is_word_poisoned(w) for w in words):
                    puzzle_poisoned = True
                    break

                if s.issubset(core | {wildcards[0]}) and wildcards[0] in s:
                    sol_a.extend(words)
                elif s.issubset(core | {wildcards[1]}) and wildcards[1] in s:
                    sol_b.extend(words)
                elif s.issubset(core):
                    common.extend(words)

            if puzzle_poisoned:
                continue # Try next center, or if all centers poisoned, core is skipped

            count_a, count_b = len(sol_a), len(sol_b)
            if count_a > 0 and count_b > 0:
                balance = (count_a + count_b) - abs(count_a - count_b)
                if balance > max_balance:
                    max_balance = balance
                    best_center = center
                    best_solutions = {
                        "common": sorted(common),
                        "words_a": sorted(sol_a),
                        "words_b": sorted(sol_b)
                    }
        
        if best_center:
            final_puzzles.append({
                "core": "".join(sorted(list(core))),
                "wildcards": sorted(wildcards), # Keep wildcards consistent
                "center": best_center,
                "solutions": best_solutions
            })

    with open(output_json, 'w') as f:
        json.dump(final_puzzles, f, indent=2)
    
    print(f"DONE! Exported {len(final_puzzles)} puzzles to {output_json}")

export_puzzles_fast('lists/words_final.txt', 'jsons/ghostgram_puzzles.json')