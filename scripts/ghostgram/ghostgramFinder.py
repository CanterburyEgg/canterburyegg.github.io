import collections

def get_all_pangrams_for_core(core_set, all_words):
    """
    Secondary function: Finds every pangram possible for a 6-letter core + ANY 7th letter.
    """
    results = collections.defaultdict(list)
    for word in all_words:
        u_chars = frozenset(word)
        if len(u_chars) == 7 and core_set.issubset(u_chars):
            # Find the letter that isn't in the core
            wildcard = list(u_chars - core_set)[0]
            results[wildcard].append(word)
    return results

def run_analysis_with_sanity_check(input_file):
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            all_words = [line.strip().upper() for line in f if len(line.strip()) >= 5]
            
        # 1. Map 7-unique-char sets to their words
        pangram_map = collections.defaultdict(list)
        for word in all_words:
            u_chars = frozenset(word)
            if len(u_chars) == 7:
                pangram_map[u_chars].append(word)

        # 2. Find cores that have exactly two 7-char set neighbors
        core_to_sets = collections.defaultdict(set)
        for u_set in pangram_map.keys():
            for char in u_set:
                core = frozenset(u_set - {char})
                core_to_sets[core].add(u_set)

        pivotal_cores = []
        for core, sets in core_to_sets.items():
            if len(sets) == 2:
                pivotal_cores.append(core)

        # 3. Print Results
        print(f"Total possible puzzles: {len(pivotal_cores)}\n")
        print(f"--- FIRST 10 PUZZLES (SANITY CHECK) ---")
        
        for i, core in enumerate(pivotal_cores[:10]):
            # Use our secondary function to verify the "Exactly Two" rule
            found_map = get_all_pangrams_for_core(core, all_words)
            
            core_str = "".join(sorted(list(core)))
            wildcards = sorted(list(found_map.keys()))
            
            print(f"{i+1}. Core: [{core_str}]")
            for char in wildcards:
                example_word = found_map[char][0] 
                count = len(found_map[char])
                print(f"   ? = {char} -> Forms {count} pangram(s) (e.g., {example_word})")
            print("-" * 40)

    except FileNotFoundError:
        print("File not found.")

run_analysis_with_sanity_check('lists/words_final_long.txt')