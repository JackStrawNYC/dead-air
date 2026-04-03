#!/usr/bin/env python3
"""
Trim trailing silence from MP3 files.

For each MP3 in the target directory:
  1. Detect silence using ffmpeg silencedetect filter
  2. Find the last non-silent audio timestamp
  3. Trim to 10 seconds after the last non-silent audio
  4. Overwrite the original file

Usage:
  python3 scripts/trim-dead-air.py [directory]
  python3 scripts/trim-dead-air.py public/audio/veneta-72/
"""

import os
import re
import subprocess
import sys

PADDING_SEC = 10  # seconds to keep after last sound
SILENCE_THRESHOLD = "-50dB"
SILENCE_DURATION = "3"  # minimum silence gap to detect


def get_duration(path: str) -> float | None:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True
    )
    try:
        return float(result.stdout.strip())
    except ValueError:
        return None


def detect_last_silence_start(path: str) -> float | None:
    result = subprocess.run(
        ["ffmpeg", "-i", path, "-af", f"silencedetect=noise={SILENCE_THRESHOLD}:d={SILENCE_DURATION}", "-f", "null", "-"],
        capture_output=True, text=True
    )
    stderr = result.stderr
    matches = re.findall(r"silence_start:\s*([\d.]+)", stderr)
    if matches:
        return float(matches[-1])
    return None


def trim_file(path: str, trim_to: float) -> bool:
    tmp_path = path + ".trimmed.mp3"
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", path, "-t", str(trim_to), "-c", "copy", tmp_path],
        capture_output=True, text=True
    )
    if result.returncode == 0 and os.path.exists(tmp_path):
        os.replace(tmp_path, path)
        return True
    else:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        return False


def main():
    audio_dir = sys.argv[1] if len(sys.argv) > 1 else "public/audio/veneta-72"

    if not os.path.isdir(audio_dir):
        print(f"ERROR: Directory not found: {audio_dir}")
        sys.exit(1)

    mp3_files = sorted([f for f in os.listdir(audio_dir) if f.endswith(".mp3")])
    if not mp3_files:
        print(f"No MP3 files found in {audio_dir}")
        sys.exit(0)

    print(f"Scanning {len(mp3_files)} MP3 files in {audio_dir} ...")
    print(f"Silence threshold: {SILENCE_THRESHOLD}, min duration: {SILENCE_DURATION}s")
    print(f"Padding after last sound: {PADDING_SEC}s")
    print()

    trimmed = 0
    skipped = 0

    for mp3 in mp3_files:
        path = os.path.join(audio_dir, mp3)
        duration = get_duration(path)

        if duration is None:
            print(f"  SKIP: {mp3} (can't read duration)")
            skipped += 1
            continue

        last_silence = detect_last_silence_start(path)

        if last_silence is None:
            print(f"  OK:   {mp3} — no trailing silence ({duration:.1f}s)")
            skipped += 1
            continue

        trim_to = last_silence + PADDING_SEC
        savings = duration - trim_to

        if savings < 5.0:
            print(f"  OK:   {mp3} — trailing silence < 5s ({duration:.1f}s)")
            skipped += 1
            continue

        print(f"  TRIM: {mp3} — {duration:.1f}s -> {trim_to:.1f}s (saving {savings:.1f}s)")

        if trim_file(path, trim_to):
            trimmed += 1
        else:
            print(f"    ERROR: trim failed, keeping original")
            skipped += 1

    print()
    print(f"Done: {trimmed} trimmed, {skipped} unchanged, {len(mp3_files)} total")


if __name__ == "__main__":
    main()
