#!/usr/bin/env python3
"""
CADENZA — Exact Vector SMuFL / Finale Conductor Score PDF Parser

Reads vector Finale/SMuFL PDFs (such as Hal Leonard / Music Works full conductor scores) directly
from PDF graphics streams and SMuFL `/Differences` font encodings with 0.01pt coordinate accuracy:
  - Extracts all 5-line pitched staves and 1-line/5-line percussion staves per page
  - Tracks exact CTM (Current Transformation Matrix) for lines, stems, beam polygons, ties & glyphs
  - Decodes clefs, key signatures, time signatures, accidentals, noteheads, flags, beams, dots,
    trills (`uniE566` / `uniEAA4`), ties, and `%` 1-bar/2-bar repeat signs (`uniE500` / `uniE501`)
  - Converts transposing band instruments (Bb Clarinet, Bass Clarinet, Alto Flute, F Horn, Piccolo)
    into exact Concert MIDI Pitch and outputs standard Cadenza score staves + percussion events.
"""

from __future__ import annotations

import math
import re
import zlib
from collections import defaultdict
from pathlib import Path
import numpy as np
import scipy.interpolate


# Diatonic C-major scale semitones from C0 (step 0 = C0 -> MIDI 12)
_DIATONIC_SEMI = [0, 2, 4, 5, 7, 9, 11]

# Bottom-line (line 0) diatonic step from C0:
#   Treble (E4): 4 * 7 + 2 = 30 (MIDI 64)
#   Alto   (F3): 3 * 7 + 3 = 24 (MIDI 53)
#   Bass   (G2): 2 * 7 + 4 = 18 (MIDI 43)
_CLEF_BASE_STEP = {
    "treble": 30,
    "alto": 24,
    "bass": 18,
}


def _step_to_midi(abs_step: int, alter: int = 0) -> int:
    oct_n, deg = divmod(abs_step, 7)
    return (oct_n + 1) * 12 + _DIATONIC_SEMI[deg] + alter


def _canonicalize_staff_label(raw_label: str) -> tuple[str, int, bool]:
    """Returns (canonical_name, concert_transposition_semitones, is_percussion)."""
    s = re.sub(r"\s+", " ", raw_label).strip()
    sl = s.lower()

    if any(k in sl for k in ["perc. 3", "percussion 3", "perc. 4", "percussion 4"]):
        return ("Mallet Perc", 0, False)
    if any(k in sl for k in ["perc", "timp", "drum", "darabuka", "conga", "tambourine", "cym"]):
        if "mllt" in sl or "mallet" in sl:
            return ("Mallet Perc", 0, False)
        name = "Timpani" if "timp" in sl else "Percussion"
        return (name, 0, True)
    if "mllt" in sl or "mallet" in sl:
        return ("Mallet Perc", 0, False)
    if "flugel" in sl or "fl. hn" in sl:
        if "2" in sl or "3" in sl:
            return ("Bb Flugel Horn 2, 3", -2, False)
        return ("Bb Flugel Horn 1", -2, False)
    if "s. sax" in sl or "soprano sax" in sl:
        return ("Bb Soprano Sax", -2, False)
    if "a. sax" in sl or "alto sax" in sl:
        return ("Eb Alto Sax 1, 2", -9, False)
    if "t. sax" in sl or "tenor sax" in sl:
        return ("Bb Tenor Sax", -14, False)
    if "b. sax" in sl or "baritone sax" in sl:
        return ("Eb Baritone Sax", -21, False)
    if "cnt" in sl or "cornet" in sl:
        if "eb" in sl or sl.startswith("e "):
            return ("Eb Cornet", 3, False)
        return ("Cornet", -2, False)
    if "picc" in sl:
        return ("Piccolo", 12, False)
    if "a. fl" in sl or "alto flute" in sl:
        return ("Alto Flute", -5, False)
    if "b. fl" in sl or "bass flute" in sl:
        return ("Bass Flute", -12, False)
    if "fl" in sl:
        return ("Flute 1, 2", 0, False)
    if "ob" in sl:
        return ("Oboe 1, 2", 0, False)
    if "b. cl" in sl or "bass cl" in sl:
        return ("Bass Clarinet", -14, False)
    if "cl" in sl:
        return ("Bb Clarinet 1, 2", -2, False)
    if "bsn" in sl or "bassoon" in sl:
        return ("Bassoon 1, 2", 0, False)
    if "hn" in sl or "horn" in sl:
        if "3" in sl or "4" in sl:
            return ("F Horn 3, 4", -7, False)
        return ("F Horn 1, 2", -7, False)
    if "tpt" in sl or "trumpet" in sl:
        if "c tpt" in sl or "c trumpet" in sl:
            return ("C Trumpet 1, 2", 0, False)
        if ("2" in sl or "3" in sl) and "1" not in sl:
            return ("Trumpet 2, 3", -2, False)
        return ("Trumpet 1, 2", -2, False)
    if "b. tbn" in sl or "bass tbn" in sl or "bs. tbn" in sl or "bass trombone" in sl:
        return ("Bass Trombone", 0, False)
    if "tbn" in sl or "trombone" in sl:
        return ("Trombone 1, 2", 0, False)
    if "bar." in sl or "baritone" in sl:
        if "2" in sl:
            return ("Bb Baritone 2", -14, False)
        return ("Bb Baritone 1", -14, False)
    if "euph" in sl:
        return ("Bb Euphonium", -2, False)
    if "eb bs" in sl or "eb bass" in sl or "e b bass" in sl or "e b bs" in sl or sl in ("e bass", "e bs."):
        return ("Eb Bass", -9, False)
    if "bb bs" in sl or "bb bass" in sl or "b b bass" in sl or "b b bs" in sl or sl in ("b bass", "b bs."):
        return ("Bb Bass", -14, False)
    if "tuba" in sl:
        return ("Tuba", 0, False)
    if "vln. i" in sl or "violin i" in sl:
        if "ii" in sl:
            return ("Violin II", 0, False)
        return ("Violin I", 0, False)
    if "vla" in sl or "viola" in sl:
        return ("Viola", 0, False)
    if "vc" in sl or "cello" in sl:
        return ("Cello", 0, False)
    if "d.b" in sl or "double bass" in sl:
        return ("Double Bass", -12, False)
    return (s or "Instrument", 0, False)


def _mat_mul(m1: tuple, m2: tuple) -> tuple:
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (
        a1 * a2 + b1 * c2,
        a1 * b2 + b1 * d2,
        c1 * a2 + d1 * c2,
        c1 * b2 + d1 * d2,
        e1 * a2 + f1 * c2 + e2,
        e1 * b2 + f1 * d2 + f2,
    )


