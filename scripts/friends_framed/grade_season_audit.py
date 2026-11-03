import argparse
import hashlib
import json
import os
import shutil
import subprocess

REPO = "/Users/bmyersmorgan/Documents/GitHub/canterburyegg.github.io"
ALL_EPS_PATH = os.path.join(REPO, "scripts", "friends_framed", "all_friends_eps.json")
REGISTRY_PATH = os.path.join(REPO, "scripts", "friends_framed", "series_registry.json")
COMPILE_SCRIPT = os.path.join(REPO, "scripts", "friends_framed", "compile_series.py")
IMG_ROOT = os.path.join(REPO, "img", "friends_framed")


def ep_hash_id(s: int, e: int) -> str:
    h = hashlib.md5(f"friends_framed:S{s:02d}E{e:02d}".encode("utf-8")).hexdigest()[:8]
    return f"e_{h}"


def norm_code(raw: str) -> str:
    raw = raw.strip().upper().replace(" ", "")
    if raw.startswith("S") and "E" in raw:
        try:
            s_part, e_part = raw[1:].split("E", 1)
            return f"S{int(s_part):02d}E{int(e_part):02d}"
        except Exception:
            return raw
    return raw


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--cand-root", required=True)
    parser.add_argument("--key-path", required=True)
    parser.add_argument("--results-path", required=True)
    parser.add_argument("--override", action="append", default=[], help="CODE=c1,c2,c3,c4,c5,c6")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    overrides = {}
    for ov in args.override:
        k, v = ov.split("=", 1)
        overrides[k.strip()] = [int(x) for x in v.split(",")]

    with open(ALL_EPS_PATH) as f:
        all_eps = json.load(f)
    titles = {f"S{int(x['season']):02d}E{int(x['episode']):02d}": x["title"] for x in all_eps}

    with open(args.key_path) as f:
        key = json.load(f)
    with open(args.results_path) as f:
        results = json.load(f)

    stats = {}
    for code, picks in key["picks"].items():
        stats[code] = {slot: {"cand_idx": picks[slot - 1], "runs": []} for slot in range(1, 7)}

    for slice_name, arr in results.items():
        slice_map = key["slices"][slice_name]
        for entry in arr:
            idx = int(entry["item"])
            guess = norm_code(str(entry["guess"]))
            conf = int(entry["conf"])
            fname = f"item_{idx:02d}.jpg"
            truth = slice_map[fname]
            code = truth["code"]
            slot = truth["slot"]
            correct = (guess == code)
            eff = conf if correct else 0
            stats[code][slot]["runs"].append({"guess": guess, "conf": conf, "correct": correct, "eff": eff})

    total_preds = 0
    total_hits = 0
    reordered_count = 0
    final_orders = {}

    for code in sorted(stats.keys()):
        print(f"=== {code}: {titles[code]} ===")
        rows = []
        for slot in range(1, 7):
            st = stats[code][slot]
            runs = st["runs"]
            hits = sum(1 for r in runs if r["correct"])
            avg_eff = sum(r["eff"] for r in runs) / max(1, len(runs))
            # Cap 2/2 slam-dunk confidence at 92.0 so 95 vs 99 verbal calibration jitter
            # doesn't invert curated visual climaxes inside the >=92% giveaway tier
            capped_eff = min(avg_eff, 92.0) if hits == len(runs) else avg_eff
            total_preds += len(runs)
            total_hits += hits
            rows.append((hits, capped_eff, slot, st["cand_idx"], avg_eff, runs))
            r_str = " | ".join(f"{'OK' if r['correct'] else 'XX:'+r['guess']}@{r['conf']}" for r in runs)
            print(f"  init_slot={slot} (cand {st['cand_idx']:02d}): hits={hits}/{len(runs)}, avg_eff={avg_eff:5.1f}  [{r_str}]")

        sorted_rows = sorted(rows, key=lambda x: (x[0], x[1], x[2]))
        new_cands = overrides.get(code) or [r[3] for r in sorted_rows]
        orig_cands = key["picks"][code]
        if new_cands != orig_cands:
            reordered_count += 1
            tag = "REORDERED (override)" if code in overrides else "REORDERED"
        else:
            tag = "unchanged"
        final_orders[code] = new_cands
        print(f"  -> Final cands={new_cands} ({tag})")

    print(f"\nSummary: {total_hits}/{total_preds} exact blind hits ({100.0*total_hits/max(1,total_preds):.1f}%), {reordered_count}/{len(stats)} episodes reordered.")

    if args.apply:
        with open(REGISTRY_PATH) as f:
            registry = json.load(f)

        for code, final_cands in final_orders.items():
            s = int(code[1:3])
            e = int(code[4:6])
            hid = ep_hash_id(s, e)
            dst_dir = os.path.join(IMG_ROOT, hid)
            os.makedirs(dst_dir, exist_ok=True)
            for pos, cand_idx in enumerate(final_cands, start=1):
                src_img = os.path.join(args.cand_root, code, f"{cand_idx:02d}.jpg")
                assert os.path.exists(src_img), f"Missing {src_img}"
                shutil.copy2(src_img, os.path.join(dst_dir, f"{pos}.jpg"))
            registry[code] = {
                "season": s,
                "episode": e,
                "hash_id": hid,
                "cands": final_cands,
                "source": f"s{args.season:02d}_double_blind_verified",
            }

        sorted_reg = {k: registry[k] for k in sorted(registry.keys())}
        with open(REGISTRY_PATH, "w") as f:
            json.dump(sorted_reg, f, indent=2)

        season_cnt = sum(1 for v in sorted_reg.values() if v["season"] == args.season)
        print(f"Registered Season {args.season}: {season_cnt} episodes now verified ({len(sorted_reg)} total across series).")
        subprocess.run(["python3", COMPILE_SCRIPT], check=True)


if __name__ == "__main__":
    main()
