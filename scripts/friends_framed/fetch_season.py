import argparse
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
import math
import os
import re
import warnings
from PIL import Image, ImageDraw, ImageStat
import requests

warnings.filterwarnings("ignore")

TMDB_KEY = "f5cc68dfbe5836293db6212bb383ffff"
IMDB_GQL = "https://api.graphql.imdb.com/"
FANDOM_API = "https://friends.fandom.com/api.php"
TVMAZE_URL = "https://api.tvmaze.com/shows/431/episodes"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
HEADERS = {
    "User-Agent": UA,
    "Content-Type": "application/json",
    "x-imdb-client-name": "imdb-web-next",
}


def amazon_1200_url(url: str) -> str:
    return re.sub(r"\._V1_.*?\.(jpg|jpeg|png)$", r"._V1_QL86_UX1200_.\1", url, flags=re.IGNORECASE)


def is_color_image(im: Image.Image) -> bool:
    hsv = im.convert("HSV")
    mean_sat = ImageStat.Stat(hsv).mean[1]
    return mean_sat >= 14.0


def dhash64(im: Image.Image) -> int:
    # Crop inner 80% so black pillarboxes don't make different 4:3 shots look similar
    w, h = im.size
    cropped = im.crop((int(w * 0.1), int(h * 0.1), int(w * 0.9), int(h * 0.9))).convert("L").resize((9, 8), Image.Resampling.BILINEAR)
    px = list(cropped.getdata())
    bits = 0
    for r in range(8):
        row = r * 9
        for c in range(8):
            bits = (bits << 1) | (1 if px[row + c] > px[row + c + 1] else 0)
    return bits


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def fetch_and_process_image(url: str, fallback_url: str = None, extra_headers: dict = None):
    urls = [u for u in (url, fallback_url) if u]
    hdrs = {"User-Agent": UA}
    if extra_headers:
        hdrs.update(extra_headers)
    for u in urls:
        try:
            r = requests.get(u, headers=hdrs, timeout=14)
            if r.status_code == 200 and len(r.content) > 4000:
                im = Image.open(BytesIO(r.content)).convert("RGB")
                if im.width / max(1, im.height) < 1.12:
                    return None
                if im.width < 450 or im.height < 270:
                    return None
                if not is_color_image(im):
                    return None
                if im.width > 1200:
                    new_h = int(round(im.height * (1200 / im.width)))
                    im = im.resize((1200, new_h), Image.Resampling.LANCZOS)
                return im
        except Exception:
            pass
    return None


def get_fandom_supplement_urls(title: str):
    variants = [
        title,
        title.replace(" with ", " With ").replace(" the ", " The ").replace(" a ", " A ").replace(" an ", " An "),
        re.sub(r": Part (\d)", r", Part \1", title),
    ]
    seen_titles = set()
    urls = []
    for t in variants:
        if t in seen_titles:
            continue
        seen_titles.add(t)
        try:
            r = requests.get(
                FANDOM_API,
                params={"action": "query", "titles": t, "prop": "images", "imlimit": 50, "format": "json"},
                headers={"User-Agent": UA},
                timeout=10,
            ).json()
            pages = r.get("query", {}).get("pages", {})
            img_titles = []
            for p in pages.values():
                for im in p.get("images", []):
                    name = im["title"]
                    low = name.lower()
                    if any(ext in low for ext in (".jpg", ".jpeg", ".png")) and not any(
                        bad in low for bad in ("logo", "icon", "dvd", "poster", "promo", "cast")
                    ):
                        img_titles.append(name)
            if img_titles:
                r2 = requests.get(
                    FANDOM_API,
                    params={
                        "action": "query",
                        "titles": "|".join(img_titles[:25]),
                        "prop": "imageinfo",
                        "iiprop": "url|dimensions",
                        "format": "json",
                    },
                    headers={"User-Agent": UA},
                    timeout=10,
                ).json()
                for p2 in r2.get("query", {}).get("pages", {}).values():
                    for ii in p2.get("imageinfo", []):
                        w = ii.get("width", 0)
                        h = ii.get("height", 1)
                        if w >= 450 and (w / max(1, h)) >= 1.12:
                            urls.append(("fandom", ii["url"], {"Referer": "https://friends.fandom.com/"}))
                if urls:
                    break
        except Exception:
            pass
    return urls


_TMDB_SEASON_CACHE = {}


def _norm_ep_title(t: str) -> str:
    s = t.lower().replace("the one ", "").replace("part i", "part 1").replace("part ii", "part 2")
    return re.sub(r"[^a-z0-9]", "", s)


