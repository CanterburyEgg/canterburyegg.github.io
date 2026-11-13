#!/usr/bin/env python3
"""
CADENZA — Multi-Format Score + Audio DTW Chart Compiler (Approach #3)

Supported Score Formats:
  - Standard Multi-Track MIDI: .mid, .midi
  - MuseScore 3 & 4 Native Scores: .mscz, .mscx
  - MusicXML (Compressed & Uncompressed): .mxl, .musicxml, .xml

Pipeline:
  1. Universal Score Parser -> extracts named instrument staves, ties, trills, dynamics, and percussion.
  2. Concert-Pitch Harmonizer & Trill/Tie Consolidator -> auto-corrects transposing staves and collapses
     written trills/ties into unbroken Hold Ribbons.
  3. Symphonic Lead-Part Conductor (Phrase-Level Viterbi) -> uses Unison/Octave Orchestration Doubling,
     Pitch-Contour Entropy (anti-ostinato), and Instrument Role Priors to follow the true foreground
     lead melody phrase-by-phrase across the ensemble.
  4. Multiscale Hybrid Chroma + Onset Corridor DTW (92.9ms -> 11.6ms) -> warps every score note and
     written percussion impact onto the real performance recording's rubato, tempo changes, and fermatas.
"""

import argparse
import json
import os
import re
import subprocess
import tempfile
import time
import warnings
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

warnings.filterwarnings("ignore")

import librosa
import numpy as np
import pretty_midi
import scipy.interpolate
import scipy.ndimage
import scipy.signal
import soundfile as sf


# ==============================================================================
# 1. AUDIO LOADER
# ==============================================================================

