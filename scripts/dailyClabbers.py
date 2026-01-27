import itertools
import random
import collections
import json
import os
import time

# --- BOARD & TILE DATA ---
BOARD_SIZE = 15
TRIPLE_WORD = {(0, 0), (7, 0), (14, 0), (0, 7), (14, 7), (0, 14), (7, 14), (14, 14)}
DOUBLE_WORD = {(1, 1), (2, 2), (3, 3), (4, 4), (10, 10), (11, 11), (12, 12), (13, 13), (1, 13), (2, 12), (3, 11), (4, 10), (10, 4), (11, 3), (12, 2), (13, 1), (7, 7)}
TRIPLE_LETTER = {(1, 5), (1, 9), (5, 1), (5, 5), (5, 9), (5, 13), (9, 1), (9, 5), (9, 9), (9, 13), (13, 5), (13, 9)}
DOUBLE_LETTER = {(0, 3), (0, 11), (2, 6), (2, 8), (3, 0), (3, 7), (3, 14), (6, 2), (6, 6), (6, 8), (6, 12), (7, 3), (7, 11), (8, 2), (8, 6), (8, 8), (8, 12), (11, 0), (11, 7), (11, 14), (12, 6), (12, 8), (14, 3), (14, 11)}
TILE_VALUES = {'A':1, 'B':3, 'C':3, 'D':2, 'E':1, 'F':4, 'G':2, 'H':4, 'I':1, 'J':8, 'K':5, 'L':1, 'M':3, 'N':1, 'O':1, 'P':3, 'Q':10, 'R':1, 'S':1, 'T':1, 'U':1, 'V':4, 'W':4, 'X':8, 'Y':4, 'Z':10}
BAG_BASE = "AAAAAAAAABBCCDDDDDEEEEEEEEEEEEFFGGGHHIIIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSTTTTTTUUUUVVWWXYYZ"

