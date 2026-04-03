#!/usr/bin/env python3
"""Batch analyze all Veneta 1972-08-27 tracks."""

import json
import os
import sys
from pathlib import Path

os.environ["SKIP_CLAP"] = "1"

sys.path.insert(0, str(Path(__file__).parent))
from analyze import analyze_track

SHOW_DIR = Path(__file__).resolve().parent.parent / "data" / "shows" / "1972-08-27"
TRACKS_DIR = SHOW_DIR / "tracks"
AUDIO_DIR = Path(__file__).resolve().parent.parent / "public" / "audio"

TRACKS_DIR.mkdir(parents=True, exist_ok=True)

with open(SHOW_DIR / "setlist.json") as f:
    setlist = json.load(f)

timeline_tracks = []
global_offset = 0

for song in setlist["songs"]:
    track_id = song["trackId"]
    audio_file = song["audioFile"]
    audio_path = AUDIO_DIR / audio_file
    output_path = TRACKS_DIR / f"{track_id}-analysis.json"

    if output_path.exists():
        print(f"SKIP: {track_id} already analyzed")
        with open(output_path) as af:
            existing = json.load(af)
        total_frames = existing["meta"]["totalFrames"]
        timeline_tracks.append({
            "trackId": track_id,
            "globalFrameStart": global_offset,
            "globalFrameEnd": global_offset + total_frames,
            "totalFrames": total_frames,
        })
        global_offset += total_frames
        continue

    if not audio_path.exists():
        print(f"SKIP: {audio_file} not found")
        timeline_tracks.append({
            "trackId": track_id,
            "globalFrameStart": global_offset,
            "globalFrameEnd": global_offset,
            "totalFrames": 0,
            "missing": True,
        })
        continue

    print(f"\n{'='*60}")
    print(f"Analyzing: {song['title']} ({track_id})")
    print(f"{'='*60}")
    result = analyze_track(audio_path, output_path, None)
    total_frames = result["meta"]["totalFrames"]

    timeline_tracks.append({
        "trackId": track_id,
        "globalFrameStart": global_offset,
        "globalFrameEnd": global_offset + total_frames,
        "totalFrames": total_frames,
    })
    global_offset += total_frames

# Write show timeline
timeline = {
    "showDate": "1972-08-27",
    "totalFrames": global_offset,
    "tracks": timeline_tracks,
}

timeline_path = SHOW_DIR / "show-timeline.json"
with open(timeline_path, "w") as f:
    json.dump(timeline, f, indent=2)

print(f"\nTimeline written: {timeline_path}")
print(f"Total frames: {global_offset} ({global_offset / 30 / 60:.1f} min)")
print("Done!")