def load_mono_22k(audio_path: Path) -> tuple[np.ndarray, float]:
    """Decode audio file (.mp3, .m4a, .flac, .wav, .ogg) to mono float32 @ 22050 Hz."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_wav = tmp.name
    try:
        if os.path.exists("/usr/bin/afconvert"):
            subprocess.run(
                [
                    "/usr/bin/afconvert",
                    "-f",
                    "WAVE",
                    "-d",
                    "LEI16@22050",
                    "-c",
                    "1",
                    str(audio_path),
                    tmp_wav,
                ],
                check=True,
            )
            y, sr = sf.read(tmp_wav, dtype="float32", always_2d=False)
            if y.ndim > 1:
                y = y.mean(axis=1)
            return y.astype(np.float32), float(len(y) / sr)
        else:
            y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
            return y.astype(np.float32), float(len(y) / sr)
    finally:
        if os.path.exists(tmp_wav):
            os.remove(tmp_wav)


# ==============================================================================
# 2. UNIVERSAL SCORE PARSERS (.mid, .mscz/.mscx, .mxl/.musicxml)
# ==============================================================================

def parse_midi_score(score_path: Path) -> list[dict]:
    pm = pretty_midi.PrettyMIDI(str(score_path))
    staves = []
    for idx, inst in enumerate(pm.instruments):
        if not inst.notes:
            continue
        name = (inst.name or "").strip()
        if not name:
            name = "Percussion" if inst.is_drum else pretty_midi.program_to_instrument_name(inst.program)
        is_drum = bool(inst.is_drum) or any(
            k in name.lower()
            for k in ["timpani", "percussion", "drum", "cymbal", "tambourine", "triangle", "darbuka", "tom"]
        )
        notes = [
            {
                "start": float(n.start),
                "end": float(max(n.start + 0.03, n.end)),
                "midi": int(n.pitch),
                "vel": int(n.velocity),
                "trill": False,
            }
            for n in inst.notes
        ]
        staves.append({"name": name, "program": int(inst.program), "is_drum": is_drum, "notes": notes})
    return staves


_MS_DUR_BEATS = {
    "long": 16.0,
    "breve": 8.0,
    "whole": 4.0,
    "measure": 4.0,
    "half": 2.0,
    "quarter": 1.0,
    "eighth": 0.5,
    "16th": 0.25,
    "32nd": 0.125,
    "64th": 0.0625,
    "128th": 0.03125,
}


def _fractions_to_quarters(text: str) -> float:
    parts = text.strip().split("/")
    if len(parts) == 2:
        return (float(parts[0]) / float(parts[1])) * 4.0
    return float(parts[0]) * 4.0


def parse_musescore_xml(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    score_el = root.find(".//Score")
    if score_el is None and root.tag == "Score":
        score_el = root
    if score_el is None:
        raise ValueError("No <Score> element found in MuseScore file.")

    # Map staff_id -> (part_name, is_drum)
    staff_meta = {}
    for part in score_el.findall("Part"):
        pname = (
            part.findtext("trackName")
            or part.findtext(".//longName")
            or part.findtext(".//instrumentId")
            or "Instrument"
        ).strip()
        use_drum = part.find(".//useDrumset") is not None and part.findtext(".//useDrumset") == "1"
        is_drum = use_drum or any(
            k in pname.lower()
            for k in ["timpani", "percussion", "drum", "cymbal", "tambourine", "darbuka", "snare", "triangle"]
        )
        for st in part.findall("Staff"):
            sid = st.attrib.get("id")
            if sid:
                staff_meta[sid] = (pname, is_drum)

    # First pass across Staff 1 (or all staves): collect tempo map (quarter_pos -> quarter_per_sec)
    tempo_events = [(0.0, 2.0)]  # default 120 BPM = 2.0 quarters/sec
    all_staves_raw = []

    for st in score_el.findall("Staff"):
        sid = st.attrib.get("id", "1")
        if sid not in staff_meta and len(staff_meta) > 0:
            continue
        pname, is_drum = staff_meta.get(sid, (f"Staff {sid}", False))

        q_cursor = 0.0
        meas_sig_q = 4.0
        staff_notes = []  # (q_start, q_end, midi, vel, is_tie_start, is_tie_end, is_trill)

        for meas in st.findall("Measure"):
            m_start = q_cursor
            max_m_end = m_start
            voices = meas.findall("voice")
            if not voices:
                voices = [meas]

            for v_idx, voice in enumerate(voices):
                v_pos = m_start
                tuplet_scale = 1.0
                active_trill = False

                for elem in voice:
                    tag = elem.tag
                    if tag == "TimeSig":
                        n_sig = float(elem.findtext("sigN", "4"))
                        d_sig = float(elem.findtext("sigD", "4"))
                        meas_sig_q = n_sig * (4.0 / d_sig)
                    elif tag == "Tempo":
                        t_val = elem.findtext("tempo")
                        if t_val:
                            tempo_events.append((v_pos, max(0.2, float(t_val))))
                    elif tag == "location":
                        fr = elem.findtext("fractions")
                        if fr:
                            v_pos += _fractions_to_quarters(fr)
                    elif tag == "Tuplet":
                        normal = float(elem.findtext("normalNotes", "2"))
                        actual = float(elem.findtext("actualNotes", "3"))
                        tuplet_scale = normal / max(1.0, actual)
                    elif tag == "endTuplet":
                        tuplet_scale = 1.0
                    elif tag == "Spanner" and elem.attrib.get("type") == "Trill":
                        if elem.find("next") is not None:
                            active_trill = True
                        elif elem.find("prev") is not None:
                            active_trill = False
                    elif tag in ("Rest", "Chord"):
                        dtype = elem.findtext("durationType", "quarter")
                        dur_str = elem.findtext("duration")
                        if dtype == "measure" and dur_str:
                            q_dur = _fractions_to_quarters(dur_str)
                        elif dtype == "measure":
                            q_dur = meas_sig_q
                        else:
                            q_dur = _MS_DUR_BEATS.get(dtype, 1.0)
                            dots = int(elem.findtext("dots", "0"))
                            dot_mult = 1.0
                            add = 0.5
                            for _ in range(dots):
                                dot_mult += add
                                add *= 0.5
                            q_dur *= dot_mult
                        q_dur *= tuplet_scale

                        if tag == "Chord":
                            for note_el in elem.findall("Note"):
                                pitch_txt = note_el.findtext("pitch")
                                if pitch_txt is None:
                                    continue
                                midi_p = int(pitch_txt)
                                vel = int(note_el.findtext("velocity", "88") or "88")
                                tie_start = note_el.find("Tie") is not None
                                tie_end = False
                                for sp in note_el.findall("Spanner"):
                                    if sp.attrib.get("type") == "Tie":
                                        if sp.find("next") is not None:
                                            tie_start = True
                                        if sp.find("prev") is not None:
                                            tie_end = True
                                staff_notes.append(
                                    (v_pos, v_pos + q_dur, midi_p, vel, tie_start, tie_end, active_trill)
                                )
                        v_pos += q_dur

                if v_pos > max_m_end:
                    max_m_end = v_pos

            q_cursor = max(max_m_end, m_start + meas_sig_q)

        all_staves_raw.append((pname, is_drum, staff_notes))

    # Build monotonic quarter -> seconds piecewise linear function
    tempo_events.sort(key=lambda x: x[0])
    dedup_tempo = [tempo_events[0]]
    for qp, qps in tempo_events[1:]:
        if abs(qp - dedup_tempo[-1][0]) < 1e-4:
            dedup_tempo[-1] = (qp, qps)
        else:
            dedup_tempo.append((qp, qps))

    q_knots = [0.0]
    t_knots = [0.0]
    cur_t = 0.0
    for idx in range(len(dedup_tempo)):
        q0, qps = dedup_tempo[idx]
        if q0 > q_knots[-1]:
            prev_qps = dedup_tempo[idx - 1][1]
            cur_t += (q0 - q_knots[-1]) / prev_qps
            q_knots.append(q0)
            t_knots.append(cur_t)
    q_knots.append(q_knots[-1] + 100000.0)
    t_knots.append(cur_t + 100000.0 / dedup_tempo[-1][1])
    q_to_sec = scipy.interpolate.interp1d(q_knots, t_knots, kind="linear", fill_value="extrapolate")

    staves_out = []
    for pname, is_drum, snotes in all_staves_raw:
        if not snotes:
            continue
        snotes.sort(key=lambda x: (x[0], x[2]))
        # Fuse tied notes on identical pitch
        open_ties = {}
        merged = []
        for qs, qe, mp, vel, t_start, t_end, is_tr in snotes:
            s_sec = float(q_to_sec(qs))
            e_sec = float(max(s_sec + 0.03, q_to_sec(qe)))
            if t_end and mp in open_ties and abs(s_sec - open_ties[mp]["end"]) <= 0.05:
                open_ties[mp]["end"] = e_sec
                if not t_start:
                    del open_ties[mp]
            else:
                item = {"start": s_sec, "end": e_sec, "midi": mp, "vel": vel, "trill": is_tr}
                merged.append(item)
                if t_start:
                    open_ties[mp] = item
        staves_out.append({"name": pname, "program": 0, "is_drum": is_drum, "notes": merged})
    return staves_out


_STEP_SEMI = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def parse_musicxml_bytes(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    part_names = {}
    for sp in root.findall(".//score-part"):
        pid = sp.attrib.get("id", "")
        pname = (sp.findtext("part-name") or sp.findtext("part-abbreviation") or pid).strip()
        part_names[pid] = pname

    tempo_events = [(0.0, 2.0)]  # (quarters, quarters_per_sec)
    parts_raw = []

    for part in root.findall("part"):
        pid = part.attrib.get("id", "")
        pname = part_names.get(pid, pid or "Instrument")
        is_drum = any(
            k in pname.lower()
            for k in ["timpani", "percussion", "drum", "cymbal", "tambourine", "darbuka", "snare", "triangle"]
        )
        divisions = 1.0
        chromatic_shift = 0
        q_pos = 0.0
        pnotes = []

        for meas in part.findall("measure"):
            last_chord_start = q_pos
            for elem in meas:
                tag = elem.tag.split("}")[-1]
                if tag == "attributes":
                    div_txt = elem.findtext("divisions")
                    if div_txt:
                        divisions = max(1e-4, float(div_txt))
                    tr_el = elem.find("transpose")
                    if tr_el is not None:
                        ch = int(tr_el.findtext("chromatic", "0"))
                        oct_ch = int(tr_el.findtext("octave-change", "0"))
                        chromatic_shift = ch + 12 * oct_ch
                elif tag == "direction":
                    snd = elem.find(".//sound")
                    if snd is not None and "tempo" in snd.attrib:
                        tempo_events.append((q_pos, max(0.2, float(snd.attrib["tempo"]) / 60.0)))
                elif tag == "backup":
                    dur = float(elem.findtext("duration", "0")) / divisions
                    q_pos = max(0.0, q_pos - dur)
                elif tag == "forward":
                    dur = float(elem.findtext("duration", "0")) / divisions
                    q_pos += dur
                elif tag == "note":
                    if elem.find("grace") is not None:
                        continue
                    is_chord = elem.find("chord") is not None
                    dur_q = float(elem.findtext("duration", "0")) / divisions
                    note_start = last_chord_start if is_chord else q_pos
                    if not is_chord:
                        last_chord_start = q_pos
                        q_pos += dur_q

                    if elem.find("rest") is not None:
                        continue

                    unp = elem.find("unpitched")
                    pitch_el = elem.find("pitch")
                    if unp is not None:
                        is_drum = True
                        midi_p = 45
                    elif pitch_el is not None:
                        step = pitch_el.findtext("step", "C").strip()
                        alter = float(pitch_el.findtext("alter", "0"))
                        octave = int(pitch_el.findtext("octave", "4"))
                        midi_p = int(round((octave + 1) * 12 + _STEP_SEMI.get(step, 0) + alter + chromatic_shift))
                    else:
                        continue

                    ties = [t.attrib.get("type") for t in elem.findall("tie")]
                    is_trill = elem.find(".//trill-mark") is not None or elem.find(".//tremolo") is not None
                    pnotes.append(
                        (note_start, note_start + dur_q, midi_p, 88, "start" in ties, "stop" in ties, is_trill)
                    )

        parts_raw.append((pname, is_drum, pnotes))

    tempo_events.sort(key=lambda x: x[0])
    dedup = [tempo_events[0]]
    for qp, qps in tempo_events[1:]:
        if abs(qp - dedup[-1][0]) < 1e-4:
            dedup[-1] = (qp, qps)
        else:
            dedup.append((qp, qps))

    q_knots, t_knots, cur_t = [0.0], [0.0], 0.0
    for idx in range(len(dedup)):
        q0, qps = dedup[idx]
        if q0 > q_knots[-1]:
            cur_t += (q0 - q_knots[-1]) / dedup[idx - 1][1]
            q_knots.append(q0)
            t_knots.append(cur_t)
    q_knots.append(q_knots[-1] + 100000.0)
    t_knots.append(cur_t + 100000.0 / dedup[-1][1])
    q_to_sec = scipy.interpolate.interp1d(q_knots, t_knots, kind="linear", fill_value="extrapolate")

    staves_out = []
    for pname, is_drum, snotes in parts_raw:
        if not snotes:
            continue
        snotes.sort(key=lambda x: (x[0], x[2]))
        open_ties = {}
        merged = []
        for qs, qe, mp, vel, t_start, t_end, is_tr in snotes:
            s_sec = float(q_to_sec(qs))
            e_sec = float(max(s_sec + 0.03, q_to_sec(qe)))
            if t_end and mp in open_ties and abs(s_sec - open_ties[mp]["end"]) <= 0.05:
                open_ties[mp]["end"] = e_sec
                if not t_start:
                    del open_ties[mp]
            else:
                item = {"start": s_sec, "end": e_sec, "midi": mp, "vel": vel, "trill": is_tr}
                merged.append(item)
                if t_start:
                    open_ties[mp] = item
        staves_out.append({"name": pname, "program": 0, "is_drum": is_drum, "notes": merged})
    return staves_out


def load_any_score(score_path: Path) -> list[dict]:
    ext = score_path.suffix.lower()
    if ext in (".mid", ".midi"):
        return parse_midi_score(score_path)
    elif ext == ".mscz":
        with zipfile.ZipFile(score_path, "r") as zf:
            mscx_names = [n for n in zf.namelist() if n.endswith(".mscx")]
            if not mscx_names:
                raise ValueError(f"No .mscx found inside {score_path}")
            return parse_musescore_xml(zf.read(mscx_names[0]))
    elif ext == ".mscx":
        return parse_musescore_xml(score_path.read_bytes())
    elif ext == ".mxl":
        with zipfile.ZipFile(score_path, "r") as zf:
            if "META-INF/container.xml" in zf.namelist():
                c_root = ET.fromstring(zf.read("META-INF/container.xml"))
                rf = c_root.find(".//{*}rootfile")
                xml_name = rf.attrib["full-path"] if rf is not None else [n for n in zf.namelist() if n.endswith(".xml")][0]
            else:
                xml_name = [n for n in zf.namelist() if n.endswith((".xml", ".musicxml"))][0]
            return parse_musicxml_bytes(zf.read(xml_name))
    elif ext in (".musicxml", ".xml"):
        return parse_musicxml_bytes(score_path.read_bytes())
    elif ext == ".pdf":
        from parse_finale_pdf import parse_finale_pdf_score
        return parse_finale_pdf_score(score_path)
    else:
        raise ValueError(f"Unsupported score extension: {ext}")


# ==============================================================================
# 3. CONCERT-PITCH HARMONIZER, TRILL COLLAPSER & LEAD-PART CONDUCTOR
# ==============================================================================

def consolidate_and_harmonize_staves(raw_staves: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    1. Merges split articulation staves sharing the same normalized instrument name.
    2. Auto-detects transposing staves (Bb/Eb/F/D/A engraving exports) via Chroma Consensus.
    3. Extracts clean upper-voice monophonic line + collapses rapid 2-note trills into single holds!
    """
    grouped = {}
    drum_notes = []

    for st in raw_staves:
        if st["is_drum"]:
            drum_notes.extend(st["notes"])
            p_set = {n["midi"] for n in st["notes"] if 30 <= n["midi"] <= 62}
            if "timp" not in st["name"].lower() or len(p_set) < 2:
                continue
        norm_name = re.sub(r"\s+", " ", st["name"]).strip()
        if norm_name not in grouped:
            grouped[norm_name] = {"name": norm_name, "notes": []}
        grouped[norm_name]["notes"].extend(st["notes"])

    staves = list(grouped.values())
    if not staves:
        return [], drum_notes

    max_t = max(n["end"] for st in staves for n in st["notes"]) + 2.0
    n_bins = max(10, int(max_t * 2))

    # Build concert-pitch reference chroma from C instruments (or all staves weighted by note count)
    c_inst_keywords = ["flute", "oboe", "violin", "viola", "cello", "trombone", "piano", "marimba", "harp", "staff"]
    ref_chroma = np.zeros((12, n_bins), dtype=np.float64)
    has_c_ref = False
    for st in staves:
        lname = st["name"].lower()
        if any(k in lname for k in c_inst_keywords) and "bass" not in lname:
            has_c_ref = True
            for n in st["notes"]:
                b0 = int(n["start"] * 2)
                b1 = min(n_bins, int(n["end"] * 2) + 1)
                ref_chroma[n["midi"] % 12, b0:b1] += n["end"] - n["start"]

    if not has_c_ref:
        for st in staves:
            for n in st["notes"]:
                b0 = int(n["start"] * 2)
                b1 = min(n_bins, int(n["end"] * 2) + 1)
                ref_chroma[n["midi"] % 12, b0:b1] += n["end"] - n["start"]

    # Check standard band/orchestral transpositions (-5, -3, -2, +2, +3, +5, -7, +7)
    allowed_shifts = [0, -2, 2, -5, 5, -3, 3, -7, 7]
    for st in staves:
        if len(st["notes"]) < 60:
            continue
        c = np.zeros((12, n_bins), dtype=np.float64)
        for n in st["notes"]:
            b0 = int(n["start"] * 2)
            b1 = min(n_bins, int(n["end"] * 2) + 1)
            c[n["midi"] % 12, b0:b1] += n["end"] - n["start"]

        zero_dot = float(np.sum(c * ref_chroma)) + 1e-6
        best_sh = 0
        best_ratio = 1.0
        for sh in allowed_shifts[1:]:
            sh_dot = float(np.sum(np.roll(c, sh, axis=0) * ref_chroma))
            ratio = sh_dot / zero_dot
            if ratio > best_ratio:
                best_ratio = ratio
                best_sh = sh

        if best_sh != 0 and best_ratio >= 3.0:
            print(f"    [Concert-Pitch Fix] Transposing '{st['name']}' by {best_sh:+d} semitones (match={best_ratio:.1f}x)")
            for n in st["notes"]:
                n["midi"] += best_sh

    # Extract 1st-Chair Upper Skyline & Collapse Trills / Ties per Staff
    cleaned_staves = []
    for st in staves:
        snotes = sorted(st["notes"], key=lambda x: (x["start"], -x["midi"]))
        # 1. Simultaneous dyad/chord skyline (keep highest voice attacking within 28ms on this staff)
        sky = []
        for n in snotes:
            if sky and abs(n["start"] - sky[-1]["start"]) <= 0.028:
                # Keep upper note (already first due to -midi sort), extend end if lower note tied longer? No, keep upper duration!
                continue
            # Also skip inner divisi sustain notes completely covered by an active higher note on the same staff
            if sky and n["midi"] < sky[-1]["midi"] and n["end"] <= sky[-1]["end"] + 0.04 and (n["start"] - sky[-1]["start"]) < 0.25:
                continue
            sky.append(dict(n))

        # 2. Merge tied / overlapping identical pitches on same staff (gap <= 0.008s = MIDI tie!)
        tied = []
        for n in sky:
            if tied and n["midi"] == tied[-1]["midi"] and (n["start"] - tied[-1]["end"]) <= 0.008:
                # Only merge if gap is literally zero/overlap (written tie), NOT staccato/tongued repeats!
                if n["start"] <= tied[-1]["end"] - 0.002 or (tied[-1].get("trill") and n.get("trill")):
                    tied[-1]["end"] = max(tied[-1]["end"], n["end"])
                    continue
            tied.append(n)

        # 3. Collapse rapid 2-pitch written trills (|p1 - p2| <= 2 oscillating >= 4 times at dur <= 0.125s)
        collapsed = []
        idx = 0
        while idx < len(tied):
            cur = tied[idx]
            if cur.get("trill"):
                j = idx + 1
                while (
                    j < len(tied)
                    and tied[j].get("trill")
                    and tied[j]["midi"] == cur["midi"]
                    and (tied[j]["start"] - tied[j - 1]["end"]) <= 0.05
                ):
                    j += 1
                cur = dict(cur)
                cur["end"] = tied[j - 1]["end"]
                collapsed.append(cur)
                idx = j
                continue

            # Detect exported MIDI trill (rapid A-B-A-B-A oscillation <= 2 semitones, each <= 0.125s)
            if cur["end"] - cur["start"] <= 0.125 and idx + 4 < len(tied):
                p_set = {cur["midi"], tied[idx + 1]["midi"]}
                if len(p_set) == 2 and max(p_set) - min(p_set) <= 2:
                    j = idx + 1
                    while (
                        j < len(tied)
                        and tied[j]["midi"] in p_set
                        and (tied[j]["end"] - tied[j]["start"]) <= 0.135
                        and (tied[j]["start"] - tied[j - 1]["end"]) <= 0.035
                    ):
                        j += 1
                    if j - idx >= 5:
                        tr_note = dict(cur)
                        tr_note["midi"] = min(p_set)
                        tr_note["end"] = tied[j - 1]["end"]
                        tr_note["trill"] = True  # collapsed from an A-B-A-B oscillation
                        collapsed.append(tr_note)
                        idx = j
                        continue

            collapsed.append(cur)
            idx += 1

        # Trim tiny legato overlaps within staff
        for k in range(len(collapsed) - 1):
            if collapsed[k]["end"] > collapsed[k + 1]["start"]:
                collapsed[k]["end"] = max(collapsed[k]["start"] + 0.025, collapsed[k + 1]["start"] - 0.005)

        cleaned_staves.append({"name": st["name"], "notes": collapsed})

    return cleaned_staves, drum_notes


