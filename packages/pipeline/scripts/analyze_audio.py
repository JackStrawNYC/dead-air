#!/usr/bin/env python3
"""Audio analysis sidecar for Dead Air pipeline.

Reads JSON config on stdin, outputs JSON analysis on stdout.
Dependencies: librosa, numpy

Input: {"audioPath": "/path/to/song.mp3", "analyses": ["energy","tempo","spectral","onsets","key"]}
Output: {"ok": true, "durationSec": 312.4, "energy": [...], "tempo": [...], ...}
"""
import sys
import json
import numpy as np
import librosa


def estimate_key(chroma_vector):
    """Krumhansl-Schmuckler key-finding algorithm."""
    major_profile = np.array(
        [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
    )
    minor_profile = np.array(
        [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
    )
    note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    best_corr = -2
    best_key = "C major"

    for i in range(12):
        rotated = np.roll(chroma_vector, -i)
        corr_major = float(np.corrcoef(rotated, major_profile)[0, 1])
        corr_minor = float(np.corrcoef(rotated, minor_profile)[0, 1])
        if corr_major > best_corr:
            best_corr = corr_major
            best_key = f"{note_names[i]} major"
        if corr_minor > best_corr:
            best_corr = corr_minor
            best_key = f"{note_names[i]} minor"

    return best_key


def analyze(config):
    path = config["audioPath"]
    sr = config.get("sampleRate", 22050)
    hop = config.get("hopLength", 2205)  # 10 Hz at sr=22050
    requested = set(
        config.get("analyses", ["energy", "tempo", "spectral", "onsets", "key"])
    )

    # Load audio (mono, resampled to sr)
    y, sr = librosa.load(path, sr=sr, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)

    result = {"ok": True, "durationSec": round(float(duration), 2)}

    if "energy" in requested:
        rms = librosa.feature.rms(y=y, hop_length=hop)[0]
        max_rms = float(rms.max()) if rms.max() > 0 else 1.0
        result["energy"] = (rms / max_rms).round(4).tolist()

    if "tempo" in requested:
        tempo = librosa.beat.tempo(y=y, sr=sr, hop_length=hop)
        result["tempo"] = [round(float(t), 1) for t in tempo]

    if "spectral" in requested:
        cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop)[0]
        nyquist = sr / 2.0
        result["spectralCentroid"] = (cent / nyquist).round(4).tolist()

    if "onsets" in requested:
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, hop_length=hop)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop)
        result["onsets"] = [round(float(t), 3) for t in onset_times]

    if "key" in requested:
        chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop)
        chroma_mean = chroma.mean(axis=1)
        result["key"] = estimate_key(chroma_mean)

    return result


if __name__ == "__main__":
    try:
        config = json.loads(sys.stdin.read())
        result = analyze(config)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
