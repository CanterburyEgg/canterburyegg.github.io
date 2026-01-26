import sys

def generate_report(core_str, w1, w2, dictionary_path):
    try:
        with open(dictionary_path, 'r', encoding='utf-8') as f:
            all_words = [line.strip().upper() for line in f if len(line.strip()) >= 5]
    except FileNotFoundError:
        print(f"Error: {dictionary_path} not found.")
        return

    core_set = set(core_str.upper())
    wildcards = [w1.upper(), w2.upper()]
    
    # 1. Evaluate each letter in the core as a potential center
    best_center = None
    max_balance_score = -1
    final_data = {}

    for center in core_set:
        # Path A and Path B must both contain the center (they do, by definition of the core)
        # But we need to see how many words each path keeps
        
        def get_valid_subset(wildcard):
            allowed = core_set | {wildcard}
            return [w for w in all_words if set(w).issubset(allowed) 
                    and wildcard in set(w) and center in set(w)]

        # Common words must also use the center
        common = [w for w in all_words if set(w).issubset(core_set) and center in set(w)]
        
        set_a = get_valid_subset(wildcards[0])
        set_b = get_valid_subset(wildcards[1])

        # We want a center that keeps both lists active (balance)
        # Scoring: (Total Words) - (Difference between A and B)
        # This penalizes centers that make one side 50 words and the other 2.
        count_a, count_b = len(set_a), len(set_b)
        if count_a > 0 and count_b > 0:
            balance = (count_a + count_b) - abs(count_a - count_b)
            if balance > max_balance_score:
                max_balance_score = balance
                best_center = center
                final_data = {'common': common, 'a': set_a, 'b': set_b}

    if not best_center:
        print("No viable center letter found that keeps both pangrams possible.")
        return

    # 2. Output the "Polished" Game Stats
    print(f"\n" + "★"*40)
    print(f"  DAILY HIVE: {core_str.upper()} | CENTER: {best_center}")
    print(f"  Pivoting on: {wildcards[0]} vs {wildcards[1]}")
    print("★"*40)
    
    print(f"Common words (Core + {best_center}): {len(final_data['common'])}")
    print(f"Unique to {wildcards[0]}: {len(final_data['a'])}")
    print(f"Unique to {wildcards[1]}: {len(final_data['b'])}")
    print("-" * 40)
    
    # Show the Pangrams specifically
    pans_a = [w for w in final_data['a'] if len(set(w)) == 7]
    pans_b = [w for w in final_data['b'] if len(set(w)) == 7]
    
    print(f"Pangram A: {', '.join(pans_a)}")
    print(f"Pangram B: {', '.join(pans_b)}")
    print("-" * 40)
    print(f"WORDS FOR {wildcards[0]}: {', '.join(final_data['a'])}")
    print(f"\nWORDS FOR {wildcards[1]}: {', '.join(final_data['b'])}")
    print(f"\nCORE WORDS (with {best_center}): {', '.join(final_data['common'])}")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python3 solve.py [6-LETTER-CORE] [W1] [W2]")
    else:
        generate_report(sys.argv[1], sys.argv[2], sys.argv[3], 'lists/words_final.txt')