def get_tmdb_supplement_urls(season: int, episode: int, title: str = ""):
    urls = []
    try:
        if season not in _TMDB_SEASON_CACHE:
            sr = requests.get(
                f"https://api.themoviedb.org/3/tv/1668/season/{season}",
                params={"api_key": TMDB_KEY},
                timeout=10,
            ).json()
            _TMDB_SEASON_CACHE[season] = sr.get("episodes", [])

        target_norm = _norm_ep_title(title) if title else ""
        matched_ep_num = None
        for ep_obj in _TMDB_SEASON_CACHE[season]:
            cand_norm = _norm_ep_title(ep_obj.get("name", ""))
            if target_norm and cand_norm == target_norm:
                matched_ep_num = ep_obj.get("episode_number")
                break
        if matched_ep_num is None:
            return urls

        r = requests.get(
            f"https://api.themoviedb.org/3/tv/1668/season/{season}/episode/{matched_ep_num}/images",
            params={"api_key": TMDB_KEY},
            timeout=10,
        ).json()
        for st in r.get("stills", []):
            fp = st.get("file_path")
            if fp:
                urls.append(("tmdb", f"https://image.tmdb.org/t/p/w1280{fp}", None))
    except Exception:
        pass
    return urls


def get_youtube_clip_frame_urls(season: int, episode: int, title: str):
    # Query YouTube for clips of this exact episode and pull raw auto-extracted video frames (maxres1..3)
    urls = []
    seen_vids = set()
    queries = [
        f'Friends "{title}"',
        f'Friends {season}x{episode:02d} "{title}"',
    ]
    bad_words = ("compilation", "top 10", "every time", "best of", "bloopers", "gag reel", "reaction", "popcorn", "roulette", "interview", "reunion", "#shorts", "promo", "trailer", "intro", "theme song", "theone_with", "first time", "podcast", "review", "spoiler", "prism", "worst")
    for q in queries:
        try:
            r = requests.get(
                "https://www.youtube.com/results",
                params={"search_query": q},
                headers={"User-Agent": UA},
                timeout=10,
            )
            matches = re.findall(
                r'"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"\}',
                r.text,
            )
            for vid, vtitle in matches[:8]:
                if vid in seen_vids:
                    continue
                low = vtitle.lower().strip()
                if len(low) <= 9 or any(bw in low for bw in bad_words):
                    continue
                seen_vids.add(vid)
                for variant in ("maxres1.jpg", "maxres2.jpg", "maxres3.jpg"):
                    urls.append((f"yt:{vtitle[:22]}", f"https://i.ytimg.com/vi/{vid}/{variant}", None))
            if len(seen_vids) >= 5:
                break
        except Exception:
            pass
    return urls


def make_contact_sheet(ep_meta, saved_records, ep_folder):
    if not saved_records:
        return
    cols = 4
    rows = math.ceil(len(saved_records) / cols)
    cell_w, cell_h = 380, 250
    img_w, img_h = 364, 205
    header_h = 64
    sheet_w = cols * cell_w + 16
    sheet_h = header_h + rows * cell_h + 16

    sheet = Image.new("RGB", (sheet_w, sheet_h), (20, 18, 16))
    draw = ImageDraw.Draw(sheet)

    code = f"S{int(ep_meta['season']):02d}E{int(ep_meta['episode']):02d}"
    title_line = f"{code} ({ep_meta['imdb_id']}) - {ep_meta['title']} [{len(saved_records)} clean color stills]"
    plot_line = (ep_meta.get("plot") or "")[:185]
    draw.text((16, 12), title_line, fill=(245, 238, 225))
    draw.text((16, 36), plot_line, fill=(175, 165, 150))

    for pos, rec in enumerate(saved_records):
        idx = rec["idx"]
        r_idx = pos // cols
        c_idx = pos % cols
        x0 = 8 + c_idx * cell_w + 8
        y0 = header_h + r_idx * cell_h + 6

        im = Image.open(os.path.join(ep_folder, f"{idx:02d}.jpg"))
        im.thumbnail((img_w, img_h), Image.Resampling.LANCZOS)

        draw.rectangle([x0, y0, x0 + img_w, y0 + img_h], fill=(8, 8, 8), outline=(70, 65, 60))
        ox = x0 + (img_w - im.width) // 2
        oy = y0 + (img_h - im.height) // 2
        sheet.paste(im, (ox, oy))

        src_short = rec["src"].split(":")[0]
        badge_txt = f"#{idx:02d} [{src_short}]"
        draw.rectangle([x0 + 4, y0 + 4, x0 + 118, y0 + 24], fill=(226, 168, 41))
        draw.text((x0 + 8, y0 + 8), badge_txt, fill=(20, 16, 12))

        names = rec.get("names") or []
        names_short = ", ".join(
            n.split()[-1]
            if n
            in (
                "Jennifer Aniston",
                "Courteney Cox",
                "Lisa Kudrow",
                "Matt LeBlanc",
                "Matthew Perry",
                "David Schwimmer",
            )
            else n
            for n in names
        )
        if not names_short:
            names_short = rec["src"] if ":" in rec["src"] else "(untagged)"
        draw.text((x0 + 2, y0 + img_h + 6), names_short[:52], fill=(210, 200, 185))

    sheet.save(os.path.join(ep_folder, "sheet.jpg"), "JPEG", quality=85)


