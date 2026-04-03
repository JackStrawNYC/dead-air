#!/usr/bin/env python3
"""Generate psychedelic poster art for Veneta 8/27/72 via Recraft V4 Pro on Replicate."""

import json, os, sys, requests
from pathlib import Path

import dotenv
dotenv.load_dotenv()
dotenv.load_dotenv(Path(__file__).resolve().parents[3] / ".env")

import replicate

ROOT = Path(__file__).resolve().parents[1]
SETLIST = ROOT / "data/shows/1972-08-27/setlist.json"
ART_DIR = ROOT / "public/assets/song-art/veneta-72"
ART_DIR.mkdir(parents=True, exist_ok=True)

MODEL = "recraft-ai/recraft-v4-pro"
SIZE = "2560x1664"

DRY_RUN = "--dry-run" in sys.argv
FORCE = "--force" in sys.argv
TRACK = next((a.split("=")[1] for a in sys.argv if a.startswith("--track=")), None)

SHOW_POSTER_PROMPT = """Psychedelic concert poster art for "The Grateful Dead — Sunshine Daydream — August 27, 1972".
Ornate art nouveau border with organic flowering vines, sunflowers, and sacred geometry patterns.
Open air Oregon countryside festival scene: golden afternoon sunlight, rolling green hills, tall Douglas fir trees, a makeshift wooden stage in a clearing, crowd of barefoot hippies in tie-dye dancing on grass, VW buses and school buses parked in a meadow.
The text "GRATEFUL DEAD" rendered in massive ornate psychedelic hand-lettered typography at the top.
Below it: "Sunshine Daydream" in elegant flowing secondary lettering.
Below that: "Old Renaissance Faire Grounds — Veneta, Oregon — August 27, 1972" in smaller decorative type.
Dancing skeleton figures, Grateful Dead bears, steal your face skull and lightning bolt motifs, sunflower and daisy patterns, tie-dye color swirls woven into the border.
Rich warm earth-tone palette with bursts of psychedelic color, intricate linework details, luminous golden-hour glow, professional concert poster illustration.
Landscape orientation, cinematic wide composition."""

SONG_IMAGERY = {
    "d1t01": "Open highway stretching to the horizon through golden wheat fields, '50s Cadillac convertible, American flag waving, Chuck Berry guitar silhouette, endless blue sky",
    "d1t02": "Weeping woman standing at a misty crossroads, spanish moss hanging from ancient oaks, guitar strings dripping honey and tears, warm amber and deep violet twilight",
    "d1t03": "Dusty western trail through canyon country, two cowboys on horseback silhouetted against a blood-orange sunset, playing cards and silver dollars scattered on red rock",
    "d1t04": "Cascading poker chips and playing cards, smoky card room with green felt table, chandelier throwing prismatic light, whiskey glass catching golden light",
    "d1t05": "Dark wind howling through a desert canyon at night, tumbleweed spinning, distant coyote silhouette on a mesa, deep indigo sky with swirling storm clouds",
    "d1t06": "Giant cosmic sunflower with a cat's face in the center, surrounded by prismatic rainbow light, butterflies made of stained glass, psychedelic garden under alien stars",
    "d1t07": "Midnight rider on horseback galloping through moonlit countryside, shooting stars overhead, fiddle and banjo floating in cosmic clouds, warm amber and deep indigo",
    "d1t08": "Mexican cantina scene with strings of papel picado, mariachi guitar silhouette, tequila sunrise colors, distant Baja coastline, warm terracotta and turquoise",
    "d1t09": "Skeleton woman in Victorian dress dancing wildly at a masquerade ball, chandeliers swinging, roses flying through the air, electric energy and flowing gown",
    "d1t10": "Infinite fractal landscape of musical instruments morphing into each other, guitars becoming rivers, drums becoming mountains, cosmic jam session in abstract space",
    "d2t01": "Empty chair at a table set for dinner, single candle burning low, photograph fading in golden light, autumn leaves blowing through an open window, melancholy warmth",
    "d2t02": "Railroad tracks vanishing into golden harvest fields, scarecrow silhouette, approaching thunderstorm, lightning on the horizon",
    "d2t03": "Ethereal bird made of pure light soaring through a twilight forest canopy, feathers dissolving into musical notes, dappled golden sunbeams, deep emerald and amber",
    "d2t04": "Giant open storybook with scenes erupting from the pages in 3D, castle towers, dragons, heroic figures, bold comic-book energy, vivid primary colors",
    "d2t05": "Drum kit floating weightless in deep space nebula, galaxies and star clusters swirling, cosmic percussion waves rippling through spacetime, primal rhythmic energy",
    "d2t06": "Infinite deep space void with a single brilliant dark star, cosmic dust spiraling inward, event horizon warping light, fractal geometry emerging from the darkness",
    "d3t01": "Dark star exploding outward in slow motion, nebula birth, new galaxies forming, transcendent light emerging from total darkness, cosmic creation",
    "d3t02": "Desert sunset over Mexican border town, adobe buildings, saguaro cacti, warm amber and terracotta tones, distant mountains, Rosa's cantina glowing",
    "d3t03": "Weathered front porch of a rural homestead at dusk, acoustic guitar leaning against a rocking chair, fireflies in the yard, country road vanishing into twilight",
    "d3t04": "Magnificent magnolia tree in full explosive bloom, blossoms radiating golden light, hummingbirds and butterflies swirling, sunshine streaming through petals, pure joy",
    "d3t05": "Runaway steam locomotive barreling through the night, cocaine snow swirling in headlight beams, railroad switch ahead, dangerous curves, hot red and steel blue",
    "d3t06": "Full moon party night, concert crowd celebrating with arms raised, fireworks exploding, neon Saturday night energy, electric blues and hot pinks",
    "d3t07": "Choir of angels in flowing robes singing in harmonious farewell, golden light radiating from clasped hands, peaceful sunset clouds, gentle benediction, sacred warmth",
}