def _apply_ctm(ctm: tuple, x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = ctm
    return (a * x + c * y + e, b * x + d * y + f)


def _unescape_pdf_str(s: str) -> bytes:
    out = bytearray()
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if ch == "\\" and i + 1 < n:
            nxt = s[i + 1]
            if nxt in "01234567":
                oct_s = s[i + 1 : i + 4]
                m = re.match(r"[0-7]{1,3}", oct_s)
                val = int(m.group(0), 8)
                out.append(val & 0xFF)
                i += 1 + len(m.group(0))
                continue
            elif nxt == "n":
                out.append(10)
            elif nxt == "r":
                out.append(13)
            elif nxt == "t":
                out.append(9)
            else:
                out.append(ord(nxt))
            i += 2
        else:
            out.append(ord(ch) & 0xFF)
            i += 1
    return bytes(out)


def _parse_pdf_objects(pdf_path: Path) -> tuple[dict[int, tuple[bytes, bytes | None]], list[tuple[int, str]]]:
    raw = pdf_path.read_bytes()
    objs = {}
    for m in re.finditer(rb"(\d+)\s+0\s+obj\b(.*?)endobj", raw, re.DOTALL):
        onum = int(m.group(1))
        body = m.group(2)
        sm = re.search(rb"stream\r?\n(.*?)\r?\nendstream", body, re.DOTALL)
        dec = None
        if sm:
            try:
                dec = zlib.decompress(sm.group(1))
            except Exception:
                dec = sm.group(1)
            hdr = body[: sm.start()]
        else:
            hdr = body
        objs[onum] = (hdr, dec)

    pages = []
    for onum, (hdr, _) in sorted(objs.items()):
        htxt = hdr.decode("latin1", "ignore")
        if re.search(r"/Type\s*/Page\b", htxt) and not re.search(r"/Type\s*/Pages\b", htxt):
            pages.append((onum, htxt))
    return objs, pages


def _get_page_fonts(objs: dict, res_num: int) -> dict[str, tuple[str, dict[int, str]]]:
    rhdr = objs[res_num][0].decode("latin1", "ignore")
    fm = re.search(r"/Font\s*(?:(\d+)\s+0\s+R|<<(.*?)>>)", rhdr, re.DOTALL)
    if not fm:
        return {}
    fdict_txt = objs[int(fm.group(1))][0].decode("latin1", "ignore") if fm.group(1) else fm.group(2)
    fmap = {}
    for fname, fobj_s in re.findall(r"/(\w+)\s+(\d+)\s+0\s+R", fdict_txt):
        fhdr = objs[int(fobj_s)][0].decode("latin1", "ignore")
        bf_m = re.search(r"/BaseFont\s*/([^\s/>]+)", fhdr)
        bf = bf_m.group(1) if bf_m else fname
        enc = {}
        dm = re.search(r"/Differences\s*\[(.*?)\]", fhdr, re.DOTALL)
        if dm:
            cur_code = 0
            for tok in re.findall(r"(\d+|/[A-Za-z0-9_.]+)", dm.group(1)):
                if tok.startswith("/"):
                    enc[cur_code] = tok[1:]
                    cur_code += 1
                else:
                    cur_code = int(tok)
        fmap[fname] = (bf, enc)
    return fmap


_TOKEN_RE = re.compile(
    r"\((?:\\.|[^\\()])*\)|\[|\]|/[A-Za-z0-9_.-]+|[+-]?(?:\d+\.?\d*|\.\d+)|[A-Za-z*']+"
)


def _extract_page_primitives(stream_txt: str, fmap: dict):
    """
    Executes a lightweight PDF graphics state machine over `stream_txt` so ALL coordinates
    (lines, stems, filled beam polygons, tie curves, SMuFL glyphs, and text labels) are in exact points!
    """
    ctm = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    stack = []
    cur_path = []
    in_text = False
    tm = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    cur_font = ""
    cur_fsize = 12.0

    lines = []      # (x1, y1, x2, y2)
    beams = []      # (x_min, x_max, y_mid)
    curves = []     # (x_start, y_start, x_end, y_end) -> ties/slurs!
    smufl = []      # (x, y, glyph_name, fsize_pt)
    texts = []      # (x, y, text_str, fsize_pt)

    operands = []
    for m in _TOKEN_RE.finditer(stream_txt):
        tok = m.group(0)
        c0 = tok[0]
        if c0 in "+-.0123456789":
            try:
                operands.append(float(tok))
                continue
            except ValueError:
                pass
        if c0 in "(/[" or tok == "]":
            operands.append(tok)
            continue

        # Operator!
        op = tok
        if op == "q":
            stack.append((ctm, cur_font, cur_fsize))
        elif op == "Q":
            if stack:
                ctm, cur_font, cur_fsize = stack.pop()
        elif op == "cm" and len(operands) >= 6:
            m_new = tuple(float(x) for x in operands[-6:])
            ctm = _mat_mul(m_new, ctm)
        elif op == "BT":
            in_text = True
            tm = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
        elif op == "ET":
            in_text = False
        elif op == "Tm" and len(operands) >= 6:
            tm = tuple(float(x) for x in operands[-6:])
        elif op == "Td" and len(operands) >= 2:
            tx, ty = float(operands[-2]), float(operands[-1])
            tm = _mat_mul((1.0, 0.0, 0.0, 1.0, tx, ty), tm)
        elif op == "Tf" and len(operands) >= 2:
            fn_tok = str(operands[-2])
            cur_font = fn_tok[1:] if fn_tok.startswith("/") else fn_tok
            cur_fsize = float(operands[-1])
        elif op in ("Tj", "TJ") and in_text:
            full_m = _mat_mul(tm, ctm)
            x_pt, y_pt = full_m[4], full_m[5]
            eff_fs = abs(full_m[0]) * cur_fsize
            bf, enc = fmap.get(cur_font, (cur_font, {}))

            # Collect string literals inside operands
            str_Literals = re.findall(r"\((?:\\.|[^\\()])*\)", " ".join(str(o) for o in operands))
            raw_bytes = b"".join(_unescape_pdf_str(sl[1:-1]) for sl in str_Literals)

            if "FinaleMaestro" in bf:
                for b_val in raw_bytes:
                    gn = enc.get(b_val)
                    if gn:
                        smufl.append((x_pt, y_pt, gn, eff_fs))
            else:
                txt_s = raw_bytes.decode("mac_roman", errors="ignore").strip()
                if txt_s:
                    texts.append((x_pt, y_pt, txt_s, eff_fs))
        elif op == "m" and len(operands) >= 2:
            pt = _apply_ctm(ctm, float(operands[-2]), float(operands[-1]))
            cur_path = [("m", pt)]
        elif op == "l" and len(operands) >= 2:
            pt = _apply_ctm(ctm, float(operands[-2]), float(operands[-1]))
            cur_path.append(("l", pt))
        elif op == "c" and len(operands) >= 6:
            pt_end = _apply_ctm(ctm, float(operands[-2]), float(operands[-1]))
            cur_path.append(("c", pt_end))
        elif op == "S":
            if len(cur_path) == 2 and cur_path[0][0] == "m" and cur_path[1][0] == "l":
                (x1, y1), (x2, y2) = cur_path[0][1], cur_path[1][1]
                lines.append((x1, y1, x2, y2))
            cur_path = []
        elif op in ("f", "f*", "B", "B*"):
            has_curve = any(cmd == "c" for cmd, _ in cur_path)
            pts = [pt for _, pt in cur_path]
            if has_curve and len(pts) >= 2:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                x_min_i = int(np.argmin(xs))
                x_max_i = int(np.argmax(xs))
                if xs[x_max_i] - xs[x_min_i] >= 3.0:
                    curves.append((xs[x_min_i], ys[x_min_i], xs[x_max_i], ys[x_max_i]))
            elif len(pts) >= 4:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                w = max(xs) - min(xs)
                h = max(ys) - min(ys)
                # Music beam polygon: width >= 2.2pt, vertical thickness <= 9pt
                if w >= 2.2 and 0.4 <= h <= 9.5:
                    beams.append((min(xs), max(xs), 0.5 * (min(ys) + max(ys))))
            cur_path = []
        elif op == "n":
            cur_path = []

        operands.clear()

    return lines, beams, curves, smufl, texts


_OPUS_TO_SMUFL = {
    "&": "uniE050",   # Treble clef
    "?": "uniE062",   # Bass clef
    "/": "uniE069",   # Percussion clef
    "b": "uniE260",   # Flat
    "n": "uniE261",   # Natural
    "#": "uniE262",   # Sharp
    "w": "uniE0A2",   # Whole notehead
    "˙": "uniE0A3",   # Half notehead
    "œ": "uniE0A4",   # Quarter/filled notehead
    "¿": "uniE0AA",   # X-notehead (percussion)
    "j": "uniE240",   # 8th flag up
    "J": "uniE241",   # 8th flag down
    "r": "uniE242",   # 16th flag up
    "R": "uniE243",   # 16th flag down
    "Ÿ": "uniE566",   # Trill
    ".": "uniE4A2",   # Staccato
    "∑": "uniE4E3",   # Whole/bar rest
    "Ó": "uniE4E4",   # Half rest
    "Œ": "uniE4E5",   # Quarter rest
    "‰": "uniE4E6",   # Eighth rest
    "≈": "uniE4E7",   # 16th rest
    "0": "uniE080",
    "1": "uniE081",
    "2": "uniE082",
    "3": "uniE083",
    "4": "uniE084",
    "5": "uniE085",
    "6": "uniE086",
    "7": "uniE087",
    "8": "uniE088",
    "9": "uniE089",
}


def _extract_fitz_opus_pages(pdf_path: Path) -> list[tuple[list, list, list, list, list]]:
    """
    Extracts logical score pages from encrypted or 2-up Sibelius/Opus vector PDFs via PyMuPDF (`fitz`),
    converting coordinates to bottom-up PDF points and Opus glyphs to SMuFL equivalents.
    """
    import fitz

    doc = fitz.open(str(pdf_path))
    logical_pages = []
    for pno in range(len(doc)):
        page = doc[pno]
        W = float(page.rect.width)
        H = float(page.rect.height)
        halves = [(0.0, 0.5 * W), (0.5 * W, W)] if W > 1000.0 else [(0.0, W)]
        p_drawings = page.get_drawings()
        raw = page.get_text("rawdict")

        for x_lo, x_hi in halves:
            lines = []
            beams = []
            curves = []
            smufl = []
            texts = []

            for d in p_drawings:
                r = d["rect"]
                if r.x1 < x_lo or r.x0 >= x_hi:
                    continue
                fill = d.get("fill")
                if fill is not None and len(fill) >= 3 and all(c > 0.95 for c in fill[:3]):
                    continue  # Ignore white background mask boxes behind time signatures
                items = d["items"]
                has_c = any(it[0] == "c" for it in items)
                if has_c:
                    pts = []
                    for it in items:
                        if it[0] == "c":
                            pts.append(it[1])
                            pts.append(it[4])
                        elif it[0] == "l":
                            pts.append(it[1])
                            pts.append(it[2])
                    if len(pts) >= 2:
                        p_min = min(pts, key=lambda p: p.x)
                        p_max = max(pts, key=lambda p: p.x)
                        if p_max.x - p_min.x >= 3.0:
                            curves.append((p_min.x - x_lo, H - p_min.y, p_max.x - x_lo, H - p_max.y))
                elif d["type"] in ("f", "fs") and len(items) >= 3 and all(it[0] == "l" for it in items):
                    xs = [it[1].x - x_lo for it in items] + [items[-1][2].x - x_lo]
                    ys = [H - it[1].y for it in items] + [H - items[-1][2].y]
                    w = max(xs) - min(xs)
                    h = max(ys) - min(ys)
                    if w >= 1.8 and 0.3 <= h <= 6.5:
                        beams.append((min(xs), max(xs), 0.5 * (min(ys) + max(ys))))
                else:
                    for it in items:
                        if it[0] == "l":
                            p1, p2 = it[1], it[2]
                            lines.append((p1.x - x_lo, H - p1.y, p2.x - x_lo, H - p2.y))

            for b in raw["blocks"]:
                for l in b.get("lines", []):
                    for s in l.get("spans", []):
                        fn = s["font"]
                        fs = float(s["size"])
                        chars = s.get("chars", [])
                        if not chars:
                            continue
                        ox0 = chars[0]["origin"][0]
                        if ox0 < x_lo or ox0 >= x_hi:
                            continue
                        if "OpusStd" in fn:
                            for c in chars:
                                ch = c["c"]
                                gn = _OPUS_TO_SMUFL.get(ch)
                                if gn:
                                    cx, cy = c["origin"]
                                    smufl.append((cx - x_lo, H - cy, gn, fs))
                        elif "OpusSpecialStd" in fn:
                            for c in chars:
                                ch = c["c"]
                                if ch == "™":
                                    cx, cy = c["origin"]
                                    smufl.append((cx - x_lo, H - cy, "uniE1E7", fs))
                                elif ch == "%":
                                    cx, cy = c["origin"]
                                    smufl.append((cx - x_lo, H - cy, "uniE500", fs))
                        elif "OpusTextStd" in fn:
                            for c in chars:
                                ch = c["c"]
                                cx, cy = c["origin"]
                                if ch == "b" and (cx - x_lo) < 95.0:
                                    texts.append((cx - x_lo, H - cy, "b", fs))
                                elif ch == "q":
                                    texts.append((cx - x_lo, H - cy, "q", fs))
                        else:
                            txt_s = "".join(c["c"] for c in chars).strip()
                            if txt_s:
                                cx, cy = chars[0]["origin"]
                                texts.append((cx - x_lo, H - cy, txt_s, fs))

            logical_pages.append((lines, beams, curves, smufl, texts))
    return logical_pages


def _parse_flat_json_score(flat_json_path: Path) -> list[dict]:
    """
    Parses a Flat.io Adagio MusicXML-in-JSON score (.flat.json) into standard Cadenza staves.
    """
    import json

    raw = json.loads(flat_json_path.read_text(encoding="utf-8"))
    sp = raw["score-partwise"]
    parts_meta = {p["$id"]: p.get("part-name", "").strip() for p in sp["part-list"]["score-part"]}
    parts = sp["part"]
    if not parts:
        return []

    n_measures = len(parts[0]["measure"])
    meas_start_sec = [0.0] * n_measures
    meas_sec_per_q = [60.0 / 120.0] * n_measures

    cur_q_per_bar = 4.0
    cur_bpm = 120.0
    cur_t = 0.0
    for m_idx in range(n_measures):
        for p in parts:
            if m_idx >= len(p["measure"]):
                continue
            m = p["measure"][m_idx]
            attrs = m.get("attributes", [])
            if isinstance(attrs, dict):
                attrs = [attrs]
            for a in attrs:
                tm = a.get("time") or a.get("$adagio-time")
                if tm and "beats" in tm and "beat-type" in tm:
                    cur_q_per_bar = float(tm["beats"]) * (4.0 / float(tm["beat-type"]))
            dirs = m.get("direction", [])
            if isinstance(dirs, dict):
                dirs = [dirs]
            for d in dirs:
                met = d.get("direction-type", {}).get("metronome")
                if met and "per-minute" in met:
                    bu = met.get("beat-unit", "quarter")
                    mult = 0.5 if bu == "eighth" else (1.5 if "dot" in str(met) else 1.0)
                    cur_bpm = float(met["per-minute"]) * mult
        sec_per_q = 60.0 / cur_bpm
        meas_start_sec[m_idx] = cur_t
        meas_sec_per_q[m_idx] = sec_per_q
        cur_t += cur_q_per_bar * sec_per_q

    step_to_pc = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    staves_by_name: dict[str, dict] = {}

    def _staff_label_for_part(raw_pname: str, staff_num: int, total_staves: int) -> tuple[str, bool]:
        pl = raw_pname.lower()
        if "piccolo/flute" in pl or "fl. & pc" in pl:
            return ("Piccolo" if staff_num == 1 else f"Flute {staff_num - 1}", False)
        if "clarinet (1,2,3)" in pl:
            return (f"Bb Clarinet {staff_num}", False)
        if "alto clarinet" in pl:
            return ("Eb Alto Clarinet", False)
        if "bass clarinet" in pl:
            return ("Bb Bass Clarinet", False)
        if "bassoon" in pl and total_staves >= 2:
            return (f"Bassoon {staff_num}", False)
        if "soprano sax" in pl:
            return ("Bb Soprano Sax", False)
        if "alto sax" in pl and total_staves >= 2:
            return (f"Eb Alto Sax {staff_num}", False)
        if "tenor sax" in pl and "bari" not in pl:
            return ("Bb Tenor Sax", False)
        if "bari sax" in pl or "baritone sax" in pl:
            return ("Eb Baritone Sax", False)
        if "trumpet" in pl and total_staves >= 2:
            return ("Trumpet 1, 2" if staff_num == 1 else f"Trumpet {staff_num}", False)
        if "horn in f" in pl and total_staves >= 2:
            return ("F Horn 1, 2" if staff_num in (1, 2) else "F Horn 3, 4", False)
        if "trombone" in pl and total_staves >= 2:
            return ("Trombone 1, 2" if staff_num in (1, 2) else "Bass Trombone", False)
        if "euphonium" in pl:
            return ("Bb Euphonium", False)
        if "tuba" in pl:
            return ("Bb Bass", False)
        if "timpani" in pl:
            return ("Timpani", True)
        if "glockenspiel" in pl:
            return ("Glockenspiel", False)
        if "xylophone" in pl:
            return ("Xylophone", False)
        if any(k in pl for k in ["vibraphone", "marimba", "chimes (electric"]):
            return ("Mallet Perc", False)
        if any(k in pl for k in ["snare", "cymbal", "bass drum", "drum set", "sound effect"]):
            return ("Percussion", True)
        cname, _, is_d = _canonicalize_staff_label(raw_pname)
        return (cname, is_d)

    for p in parts:
        pid = p["$id"]
        raw_pname = parts_meta.get(pid, pid)
        cur_div = 1.0
        cur_trans_semi = 0
        total_staves = 1
        for m_idx, m in enumerate(p["measure"]):
            attrs = m.get("attributes", [])
            if isinstance(attrs, dict):
                attrs = [attrs]
            for a in attrs:
                if "divisions" in a:
                    cur_div = max(1.0, float(a["divisions"]))
                if "staves" in a:
                    total_staves = max(1, int(a["staves"]))
                if "transpose" in a and isinstance(a["transpose"], dict):
                    tr = a["transpose"]
                    cur_trans_semi = int(tr.get("chromatic", 0)) + 12 * int(tr.get("octave-change", 0))

            s_start = meas_start_sec[m_idx]
            sec_per_q = meas_sec_per_q[m_idx]
            notes = m.get("note", [])
            if isinstance(notes, dict):
                notes = [notes]
            for n in notes:
                if "rest" in n or "grace" in n:
                    continue
                st_num = int(n.get("staff", 1))
                sname, is_drum = _staff_label_for_part(raw_pname, st_num, total_staves)
                q_off = float(n.get("$adagio-location", {}).get("timePos", 0.0)) / cur_div
                q_dur = float(n.get("duration", 0.0)) / cur_div
                if q_dur <= 0.0:
                    continue
                t0 = s_start + q_off * sec_per_q
                t1 = t0 + max(0.04, q_dur * sec_per_q)

                if is_drum or "unpitched" in n:
                    midi_val = 53 if sname == "Timpani" else 45
                elif "pitch" in n:
                    pt = n["pitch"]
                    step = pt.get("step", "C")
                    alter = int(float(pt.get("alter", 0))) if "alter" in pt else 0
                    oct_v = int(pt.get("octave", 4))
                    midi_val = (oct_v + 1) * 12 + step_to_pc.get(step, 0) + alter + cur_trans_semi
                else:
                    continue

                notat = n.get("notations", {})
                if isinstance(notat, list):
                    notat = notat[0] if notat else {}
                orns = notat.get("ornaments", {})
                has_trill = bool("trill-mark" in orns or "tremolo" in orns or "$adagio-buzz" in orns)

                tied_list = notat.get("tied", [])
                if isinstance(tied_list, dict):
                    tied_list = [tied_list]
                tie_list = n.get("tie", [])
                if isinstance(tie_list, dict):
                    tie_list = [tie_list]
                all_ties = tied_list + tie_list
                is_tie_stop = any(t.get("$type") == "stop" for t in all_ties if isinstance(t, dict))

                st_entry = staves_by_name.setdefault(
                    sname,
                    {"name": sname, "program": 0, "is_drum": is_drum, "notes": []},
                )
                if is_tie_stop and not is_drum:
                    for prev_n in reversed(st_entry["notes"]):
                        if prev_n["midi"] == midi_val and abs(t0 - prev_n["end"]) <= 0.08:
                            prev_n["end"] = max(prev_n["end"], t1)
                            prev_n["trill"] = prev_n["trill"] or has_trill
                            break
                    else:
                        st_entry["notes"].append(
                            {"start": t0, "end": t1, "midi": midi_val, "vel": 96, "trill": has_trill}
                        )
                else:
                    st_entry["notes"].append(
                        {"start": t0, "end": t1, "midi": midi_val, "vel": 96, "trill": has_trill}
                    )

    out_staves = []
    for sname, st in staves_by_name.items():
        if not st["notes"]:
            continue
        st["notes"].sort(key=lambda x: (x["start"], -x["midi"]))
        # Deduplicate simultaneous unison/divisi attacks on merged staves (keeping the top voice at each attack)
        dedup = []
        for n in st["notes"]:
            if dedup and abs(n["start"] - dedup[-1]["start"]) <= 0.015:
                dedup[-1]["end"] = max(dedup[-1]["end"], n["end"])
                dedup[-1]["trill"] = dedup[-1]["trill"] or n["trill"]
            else:
                dedup.append(n)
        st["notes"] = dedup
        out_staves.append(st)
    return out_staves


def parse_finale_pdf_score(pdf_path: Path) -> list[dict]:
    """
    Compiles a Finale/SMuFL or Sibelius/Opus vector PDF full score into standard Cadenza staves:
      [{"name": str, "program": int, "is_drum": bool, "notes": [{"start", "end", "midi", "vel", "trill"}]}]
    """
    flat_sidecar = pdf_path.with_suffix(".flat.json")
    if flat_sidecar.exists():
        return _parse_flat_json_score(flat_sidecar)

    ms_staves = _parse_musescore_pdf(pdf_path)
    if ms_staves:
        return ms_staves

    objs, pages = _parse_pdf_objects(pdf_path)
    logical_pages = []
    for p_idx, (p_num, p_hdr) in enumerate(pages):
        res_m = re.search(r"/Resources\s+(\d+)", p_hdr)
        cnt_m = re.search(r"/Contents\s+(\d+)", p_hdr)
        if not res_m or not cnt_m:
            continue
        fmap = _get_page_fonts(objs, int(res_m.group(1)))
        stream_bytes = objs[int(cnt_m.group(1))][1]
        if not stream_bytes:
            continue
        lines, beams, curves, smufl, texts = _extract_page_primitives(stream_bytes.decode("latin1", "ignore"), fmap)
        if smufl:
            logical_pages.append((lines, beams, curves, smufl, texts))

    if not logical_pages:
        logical_pages = _extract_fitz_opus_pages(pdf_path)
    if not logical_pages:
        ms_staves = _parse_musescore_pdf(pdf_path)
        if ms_staves:
            return ms_staves
        raise ValueError(f"No vector music pages found in {pdf_path}")

    # Track global musical state across sequential measures
    staves_by_name: dict[str, dict] = {}
    last_bar_events: dict[tuple[str, int], list] = {}  # (staff_name, bar_idx) -> events for `%` repeat!

    cur_beats_per_bar = 4.0
    cur_q_per_sec = 50.0 / 60.0  # Arabesque opens "Mysteriously (q = 50)"
    tempo_events = [(0.0, cur_q_per_sec)]
    global_q_cursor = 0.0
    global_meas_idx = 0

    # Active key signature pitch-class alterations (0=C, 1=D, 2=E, 3=F, 4=G, 5=A, 6=B) per staff
    staff_keysig: dict[str, list[int]] = defaultdict(lambda: [0] * 7)
    staff_clef: dict[str, str] = defaultdict(lambda: "treble")

    for p_idx, (lines, beams, curves, smufl, texts) in enumerate(logical_pages):
        # 1. Detect horizontal staff lines (single segment > 400pt OR split segments summing > 350pt)
        horiz_w_by_y = defaultdict(float)
        for x1, y1, x2, y2 in lines:
            if abs(y1 - y2) < 0.15 and abs(x2 - x1) > 40.0:
                horiz_w_by_y[round(y1, 2)] += abs(x2 - x1)
        horiz_y = sorted(
            [y for y, w in horiz_w_by_y.items() if w > 350.0],
            reverse=True,
        )
        raw_staff_groups = []
        for y in horiz_y:
            if not raw_staff_groups or raw_staff_groups[-1][-1] - y > 6.0:
                raw_staff_groups.append([y])
            else:
                raw_staff_groups[-1].append(y)

        # Build page staves: 5-line pitched/percussion staves + 1-line percussion staves
        page_staves = []
        for sg in raw_staff_groups:
            if len(sg) == 5:
                y_top, y_bot = sg[0], sg[-1]
                step_pt = (y_top - y_bot) / 8.0
            elif len(sg) == 1:
                y_top = sg[0] + 6.5
                y_bot = sg[0] - 6.5
                step_pt = 1.62
            else:
                continue
            y_mid = 0.5 * (y_top + y_bot)
            page_staves.append({"y_top": y_top, "y_bot": y_bot, "y_mid": y_mid, "step_pt": step_pt, "lines": len(sg)})

        if not page_staves:
            continue

        # 2. Detect vertical system barlines (single segment > 150pt OR choir-split barline segments > 55pt summing > 150pt)
        vert_h_by_x = defaultdict(float)
        for x1, y1, x2, y2 in lines:
            if abs(x1 - x2) < 0.25 and abs(y2 - y1) > 55.0:
                vert_h_by_x[round(x1, 1)] += abs(y2 - y1)
        vert_x = sorted(x for x, h in vert_h_by_x.items() if h > 150.0)
        bars = []
        for x in vert_x:
            if not bars or x - bars[-1] > 8.0:
                bars.append(x)
            else:
                bars[-1] = x
        if len(bars) < 2:
            continue

        left_spine_x = bars[0]

        # 3. Match left-margin text labels (`x < left_spine_x - 2`) to nearest staff!
        margin_labels = [t for t in texts if t[0] < left_spine_x - 2.0 and 60.0 < t[1] < 1180.0]
        for st_info in page_staves:
            near_txt = [
                t[2]
                for t in sorted(margin_labels, key=lambda item: item[0])
                if abs(t[1] - st_info["y_mid"]) <= 11.0
                and not re.match(r"^\d+$", t[2])
            ]
            label_joined = " ".join(near_txt)
            cname, trans_semi, is_perc = _canonicalize_staff_label(label_joined)
            if st_info["lines"] == 1:
                is_perc = True
                cname = "Percussion"
            st_info["name"] = cname
            st_info["transpose"] = trans_semi
            st_info["is_drum"] = is_perc
            if cname not in staves_by_name:
                staves_by_name[cname] = {"name": cname, "program": 0, "is_drum": is_perc, "q_notes": []}

        # Vertical stems for beam-to-notehead association: vertical lines 8pt..45pt tall (or 4.8pt+ on compact 2-up staves)
        is_compact_page = page_staves[0]["step_pt"] < 1.35
        min_stem_h = 4.8 if is_compact_page else 7.5
        stems = [
            (0.5 * (x1 + x2), min(y1, y2), max(y1, y2))
            for x1, y1, x2, y2 in lines
            if abs(x1 - x2) < 0.35 and min_stem_h <= abs(y2 - y1) <= 48.0
        ]

        # Check tempo markings & ritardandos at top of page (`= 50`, `= 106-114`, `= 64`, `= 53`, `rit.`, `molto rit.`)
        top_texts = [t for t in texts if t[1] > page_staves[0]["y_top"] + 4.0 and t[0] >= left_spine_x - 5.0]
        meas_tempos = {}
        meas_rit_mult = {}
        for tx, ty, tstr, _ in top_texts:
            tm_match = re.search(r"=\s*(\d+)(?:\s*-\s*(\d+))?", tstr)
            if tm_match:
                bpm = float(tm_match.group(1))
                if tm_match.group(2):
                    bpm = 0.5 * (bpm + float(tm_match.group(2)))
                if 30.0 <= bpm <= 240.0:
                    # Anchor to the left edge of the tempo phrase (e.g. "15 With Drive and Flair (" or "With Energy" before "= 120")
                    left_companions = [
                        tx2
                        for tx2, ty2, tstr2, _ in top_texts
                        if abs(ty2 - ty) <= 6.0
                        and tx - 140.0 <= tx2 < tx
                    ]
                    anchor_x = min([tx] + left_companions)
                    m_local = int(np.argmin([abs(bx - anchor_x) for bx in bars[:-1]]))
                    meas_tempos[m_local] = bpm / 60.0
            else:
                tl = tstr.lower().strip()
                if "molto rit" in tl:
                    m_local = int(np.argmin([abs(bx - tx) for bx in bars[:-1]]))
                    meas_rit_mult[m_local] = 0.65
                elif tl in ("rit.", "rit", "rall.", "rall"):
                    m_local = int(np.argmin([abs(bx - tx) for bx in bars[:-1]]))
                    meas_rit_mult.setdefault(m_local, 0.78)

        n_meas_page = len(bars) - 1

        # Pre-detect which staves (si, m_i) are resting for the entire measure (centered `uniE4E3` whole rest
        # and zero noteheads inside the staff's own 5-line body) so resting neighbors (e.g. Piccolo above Solo Flute)
        # NEVER steal ledger-line notes, accidentals, grace flags, or `tr` trill marks!
        resting_staff_meas: set[tuple[int, int]] = set()
        for m_i in range(n_meas_page):
            bx0, bx1 = bars[m_i], bars[m_i + 1]
            cx0 = bx0 + ((19.5 if is_compact_page else 28.0) if m_i == 0 else (0.8 if is_compact_page else 4.0))
            for si, ps in enumerate(page_staves):
                has_wrest = any(
                    cx0 <= gx < bx1 - 1.5
                    and ps["y_bot"] - 3.0 <= gy <= ps["y_top"] + 6.0
                    and gn == "uniE4E3"
                    for gx, gy, gn, _ in smufl
                )
                if has_wrest:
                    has_own_note = any(
                        cx0 <= gx < bx1 - 1.5
                        and ps["y_bot"] - 6.5 <= gy <= ps["y_top"] + 6.5
                        and gn in ("uniE0A2", "uniE0A3", "uniE0A4", "uniE0AA", "uniE0DA")
                        for gx, gy, gn, _ in smufl
                    )
                    if not has_own_note:
                        resting_staff_meas.add((si, m_i))

        # Assign every SMuFL glyph & tuplet digit to its true owning staff (ignoring resting staves for ledger glyphs!)
        staff_glyphs = [[] for _ in range(len(page_staves))]
        staff_tuplets = [[] for _ in range(len(page_staves))]

        for gx, gy, gn, gfs in smufl:
            if gx < left_spine_x - 1.5:
                continue  # Ignore margin instrument label accidentals (e.g. flat inside "Bb Cl. 1, 2")!
            # Determine measure index for gx
            m_for_g = -1
            if gx >= left_spine_x + (19.5 if is_compact_page else 32.0):
                for m_k in range(n_meas_page):
                    if bars[m_k] <= gx <= bars[m_k + 1]:
                        m_for_g = m_k
                        break

            cand_indices = [
                si
                for si in range(len(page_staves))
                if not (
                    m_for_g >= 0
                    and (si, m_for_g) in resting_staff_meas
                    and gn != "uniE4E3"
                    and not (page_staves[si]["y_bot"] - 2.0 <= gy <= page_staves[si]["y_top"] + 2.0)
                )
            ]
            if not cand_indices:
                cand_indices = list(range(len(page_staves)))

            best_si = min(cand_indices, key=lambda si: abs(page_staves[si]["y_mid"] - gy))
            if abs(page_staves[best_si]["y_mid"] - gy) <= 34.0:
                staff_glyphs[best_si].append((gx, gy, gn, gfs))

        for tx, ty, tstr, tfs in texts:
            if tstr in ("3", "5", "6") and 4.0 <= tfs <= 9.5 and tx > left_spine_x:
                best_si = int(np.argmin([abs(ps["y_mid"] - ty) for ps in page_staves]))
                if abs(page_staves[best_si]["y_mid"] - ty) <= 26.0:
                    staff_tuplets[best_si].append((tx, int(tstr)))

        # Check Clef & System Key Signature inside [left_spine_x, header_limit] on EVERY page!
        for si, ps in enumerate(page_staves):
            cname = ps["name"]
            if cname in ("Alto Flute", "Bass Flute"):
                continue
            sg = sorted(staff_glyphs[si], key=lambda g: g[0])
            header_limit = left_spine_x + (19.5 if is_compact_page else 35.0)
            ks_vec = [0] * 7
            saw_clef = False
            for gx, gy, gn, gfs in sg:
                if gx < left_spine_x - 0.5:
                    continue
                if gx > header_limit:
                    break
                if gn == "uniE050":
                    staff_clef[cname] = "treble"
                    saw_clef = True
                elif gn == "uniE05C":
                    staff_clef[cname] = "alto"
                    saw_clef = True
                elif gn == "uniE062":
                    staff_clef[cname] = "bass"
                    saw_clef = True
                elif gn == "uniE069":
                    ps["is_drum"] = True
                    saw_clef = True
                elif gn in ("uniE260", "uniE262") and (not ps["is_drum"] or cname == "Timpani"):
                    # Ensure accidental is not attached to an immediate beat-1 notehead
                    has_attached_note = any(
                        gx < nx <= gx + 5.5 and n_gn in ("uniE0A2", "uniE0A3", "uniE0A4")
                        for nx, _, n_gn, _ in sg
                    )
                    if not has_attached_note:
                        step = int(round((gy - ps["y_bot"]) / ps["step_pt"]))
                        base = _CLEF_BASE_STEP.get(staff_clef[cname], 30)
                        deg = (base + step) % 7
                        ks_vec[deg] = -1 if gn == "uniE260" else 1
            if saw_clef and (not ps["is_drum"] or cname == "Timpani"):
                staff_keysig[cname] = ks_vec

        # Iterate measure by measure across this page!
        for m_i in range(n_meas_page):
            global_meas_idx += 1
            bx0 = bars[m_i]
            bx1 = bars[m_i + 1]

            if m_i in meas_tempos:
                cur_q_per_sec = meas_tempos[m_i]
                tempo_events.append((global_q_cursor, cur_q_per_sec))
            elif m_i in meas_rit_mult:
                cur_q_per_sec = max(0.45, cur_q_per_sec * meas_rit_mult[m_i])
                tempo_events.append((global_q_cursor, cur_q_per_sec))

            # Check Time Signature digits (`uniE080..uniE089`) near bx0 on Staff 0 or Staff 1!
            ts_digits = [
                (gx, gy, int(gn[-1]))
                for gx, gy, gn, _ in staff_glyphs[0]
                if bx0 - 2.0 <= gx <= bx0 + (38.0 if m_i == 0 else 18.0)
                and gn in ("uniE080", "uniE081", "uniE082", "uniE083", "uniE084", "uniE085", "uniE086", "uniE087", "uniE088", "uniE089")
            ]
            if len(ts_digits) >= 2:
                ym_ts = 0.5 * (max(d[1] for d in ts_digits) + min(d[1] for d in ts_digits))
                upper_d = sorted([d for d in ts_digits if d[1] >= ym_ts], key=lambda d: d[0])
                lower_d = sorted([d for d in ts_digits if d[1] < ym_ts], key=lambda d: d[0])
                if upper_d and lower_d:
                    num_d = int("".join(str(d[2]) for d in upper_d))
                    den_d = int("".join(str(d[2]) for d in lower_d))
                    if den_d > 0:
                        cur_beats_per_bar = num_d * (4.0 / den_d)

            # Check mid-page system key-signature change right at barline bx0 (e.g. Page 14 m.78!)
            if m_i > 0:
                staves_with_bar_ks = 0
                cand_bar_ks = {}
                for si, ps in enumerate(page_staves):
                    if (ps["is_drum"] and ps["name"] != "Timpani") or ps["name"] in ("Alto Flute", "Bass Flute"):
                        continue
                    bar_ks = [
                        (gx, gy, gn)
                        for gx, gy, gn, _ in staff_glyphs[si]
                        if bx0 <= gx <= bx0 + 18.0 and gn in ("uniE260", "uniE261", "uniE262")
                    ]
                    bar_notes_x = [
                        gx
                        for gx, _, gn, _ in staff_glyphs[si]
                        if bx0 <= gx <= bx0 + 24.0 and gn in ("uniE0A2", "uniE0A3", "uniE0A4")
                    ]
                    if bar_ks and all(
                        min([99.0] + [nx - ax for nx in bar_notes_x if nx > ax]) > 5.5 for ax, _, _ in bar_ks
                    ):
                        staves_with_bar_ks += 1
                        cand_bar_ks[si] = bar_ks
                if staves_with_bar_ks >= 4:
                    for si, bar_ks in cand_bar_ks.items():
                        ps = page_staves[si]
                        cname = ps["name"]
                        ks_vec = [0] * 7
                        base = _CLEF_BASE_STEP.get(staff_clef[cname], 30)
                        for _, ay, agn in bar_ks:
                            deg = (base + int(round((ay - ps["y_bot"]) / ps["step_pt"]))) % 7
                            if agn == "uniE260":
                                ks_vec[deg] = -1
                            elif agn == "uniE262":
                                ks_vec[deg] = 1
                        staff_keysig[cname] = ks_vec

            # Detect system-wide `caesura //` (`uniE4D1`) or `fermata` (`uniE511` / `uniE4C0`) inside [bx0, bx1]
            has_caesura = (
                sum(
                    1
                    for gx, _, gn, _ in smufl
                    if bx0 + 4.0 <= gx <= bx1 + 2.0 and gn in ("uniE4D1", "uniE4D2")
                )
                >= 3
            )
            has_fermata = any(
                bx0 + 4.0 <= gx <= bx1 - 1.0 and gn in ("uniE4C0", "uniE4C1")
                for gx, _, gn, _ in smufl
            )
            caesura_extra_q = 1.65 if has_caesura else 0.0
            fermata_scale = 1.28 if has_caesura else (1.45 if has_fermata else 1.0)
            meas_span_q = cur_beats_per_bar * fermata_scale + caesura_extra_q

            # Parse every staff inside measure [bx0, bx1]
            content_x0 = bx0 + ((19.5 if is_compact_page else 28.0) if m_i == 0 else (0.8 if is_compact_page else 4.0))
            # If time signature was present at m_i == 0, push content_x0 past time signature
            if m_i == 0 and ts_digits:
                ts_xs = [
                    gx
                    for gx, _, gn, _ in staff_glyphs[0]
                    if bx0 <= gx <= bx0 + 42.0
                    and gn in ("uniE080", "uniE081", "uniE082", "uniE083", "uniE084", "uniE085", "uniE086", "uniE087", "uniE088", "uniE089")
                ]
                if ts_xs:
                    content_x0 = max(content_x0, max(ts_xs) + 4.0)

            for si, ps in enumerate(page_staves):
                cname = ps["name"]
                if cname in ("Alto Flute", "Bass Flute"):
                    # Optional cue doubling of Solo Flute 1,2 -> skip to avoid redundant shadow staves
                    continue

                mg = [g for g in staff_glyphs[si] if content_x0 <= g[0] < bx1 - 1.5]
                if not mg:
                    continue
                mg.sort(key=lambda g: g[0])

                # Check `%` 1-bar repeat sign (`uniE500`)!
                if any(g[2] == "uniE500" for g in mg):
                    prev_evs = last_bar_events.get((cname, global_meas_idx - 1), [])
                    rep_evs = []
                    for rel_s, rel_e, mp, vel, is_tr in prev_evs:
                        staves_by_name[cname]["q_notes"].append(
                            (global_q_cursor + rel_s, global_q_cursor + rel_e, mp, vel, is_tr, 0.0, 0.0)
                        )
                        rep_evs.append((rel_s, rel_e, mp, vel, is_tr))
                    last_bar_events[(cname, global_meas_idx)] = rep_evs
                    continue

                # Determine normal notehead font size on this staff (~14.4pt full, ~10.8pt reduced)
                nh_sizes = [g[3] for g in mg if g[2] in ("uniE0A2", "uniE0A3", "uniE0A4", "uniE0AA")]
                base_fs = max(nh_sizes) if nh_sizes else 14.0

                # Track active measure accidentals per abs_step
                meas_acc: dict[int, int] = {}
                ks_vec = staff_keysig[cname]
                base_step = _CLEF_BASE_STEP.get(staff_clef[cname], 30)

                # Collect accidentals, dots, flags, trills, staccatos in this measure
                accs = [(gx, gy, gn) for gx, gy, gn, _ in mg if gn in ("uniE260", "uniE261", "uniE262")]
                dots = [gx for gx, _, gn, _ in mg if gn == "uniE1E7"]
                flags = [gx for gx, _, gn, gfs in mg if gn in ("uniE240", "uniE241") and gfs >= base_fs * 0.78]
                flags16 = [gx for gx, _, gn, gfs in mg if gn in ("uniE242", "uniE243") and gfs >= base_fs * 0.78]
                trills = [gx for gx, _, gn, _ in mg if gn in ("uniE566", "uniEAA4")]
                staccatos = [gx for gx, _, gn, _ in mg if gn in ("uniE4A2", "uniE4A3", "uniE4A6", "uniE4A7")]
                tups = [t for t in staff_tuplets[si] if bx0 <= t[0] <= bx1]

                # Collect rhythmic events (notes and rests, skipping grace notes `gfs < base_fs * 0.75`)
                raw_events = []  # (x, kind, dur_q, [pitches], is_trill, has_staccato)
                for gx, gy, gn, gfs in mg:
                    if gn in ("uniE0A2", "uniE0A3", "uniE0A4", "uniE0AA", "uniE0DA"):
                        if gfs < base_fs * 0.74:
                            continue  # grace note!
                        step_rel = int(round((gy - ps["y_bot"]) / ps["step_pt"]))
                        abs_st = base_step + step_rel

                        # Check accidental within [gx - 8.5, gx - 0.5] at matching y (±1.5pt)
                        for ax, ay, agn in accs:
                            if gx - 9.0 <= ax <= gx + 0.5 and abs(ay - gy) <= ps["step_pt"] * 0.85:
                                meas_acc[abs_st] = -1 if agn == "uniE260" else (1 if agn == "uniE262" else 0)

                        alter = meas_acc.get(abs_st, ks_vec[abs_st % 7])
                        is_pitched_timp = cname == "Timpani" and ps["lines"] == 5
                        midi_p = 45 if (ps["is_drum"] and not is_pitched_timp) else (_step_to_midi(abs_st, alter) + ps["transpose"])

                        # Group chord tones sharing x within 1.8pt!
                        if raw_events and raw_events[-1][1] == "note" and abs(gx - raw_events[-1][0]) <= 1.8:
                            raw_events[-1][3].append((midi_p, gy))
                            continue

                        # Determine rhythmic duration of notehead!
                        if gn == "uniE0A2":
                            dur_q = 4.0
                        elif gn in ("uniE0A3", "uniE0DA"):
                            dur_q = 2.0
                        else:
                            # Find stem attached to this notehead (x within [gx - 1.2, gx + max_stem_dx])
                            max_stem_dx = 3.6 if ps["step_pt"] < 1.35 else 6.2
                            my_stems = [
                                s
                                for s in stems
                                if gx - 1.2 <= s[0] <= gx + max_stem_dx and (s[1] - 3.0 <= gy <= s[2] + 3.0)
                            ]
                            stem_x = my_stems[0][0] if my_stems else gx + (1.8 if ps["step_pt"] < 1.35 else 2.2)
                            s_y0 = my_stems[0][1] - 1.5 if my_stems else gy - 18.0
                            s_y1 = my_stems[0][2] + 1.5 if my_stems else gy + 18.0

                            # Count filled beam polygons intersecting stem_x within [s_y0, s_y1]!
                            n_beams = sum(
                                1
                                for b_x0, b_x1, b_ym in beams
                                if b_x0 - 1.2 <= stem_x <= b_x1 + 1.2 and s_y0 <= b_ym <= s_y1
                            )
                            if n_beams >= 3:
                                dur_q = 0.125
                            elif n_beams == 2 or any(abs(fx - stem_x) <= 4.5 or abs(fx - gx) <= 6.0 for fx in flags16):
                                dur_q = 0.25
                            elif n_beams == 1 or any(abs(fx - stem_x) <= 4.5 or abs(fx - gx) <= 6.0 for fx in flags):
                                dur_q = 0.5
                            else:
                                dur_q = 1.0

                        # Check augmentation dot within [gx + 1.5, gx + 9.5]
                        if any(gx + 1.2 <= dx <= gx + 9.5 for dx in dots):
                            dur_q *= 1.5

                        has_tr = any(gx - 3.0 <= trx <= gx + 12.0 for trx in trills)
                        has_stac = any(gx - 2.0 <= stx <= gx + 6.5 for stx in staccatos)
                        raw_events.append([gx, "note", dur_q, [(midi_p, gy)], has_tr, has_stac])

                    elif gn in ("uniE4E3", "uniE4E4", "uniE4E5", "uniE4E6", "uniE4E7"):
                        if gfs < base_fs * 0.74:
                            continue
                        if gn == "uniE4E3":
                            r_dur = cur_beats_per_bar if len(nh_sizes) == 0 else 4.0
                        elif gn == "uniE4E4":
                            r_dur = 2.0
                        elif gn == "uniE4E5":
                            r_dur = 1.0
                        elif gn == "uniE4E6":
                            r_dur = 0.5
                        else:
                            r_dur = 0.25
                        if any(gx + 1.2 <= dx <= gx + 9.5 for dx in dots):
                            r_dur *= 1.5
                        raw_events.append([gx, "rest", r_dur, [], False, False])

                if not raw_events:
                    continue

                raw_events.sort(key=lambda e: e[0])

                # Apply tuplets ('3' -> 3 notes * 2/3, '6' -> 6 notes * 2/3, '5' -> 5 notes * 4/5)
                # matching the exact base subdivision of the note closest to the tuplet numeral!
                tupled_indices = set()
                tups.sort(key=lambda item: item[0])
                dedup_tups = []
                for tx, tnum in tups:
                    if not dedup_tups or abs(tx - dedup_tups[-1][0]) > 12.0:
                        dedup_tups.append((tx, tnum))
                for tx, tnum in dedup_tups:
                    cand_notes = [
                        (idx_e, abs(e[0] - tx), e[2])
                        for idx_e, e in enumerate(raw_events)
                        if e[1] == "note" and idx_e not in tupled_indices and e[2] <= 0.75 and abs(e[0] - tx) <= 28.0
                    ]
                    if not cand_notes:
                        continue
                    cand_notes.sort(key=lambda item: item[1])
                    if cand_notes[0][1] > 9.5:
                        continue
                    base_tuplet_dur = cand_notes[0][2]
                    max_dx = 16.0 if base_tuplet_dur <= 0.26 else 28.0
                    same_subdiv = [
                        item[0]
                        for item in cand_notes
                        if abs(item[2] - base_tuplet_dur) <= 0.02 and item[1] <= max_dx
                    ][:tnum]
                    ratio = (2.0 / 3.0) if tnum in (3, 6) else (4.0 / 5.0)
                    for idx_e in same_subdiv:
                        raw_events[idx_e][2] *= ratio
                        tupled_indices.add(idx_e)

                note_evs = [e for e in raw_events if e[1] == "note"]
                total_note_q = sum(e[2] for e in note_evs)
                total_raw_q = sum(e[2] for e in raw_events)
                has_divisi_rests = False
                if (
                    not ps["is_drum"]
                    and total_note_q >= cur_beats_per_bar - 0.15
                    and (len(raw_events) - len(note_evs)) >= 2
                    and 2.5 <= (total_raw_q - total_note_q) <= 3.8
                ):
                    # Shared 2-voice staff where one voice rests for most of the bar while the other plays the full bar (e.g. m.37 Bb Clarinet 1, 2)
                    raw_events = note_evs
                    total_raw_q = total_note_q
                    has_divisi_rests = True

                if total_raw_q <= 0:
                    continue

                # On compact watermarked 2-up scores, if the diagonal watermark occluded a Beat 1 rest
                # (e.g. Bb Tpt. 1 in Measure 29 where the first note starts >= 8pt after content_x0 and
                # another homorhythmic staff shares the exact first-note X and has an intact Beat 1 rest),
                # restore the occluded Beat 1 rest!
                if (
                    is_compact_page
                    and not ps["is_drum"]
                    and raw_events[0][1] == "note"
                    and raw_events[0][0] >= content_x0 + 8.0
                    and 0.20 <= (cur_beats_per_bar - total_raw_q) <= 1.05
                ):
                    first_nx = raw_events[0][0]
                    missing_q = round((cur_beats_per_bar - total_raw_q) * 4.0) / 4.0
                    if missing_q in (0.25, 0.5, 0.75, 1.0) and abs((cur_beats_per_bar - total_raw_q) - missing_q) <= 0.05:
                        has_peer_rest = any(
                            si_o != si
                            and any(content_x0 <= gx < first_nx - 2.0 and gn in ("uniE4E5", "uniE4E6", "uniE4E7") for gx, _, gn, _ in staff_glyphs[si_o])
                            and any(abs(gx - first_nx) <= 1.0 and gn in ("uniE0A2", "uniE0A3", "uniE0A4") for gx, _, gn, _ in staff_glyphs[si_o])
                            for si_o in range(len(page_staves))
                        )
                        if has_peer_rest:
                            raw_events.insert(0, [content_x0 + 2.0, "rest", missing_q, [], False, False])
                            total_raw_q += missing_q

                # Fuse feathered/slurred single-pitch breath-pulses in slow solo passages (e.g. Arabesque m.2 G5!)
                staff_curves = [c for c in curves if abs(c[1] - ps["y_mid"]) <= 26.0]
                if (
                    not ps["is_drum"]
                    and cur_q_per_sec <= 1.15
                    and len(note_evs) >= 7
                    and len(note_evs) == len(raw_events)
                    and len({max(p for p, _ in e[3]) for e in note_evs}) == 1
                ):
                    raw_events = [[note_evs[0][0], "note", cur_beats_per_bar, note_evs[0][3], False, False]]
                    total_raw_q = cur_beats_per_bar

                # If whole-note pedal drone in a caesura/fermata bar, stretch across full `meas_span_q` so pedal never breaks!
                if len(raw_events) == 1 and raw_events[0][1] == "note" and raw_events[0][2] >= 3.8:
                    target_bar_q = meas_span_q
                else:
                    target_bar_q = cur_beats_per_bar * fermata_scale

                scale_q = target_bar_q / total_raw_q if abs(total_raw_q - target_bar_q) > 0.04 else 1.0

                q_local = 0.0
                bar_saved = []
                for idx_ev, (ev_x, kind, dur_q, p_list, has_tr, has_stac) in enumerate(raw_events):
                    eff_q = dur_q * scale_q
                    sounded_q = min(eff_q, 0.50) if (has_stac and eff_q <= 1.15) else eff_q
                    if kind == "note" and p_list:
                        if has_divisi_rests and idx_ev == 0 and len(p_list) >= 2 and len(raw_events) >= 2 and raw_events[1][3]:
                            ref_m = raw_events[1][3][0][0]
                            p_list.sort(key=lambda item: (abs(item[0] - ref_m), -item[0]))
                        else:
                            p_list.sort(key=lambda item: -item[0])
                        top_midi, top_y = p_list[0]
                        prev_list = staves_by_name[cname]["q_notes"]
                        tied_to_prev = False
                        if prev_list and prev_list[-1][2] == top_midi and abs((global_q_cursor + q_local) - prev_list[-1][1]) <= 0.04:
                            prev_x, prev_y = prev_list[-1][5], prev_list[-1][6]
                            # For percussion staves, fuse tied sustained rolls (`eff_q >= 1.4`), NEVER accented short cutoffs (`eff_q < 1.2`)!
                            allow_tie = (not ps["is_drum"]) or (eff_q >= 1.4)
                            if allow_tie:
                                if idx_ev > 0 and has_tr and (prev_list[-1][1] - prev_list[-1][0]) >= 0.9:
                                    tied_to_prev = True
                                elif ev_x > prev_x + 3.0 and any(
                                    prev_x - 3.0 <= cx0 <= prev_x + 18.0
                                    and ev_x - 16.0 <= cx1 <= ev_x + 6.0
                                    and cx0 < (prev_x + ev_x) * 0.58
                                    and cx1 > (prev_x + ev_x) * 0.42
                                    and abs(cy0 - cy1) <= 4.5
                                    for cx0, cy0, cx1, cy1 in staff_curves
                                ):
                                    tied_to_prev = True
                                elif ev_x < prev_x - 100.0 and any(
                                    # Tie across a system break: the tied-over note opens the NEW system, and the engraver draws
                                    # a short incoming half-tie that starts just left of it at notehead height
                                    # (e.g. Sevens 1:56 / 2:08 / 3:26: a 16th at the end of a line tied into the next line's note).
                                    ev_x - 9.0 <= cx0 <= ev_x - 0.5
                                    and ev_x - 1.0 <= cx1 <= ev_x + 3.0
                                    and abs(cy1 - top_y) <= 4.5
                                    and abs(cy0 - cy1) <= 2.0
                                    for cx0, cy0, cx1, cy1 in staff_curves
                                ):
                                    tied_to_prev = True
                                elif ps["is_drum"] and eff_q >= 1.8 and (prev_list[-1][1] - prev_list[-1][0]) >= 2.2:
                                    # Cross-page / cross-barline decaying roll (`fp > n.`)
                                    tied_to_prev = True

                        if tied_to_prev:
                            pq0, _, pmp, pvel, ptr, _, _ = prev_list[-1]
                            prev_list[-1] = (
                                pq0,
                                global_q_cursor + q_local + sounded_q,
                                pmp,
                                pvel,
                                ptr or has_tr,
                                ev_x,
                                top_y,
                            )
                        else:
                            prev_list.append(
                                (
                                    global_q_cursor + q_local,
                                    global_q_cursor + q_local + sounded_q,
                                    top_midi,
                                    92,
                                    has_tr,
                                    ev_x,
                                    top_y,
                                )
                            )
                        bar_saved.append((q_local, q_local + sounded_q, top_midi, 92, has_tr))
                    q_local += eff_q

                last_bar_events[(cname, global_meas_idx)] = bar_saved

            global_q_cursor += meas_span_q

    # Build monotonic quarter -> seconds piecewise linear tempo curve
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

    # Convert quarter positions to seconds & fuse long pedal whole-note drones / trills!
    staves_out = []
    for cname, sdict in staves_by_name.items():
        q_notes = sdict["q_notes"]
        if not q_notes:
            continue
        q_notes.sort(key=lambda x: x[0])
        notes_sec = []
        for qs, qe, mp, vel, has_tr, _, _ in q_notes:
            s_sec = float(q_to_sec(qs))
            e_sec = float(max(s_sec + 0.04, q_to_sec(qe)))
            # Fuse touching whole-note ties (dur >= 3.8 beats touching identical pitch across barline)
            if (
                not sdict["is_drum"]
                and notes_sec
                and notes_sec[-1]["midi"] == mp
                and abs(s_sec - notes_sec[-1]["end"]) <= 0.03
                and (qe - qs) >= 3.8
                and notes_sec[-1].get("_q_dur", 0) >= 3.8
            ):
                notes_sec[-1]["end"] = e_sec
                notes_sec[-1]["_q_dur"] += qe - qs
                continue
            notes_sec.append(
                {
                    "start": s_sec,
                    "end": e_sec,
                    "midi": int(mp),
                    "vel": int(vel),
                    "trill": bool(has_tr),
                    "_q_dur": qe - qs,
                }
            )
        for item in notes_sec:
            item.pop("_q_dur", None)
        staves_out.append(
            {
                "name": cname,
                "program": 0,
                "is_drum": bool(sdict["is_drum"]),
                "notes": notes_sec,
            }
        )

    return staves_out


def _parse_musescore_pdf(pdf_path: Path) -> list[dict]:
    """
    Compiles a MuseScore web-viewer vector PDF export (`pdfmake` 3060x3960 SVG coordinate space,
    top-down Y axis, 1 full-orchestra system per page) into standard Cadenza staves.
    """
    try:
        import fitz
    except ImportError:
        return []

    doc = fitz.open(str(pdf_path))
    if len(doc) == 0:
        return []

    first_text = doc[0].read_contents().decode("latin1", errors="ignore")
    if "0.187908" not in first_text and doc.metadata.get("creator") != "pdfmake":
        return []

    stem_lower = pdf_path.stem.lower()
    is_what_we_do = "what-we-do" in stem_lower or "what_we_do" in stem_lower
    is_guthix = "guthix" in stem_lower

    if is_what_we_do:
        # 20 staves per page, 6/4 (with 4/4 bars at m.16, m.75, m.85-104), quarter = 135 BPM
        q_bpm = 135.0
        default_beats_per_bar = 6.0
        four_four_bars = {16, 75} | set(range(85, 105))
        repeat_spans = [(8, 11), (25, 32), (33, 36)]
        staff_defs = [
            ("Piccolo", "treble", 12, False, False),
            ("Flute 1", "treble", 0, False, False),
            ("Flute 2", "treble", 0, False, False),
            ("Bagpipes", "treble", 0, False, False),
            ("F Horn 1, 2", "treble", -7, False, False),
            ("Trombone 1, 2", "bass", 0, False, False),
            ("Tuba", "bass", 0, False, False),
            ("Timpani", "bass", 0, True, False),
            ("Guiro", "perc", 0, True, False),
            ("Clap", "perc", 0, True, False),
            ("Xylophone", "treble", 0, False, False),
            ("Marimba 1", "treble", 0, False, False),
            ("Marimba 2", "treble", 0, False, False),
            ("Bongo Drums", "perc", 0, True, False),
            ("Goblet Drum", "perc", 0, True, False),
            ("Snare Drum", "perc", 0, True, False),
            ("Dulcimer", "treble", 0, False, False),
            ("Violin I", "treble", 0, False, False),
            ("Strings I", "treble", 0, False, False),
            ("Strings II", "bass", 0, False, False),
        ]
    elif is_guthix:
        # 16 staves per page, 12/8 (6.0 quarter-beats = 4.0 dotted-quarter beats per bar), dotted-quarter = 80 -> quarter = 120 BPM
        q_bpm = 120.0
        default_beats_per_bar = 6.0
        four_four_bars = set()
        repeat_spans = []
        staff_defs = [
            ("Flute 1", "treble", 0, False, False),
            ("Alto Flute 1", "treble", -5, False, False),
            ("Pan Flute 1", "treble", 0, False, False),
            ("Pan Flute 2", "treble", 0, False, False),
            ("Pan Flute 3", "treble", 0, False, False),
            ("Bell Tree", "perc", 0, True, True),
            ("Drum Set 1", "perc", 0, True, False),
            ("Drum Set 2", "perc", 0, True, False),
            ("Celesta 1", "treble", 0, False, False),
            ("Celesta 2", "treble", 0, False, False),
            ("Warm Pad 1", "bass", 0, False, False),
            ("Warm Pad 2", "bass", 0, False, False),
            ("Choir", "bass", 0, False, False),
            ("Bird Tweet FX", "perc", 0, True, True),
            ("Howl FX", "perc", 0, True, True),
            ("Seashore FX", "perc", 0, True, True),
        ]
    else:
        q_bpm = 120.0
        default_beats_per_bar = 4.0
        four_four_bars = set()
        repeat_spans = []
        staff_defs = []

    sec_per_q = 60.0 / q_bpm

    # Store parsed measure events: meas_events[m_num][s_idx] = list of (rel_q_start, rel_q_end, midi_p, vel, is_tied_left, is_trill)
    meas_events: dict[int, dict[int, list]] = defaultdict(lambda: defaultdict(list))
    meas_beats: dict[int, float] = {}
    cur_m_num = 1

    for pno, page in enumerate(doc):
        text = page.read_contents().decode("latin1", errors="ignore")
        blocks = re.findall(r"q\n(.*?)\nQ", text, re.S)
        if len(blocks) < 3:
            continue

        # 1. Extract horizontal staff lines from Block 1
        b1 = blocks[1]
        h_lines = []
        for m in re.finditer(r"([0-9.-]+) ([0-9.-]+) m\n([0-9.-]+) ([0-9.-]+) l", b1):
            x0, y0, x1, y1 = float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4))
            if abs(y1 - y0) < 0.2 and abs(x1 - x0) > 250.0:
                h_lines.append((min(x0, x1), max(x0, x1), round(y0, 2)))
        if not h_lines:
            continue

        staff_x0 = min(l[0] for l in h_lines)
        staff_x1 = max(l[1] for l in h_lines)
        ys = sorted(set(l[2] for l in h_lines))
        diffs = [round(ys[i + 1] - ys[i], 2) for i in range(len(ys) - 1) if 10.0 < ys[i + 1] - ys[i] < 25.0]
        line_sp = sorted(diffs)[len(diffs) // 2] if diffs else 14.60
        step_y = line_sp / 2.0

        staves = []
        cur_g = [ys[0]]
        for y in ys[1:]:
            if y - cur_g[-1] < line_sp * 1.5:
                cur_g.append(y)
            else:
                staves.append({"y_top": min(cur_g), "y_bot": max(cur_g), "y_mid": 0.5 * (min(cur_g) + max(cur_g)), "lines": len(cur_g)})
                cur_g = [y]
        staves.append({"y_top": min(cur_g), "y_bot": max(cur_g), "y_mid": 0.5 * (min(cur_g) + max(cur_g)), "lines": len(cur_g)})

        if not staff_defs:
            staff_defs = [
                (f"Staff {i+1}", "treble" if st["lines"] == 5 else "perc", 0, st["lines"] == 1, False)
                for i, st in enumerate(staves)
            ]

        # 2. Extract barlines, stems, ties, octave spans, and filled glyphs across blocks[2:]
        from collections import Counter
        bar_x_counts = Counter()
        stems = []  # (x, y0, y1)
        ties = []   # (x0, x1, ym)
        oct_spans = []  # (s_idx, x0, x1, semi_shift)
        glyphs = []  # (x0, y0, x1, y1, w_step, h_step, sp_cnt, pts_cnt)

        lw_b1_m = re.search(r"([0-9.]+) w", b1)
        staff_lw = float(lw_b1_m.group(1)) if lw_b1_m else 1.3

        for bi, b in enumerate(blocks[2:], start=2):
            op_m = re.search(r"\n([SsfB]\*?)\s*$", b)
            op = op_m.group(1) if op_m else "?"
            lw_m = re.search(r"([0-9.]+) w", b)
            lw = float(lw_m.group(1)) if lw_m else 0.0

            if op == "S":
                coords = [(float(m.group(1)), float(m.group(2)), m.group(3)) for m in re.finditer(r"([0-9.-]+) ([0-9.-]+) (m|l)", b)]
                for i in range(0, len(coords) - 1, 2):
                    if coords[i][2] == "m" and coords[i + 1][2] == "l":
                        x0, y0 = coords[i][0], coords[i][1]
                        x1, y1 = coords[i + 1][0], coords[i + 1][1]
                        if abs(x1 - x0) < 0.5:
                            h_seg = abs(y1 - y0)
                            if lw > staff_lw * 1.05 and h_seg > 40.0 and x0 > staff_x0 + 180.0:
                                bar_x_counts[round(x0, 1)] += 1
                            elif abs(lw - staff_lw) <= 0.15 and 2.5 * step_y <= h_seg <= 20.0 * step_y:
                                stems.append((x0, min(y0, y1), max(y0, y1)))
            elif op in ("B", "B*"):
                # Tie or slur curve
                subpaths = []
                cur_pts = []
                for line in b.split("\n"):
                    m = re.match(r"^([0-9.-]+) ([0-9.-]+) (m|l)", line.strip())
                    if m:
                        x, y, cmd = float(m.group(1)), float(m.group(2)), m.group(3)
                        if cmd == "m" and cur_pts:
                            subpaths.append(cur_pts)
                            cur_pts = []
                        cur_pts.append((x, y))
                    else:
                        mc = re.match(r"^([0-9.-]+) ([0-9.-]+) ([0-9.-]+) ([0-9.-]+) ([0-9.-]+) ([0-9.-]+) c", line.strip())
                        if mc:
                            cur_pts.append((float(mc.group(5)), float(mc.group(6))))
                if cur_pts:
                    subpaths.append(cur_pts)
                for sp in subpaths:
                    xs = [p[0] for p in sp]
                    ys_sp = [p[1] for p in sp]
                    if max(xs) - min(xs) >= 2.0 * step_y:
                        ties.append((min(xs), max(xs), 0.5 * (min(ys_sp) + max(ys_sp))))
            elif op in ("f", "f*"):
                subpaths = []
                cur_pts = []
                for line in b.split("\n"):
                    m = re.match(r"^([0-9.-]+) ([0-9.-]+) (m|l)", line.strip())
                    if m:
                        x, y, cmd = float(m.group(1)), float(m.group(2)), m.group(3)
                        if cmd == "m" and cur_pts:
                            subpaths.append(cur_pts)
                            cur_pts = []
                        cur_pts.append((x, y))
                    else:
                        mc = re.match(r"^([0-9.-]+) ([0-9.-]+) ([0-9.-]+) ([0-9.-]+) ([0-9.-]+) ([0-9.-]+) c", line.strip())
                        if mc:
                            cur_pts.append((float(mc.group(5)), float(mc.group(6))))
                if cur_pts:
                    subpaths.append(cur_pts)
                bboxes = [
                    [min(p[0] for p in sp), min(p[1] for p in sp), max(p[0] for p in sp), max(p[1] for p in sp), len(sp), 1]
                    for sp in subpaths
                    if sp
                ]
                merged = []
                for bb in bboxes:
                    if merged:
                        prev = merged[-1]
                        if (
                            bb[0] >= prev[0] - 1.5 and bb[2] <= prev[2] + 1.5 and bb[1] >= prev[1] - 1.5 and bb[3] <= prev[3] + 1.5
                        ) or (
                            prev[0] >= bb[0] - 1.5 and prev[2] <= bb[2] + 1.5 and prev[1] >= bb[1] - 1.5 and prev[3] <= bb[3] + 1.5
                        ):
                            prev[0] = min(prev[0], bb[0])
                            prev[1] = min(prev[1], bb[1])
                            prev[2] = max(prev[2], bb[2])
                            prev[3] = max(prev[3], bb[3])
                            prev[4] += bb[4]
                            prev[5] += 1
                            continue
                    merged.append(bb)
                for m_bb in merged:
                    w_s = round((m_bb[2] - m_bb[0]) / step_y, 2)
                    h_s = round((m_bb[3] - m_bb[1]) / step_y, 2)
                    sp_c = m_bb[5]
                    pts_c = m_bb[4]
                    if 2.3 <= w_s <= 2.6 and 3.0 <= h_s <= 3.4 and sp_c == 2 and m_bb[0] > staff_x0 + 50.0:
                        # '8' glyph for 8va/8vb! Look ahead 2 blocks for dashed line end x
                        cy_8 = 0.5 * (m_bb[1] + m_bb[3])
                        s_i8 = min(range(len(staves)), key=lambda i: abs(staves[i]["y_mid"] - cy_8))
                        x_end8 = m_bb[2] + 60.0
                        for nb in blocks[bi + 1 : bi + 3]:
                            nc = [float(mm.group(1)) for mm in re.finditer(r"([0-9.-]+) ([0-9.-]+) (?:m|l)", nb)]
                            if nc:
                                x_end8 = max(x_end8, max(nc))
                        semi_8 = -12 if cy_8 > staves[s_i8]["y_mid"] else 12
                        oct_spans.append((s_i8, m_bb[0] - 15.0, x_end8 + 15.0, semi_8))
                    glyphs.append((m_bb[0], m_bb[1], m_bb[2], m_bb[3], w_s, h_s, sp_c, pts_c))

        valid_bx = sorted(x for x, c in bar_x_counts.items() if c >= 6)
        bar_ends = []
        for x in valid_bx:
            if not bar_ends or x - bar_ends[-1] > 35.0:
                bar_ends.append(x)
            else:
                bar_ends[-1] = max(bar_ends[-1], x)
        if not bar_ends:
            continue

        bar_bounds = [staff_x0] + bar_ends
        n_bars_page = len(bar_ends)

        # Assign glyphs to nearest staff
        staff_glyphs = [[] for _ in range(len(staves))]
        for g in glyphs:
            gx0, gy0, gx1, gy1, ws, hs, spc, ptsc = g
            if gx0 < staff_x0:
                continue
            gcy = 0.5 * (gy0 + gy1)
            si = min(range(len(staves)), key=lambda i: abs(staves[i]["y_mid"] - gcy))
            if abs(staves[si]["y_mid"] - gcy) <= 14.0 * step_y:
                staff_glyphs[si].append(g)

        # Parse each measure on this page
        for b_i in range(n_bars_page):
            m_num = cur_m_num + b_i
            bx0 = bar_bounds[b_i]
            bx1 = bar_bounds[b_i + 1]
            beats_in_m = 4.0 if m_num in four_four_bars else default_beats_per_bar
            meas_beats[m_num] = beats_in_m

            # Concert key signature for this measure
            if is_what_we_do:
                # G major / E minor: F# (+1 on degree 3)
                concert_ks = [0, 0, 0, 1, 0, 0, 0]
            elif is_guthix:
                # D minor (Bb=-1 on deg 6) in m.1-36 & m.53-68; C minor (Bb,Eb,Ab=-1 on deg 6,2,5) in m.37-52 & m.69-84
                if (37 <= m_num <= 52) or (m_num >= 69):
                    concert_ks = [0, 0, -1, 0, 0, -1, -1]
                else:
                    concert_ks = [0, 0, 0, 0, 0, 0, -1]
            else:
                concert_ks = [0] * 7

            # First pass across staves in measure m_num: extract noteheads, rests, durations, pitches
            staff_raw_evs = {}
            anchor_x_to_q = []  # list of (x, q_beat) from staves whose durations sum to beats_in_m

            for si, st in enumerate(staves):
                if si >= len(staff_defs):
                    continue
                sname, sclef, strans, sis_drum, sskip = staff_defs[si]
                if sskip:
                    continue

                # Determine where musical content starts inside [bx0, bx1] (skipping system clef/keysig/timesig)
                mg = [g for g in staff_glyphs[si] if bx0 <= 0.5 * (g[0] + g[2]) < bx1 - 2.0]
                if not mg:
                    continue

                # Filter out clefs and time signature digits near bx0
                header_x_limit = bx0 + (220.0 if b_i == 0 else 85.0)
                accs = []
                dots = []
                flags8 = []
                flags16 = []
                beams = []
                tups = []
                nh_And_rests = []

                for gx0, gy0, gx1, gy1, ws, hs, spc, ptsc in mg:
                    gcx = 0.5 * (gx0 + gx1)
                    gcy = 0.5 * (gy0 + gy1)

                    # Skip clefs and time signatures
                    if (ws >= 4.8 and hs >= 12.0) or (2.4 <= ws <= 2.8 and 4.5 <= hs <= 5.1 and spc == 1 and gx0 < header_x_limit):
                        continue
                    if (3.1 <= ws <= 3.7 and 3.7 <= hs <= 4.3 and gx0 < header_x_limit) or (2.8 <= ws <= 3.3 and 3.7 <= hs <= 4.3 and spc == 2 and gx0 < header_x_limit):
                        continue
                    if 1.0 <= ws <= 1.4 and 2.7 <= hs <= 4.3 and gx0 < bx0 + 110.0:
                        continue  # percussion clef or time sig '1'

                    # Accidentals: sharp (2.0, 5.3, 2), flat (1.6, 5.0, 2), natural (1.4, 5.2, 2)
                    if 1.3 <= ws <= 2.2 and 4.7 <= hs <= 5.7 and spc == 2:
                        kind_acc = 1 if ws >= 1.85 else (-1 if ws >= 1.50 else 0)
                        accs.append((gcx, gcy, kind_acc))
                    # Augmentation dots
                    elif 0.72 <= ws <= 0.90 and 0.72 <= hs <= 0.90 and spc == 1:
                        dots.append((gcx, gcy))
                    # Tuplet '3'
                    elif 0.95 <= ws <= 1.25 and 1.45 <= hs <= 1.75 and ptsc >= 24:
                        tups.append(gcx)
                    # Flags (unbeamed 8th / 16th)
                    elif 2.10 <= ws <= 2.60 and 6.2 <= hs <= 7.0:
                        if spc >= 2:
                            flags16.append((gcx, gy0, gy1))
                        else:
                            flags8.append((gcx, gy0, gy1))
                    # Beams (parallelogram pts_cnt == 4)
                    elif ptsc == 4 and spc == 1 and ws >= 1.4 and 0.85 <= hs <= 3.2:
                        n_b = 1
                        beams.append((gx0, gx1, gy0, gy1, n_b))
                    # Noteheads: filled (2.6, 2.1, 1), hollow half (2.6, 2.1, 2), whole (3.0, 2.2, 2), X-notehead (2.4, 2.0, 1) or (3.1, 3.3, 3)
                    elif (2.25 <= ws <= 2.80 and 1.85 <= hs <= 2.35 and spc in (1, 2)) or \
                         (2.85 <= ws <= 3.35 and 1.95 <= hs <= 2.45 and spc == 2) or \
                         (sis_drum and 2.8 <= ws <= 3.5 and 3.0 <= hs <= 3.6 and spc >= 2):
                        if ws >= 2.85 and spc == 2 and hs <= 2.45:
                            nh_kind = "whole"
                        elif spc == 2 and hs <= 2.35:
                            nh_kind = "half"
                        else:
                            nh_kind = "quarter"
                        nh_And_rests.append((gcx, gcy, "note", nh_kind, gx0, gx1))
                    # Rests: whole/half (2.6, 1.1, 1), quarter (1.9, 5.9, 1), 8th (2.2, 3.7, 1), 16th (2.7, 5.7, 1)
                    elif 2.40 <= ws <= 2.80 and 0.95 <= hs <= 1.25 and spc == 1 and ptsc >= 6:
                        nh_And_rests.append((gcx, gcy, "rest", "half_or_whole", gx0, gx1))
                    elif 1.70 <= ws <= 2.05 and 5.5 <= hs <= 6.2 and spc == 1:
                        nh_And_rests.append((gcx, gcy, "rest", "quarter", gx0, gx1))
                    elif 2.05 <= ws <= 2.38 and 3.4 <= hs <= 3.95 and spc == 1 and ptsc >= 12:
                        nh_And_rests.append((gcx, gcy, "rest", "eighth", gx0, gx1))
                    elif 2.55 <= ws <= 2.90 and 5.4 <= hs <= 6.0 and spc == 1 and ptsc >= 15:
                        nh_And_rests.append((gcx, gcy, "rest", "sixteenth", gx0, gx1))

                if not nh_And_rests:
                    continue
                nh_And_rests.sort(key=lambda item: item[0])

                # If only a single whole/half rest in the bar and zero notes, skip resting staff
                if not any(it[2] == "note" for it in nh_And_rests):
                    continue

                # Base step for clef (top-down Y: step = round((y_bot - gcy) / step_y))
                base_step = 30 if sclef == "treble" else 18
                # Written key signature for transposing instruments
                if strans == -7:  # F Horn in What We Do (2 sharps: F#, C#)
                    ks_vec = [1, 0, 0, 1, 0, 0, 0]
                elif strans == -5:  # Alto Flute in G in Sound of Guthix (+1 flat compared to concert)
                    if (37 <= m_num <= 52) or (m_num >= 69):
                        ks_vec = [0, -1, -1, 0, 0, -1, -1]
                    else:
                        ks_vec = [0, 0, -1, 0, 0, 0, -1]
                else:
                    ks_vec = list(concert_ks)

                meas_acc = {}
                raw_events = []  # [x, kind, dur_q, [(midi_p, gcy)]]

                for gcx, gcy, ev_type, sub_kind, gx0, gx1 in nh_And_rests:
                    if ev_type == "note":
                        step_rel = int(round((st["y_bot"] - gcy) / step_y))
                        abs_st = base_step + step_rel

                        # Check in-bar accidental immediately to the left of notehead
                        for ax, ay, akind in accs:
                            if ax > bx0 + (125.0 if b_i == 0 else 45.0) and gx0 - 4.2 * step_y <= ax <= gx0 + 0.5 * step_y:
                                # Flat bbox center is shifted up by 1.10 * step_y
                                ay_note = ay + (1.10 * step_y if akind == -1 else 0.0)
                                if abs(ay_note - gcy) <= 0.85 * step_y:
                                    meas_acc[abs_st] = akind

                        alter = meas_acc.get(abs_st, ks_vec[abs_st % 7])
                        is_pitched_timp = sname == "Timpani"
                        if sis_drum and not is_pitched_timp:
                            midi_p = 45
                        else:
                            midi_p = _step_to_midi(abs_st, alter) + strans
                            for ox0, ox1, osemi in ( (o[1], o[2], o[3]) for o in oct_spans if o[0] == si ):
                                if ox0 <= gcx <= ox1:
                                    midi_p += osemi
                                    break

                        # Merge chord notes at same X
                        if raw_events and raw_events[-1][1] == "note" and abs(gcx - raw_events[-1][0]) <= 1.6 * step_y:
                            raw_events[-1][3].append((midi_p, gcy))
                            continue

                        # Determine rhythmic duration
                        if sub_kind == "whole":
                            dur_q = 4.0
                        elif sub_kind == "half":
                            dur_q = 2.0
                        else:
                            # Find attached stem
                            my_stems = [
                                s for s in stems
                                if gx0 - 0.6 * step_y <= s[0] <= gx1 + 0.6 * step_y
                                and s[1] - 1.5 * step_y <= gcy <= s[2] + 1.5 * step_y
                            ]
                            sx = my_stems[0][0] if my_stems else gcx
                            sy0 = (my_stems[0][1] if my_stems else gcy - 7.0 * step_y) - 1.0 * step_y
                            sy1 = (my_stems[0][2] if my_stems else gcy + 7.0 * step_y) + 1.0 * step_y

                            n_b = sum(
                                b_cnt for bx_0, bx_1, by_0, by_1, b_cnt in beams
                                if bx_0 - 0.8 * step_y <= sx <= bx_1 + 0.8 * step_y
                                and not (by_1 < sy0 or by_0 > sy1)
                            )
                            has_f16 = any(abs(fx - sx) <= 2.2 * step_y and not (fy1 < sy0 or fy0 > sy1) for fx, fy0, fy1 in flags16)
                            has_f8 = any(abs(fx - sx) <= 2.2 * step_y and not (fy1 < sy0 or fy0 > sy1) for fx, fy0, fy1 in flags8)

                            if n_b >= 2 or has_f16:
                                dur_q = 0.25
                            elif n_b == 1 or has_f8:
                                dur_q = 0.5
                            else:
                                dur_q = 1.0

                        # Augmentation dot
                        if any(gx1 <= dx <= gx1 + 3.0 * step_y and abs(dy - gcy) <= 1.2 * step_y for dx, dy in dots):
                            dur_q *= 1.5

                        raw_events.append([gcx, "note", dur_q, [(midi_p, gcy)]])
                    else:
                        if sub_kind == "half_or_whole":
                            r_dur = 2.0
                        elif sub_kind == "quarter":
                            r_dur = 1.0
                        elif sub_kind == "eighth":
                            r_dur = 0.5
                        else:
                            r_dur = 0.25
                        if any(gx1 <= dx <= gx1 + 3.0 * step_y and abs(dy - gcy) <= 1.5 * step_y for dx, dy in dots):
                            r_dur *= 1.5
                        raw_events.append([gcx, "rest", r_dur, []])

                # Apply tuplets ('3' -> multiply nearest 2-3 events by 2/3)
                used_tups = set()
                for tx in sorted(tups):
                    cands = [
                        (idx_e, abs(ev[0] - tx))
                        for idx_e, ev in enumerate(raw_events)
                        if idx_e not in used_tups and ev[2] <= 1.0 and abs(ev[0] - tx) <= (22.0 * step_y if n_bars_page <= 2 else 9.5 * step_y)
                    ]
                    cands.sort(key=lambda item: item[1])
                    # Pick up to 3 events whose durations sum to 1.5 (triplet 8ths) or 0.75 (triplet 16ths)
                    picked = []
                    s_q = 0.0
                    for idx_e, _ in cands:
                        picked.append(idx_e)
                        s_q += raw_events[idx_e][2]
                        if abs(s_q - 1.5) <= 0.05 or abs(s_q - 0.75) <= 0.05 or len(picked) == 3:
                            break
                    for idx_e in picked:
                        raw_events[idx_e][2] *= (2.0 / 3.0)
                        used_tups.add(idx_e)

                tot_q = sum(ev[2] for ev in raw_events)
                staff_raw_evs[si] = (raw_events, tot_q)
                if abs(tot_q - beats_in_m) <= 0.15 and len(raw_events) >= 2:
                    q_cur = 0.0
                    for ev in raw_events:
                        anchor_x_to_q.append((ev[0], q_cur))
                        q_cur += ev[2]

            # Build measure-wide X -> beat mapping from well-formed anchor staves if available
            x_knots = []
            q_knots = []
            if anchor_x_to_q:
                anchor_x_to_q.sort(key=lambda item: item[0])
                clusters_xq = []
                for ax, aq in anchor_x_to_q:
                    if not clusters_xq or ax - clusters_xq[-1][0][-1] > 1.2 * step_y:
                        clusters_xq.append(([ax], [aq]))
                    else:
                        clusters_xq[-1][0].append(ax)
                        clusters_xq[-1][1].append(aq)
                for xs_c, qs_c in clusters_xq:
                    mx = float(np.median(xs_c))
                    mq = float(np.median(qs_c))
                    if not q_knots or mq >= q_knots[-1] - 1e-3:
                        x_knots.append(mx)
                        q_knots.append(max(q_knots[-1] if q_knots else 0.0, mq))

            # Second pass: assign exact beat start/end to each note event in measure m_num
            for si, (raw_events, tot_q) in staff_raw_evs.items():
                sname, sclef, strans, sis_drum, sskip = staff_defs[si]
                use_own_q = abs(tot_q - beats_in_m) <= 0.25 or not x_knots
                scale_q = (beats_in_m / tot_q) if (tot_q > 0 and abs(tot_q - beats_in_m) > 0.04) else 1.0

                q_local = 0.0
                note_evs_in_bar = []
                for idx_e, (ev_x, kind, dur_q, p_list) in enumerate(raw_events):
                    eff_q = dur_q * scale_q
                    if use_own_q:
                        qs = q_local
                        qe = min(beats_in_m, q_local + eff_q)
                    else:
                        # Snap start to nearest vertical-alignment X knot
                        k_idx = int(np.argmin([abs(xk - ev_x) for xk in x_knots]))
                        if abs(x_knots[k_idx] - ev_x) <= 2.2 * step_y:
                            qs = q_knots[k_idx]
                        else:
                            qs = float(np.interp(ev_x, [bx0 + 40.0] + x_knots + [bx1], [0.0] + q_knots + [beats_in_m]))
                        qe = min(beats_in_m, qs + dur_q)
                    q_local += eff_q

                    if kind == "note" and p_list:
                        p_list.sort(key=lambda item: -item[0])
                        top_midi, top_y = p_list[0]
                        # Check if a tie arc (`op=B`) ends at (ev_x, top_y) from the left
                        is_tied_left = any(
                            tx0 < ev_x - 1.5 * step_y
                            and ev_x - 3.5 * step_y <= tx1 <= ev_x + 1.5 * step_y
                            and abs(tym - top_y) <= 2.2 * step_y
                            for tx0, tx1, tym in ties
                        )
                        note_evs_in_bar.append([qs, qe, top_midi, 92, is_tied_left, False])

                # Ensure consecutive notes on the same staff do not overlap
                for k in range(len(note_evs_in_bar) - 1):
                    if note_evs_in_bar[k][1] > note_evs_in_bar[k + 1][0]:
                        note_evs_in_bar[k][1] = max(note_evs_in_bar[k][0] + 0.08, note_evs_in_bar[k + 1][0])

                meas_events[m_num][si] = note_evs_in_bar

        cur_m_num += n_bars_page

    total_written_bars = cur_m_num - 1
    if total_written_bars <= 0:
        return []

    # 3. Expand measure sequence with repeats (`|: ... :|`)
    play_order = []
    m_cursor = 1
    while m_cursor <= total_written_bars:
        matched_rep = None
        for r_start, r_end in repeat_spans:
            if m_cursor == r_start:
                matched_rep = (r_start, r_end)
                break
        if matched_rep:
            r_start, r_end = matched_rep
            play_order.extend(range(r_start, r_end + 1))
            play_order.extend(range(r_start, r_end + 1))
            m_cursor = r_end + 1
        else:
            play_order.append(m_cursor)
            m_cursor += 1

    # 4. Stitch measures into global seconds timeline & fuse tied notes!
    staves_out = []
    for si, (sname, sclef, strans, sis_drum, sskip) in enumerate(staff_defs):
        if sskip:
            continue
        notes_sec = []
        q_global = 0.0
        for m_num in play_order:
            b_bar = meas_beats.get(m_num, default_beats_per_bar)
            for qs, qe, mp, vel, is_tied_left, has_tr in meas_events[m_num].get(si, []):
                s_sec = (q_global + qs) * sec_per_q
                e_sec = max(s_sec + 0.05, (q_global + qe) * sec_per_q)
                if (
                    not sis_drum
                    and notes_sec
                    and notes_sec[-1]["midi"] == mp
                    and abs(s_sec - notes_sec[-1]["end"]) <= 0.04
                    and (is_tied_left or (qe - qs >= b_bar - 0.1 and notes_sec[-1].get("_q_dur", 0.0) >= b_bar - 0.1))
                ):
                    notes_sec[-1]["end"] = e_sec
                    notes_sec[-1]["_q_dur"] += (qe - qs)
                else:
                    notes_sec.append(
                        {
                            "start": round(s_sec, 4),
                            "end": round(e_sec, 4),
                            "midi": int(mp),
                            "vel": int(vel),
                            "trill": bool(has_tr),
                            "_q_dur": qe - qs,
                        }
                    )
            q_global += b_bar

        for item in notes_sec:
            item.pop("_q_dur", None)
        if notes_sec:
            staves_out.append(
                {
                    "name": sname,
                    "program": 0,
                    "is_drum": bool(sis_drum),
                    "notes": notes_sec,
                }
            )

    return staves_out

