import json
from advanced import retry

SLICE_NAMES = [f"pass_a_s{i}" for i in range(1, 7)] + [f"pass_b_s{i}" for i in range(1, 7)]

SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "item": {"type": "integer"},
            "guess": {"type": "string"},
            "conf": {"type": "integer"},
        },
        "required": ["item", "guess", "conf"],
    },
}

blind_dir = args["blind_dir"]
num_items = int(args["num_items"])
season_label = args.get("season_label", "Season")
out_results_path = args["out_results_path"]


def make_prompt(slice_name: str) -> str:
    return f"""You are a blind playtester for a Friends (1994-2004) guess-the-episode game.
In directory `{blind_dir}/{slice_name}/`, there are {num_items} unlabeled image files named `item_01.jpg` through `item_{num_items:02d}.jpg`.

STRICT RULES:
1. ONLY call `read_file` on the {num_items} images inside `{blind_dir}/{slice_name}/` (read them in batches of 6-8 images per turn so you inspect every single image visually).
2. DO NOT read any other files, scripts, JSONs, or directories in the workspace, and DO NOT search the web.
3. Every image comes from a DIFFERENT episode of Friends (anywhere across Seasons 1-10, `S01E01`..`S10E17`; note two-parters use the 234-episode catalog numbering where S10 finale is `S10E17` and S9 Barbados is `S09E23`).
4. Judge each image purely on its own visual evidence (guest stars, outfits, haircuts, props, sets, physical gags). Do NOT force guesses to match each other.
5. SPEED & ANTI-OVERTHINKING RULE: Keep your internal reasoning ultra-brief (at most 1-2 short sentences per image)! If an image is a generic apartment/Central Perk shot without an obvious giveaway, DO NOT spend paragraphs trying to deduce it from hairstyles—immediately make a quick gut guess with low confidence (10-25) and move to the next image, just like a real human player.
6. Return an array of {num_items} objects (`item`: 1..{num_items}, `guess`: exact code like `"S02E14"`, `conf`: integer 0..100 representing your honest probability of being right). Use low confidence (10-30) when guessing from generic apartment/Central Perk shots, and high confidence (85-100) only when an unmistakable scene/prop/guest star identifies the exact episode."""


phase(f"{season_label} Double-Blind Playtest (12 slices)")
log(f"Running 12 blind playtesters across {num_items} episodes ({num_items * 12} total isolated predictions)...")

results_list = await parallel(
    SLICE_NAMES,
    lambda sname: retry(
        lambda: agent(
            make_prompt(sname),
            schema=SCHEMA,
            role=f"{season_label} Blind {sname.replace('pass_', '').upper()}",
            type_name="research",
        ),
        attempts=2,
    ),
)

out_dict = {}
for sname, arr in zip(SLICE_NAMES, results_list):
    out_dict[sname] = arr
    log(f"Completed {sname}: {len(arr)} predictions")

await call_tool("write_file", Path=out_results_path, Content=json.dumps(out_dict, indent=2), Overwrite=True)
print(f"Saved all 12 blind slice results to {out_results_path}")