def build_prompt(title: str, track_id: str) -> str:
    imagery = SONG_IMAGERY.get(track_id, "")
    parts = [
        f'Psychedelic concert poster art for the Grateful Dead song "{title}".',
        'Ornate art nouveau border with organic flowering vines, sunflowers, and sacred geometry patterns.',
        f'{imagery}.' if imagery else '',
        f'The song title "{title}" rendered in ornate psychedelic hand-lettered typography prominently at the top of the composition.',
        'Below the title in smaller type: "Grateful Dead — Veneta, Oregon — August 27, 1972"',
        'Dancing skeleton figures, Grateful Dead bears, steal your face skull and lightning bolt motifs, tie-dye color swirls.',
        'Rich saturated warm earth-tone palette with psychedelic color bursts, intricate linework details, luminous golden-hour glow, professional concert poster illustration.',
        'Landscape orientation, cinematic wide composition.',
    ]
    return '\n'.join(p for p in parts if p)

def generate(prompt: str, out_path: Path):
    print(f"  Generating...")
    output = replicate.run(MODEL, input={"prompt": prompt, "size": SIZE})
    url = output.url if hasattr(output, 'url') else str(output)
    print(f"  Downloading from {url[:60]}...")
    r = requests.get(url)
    out_path.write_bytes(r.content)
    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"  ✓ Saved: {out_path.name} ({size_mb:.1f} MB)")

def main():
    with open(SETLIST) as f:
        setlist = json.load(f)

    # Show poster
    poster_path = ART_DIR / "show-poster.png"
    if TRACK in (None, "show-poster"):
        if not poster_path.exists() or FORCE:
            print("\n=== Show Poster ===")
            if DRY_RUN:
                print(f"  Prompt: {SHOW_POSTER_PROMPT[:100]}...")
            else:
                generate(SHOW_POSTER_PROMPT, poster_path)
        else:
            print(f"  SKIP: show-poster (exists)")

    # Song art
    for song in setlist["songs"]:
        tid = song["trackId"]
        title = song["title"]
        if TRACK and TRACK != tid:
            continue

        out_path = ART_DIR / f"{tid}.png"
        if out_path.exists() and not FORCE:
            print(f"  SKIP: {tid} — {title} (exists)")
            continue

        prompt = build_prompt(title, tid)
        print(f"\n=== {tid}: {title} ===")
        if DRY_RUN:
            print(f"  Prompt: {prompt[:120]}...")
        else:
            try:
                generate(prompt, out_path)
            except Exception as e:
                print(f"  ✗ Error: {e}")

    print("\nDone!")

if __name__ == "__main__":
    main()