from types import SimpleNamespace as _SimpleNamespace  # noqa: E402

from conductor import conduct as _conduct  # noqa: E402
from conductor import run_after_pick as _run_after_pick  # noqa: E402
from timing import run_all as _run_timing  # noqa: E402
from conductor.core import instrument_role_prior  # noqa: E402,F401


def conduct_lead_melody_from_score(staves: list[dict], score_duration: float) -> list[dict]:
    """Pick the lead line from the score (see scripts/conductor/: core picker + ordered passes)."""
    return _conduct(staves, score_duration)


# ==============================================================================
# 4. MULTISCALE CHROMA + DLNCO ONSET CORRIDOR DTW (ZERO CONCERT-HALL REVERB LAG!)
# ==============================================================================

def build_score_chroma_and_onset(all_staves: list[dict], drum_notes: list[dict], hop_sec: float, score_dur: float):
    """
    Synthesizes:
      1. Concert-Hall Realistic Chroma (12xT) with 45ms brass/wind swell + 250ms hall reverb decay,
         plus automatic decay of multi-second static pedal drones (>2.6s) so solo cadenzas over bass
         pedal points remain crystal-clear in Chroma DTW!
      2. 3-Band Octave Register Profile (3xT: Low <C4, Mid C4..F#5, High >=G5) to disambiguate
         low bass-drone rests from high solo entrances playing the same pitch classes 3 octaves up!
      3. 12-Bin Pitch-Specific Chroma Onset `DLNCO` (12xT) + Broadband Onset (1xT).
    """
    T = max(20, int(np.ceil(score_dur / hop_sec)) + 30)
    chroma = np.zeros((12, T), dtype=np.float32)
    reg_prof = np.zeros((3, T), dtype=np.float32)
    dlnco = np.zeros((12, T), dtype=np.float32)
    onset = np.zeros(T, dtype=np.float32)

    atk_frames = max(2, int(round(0.046 / hop_sec)))     # ~4 frames (46ms horn/wind attack rise)
    tail_frames = max(6, int(round(0.255 / hop_sec)))    # ~22 frames (255ms concert-hall decay tail)
    tail_curve = np.exp(-np.arange(1, tail_frames + 1, dtype=np.float32) / (0.14 / hop_sec))

    harm_semi = [(0, 1.0), (12, 0.55), (19, 0.30), (24, 0.18)]
    for st in all_staves:
        prior = instrument_role_prior(st["name"])
        for n in st["notes"]:
            f0 = min(T - 2, max(0, int(round(n["start"] / hop_sec))))
            f1 = min(T - 1, max(f0 + 1, int(round(n["end"] / hop_sec))))
            n_dur_sec = float(n["end"] - n["start"])
            vel_w = (n["vel"] / 100.0) * max(0.4, prior)

            onset[f0] += vel_w
            dlnco[n["midi"] % 12, f0] += vel_w

            # Realistic note envelope: quick swell + sustain + hall reverb decay
            n_len = f1 - f0
            env = np.ones(n_len, dtype=np.float32)
            r_len = min(atk_frames, n_len)
            if r_len > 1:
                env[:r_len] = np.linspace(0.28, 1.0, r_len, dtype=np.float32)

            # Decay static multi-second low-register pedal drones (midi < 56, dur >= 2.2s) in Chroma & Low Register
            # while keeping high melodic Hold Ribbons (Flute/Oboe/Trumpet/Clarinet >= G#3) and final tutti crescendo holds 100% intact!
            env_chr = env
            if n["midi"] < 56 and n_dur_sec >= 2.2 and float(n["end"]) < score_dur - 6.0:
                t_rel = np.arange(n_len, dtype=np.float32) * hop_sec
                drone_decay = 0.14 + 0.86 * np.exp(-np.maximum(0.0, t_rel - 0.45) / 0.75)
                env_chr = env * drone_decay.astype(np.float32)

            # Register band (0: <C4, 1: C4..F#5, 2: >=G5)
            b_idx = 0 if n["midi"] < 60 else (1 if n["midi"] < 79 else 2)
            reg_prof[b_idx, f0:f1] += vel_w * (env_chr if b_idx == 0 else env)

            t_end_tail = min(T, f1 + tail_frames)
            actual_tail = t_end_tail - f1
            end_level = float(env_chr[-1]) if n_len > 0 else 1.0

            for sh, hw in harm_semi:
                pc = (n["midi"] + sh) % 12
                w_val = vel_w * hw
                chroma[pc, f0:f1] += w_val * env_chr
                if actual_tail > 0:
                    chroma[pc, f1:t_end_tail] += w_val * end_level * tail_curve[:actual_tail] * 0.68

    drum_body_frames = max(3, int(round(0.09 / hop_sec)))
    for dn in drum_notes:
        f0 = min(T - 1, max(0, int(round(dn["start"] / hop_sec))))
        dw = (dn["vel"] / 100.0) * 0.90
        onset[f0] += dw
        d_end = min(T, f0 + drum_body_frames)
        reg_prof[0, f0:d_end] += dw * 0.55
        reg_prof[1, f0:d_end] += dw * 0.30

    # Smooth & locally normalize DLNCO (12xT) and Broadband Onset (1xT)
    win_loc = max(9, int(round(1.8 / hop_sec)))
    dlnco_sm = scipy.ndimage.gaussian_filter1d(dlnco, sigma=1.5, axis=1)
    dlnco_max = np.maximum(
        scipy.ndimage.maximum_filter1d(dlnco_sm, size=win_loc, axis=1),
        np.max(dlnco_sm, axis=0, keepdims=True) * 0.35,
    ) + 1e-6
    dlnco_norm = np.clip(dlnco_sm / dlnco_max, 0.0, 1.0).astype(np.float32)

    onset_sm = scipy.ndimage.gaussian_filter1d(onset, sigma=1.3)
    loc_max = scipy.ndimage.maximum_filter1d(onset_sm, size=win_loc) + 1e-6
    onset_norm = np.clip(onset_sm / loc_max, 0.0, 1.0).astype(np.float32)

    norms = np.linalg.norm(chroma, axis=0, keepdims=True) + 1e-6
    chroma_norm = (chroma / norms).astype(np.float32)

    reg_norms = np.linalg.norm(reg_prof, axis=0, keepdims=True) + 1e-6
    reg_norm = (reg_prof / reg_norms).astype(np.float32)

    # Silence & Simultaneous Release/Cutoff Cliff channels (locks caesuras & roll cutoffs to 10ms!)
    raw_act = np.sum(reg_prof, axis=0) + onset * 0.8
    # Causal concert-hall reverb decay (tau = 0.16s) for s_sil so loud cutoffs don't match 0.6s late into reverb tails!
    alpha_hall = float(np.exp(-hop_sec / 0.16))
    reverb_tail = scipy.signal.lfilter([1.0 - alpha_hall], [1.0, -alpha_hall], raw_act).astype(np.float32)
    raw_act_sil = np.maximum(raw_act, reverb_tail * 1.35)
    s_sil = np.exp(-raw_act_sil / 0.10).astype(np.float32)
    chroma_norm *= (1.0 - 0.80 * s_sil)[None, :]
    reg_norm *= (1.0 - 0.80 * s_sil)[None, :]

    log_act = np.log1p(8.0 * scipy.ndimage.gaussian_filter1d(raw_act, sigma=1.5))
    s_rel = np.zeros(T, dtype=np.float32)
    if T > 12:
        s_rel[:-10] = np.maximum(0.0, log_act[:-10] - log_act[10:])
    rel_max = np.maximum(scipy.ndimage.maximum_filter1d(s_rel, size=win_loc), float(np.percentile(s_rel, 85)) * 0.6 + 0.15)
    s_rel_norm = np.clip(s_rel / (rel_max + 1e-6), 0.0, 1.0).astype(np.float32)

    return chroma_norm, reg_norm, dlnco_norm, onset_norm, s_sil, s_rel_norm


