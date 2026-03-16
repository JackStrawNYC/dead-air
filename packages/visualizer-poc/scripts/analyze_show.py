#!/usr/bin/env python3
"""
Batch audio analysis for a full show.
Runs analyze.py on all tracks in the setlist and generates a show timeline.

Usage:
  python analyze_show.py [--resume] [--audio-dir=/path/to/audio]

The audio directory is resolved from (in priority order):
  1. --audio-dir CLI argument
  2. setlist.json "audioDir" field
  3. public/audio/ (default)

Output:
  data/tracks/{trackId}-analysis.json   (per-track)
  data/show-timeline.json               (global frame offsets)
"""

import json
import os
import sys
from pathlib import Path

# Import the single-track analyzer
sys.path.insert(0, str(Path(__file__).parent))
from analyze import analyze_track

# Support env var overrides for Docker (fall back to relative paths for local dev)
_DATA_DIR_ENV = os.environ.get("DEAD_AIR_DATA_DIR")
_AUDIO_DIR_ENV = os.environ.get("DEAD_AIR_AUDIO_DIR")
_STEMS_DIR_ENV = os.environ.get("DEAD_AIR_STEMS_DIR")

DATA_DIR = Path(_DATA_DIR_ENV) if _DATA_DIR_ENV else Path(__file__).resolve().parent.parent / "data"
TRACKS_DIR = DATA_DIR / "tracks"
SETLIST_PATH = DATA_DIR / "setlist.json"
PUBLIC_AUDIO_DIR = Path(_AUDIO_DIR_ENV) if _AUDIO_DIR_ENV else Path(__file__).resolve().parent.parent / "public" / "audio"

FPS = 30


def main():
    resume = "--resume" in sys.argv

    # Parse --audio-dir and --stems-dir arguments
    cli_audio_dir = None
    cli_stems_dir = None
    for arg in sys.argv[1:]:
        if arg.startswith("--audio-dir="):
            cli_audio_dir = Path(arg.split("=", 1)[1])
        elif arg.startswith("--stems-dir="):
            cli_stems_dir = Path(arg.split("=", 1)[1])

    # Load setlist
    with open(SETLIST_PATH) as f:
        setlist = json.load(f)

    # Resolve audio directory: CLI > setlist.audioDir > public/audio/
    if cli_audio_dir:
        audio_dir = cli_audio_dir
    elif "audioDir" in setlist:
        audio_dir = Path(setlist["audioDir"])
        if not audio_dir.is_absolute():
            audio_dir = DATA_DIR / audio_dir
    else:
        audio_dir = PUBLIC_AUDIO_DIR

    # Resolve stems base directory: CLI > env var > ../../data/stems/
    if cli_stems_dir:
        stems_base = cli_stems_dir
    elif _STEMS_DIR_ENV:
        stems_base = Path(_STEMS_DIR_ENV)
    else:
        stems_base = DATA_DIR.parent.parent / "data" / "stems"
    print(f"Audio directory: {audio_dir}")
    print(f"Stems base directory: {stems_base}")

    TRACKS_DIR.mkdir(parents=True, exist_ok=True)

    timeline_tracks = []
    global_offset = 0
    total_duration = 0.0

    for song in setlist["songs"]:
        track_id = song["trackId"]
        audio_file = song["audioFile"]
        audio_path = audio_dir / audio_file
        output_path = TRACKS_DIR / f"{track_id}-analysis.json"

        if not audio_path.exists():
            print(f"SKIP: {audio_file} not found at {audio_path}")
            # Still advance timeline with placeholder
            timeline_tracks.append({
                "trackId": track_id,
                "globalFrameStart": global_offset,
                "globalFrameEnd": global_offset,
                "totalFrames": 0,
                "missing": True,
            })
            continue

        if resume and output_path.exists():
            print(f"RESUME: {track_id} already analyzed, loading metadata ...")
            with open(output_path) as f:
                existing = json.load(f)
            total_frames = existing["meta"]["totalFrames"]
            track_duration = existing["meta"]["duration"]
        else:
            print(f"\n{'='*60}")
            print(f"Analyzing: {song['title']} ({track_id})")
            print(f"{'='*60}")
            # Auto-detect stems dir for this track
            track_stems_dir = stems_base / track_id
            stems_dir = track_stems_dir if track_stems_dir.is_dir() else None
            if stems_dir:
                print(f"  Stems found: {stems_dir}")
            result = analyze_track(audio_path, output_path, stems_dir)
            total_frames = result["meta"]["totalFrames"]
            track_duration = result["meta"]["duration"]

        timeline_tracks.append({
            "trackId": track_id,
            "globalFrameStart": global_offset,
            "globalFrameEnd": global_offset + total_frames,
            "totalFrames": total_frames,
        })

        global_offset += total_frames
        total_duration += track_duration

    # Write show timeline
    timeline = {
        "date": setlist["date"],
        "totalFrames": global_offset,
        "totalDuration": round(total_duration, 2),
        "tracks": timeline_tracks,
    }

    timeline_path = DATA_DIR / "show-timeline.json"
    with open(timeline_path, "w") as f:
        json.dump(timeline, f, indent=2)

    total_hours = total_duration / 3600
    print(f"\n{'='*60}")
    print(f"Show timeline: {len(timeline_tracks)} tracks")
    print(f"Total frames: {global_offset:,}")
    print(f"Total duration: {total_hours:.1f} hours ({total_duration:.0f}s)")
    print(f"Written to: {timeline_path}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