def process_episode(args):
    ep_meta, imdb_edges, tvmaze_url, out_root, only_codes = args
    s = int(ep_meta["season"])
    e = int(ep_meta["episode"])
    code = f"S{s:02d}E{e:02d}"
    ep_folder = os.path.join(out_root, code)

    if only_codes and code not in only_codes:
        # Keep existing records untouched
        existing = sorted(f for f in os.listdir(ep_folder) if re.match(r"^\d+\.jpg$", f)) if os.path.exists(ep_folder) else []
        return code, ep_meta["title"], len(existing), []

    # Clean folder if rebuilding this episode
    if os.path.exists(ep_folder):
        for f in os.listdir(ep_folder):
            os.remove(os.path.join(ep_folder, f))
    os.makedirs(ep_folder, exist_ok=True)

    candidates = []
    for edge in imdb_edges:
        n = edge["node"]
        w = n.get("width") or 1
        h = n.get("height") or 1
        if w / max(1, h) >= 1.12:
            names = [x["nameText"]["text"] for x in (n.get("names") or [])]
            candidates.append(("imdb", amazon_1200_url(n["url"]), n["url"], names, None))

    saved_records = []
    seen_hashes = []
    next_idx = 0

    def try_add(src, u1, u2=None, names=None, extra_hdrs=None):
        nonlocal next_idx
        im = fetch_and_process_image(u1, u2, extra_hdrs)
        if im is None:
            return False
        dh = dhash64(im)
        if any(hamming(dh, prev) <= 6 for prev in seen_hashes):
            return False
        seen_hashes.append(dh)
        out_p = os.path.join(ep_folder, f"{next_idx:02d}.jpg")
        im.save(out_p, "JPEG", quality=84, optimize=True)
        saved_records.append({"idx": next_idx, "src": src, "w": im.width, "h": im.height, "names": names or []})
        next_idx += 1
        return True

    for src, u1, u2, names, eh in candidates[:24]:
        try_add(src, u1, u2, names, eh)

    # Top up with TMDb + Fandom + TVMaze if < 11 unique stills
    if len(saved_records) < 11:
        extra = get_tmdb_supplement_urls(s, e, ep_meta["title"]) + get_fandom_supplement_urls(ep_meta["title"])
        if tvmaze_url:
            extra.append(("tvmaze", tvmaze_url, None))
        for src, u1, eh in extra:
            if len(saved_records) >= 18:
                break
            try_add(src, u1, None, [], eh)

    # Top up with raw HD YouTube clip frames (maxres1..3) if still < 11 unique stills!
    if len(saved_records) < 11:
        yt_extra = get_youtube_clip_frame_urls(s, e, ep_meta["title"])
        for src, u1, eh in yt_extra:
            if len(saved_records) >= 18:
                break
            try_add(src, u1, None, [], eh)

    make_contact_sheet(ep_meta, saved_records, ep_folder)
    return code, ep_meta["title"], len(saved_records), saved_records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--episodes-json", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--only-codes", default="", help="Comma-separated episode codes to rebuild")
    args = parser.parse_args()

    only_codes = {x.strip() for x in args.only_codes.split(",") if x.strip()}

    with open(args.episodes_json) as f:
        all_eps = json.load(f)

    season_eps = sorted(
        [x for x in all_eps if int(x["season"]) == args.season],
        key=lambda x: int(x["episode"]),
    )
    os.makedirs(args.out_dir, exist_ok=True)

    imdb_ids = [x["imdb_id"] for x in season_eps]
    q = {
        "query": f"""
        {{
          titles(ids: {json.dumps(imdb_ids)}) {{
            id
            images(first: 30, filter: {{ types: ["still_frame"] }}) {{
              total
              edges {{
                node {{
                  id
                  url
                  width
                  height
                  names {{ nameText {{ text }} }}
                }}
              }}
            }}
          }}
        }}
        """
    }
    r = requests.post(IMDB_GQL, json=q, headers=HEADERS, timeout=25).json()
    by_id = {t["id"]: t["images"]["edges"] for t in r["data"]["titles"] if t}

    # Fetch TVMaze episode image map (optional fallback)
    tvmaze_map = {}
    try:
        rtv = requests.get(TVMAZE_URL, headers={"User-Agent": UA}, timeout=12).json()
        for item in rtv:
            img = (item.get("image") or {}).get("original")
            if img and item.get("season") == args.season:
                # Note TVMaze splits two-parters in later seasons; match by normalized title too
                tvmaze_map[item.get("name", "").lower()] = img
    except Exception:
        pass

    work = [
        (ep, by_id.get(ep["imdb_id"], []), tvmaze_map.get(ep["title"].lower()), args.out_dir, only_codes)
        for ep in season_eps
    ]
    manifest = {}
    print(f"Fetching Season {args.season} ({len(season_eps)} episodes)...")
    with ThreadPoolExecutor(max_workers=8) as ex:
        for code, title, count, recs in ex.map(process_episode, work):
            manifest[code] = {"title": title, "count": count, "stills": recs}
            print(f"  {code}: {count:2d} clean color landscape stills | {title}")

    with open(os.path.join(args.out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)


if __name__ == "__main__":
    main()
