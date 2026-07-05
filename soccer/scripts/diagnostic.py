import random

def check_team(name, o_rank, s_rank, d_rank, g_rank, props, size):
    def get_range(rank):
        l = 22.5 + (rank * 2.5)
        return l, l + 2.5

    o_r = get_range(o_rank)
    s_r = get_range(s_rank)
    d_r = get_range(d_rank)
    g_r = get_range(g_rank)

    max_off = -1
    min_off = 101
    valid_found = 0
    
    for _ in range(500000):
        r = [random.randint(20, 50) for _ in range(size)]
        if not (g_r[0] < r[-1] <= g_r[1]): continue
            
        if size == 9:
            fwd_avg = (r[0] + r[1]) / 2.0
            mid_avg = (r[2] + r[3] + r[4]) / 3.0
            def_avg = (r[5] + r[6] + r[7]) / 3.0
        else:
            fwd_avg = (r[0] + r[1]) / 2.0
            mid_avg = (r[2] + r[3]) / 2.0
            def_avg = (r[4] + r[5]) / 2.0
            
        spd = (fwd_avg * 0.25) + (mid_avg * 0.5) + (def_avg * 0.25)
        dfn = (def_avg * 0.6) + (mid_avg * 0.3) + (r[-1] * 0.1)
        
        if (s_r[0] < spd <= s_r[1]) and (d_r[0] < dfn <= d_r[1]):
            off = sum(r[i] * props[i] for i in range(size-1)) / 100.0
            max_off = max(max_off, off)
            min_off = min(min_off, off)
            valid_found += 1
            
    print(f"--- {name} ---")
    print(f"Buckets: Off({o_r}), Spd({s_r}), Def({d_r})")
    if valid_found == 0:
        print("RESULT: IMPOSSIBLE (Speed and Defense buckets are incompatible)")
    else:
        print(f"Achievable Offense range: {min_off} to {max_off}")
        if max_off < o_r[0]:
            print(f"RESULT: IMPOSSIBLE (Max Offense {max_off} is below bucket {o_r[0]})")
        elif min_off > o_r[1]:
            print(f"RESULT: IMPOSSIBLE (Min Offense {min_off} is above bucket {o_r[1]})")
        else:
            print("RESULT: POTENTIALLY POSSIBLE")

check_team("Sweden", 8, 5, 9, 6, [20, 20, 10, 10, 15, 5, 10, 10, 0], 9)