class ClabbersGame:
    def __init__(self, dict_path):
        self.alphagrams = {}
        self.load_dict(dict_path)
        self.reset()

    def reset(self):
        self.grid = [[' ' for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        self.is_first_move = True

    def load_dict(self, path):
        try:
            with open(path, 'r') as f:
                for line in f:
                    w = line.strip().upper()
                    if len(w) >= 2:
                        alpha = "".join(sorted(w))
                        self.alphagrams.setdefault(alpha, []).append(w)
        except FileNotFoundError:
            for w in ["RETAIN", "ALINES", "ENTRAI", "TINEA", "QI", "OE", "ZA", "AX"]:
                alpha = "".join(sorted(w))
                self.alphagrams.setdefault(alpha, []).append(w)

    def get_tile_value(self, char):
        return TILE_VALUES.get(char, 0)

    def get_cross_checks(self):
        checks = {}
        for r in range(BOARD_SIZE):
            for c in range(BOARD_SIZE):
                if self.grid[r][c] != ' ': continue
                for horiz in [True, False]:
                    dr, dc = (1, 0) if horiz else (0, 1)
                    lb, la = "", ""
                    cr, cc = r - dr, c - dc
                    while 0 <= cr < BOARD_SIZE and 0 <= cc < BOARD_SIZE and self.grid[cr][cc] != ' ':
                        lb = self.grid[cr][cc] + lb
                        cr, cc = cr - dr, cc - dc
                    cr, cc = r + dr, c + dc
                    while 0 <= cr < BOARD_SIZE and 0 <= cc < BOARD_SIZE and self.grid[cr][cc] != ' ':
                        la += self.grid[cr][cc]
                        cr, cc = cr + dr, cc + dc
                    if not lb and not la:
                        checks[(r, c, horiz)] = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
                    else:
                        valid = set()
                        for char in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
                            if "".join(sorted(lb + char + la)) in self.alphagrams:
                                valid.add(char)
                        checks[(r, c, horiz)] = valid
        return checks

    def find_all_moves(self, rack):
        all_moves = []
        cross_checks = self.get_cross_checks()
        rack_subsets_by_len = {}
        unique_rack = sorted(rack)
        for length in range(1, 8):
            seen = set()
            subsets = []
            for combo in itertools.combinations(unique_rack, length):
                alpha = "".join(combo)
                if alpha not in seen:
                    seen.add(alpha)
                    subsets.append((collections.Counter(combo), alpha))
            rack_subsets_by_len[length] = subsets

        anchors = set()
        if self.is_first_move:
            anchors.add((7, 7))
        else:
            for r in range(BOARD_SIZE):
                for c in range(BOARD_SIZE):
                    if self.grid[r][c] != ' ':
                        for nr, nc in [(r-1,c),(r+1,c),(r,c-1),(r,c+1)]:
                            if 0 <= nr < 15 and 0 <= nc < 15 and self.grid[nr][nc] == ' ':
                                anchors.add((nr, nc))

        for dr, dc in [(0, 1), (1, 0)]:
            is_horiz_move = (dr == 0)
            for r in range(BOARD_SIZE):
                for c in range(BOARD_SIZE):
                    if 0 <= r-dr < BOARD_SIZE and 0 <= c-dc < BOARD_SIZE and self.grid[r-dr][c-dc] != ' ': continue
                    span_has_anchor_or_tile = False
                    for length in range(2, 16):
                        curr_r, curr_c = r + dr*(length-1), c + dc*(length-1)
                        if curr_r >= BOARD_SIZE or curr_c >= BOARD_SIZE: break
                        if 0 <= curr_r+dr < BOARD_SIZE and 0 <= curr_c+dc < BOARD_SIZE and self.grid[curr_r+dr][curr_c+dc] != ' ':
                            continue
                        if (curr_r, curr_c) in anchors or self.grid[curr_r][curr_c] != ' ':
                            span_has_anchor_or_tile = True
                        if not span_has_anchor_or_tile: continue
                        
                        board_letters = []
                        empty_info = []
                        main_multiplier = 1
                        fixed_score = 0
                        possible_span = True
                        for i in range(length):
                            sr, sc = r + dr*i, c + dc*i
                            char = self.grid[sr][sc]
                            if char != ' ':
                                board_letters.append(char)
                                fixed_score += self.get_tile_value(char)
                            else:
                                cc_set = cross_checks[(sr, sc, is_horiz_move)]
                                if not cc_set: possible_span = False; break
                                pdr, pdc = dc, dr
                                lb, la = "", ""
                                h_r, h_c = sr - pdr, sc - pdc
                                while 0 <= h_r < 15 and 0 <= h_c < 15 and self.grid[h_r][h_c] != ' ':
                                    lb = self.grid[h_r][h_c] + lb
                                    h_r, h_c = h_r - pdr, h_c - pdc
                                h_r, h_c = sr + pdr, sc + pdc
                                while 0 <= h_r < 15 and 0 <= h_c < 15 and self.grid[h_r][h_c] != ' ':
                                    la += self.grid[h_r][h_c]
                                    h_r, h_c = h_r + pdr, h_c + pdc
                                empty_info.append({'idx': i, 'r': sr, 'c': sc, 'cc': cc_set, 'before': lb, 'after': la})
                                if (sr, sc) in TRIPLE_WORD: main_multiplier *= 3
                                elif (sr, sc) in DOUBLE_WORD: main_multiplier *= 2
                        
                        if not possible_span or not empty_info or len(empty_info) > len(rack): continue
                        board_alpha_str = "".join(sorted(board_letters))
                        for subset_counter, subset_alpha in rack_subsets_by_len[len(empty_info)]:
                            temp_subset_counts = collections.Counter(subset_alpha)
                            subset_ok = True
                            for slot in empty_info:
                                if not any(char in slot['cc'] for char in temp_subset_counts):
                                    subset_ok = False; break
                            if not subset_ok: continue
                            
                            full_alpha = "".join(sorted(board_alpha_str + subset_alpha))
                            if full_alpha not in self.alphagrams: continue
                            
                            memo = {}
                            def solve(letters_left, slot_idx):
                                state = (letters_left, slot_idx)
                                if state in memo: return memo[state]
                                if slot_idx == len(empty_info): return 0, []
                                slot = empty_info[slot_idx]
                                best_s, best_p = -1000000, []
                                seen_chars = set()
                                for i, char in enumerate(letters_left):
                                    if char in seen_chars: continue
                                    if char not in slot['cc']: continue
                                    seen_chars.add(char)
                                    lv = self.get_tile_value(char)
                                    if (slot['r'], slot['c']) in TRIPLE_LETTER: lv *= 3
                                    elif (slot['r'], slot['c']) in DOUBLE_LETTER: lv *= 2
                                    curr_contrib = lv * main_multiplier
                                    if slot['before'] or slot['after']:
                                        hs, hm = lv, 1
                                        if (slot['r'], slot['c']) in TRIPLE_WORD: hm = 3
                                        elif (slot['r'], slot['c']) in DOUBLE_WORD: hm = 2
                                        for hc in slot['before']: hs += self.get_tile_value(hc)
                                        for hc in slot['after']: hs += self.get_tile_value(hc)
                                        curr_contrib += hs * hm
                                    s_val, p_val = solve(letters_left[:i] + letters_left[i+1:], slot_idx + 1)
                                    if s_val + curr_contrib > best_s:
                                        best_s, best_p = s_val + curr_contrib, [char] + p_val
                                memo[state] = (best_s, best_p)
                                return best_s, best_p

                            score_slots, perm = solve(subset_alpha, 0)
                            if score_slots > -500000:
                                total_s = score_slots + (fixed_score * main_multiplier)
                                if len(empty_info) == 7: total_s += 50
                                all_moves.append({
                                    'r': r, 'c': c, 'dr': dr, 'dc': dc, 'len': length,
                                    'perm': list(perm), 'empty_idxs': list(si['idx'] for si in empty_info),
                                    'score': total_s, 'alpha': full_alpha
                                })
        all_moves.sort(key=lambda x: x['score'], reverse=True)
        return all_moves

    def find_best(self, rack):
        moves = self.find_all_moves(rack)
        return moves[0] if moves else None

def get_puzzle_data(game, rack):
    moves = game.find_all_moves(rack)
    if not moves: return None
    best_score = moves[0]['score']
    if best_score < 50: return None
    threshold = best_score * 0.70
    
    # Filter for strategic diversity
    diverse_moves = []
    for m in moves:
        if m['score'] < threshold: break
        
        m_coords = set((m['r'] + m['dr']*i, m['c'] + m['dc']*i) for i in range(m['len']))
        
        is_distinct = True
        for dm in diverse_moves:
            dm_coords = set((dm['r'] + dm['dr']*i, dm['c'] + dm['dc']*i) for i in range(dm['len']))
            overlap = m_coords.intersection(dm_coords)
            # If they share more than 33% of their tiles, they aren't distinct enough
            if len(overlap) > len(m_coords) * 0.33:
                is_distinct = False
                break
        
        if is_distinct:
            diverse_moves.append(m)
            if len(diverse_moves) >= 4: break

    if len(diverse_moves) < 4:
        return None

    return {
        'grid': [row[:] for row in game.grid],
        'rack': "".join(rack),
        'best_score': best_score,
        'num_options': len(diverse_moves),
        'options': diverse_moves
    }

def main():
    game = ClabbersGame("lists/dictionary.txt")
    target_count = 730
    puzzles = []
    print(f"Searching for {target_count} debatable puzzles (Best Score 50+)...")
    start_time = time.time()
    attempts = 0
    while len(puzzles) < target_count:
        attempts += 1
        game.reset()
        bag = list(BAG_BASE); random.shuffle(bag)
        rack = [bag.pop() for _ in range(7)]
        valid_history = True
        for t in range(4):
            move = game.find_best(rack)
            if not move: valid_history = False; break
            for i, char in zip(move['empty_idxs'], move['perm']):
                game.grid[move['r'] + move['dr']*i][move['c'] + move['dc']*i] = char
                rack.remove(char)
            game.is_first_move = False
            while len(rack) < 7 and bag: rack.append(bag.pop())
        if not valid_history: continue
        puzzle = get_puzzle_data(game, rack)
        if puzzle:
            puzzles.append(puzzle)
            elapsed = time.time() - start_time
            print(f"Found {len(puzzles)}/{target_count} (Attempts: {attempts}, Time: {elapsed:.1f}s)")
            with open("jsons/clabbers_puzzles.json", "w") as f: json.dump(puzzles, f)
    print(f"Done! Saved {len(puzzles)} puzzles.")

if __name__ == "__main__":
    main()