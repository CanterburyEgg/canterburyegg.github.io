import argparse
import json
import os
import random
import shutil

REPO = "/Users/bmyersmorgan/Documents/GitHub/canterburyegg.github.io"
BLIND_DIR = os.path.join(REPO, "_blind_audit_tmp")


def build_pass(rng, pass_name, ep_codes, picks_map, cand_root):
    slices = {i: [] for i in range(1, 7)}
    for code in ep_codes:
        slots = [1, 2, 3, 4, 5, 6]
        rng.shuffle(slots)
        for slice_idx, slot_num in enumerate(slots, start=1):
            slices[slice_idx].append((code, slot_num))

    mapping = {}
    for slice_idx in range(1, 7):
        items = slices[slice_idx]
        rng.shuffle(items)
        slice_dir = os.path.join(BLIND_DIR, f"{pass_name}_s{slice_idx}")
        os.makedirs(slice_dir, exist_ok=True)
        slice_key = {}
        for pos, (code, slot_num) in enumerate(items, start=1):
            cand_idx = picks_map[code][slot_num - 1]
            fname = f"item_{pos:02d}.jpg"
            src = os.path.join(cand_root, code, f"{cand_idx:02d}.jpg")
            assert os.path.exists(src), f"Missing {src}"
            dst = os.path.join(slice_dir, fname)
            shutil.copy2(src, dst)
            slice_key[fname] = {"code": code, "slot": slot_num, "cand_idx": cand_idx}
        mapping[f"{pass_name}_s{slice_idx}"] = slice_key
    return mapping


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--cand-root", required=True)
    parser.add_argument("--picks-json", required=True)
    parser.add_argument("--key-out", required=True)
    args = parser.parse_args()

    with open(args.picks_json) as f:
        picks_map = json.load(f)

    for code, picks in picks_map.items():
        assert len(picks) == 6 and len(set(picks)) == 6, f"Bad picks for {code}: {picks}"

    if os.path.exists(BLIND_DIR):
        shutil.rmtree(BLIND_DIR)
    os.makedirs(BLIND_DIR, exist_ok=True)

    ep_codes = sorted(picks_map.keys())
    key = {"picks": picks_map, "slices": {}}
    key["slices"].update(build_pass(random.Random(args.season * 1000 + 1), "pass_a", ep_codes, picks_map, args.cand_root))
    key["slices"].update(build_pass(random.Random(args.season * 1000 + 2), "pass_b", ep_codes, picks_map, args.cand_root))

    with open(args.key_out, "w") as f:
        json.dump(key, f, indent=2)

    print(f"Prepared 12 blind slices ({len(ep_codes) * 12} images) across {len(ep_codes)} Season {args.season} episodes.")


if __name__ == "__main__":
    main()