def extract_audio_chroma_and_onset(audio_22k: np.ndarray, hop_length: int = 256):
    """
    Extracts:
      1. Equal-Loudness & Pedal-Drone-Balanced CQT Chroma (`fmin=C2`, 6 octaves) so sub-bass pedal
         drones never drown out high solo woodwinds!
      2. 3-Band Octave Register Profile (3xT: Low <C4, Mid C4..F#5, High >=G5).
      3. Forward-Foot Pitch-Specific Chroma Flux `DLNCO` (12xT) + Broadband Onset + 2048-pt STFT.
    """
    hop_sec = hop_length / 22050.0
    cqt_mag = np.abs(
        librosa.cqt(
            y=audio_22k,
            sr=22050,
            hop_length=hop_length,
            fmin=float(librosa.note_to_hz("C2")),
            n_bins=72,
            bins_per_octave=12,
        )
    ).astype(np.float32)
    onset_raw = librosa.onset.onset_strength(y=audio_22k, sr=22050, hop_length=hop_length)
    stft_mag = np.abs(librosa.stft(audio_22k, n_fft=2048, hop_length=hop_length)).astype(np.float32)

    T = min(cqt_mag.shape[1], len(onset_raw), stft_mag.shape[1])
    cqt_mag = cqt_mag[:, :T]
    onset_raw = onset_raw[:T].astype(np.float32)
    stft_mag = stft_mag[:, :T]

    # 3-Band Octave Register Profile (de-spill low-register overtones so solo rests read cleanly as [1, 0, 0])
    b_low = np.mean(cqt_mag[0:24, :], axis=0)
    b_mid = np.maximum(0.0, np.mean(cqt_mag[24:43, :], axis=0) - 0.34 * b_low)
    b_high = np.maximum(0.0, np.mean(cqt_mag[43:72, :], axis=0) - 0.08 * b_low - 0.22 * b_mid)
    reg_raw = np.vstack([b_low * 0.72, b_mid, b_high * 1.15])
    reg_norm = (reg_raw / (np.linalg.norm(reg_raw, axis=0, keepdims=True) + 1e-6)).astype(np.float32)

    # Attenuate static >5.0s low-register (<230Hz, bins 0..21) pedal-drone bins by 84%
    # while keeping melodic registers (>=Bb3, bins 22..71) 100% un-attenuated for long solo holds!
    drone_win = max(15, int(round(5.0 / hop_sec)))
    cqt_clean = cqt_mag.copy()
    drone_floor = scipy.ndimage.minimum_filter1d(cqt_mag[:22, :], size=drone_win, axis=1)
    cqt_clean[:22, :] = np.maximum(0.16 * cqt_mag[:22, :], cqt_mag[:22, :] - 0.84 * drone_floor)

    oct_weights = np.array([0.45, 0.72, 1.00, 1.12, 1.10, 0.95], dtype=np.float32)[:, None, None]
    chr_clean = (cqt_clean.reshape(6, 12, T) * oct_weights).sum(axis=0)
    norms = np.linalg.norm(chr_clean, axis=0, keepdims=True) + 1e-6
    chroma = (chr_clean / norms).astype(np.float32)

    # Forward-foot positive chroma rise on perceptual CQT chroma (before static subtraction so note attacks stay crisp)
    chr_for_flux = (cqt_mag.reshape(6, 12, T) * oct_weights).sum(axis=0)
    log_c = np.log1p(18.0 * chr_for_flux / (float(np.max(chr_for_flux)) + 1e-6))
    dlnco = np.zeros_like(log_c)
    if T > 5:
        rise_3 = np.maximum(0.0, log_c[:, 3:] - log_c[:, :-3])
        is_rising = (log_c[:, 2:-1] > log_c[:, :-3]).astype(np.float32)
        dlnco[:, :-3] = rise_3 * is_rising

    win_loc = max(9, int(round(1.8 / hop_sec)))
    dlnco_sm = scipy.ndimage.gaussian_filter1d(dlnco, sigma=1.4, axis=1)
    dlnco_floor = float(np.percentile(dlnco_sm, 82)) * 0.48 + 1e-5
    dlnco_max = np.maximum(
        np.maximum(
            scipy.ndimage.maximum_filter1d(dlnco_sm, size=win_loc, axis=1),
            np.max(dlnco_sm, axis=0, keepdims=True) * 0.35,
        ),
        dlnco_floor,
    )
    dlnco_norm = np.clip(dlnco_sm / dlnco_max, 0.0, 1.0).astype(np.float32)

    onset_sm = scipy.ndimage.gaussian_filter1d(onset_raw, sigma=1.3)
    ons_floor = max(0.65, float(np.percentile(onset_sm, 72)) * 0.55)
    loc_max = np.maximum(scipy.ndimage.maximum_filter1d(onset_sm, size=win_loc), ons_floor) + 1e-6
    onset_norm = np.clip(onset_sm / loc_max, 0.0, 1.0).astype(np.float32)

    # Silence & Simultaneous Release/Cutoff Cliff channels (immune to hall reverb tails!)
    rms_f = librosa.feature.rms(y=audio_22k, frame_length=1024, hop_length=hop_length, center=True)[0][:T].astype(np.float32)
    sil_thresh = max(float(np.percentile(rms_f, 3)) * 1.8, float(np.max(rms_f)) * 0.009)
    a_sil = np.clip(1.0 - rms_f / (sil_thresh + 1e-6), 0.0, 1.0).astype(np.float32)
    chroma *= (1.0 - 0.80 * a_sil)[None, :]
    reg_norm *= (1.0 - 0.80 * a_sil)[None, :]

    log_rms = np.log1p(35.0 * scipy.ndimage.gaussian_filter1d(rms_f, sigma=1.5) / (float(np.max(rms_f)) + 1e-6))
    a_rel = np.zeros(T, dtype=np.float32)
    if T > 14:
        a_rel[:-12] = np.maximum(0.0, log_rms[:-12] - log_rms[12:])
    arel_floor = max(0.22, float(np.percentile(a_rel, 85)) * 0.60)
    arel_max = np.maximum(scipy.ndimage.maximum_filter1d(a_rel, size=win_loc), arel_floor) + 1e-6
    a_rel_norm = np.clip(a_rel / arel_max, 0.0, 1.0).astype(np.float32)

    return chroma, reg_norm, dlnco_norm, onset_norm, a_sil, a_rel_norm, onset_raw, stft_mag


