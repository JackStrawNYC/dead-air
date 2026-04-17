#!/usr/bin/env python3
"""
Analyze separated stem WAV files and merge per-frame features into
the existing analysis JSON.

For each stem (vocals, drums, bass, other):
  - Compute RMS energy per frame
  - Detect onsets (drum hits, vocal attacks)
  - Detect beat presence (drum beats)

Merges results into the existing analysis JSON's frames array:
  - stemBassRms, stemDrumOnset, stemDrumBeat, stemVocalRms,
    stemVocalPresence, stemOtherRms, stemOtherCentroid

Usage:
  python analyze_stems.py --stems-dir data/stems/track-id \
    --analysis data/tracks/track-id-analysis.json
"""

import json
import sys
import argparse
from pathlib import Path

import numpy as np
import librosa


def analyze_stem(wav_path: str, sr: int = 22050, hop_length: int = 735) -> dict:
    """Analyze a single stem WAV file."""
    y, _ = librosa.load(wav_path, sr=sr, mono=True)

    # RMS energy per frame
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    # Normalize to 0-1
    rms_max = rms.max() if rms.max() > 0 else 1.0
    rms_norm = rms / rms_max

    # Onset strength
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    onset_max = onset_env.max() if onset_env.max() > 0 else 1.0
    onset_norm = onset_env / onset_max

    # Beat detection
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
    beat_frames = np.zeros(len(rms))
    for b in beats:
        if b < len(beat_frames):
            beat_frames[b] = 1.0

    # Spectral centroid (normalized to Nyquist)
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
    centroid_norm = centroid / (sr / 2)

    return {
        "rms": rms_norm.tolist(),
        "onset": onset_norm.tolist(),
        "beat": beat_frames.tolist(),
        "centroid": centroid_norm.tolist(),
        "n_frames": len(rms),
    }


def main():
    parser = argparse.ArgumentParser(description="Analyze stem WAVs and merge into analysis JSON")
    parser.add_argument("--stems-dir", required=True, help="Directory with vocals.wav, drums.wav, bass.wav, other.wav")
    parser.add_argument("--analysis", required=True, help="Path to existing analysis JSON")
    args = parser.parse_args()

    stems_dir = Path(args.stems_dir)
    analysis_path = Path(args.analysis)

    if not analysis_path.exists():
        print(f"ERROR: Analysis file not found: {analysis_path}", file=sys.stderr)
        sys.exit(1)

    with open(analysis_path) as f:
        analysis = json.load(f)

    frames = analysis.get("frames", [])
    n_frames = len(frames)
    hop_length = analysis.get("meta", {}).get("hopLength", 735)
    sr = analysis.get("meta", {}).get("sr", 22050)

    print(f"Analysis: {n_frames} frames, sr={sr}, hop={hop_length}")

    # Analyze each stem
    stem_data = {}
    for stem_name in ["vocals", "drums", "bass", "other"]:
        wav_path = stems_dir / f"{stem_name}.wav"
        if wav_path.exists():
            print(f"  Analyzing {stem_name}...", end=" ", flush=True)
            data = analyze_stem(str(wav_path), sr=sr, hop_length=hop_length)
            stem_data[stem_name] = data
            print(f"{data['n_frames']} frames")
        else:
            print(f"  SKIP {stem_name} (not found)")

    # Merge into analysis frames
    merged = 0
    for i in range(n_frames):
        frame = frames[i]

        # Bass stem
        if "bass" in stem_data and i < stem_data["bass"]["n_frames"]:
            frame["stemBassRms"] = round(stem_data["bass"]["rms"][i], 4)

        # Drums stem
        if "drums" in stem_data and i < stem_data["drums"]["n_frames"]:
            frame["stemDrumOnset"] = round(stem_data["drums"]["onset"][i], 4)
            frame["stemDrumBeat"] = bool(stem_data["drums"]["beat"][i] > 0.5)

        # Vocals stem
        if "vocals" in stem_data and i < stem_data["vocals"]["n_frames"]:
            frame["stemVocalRms"] = round(stem_data["vocals"]["rms"][i], 4)
            frame["stemVocalPresence"] = stem_data["vocals"]["rms"][i] > 0.05

        # Other stem
        if "other" in stem_data and i < stem_data["other"]["n_frames"]:
            frame["stemOtherRms"] = round(stem_data["other"]["rms"][i], 4)
            frame["stemOtherCentroid"] = round(stem_data["other"]["centroid"][i], 4)

        merged += 1

    # Write back
    with open(analysis_path, "w") as f:
        json.dump(analysis, f)

    print(f"Merged stem data into {merged}/{n_frames} frames → {analysis_path}")


if __name__ == "__main__":
    main()
