"""If the final chord of the piece is a marcato stinger / choked hit (audio sustain <= 1.15s),

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    warped = ns.get('warped', MISSING)

    # If the final chord of the piece is a marcato stinger / choked hit (audio sustain <= 1.15s),
    # make it a crisp final Tap so the player slams the final hit right on the downbeat!
    if warped and warped[-1]["score_dur"] <= 1.85 and warped[-1]["dur"] <= 1.25:
        warped[-1]["end"] = min(warped[-1]["end"], warped[-1]["start"] + 0.25)
        warped[-1]["dur"] = warped[-1]["end"] - warped[-1]["start"]