def banded_dtw(feat_s: np.ndarray, feat_a: np.ndarray, center_a_for_s: np.ndarray, radius: int) -> tuple[np.ndarray, np.ndarray]:
    """
    Fast Sakoe-Chiba / Corridor Banded DTW around `center_a_for_s` (shape Ts,) at 11.61ms resolution!
    feat_s: (D, Ts), feat_a: (D, Ta) both L2-normalized per column -> cosine distance = 1 - dot(s, a).
    """
    Ts = feat_s.shape[1]
    Ta = feat_a.shape[1]
    INF = 1e12

    W_band = 2 * radius + 1
    dp = np.full((Ts, W_band), INF, dtype=np.float64)
    back = np.zeros((Ts, W_band), dtype=np.int8)

    # Initialize s = 0, pinning the first score frame near c0 so DTW never skips the opening bars!
    c0 = int(center_a_for_s[0])
    start_tol = max(6, radius // 8)
    for off in range(-start_tol, start_tol + 1):
        a = c0 + off
        if 0 <= a < Ta:
            cost = max(0.0, 1.0 - float(np.dot(feat_s[:, 0], feat_a[:, a])))
            dp[0, off + radius] = cost + abs(off) * 0.35

    for s in range(1, Ts):
        cs = int(center_a_for_s[s])
        cs_prev = int(center_a_for_s[s - 1])
        a_lo = max(0, cs - radius)
        a_hi = min(Ta - 1, cs + radius)
        if a_lo > a_hi:
            continue

        # Vectorized cosine cost across active band [a_lo .. a_hi]
        dots = feat_s[:, s] @ feat_a[:, a_lo : a_hi + 1]
        costs = np.maximum(0.0, 1.0 - dots)

        for idx_a, a in enumerate(range(a_lo, a_hi + 1)):
            b_idx = (a - cs) + radius
            c_step = float(costs[idx_a])

            # 1. Diagonal (s-1, a-1)
            best_v = INF
            best_move = 0
            off_prev_diag = (a - 1) - cs_prev + radius
            if 0 <= off_prev_diag < W_band:
                v_diag = dp[s - 1, off_prev_diag] + c_step
                if v_diag < best_v:
                    best_v = v_diag
                    best_move = 0

            # 2. Vertical (s-1, a) — score faster than audio
            off_prev_vert = a - cs_prev + radius
            if 0 <= off_prev_vert < W_band:
                v_vert = dp[s - 1, off_prev_vert] + c_step * 1.06
                if v_vert < best_v:
                    best_v = v_vert
                    best_move = 1

            # 3. Horizontal (s, a-1) — audio slower than score
            if b_idx - 1 >= 0:
                v_horiz = dp[s, b_idx - 1] + c_step * 1.06
                if v_horiz < best_v:
                    best_v = v_horiz
                    best_move = 2

            dp[s, b_idx] = best_v
            back[s, b_idx] = best_move

    # Backtrack from s = Ts - 1, pinning the final score frame near Ta - 1 so DTW never abandons the ending
    end_tol = max(8, radius // 6)
    b_lo = max(0, (Ta - 1 - end_tol) - int(center_a_for_s[Ts - 1]) + radius)
    b_hi = min(W_band, (Ta - 1 + end_tol) - int(center_a_for_s[Ts - 1]) + radius + 1)
    if b_lo < b_hi and float(np.min(dp[Ts - 1, b_lo:b_hi])) < 1e14:
        end_b = b_lo + int(np.argmin(dp[Ts - 1, b_lo:b_hi]))
    else:
        end_b = int(np.argmin(dp[Ts - 1]))
    s = Ts - 1
    a = int(center_a_for_s[s]) + (end_b - radius)
    path_s = []
    path_a = []

    while s >= 0:
        path_s.append(s)
        path_a.append(a)
        b_idx = (a - int(center_a_for_s[s])) + radius
        if s == 0 or not (0 <= b_idx < W_band):
            break
        mv = int(back[s, b_idx])
        if mv == 0:
            s -= 1
            a -= 1
        elif mv == 1:
            s -= 1
        else:
            a -= 1

    path_s.reverse()
    path_a.reverse()
    return np.array(path_s, dtype=np.int32), np.array(path_a, dtype=np.int32)


RIGID_CLOCK = {"rate": 0.0, "off": 0.0}  # set by align_score_to_audio: how well the recording follows the score clock


def align_score_to_audio(all_staves: list[dict], drum_notes: list[dict], audio_22k: np.ndarray):
    """
    Computes a drift-free, rubato-tracking warping function W(t_score) -> t_audio at 11.61ms precision,
    plus auto-detects any global key transposition between Score and Recording!
    """
    hop = 256
    dt = hop / 22050.0  # 0.01161s
    score_dur = max(n["end"] for st in all_staves for n in st["notes"]) + 1.2

    print("  [3/4] Extracting CQT Chroma + Register + DLNCO Onsets & running 3-Stage Corridor DTW...")
    s_chr, s_reg, s_dlnco, s_ons, s_sil, s_rel = build_score_chroma_and_onset(all_staves, drum_notes, dt, score_dur)
    a_chr, a_reg, a_dlnco, a_ons, a_sil, a_rel, a_ons_raw, stft_mag = extract_audio_chroma_and_onset(audio_22k, hop_length=hop)

    # Trim leading/trailing silence on Score & Audio (leaving 28 frames ~325ms pre-attack pad for first transient
    # and 47 frames ~550ms post-release pad so the final chord sustain & release cliff align 1-to-1!)
    rms = librosa.feature.rms(y=audio_22k, frame_length=1024, hop_length=hop, center=True)[0]
    a_thresh = float(np.max(rms)) * 0.032
    a_active = np.where((rms >= a_thresh) | (a_ons_raw >= 3.5))[0]
    a_end_sound = np.where(rms >= float(np.max(rms)) * 0.22)[0]
    s_energy = np.sum(s_dlnco, axis=0) + s_ons
    s_active = np.where(s_energy > 0.05)[0]
    s_sounding = np.where((1.0 - s_sil) > 0.15)[0]
    pre_pad = min(8, int(s_active[0]) if len(s_active) else 0, int(a_active[0]) if len(a_active) else 0)
    a0 = max(0, int(a_active[0]) - pre_pad - 2) if len(a_active) else 0
    a1_raw = (
        int(a_active[-1])
        if (len(a_active) and len(a_end_sound) and (int(a_active[-1]) - int(a_end_sound[-1])) * dt >= 3.0)
        else (int(a_end_sound[-1]) if len(a_end_sound) else (int(a_active[-1]) if len(a_active) else a_chr.shape[1] - 1))
    )
    a1 = min(a_chr.shape[1] - 1, a1_raw + int(round(0.55 / dt)))
    s0 = max(0, int(s_active[0]) - pre_pad) if len(s_active) else 0
    s1_raw = int(s_sounding[-1]) if len(s_sounding) else (int(s_active[-1]) if len(s_active) else s_chr.shape[1] - 1)
    s1 = min(s_chr.shape[1] - 1, s1_raw + int(round(0.55 / dt)))

    s_chr_sub = s_chr[:, s0 : s1 + 1]
    s_reg_sub = s_reg[:, s0 : s1 + 1]
    s_dln_sub = s_dlnco[:, s0 : s1 + 1]
    s_ons_sub = s_ons[s0 : s1 + 1]
    s_sil_sub = s_sil[s0 : s1 + 1]
    s_rel_sub = s_rel[s0 : s1 + 1]
    a_chr_sub = a_chr[:, a0 : a1 + 1]
    a_reg_sub = a_reg[:, a0 : a1 + 1]
    a_dln_sub = a_dlnco[:, a0 : a1 + 1]
    a_ons_sub = a_ons[a0 : a1 + 1]
    a_sil_sub = a_sil[a0 : a1 + 1]
    a_rel_sub = a_rel[a0 : a1 + 1]

    # Stage 1: Downsample by 8x (92.9ms hop) for Coarse Global DTW & Key-Transposition Check
    DS = 8
    def pool_ds(mat, k):
        n_out = mat.shape[-1] // k
        if mat.ndim == 1:
            return mat[: n_out * k].reshape(n_out, k).mean(axis=1)
        return mat[:, : n_out * k].reshape(mat.shape[0], n_out, k).mean(axis=2)

    sc_coarse = pool_ds(s_chr_sub, DS)
    sr_coarse = pool_ds(s_reg_sub, DS)
    sd_coarse = pool_ds(s_dln_sub, DS)
    so_coarse = pool_ds(s_ons_sub, DS)
    ss_coarse = pool_ds(s_sil_sub, DS)
    sx_coarse = pool_ds(s_rel_sub, DS)
    ac_coarse = pool_ds(a_chr_sub, DS)
    ar_coarse = pool_ds(a_reg_sub, DS)
    ad_coarse = pool_ds(a_dln_sub, DS)
    ao_coarse = pool_ds(a_ons_sub, DS)
    as_coarse = pool_ds(a_sil_sub, DS)
    ax_coarse = pool_ds(a_rel_sub, DS)

    def make_joint(chr_m, reg_m, dln_m, ons_v, sil_v, rel_v, reg_weight=0.52, dln_weight=0.72, ons_weight=0.38, sil_weight=0.62, rel_weight=0.38):
        joint = np.vstack([
            chr_m,
            reg_m * reg_weight,
            dln_m * dln_weight,
            ons_v[None, :] * ons_weight,
            sil_v[None, :] * sil_weight,
            rel_v[None, :] * rel_weight,
        ])
        return joint / (np.linalg.norm(joint, axis=0, keepdims=True) + 1e-6)

    fa_coarse = make_joint(ac_coarse, ar_coarse, ad_coarse, ao_coarse, as_coarse, ax_coarse)

    # Check global transposition (-5 .. +6 semitones) on 2x-coarser grid (~185ms) in <0.4s
    fa_super = fa_coarse[:, ::2]
    best_shift = 0
    best_cost = 1e18
    shift_costs = {}
    for sh in [0, -2, 2, -1, 1, -3, 3, -5, 5]:
        fs_sh = make_joint(np.roll(sc_coarse, sh, axis=0), sr_coarse, np.roll(sd_coarse, sh, axis=0), so_coarse, ss_coarse, sx_coarse)[:, ::2]
        cost_m = np.clip(1.0 - (fs_sh.T @ fa_super), 0.0, 2.0)
        D_mat, wp = librosa.sequence.dtw(C=cost_m)
        norm_cost = float(D_mat[-1, -1]) / max(1, len(wp))
        shift_costs[sh] = norm_cost
        if norm_cost < best_cost:
            best_cost = norm_cost
            best_shift = sh

    # Only adopt non-zero key shift if it beats shift=0 by a clear margin (>8% lower DTW distance)
    if best_shift != 0 and shift_costs[best_shift] < shift_costs[0] * 0.91:
        print(
            f"    [Key Auto-Match] Audio recording is transposed {best_shift:+d} semitones vs score "
            f"(dtw={shift_costs[best_shift]:.3f} vs {shift_costs[0]:.3f})!"
        )
    else:
        best_shift = 0

    fs_coarse = make_joint(
        np.roll(sc_coarse, best_shift, axis=0),
        sr_coarse,
        np.roll(sd_coarse, best_shift, axis=0),
        so_coarse,
        ss_coarse,
        sx_coarse,
    )
    cost_coarse = np.clip(1.0 - (fs_coarse.T @ fa_coarse), 0.0, 2.0)
    _, wp_coarse = librosa.sequence.dtw(
        C=cost_coarse,
        step_sizes_sigma=np.array([[1, 1], [0, 1], [1, 0]]),
        weights_mul=np.array([1.0, 1.05, 1.05]),
    )
    wp_coarse = wp_coarse[::-1]  # chronological [(s_idx, a_idx), ...]

    s_c_pts = wp_coarse[:, 0] * DS + (DS - 1) * 0.5
    a_c_pts = wp_coarse[:, 1] * DS + (DS - 1) * 0.5
    uniq_s, inv = np.unique(s_c_pts, return_inverse=True)
    avg_a = np.zeros_like(uniq_s, dtype=np.float64)
    cnt_a = np.zeros_like(uniq_s, dtype=np.float64)
    np.add.at(avg_a, inv, a_c_pts)
    np.add.at(cnt_a, inv, 1.0)
    avg_a /= cnt_a

    # Stage 2: Medium Banded DTW at DS_MID=3 (34.8ms hop) with wide ±3.8s corridor (radius=110) for rubato cadenzas!
    DS_MID = 3
    sc_mid = pool_ds(np.roll(s_chr_sub, best_shift, axis=0), DS_MID)
    sr_mid = pool_ds(s_reg_sub, DS_MID)
    sd_mid = pool_ds(np.roll(s_dln_sub, best_shift, axis=0), DS_MID)
    so_mid = pool_ds(s_ons_sub, DS_MID)
    ss_mid = pool_ds(s_sil_sub, DS_MID)
    sx_mid = pool_ds(s_rel_sub, DS_MID)
    ac_mid = pool_ds(a_chr_sub, DS_MID)
    ar_mid = pool_ds(a_reg_sub, DS_MID)
    ad_mid = pool_ds(a_dln_sub, DS_MID)
    ao_mid = pool_ds(a_ons_sub, DS_MID)
    as_mid = pool_ds(a_sil_sub, DS_MID)
    ax_mid = pool_ds(a_rel_sub, DS_MID)

    Ts_mid = sc_mid.shape[1]
    Ta_mid = ac_mid.shape[1]
    mid_s_in_fine = np.arange(Ts_mid) * DS_MID + (DS_MID - 1) * 0.5
    center_mid = np.interp(mid_s_in_fine, uniq_s, avg_a) / DS_MID
    center_mid = np.clip(np.round(center_mid), 0, Ta_mid - 1).astype(np.int32)

    fs_mid = make_joint(sc_mid, sr_mid, sd_mid, so_mid, ss_mid, sx_mid, reg_weight=0.50, dln_weight=0.82, ons_weight=0.42, sil_weight=0.62, rel_weight=0.40)
    fa_mid = make_joint(ac_mid, ar_mid, ad_mid, ao_mid, as_mid, ax_mid, reg_weight=0.50, dln_weight=0.82, ons_weight=0.42, sil_weight=0.62, rel_weight=0.40)
    ps_mid, pa_mid = banded_dtw(fs_mid, fa_mid, center_mid, radius=110)

    s_m_pts = ps_mid * DS_MID + (DS_MID - 1) * 0.5
    a_m_pts = pa_mid * DS_MID + (DS_MID - 1) * 0.5
    uniq_sm, inv_m = np.unique(s_m_pts, return_inverse=True)
    avg_am = np.zeros_like(uniq_sm, dtype=np.float64)
    cnt_am = np.zeros_like(uniq_sm, dtype=np.float64)
    np.add.at(avg_am, inv_m, a_m_pts)
    np.add.at(cnt_am, inv_m, 1.0)
    avg_am /= cnt_am

    # Stage 3: Fine Banded DTW at 11.61ms resolution within ±140 frames (±1.63s), high DLNCO weight for tight attacks!
    Ts_fine = s_chr_sub.shape[1]
    Ta_fine = a_chr_sub.shape[1]
    center_a = np.interp(np.arange(Ts_fine), uniq_sm, avg_am)
    center_a = np.clip(np.round(center_a), 0, Ta_fine - 1).astype(np.int32)

    fs_fine = make_joint(
        np.roll(s_chr_sub, best_shift, axis=0),
        s_reg_sub,
        np.roll(s_dln_sub, best_shift, axis=0),
        s_ons_sub,
        s_sil_sub,
        s_rel_sub,
        reg_weight=0.45,
        dln_weight=0.95,
        ons_weight=0.48,
        sil_weight=0.60,
        rel_weight=0.42,
    )
    fa_fine = make_joint(
        a_chr_sub,
        a_reg_sub,
        a_dln_sub,
        a_ons_sub,
        a_sil_sub,
        a_rel_sub,
        reg_weight=0.45,
        dln_weight=0.95,
        ons_weight=0.48,
        sil_weight=0.60,
        rel_weight=0.42,
    )
    ps_fine, pa_fine = banded_dtw(fs_fine, fa_fine, center_a, radius=140)

    # Convert frame indices back to absolute seconds: take MINIMUM audio frame per score onset frame
    # (when DTW dwells horizontally on a sustained note, the attack is the FIRST audio frame of that step!)
    uniq_sf = np.unique(ps_fine)
    first_af = np.zeros_like(uniq_sf, dtype=np.float64)
    # Since ps_fine is non-decreasing, np.searchsorted(..., side='left') gives the exact first audio frame!
    first_indices = np.searchsorted(ps_fine, uniq_sf, side="left")
    first_af = pa_fine[first_indices].astype(np.float64)

    # Light Gaussian smoothing (~45ms) + strict monotonicity enforcement
    sm_af = scipy.ndimage.gaussian_filter1d(first_af, sigma=2.0)
    sm_af = np.maximum.accumulate(sm_af)

    score_sec_knots = (s0 + uniq_sf) * dt
    audio_sec_knots = (a0 + sm_af) * dt

    s_full = np.concatenate([[0.0], score_sec_knots, [score_dur + 10.0]])
    slope_start = (audio_sec_knots[min(10, len(audio_sec_knots) - 1)] - audio_sec_knots[0]) / max(
        0.05, score_sec_knots[min(10, len(score_sec_knots) - 1)] - score_sec_knots[0]
    )
    a_at_zero = max(0.0, audio_sec_knots[0] - slope_start * score_sec_knots[0])
    a_full = np.concatenate([[a_at_zero], audio_sec_knots, [audio_sec_knots[-1] + 10.0]])
    s_unique, idx_u = np.unique(s_full, return_index=True)
    a_unique = np.maximum.accumulate(a_full[idx_u])

    warp_fn = scipy.interpolate.interp1d(s_unique, a_unique, kind="linear", fill_value="extrapolate")

    # Rigid-Clock Detection (sequenced/rendered game soundtracks, e.g. The Sound of Guthix):
    # When the recording runs on the exact score clock (audio length ~= score length and every score attack lands
    # on an audio onset at one constant latency), highly repetitive intros (identical drum bars) can make DTW collapse
    # whole sections tens of seconds early. If DTW strays > 1.0s from that rigid clock, trust the rigid clock instead!
    audio_dur_s = len(audio_22k) / 22050.0
    RIGID_CLOCK["rate"], RIGID_CLOCK["off"] = 0.0, 0.0
    if True:
        pk_frames = librosa.util.peak_pick(a_ons_raw, pre_max=3, post_max=3, pre_avg=5, post_avg=5, delta=0.8, wait=5)
        pk_secs = np.asarray(pk_frames, dtype=np.float64) * dt
        att_secs = np.array(sorted({round(float(n["start"]), 3) for st in all_staves for n in st["notes"]}), dtype=np.float64)
        if len(pk_secs) >= 20 and len(att_secs) >= 40:
            best_off, best_rate = 0.0, 0.0
            for off in np.arange(-0.30, 0.301, 0.005):
                idx_r = np.clip(np.searchsorted(pk_secs, att_secs + off), 1, len(pk_secs) - 1)
                d_r = np.minimum(np.abs(pk_secs[idx_r] - att_secs - off), np.abs(pk_secs[idx_r - 1] - att_secs - off))
                rate = float(np.mean(d_r <= 0.035))
                if rate > best_rate:
                    best_rate, best_off = rate, float(off)
            # (refine the latency to the nearest 0.5ms around the best 5ms step)
            for off in np.arange(best_off - 0.005, best_off + 0.0051, 0.0005):
                idx_r = np.clip(np.searchsorted(pk_secs, att_secs + off), 1, len(pk_secs) - 1)
                d_r = np.minimum(np.abs(pk_secs[idx_r] - att_secs - off), np.abs(pk_secs[idx_r - 1] - att_secs - off))
                rate = float(np.mean(d_r <= 0.035))
                if rate > best_rate:
                    best_rate, best_off = rate, float(off)
            RIGID_CLOCK["rate"], RIGID_CLOCK["off"] = best_rate, best_off
            s_probe = np.arange(0.0, score_dur - 1.2, 0.5)
            max_dev = float(np.max(np.abs(warp_fn(s_probe) - (s_probe + best_off)))) if len(s_probe) else 0.0
            if best_rate >= 0.40 and max_dev > 1.0:
                print(
                    f"    [Rigid Clock] Recording follows the score clock (+{best_off * 1000:.0f}ms, {best_rate * 100:.0f}% attacks matched); "
                    f"DTW strayed {max_dev:.1f}s -> using rigid clock warp."
                )
                warp_fn = scipy.interpolate.interp1d(
                    np.array([-10.0, score_dur + 10.0]),
                    np.array([-10.0 + best_off, score_dur + 10.0 + best_off]),
                    kind="linear",
                    fill_value="extrapolate",
                )
    return warp_fn, best_shift, rms, a_ons_raw, stft_mag, dt


# ==============================================================================
# 5. EXPORT .CADENZA.JSON SIDECAR
# ==============================================================================

def snap_to_local_transient(t_audio: float, a_ons_raw: np.ndarray, dt: float, max_snap_frames: int = 3) -> float:
    """Snaps percussion/impact onset within ±35ms onto exact broadband acoustic transient peak."""
    f = int(round(t_audio / dt))
    if f <= max_snap_frames or f >= len(a_ons_raw) - max_snap_frames - 1:
        return t_audio
    lo = f - max_snap_frames
    hi = f + max_snap_frames + 1
    win = a_ons_raw[lo:hi]
    pk_off = int(np.argmax(win))
    pk_val = float(win[pk_off])
    med_val = float(np.median(a_ons_raw[max(0, f - 20) : min(len(a_ons_raw), f + 20)])) + 1e-6
    if pk_val >= med_val * 1.55 and pk_val >= 0.8:
        return float((lo + pk_off) * dt)
    return t_audio


def snap_note_to_harmonic_onset(
    t_audio: float,
    midi: int,
    stft_mag: np.ndarray,
    a_ons_raw: np.ndarray,
    dt: float,
    t_min: float,
    t_max: float,
    max_snap_frames: int = 9,
) -> float:
    """
    Snaps a warped score note (within ±105ms, clamped to [t_min, t_max]) onto the exact acoustic
    breath/bow attack foot of its specific harmonic stack (f0, 2f0, 3f0, 4f0).
    """
    T = stft_mag.shape[1]
    n_bins = stft_mag.shape[0]
    bin_hz = 22050.0 / 2048.0
    f_center = int(round(t_audio / dt))
    lo = max(2 if t_min < 0.03 else 3, int(np.ceil(t_min / dt)), f_center - max_snap_frames)
    hi = min(T - 5, int(np.floor(t_max / dt)), f_center + max_snap_frames)
    if lo >= hi:
        return float(np.clip(t_audio, t_min, max(t_min, t_max)))

    f0_hz = 440.0 * (2.0 ** ((midi - 69) / 12.0))
    ctx_lo = max(0, lo - 12)
    ctx_hi = min(T, hi + 12)

    harm_env = np.zeros(ctx_hi - ctx_lo, dtype=np.float32)
    for h_idx, h_w in [(1, 1.0), (2, 0.72), (3, 0.48), (4, 0.30)]:
        b_c = int(round((f0_hz * h_idx) / bin_hz))
        if 2 <= b_c < n_bins - 2:
            band = np.max(stft_mag[b_c - 1 : b_c + 2, ctx_lo:ctx_hi], axis=0)
            harm_env += h_w * np.log1p(25.0 * band)

    # Forward-foot harmonic rise: peaks right at the foot where the target note begins sounding!
    L = len(harm_env)
    atk = np.zeros(L, dtype=np.float32)
    if L > 4:
        rise = np.maximum(0.0, harm_env[3:] - harm_env[:-3])
        slope_pos = (harm_env[2:-1] > harm_env[:-3]).astype(np.float32)
        atk[:-3] = rise * slope_pos

    med_atk = float(np.median(atk)) + 1e-5
    w_lo = lo - ctx_lo
    w_hi = hi - ctx_lo + 1
    cand_atk = atk[w_lo:w_hi] / med_atk

    # Combine pitch-specific harmonic rise + gentle broadband onset + Gaussian proximity prior around f_center
    offs = np.arange(lo, hi + 1) - f_center
    prox = np.exp(-0.5 * (offs / 5.5) ** 2)
    bb = a_ons_raw[lo : hi + 1] / (float(np.median(a_ons_raw[ctx_lo:ctx_hi])) + 1e-5)
    if midi <= 54:
        combined = bb * (0.72 + 0.28 * prox)
    else:
        combined = (cand_atk + 0.25 * bb) * (0.65 + 0.35 * prox)

    best_idx = int(np.argmax(combined))
    if (midi <= 54 and bb[best_idx] >= 1.42) or cand_atk[best_idx] >= 1.45 or bb[best_idx] >= 1.65:
        return float((lo + best_idx) * dt)
    return t_audio


def compute_macro_profiles(mix_rms: np.ndarray, frame_dt: float, duration: float):
    win = max(3, int(round(1.4 / frame_dt)))
    sm = np.log1p(18.0 * scipy.ndimage.uniform_filter1d(mix_rms, size=win))
    p_lo = float(np.percentile(sm, 6))
    p_hi = float(np.percentile(sm, 98.5))
    macro = np.clip((sm - p_lo) / max(1e-5, p_hi - p_lo), 0.0, 1.0)

    elev = [round(float(chunk.mean()), 4) for chunk in np.array_split(macro, 240)]
    macro_hz = 10
    n_out = max(1, int(round(duration * macro_hz)))
    macro_10hz = [round(float(chunk.mean()), 4) for chunk in np.array_split(macro, n_out)]
    return elev, macro_hz, macro_10hz


def process_pair(audio_path: Path, score_path: Path, out_path: Path | None = None):
    t_begin = time.time()
    print(f"\n=== Syncing Score '{score_path.name}' -> Audio '{audio_path.name}' ===")

    audio_22k, duration = load_mono_22k(audio_path)
    print(f"  [1/4] Parsing score ({score_path.suffix}) & consolidating instrument staves...")
    raw_staves = load_any_score(score_path)
    staves, drum_notes = consolidate_and_harmonize_staves(raw_staves)
    # Notes the score reader drops from a part (<song>_corrections.json "missing_notes", score seconds, confirmed by ear):
    # added to that part before anything reads the score.
    corr_notes = Path(__file__).with_name(f"{score_path.stem.lower()}_corrections.json")
    if corr_notes.exists():
        for mn in json.loads(corr_notes.read_text(encoding="utf-8")).get("missing_notes", []):
            st_m = next((st for st in staves if st["name"] == mn["staff"]), None)
            if st_m is None:
                continue
            tmpl = min(st_m["notes"], key=lambda x: abs(float(x["start"]) - float(mn["start"])), default={})
            st_m["notes"].append(dict(tmpl, start=float(mn["start"]), end=float(mn["end"]), midi=int(mn["midi"])))
            st_m["notes"].sort(key=lambda x: float(x["start"]))
    score_dur = max(n["end"] for st in staves for n in st["notes"])
    print(f"    -> {len(staves)} melodic staves, {len(drum_notes)} percussion events, score_dur={score_dur:.1f}s")

    print("  [2/4] Conducting Lead-Melody voice handoffs across score staves...")
    lead_score_notes = conduct_lead_melody_from_score(staves, score_dur)

    _ctx = _SimpleNamespace(
        staves=staves, raw_staves=raw_staves, score_duration=score_dur, score_path=score_path, lead_notes=lead_score_notes, drum_passages=[]
    )
    _run_after_pick(_ctx)
    lead_score_notes, drum_passages = _ctx.lead_notes, _ctx.drum_passages

    staff_counts = Counter(n["staff"] for n in lead_score_notes)
    top_staves = ", ".join(f"{k}({v})" for k, v in staff_counts.most_common(6))
    print(f"    -> Selected {len(lead_score_notes)} lead score notes | Top voices: {top_staves}")

    warp_fn, key_shift, mix_rms, a_ons_raw, stft_mag, dt = align_score_to_audio(staves, drum_notes, audio_22k)

    _ns = {**globals(), **locals()}
    _run_timing(_ns)


def main():
    parser = argparse.ArgumentParser(
        description="Sync a MIDI / MuseScore (.mscz) / MusicXML (.mxl/.musicxml) score to an audio recording."
    )
    parser.add_argument("audio", help="Path to audio file (.mp3, .m4a, .flac, .wav, .ogg)")
    parser.add_argument("score", help="Path to score file (.mid, .midi, .mscz, .mscx, .mxl, .musicxml, .xml)")
    parser.add_argument("-o", "--output", help="Optional output .cadenza.json path")
    args = parser.parse_args()
    process_pair(Path(args.audio), Path(args.score), Path(args.output) if args.output else None)


if __name__ == "__main__":
    main()
