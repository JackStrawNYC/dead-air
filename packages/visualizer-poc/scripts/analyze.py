#!/usr/bin/env python3
"""
Enhanced audio analysis for Cornell '77 at 30fps frame resolution.

Extracts per-frame features using librosa with hop_length=735 (30fps at sr=22050).
Supports single-track and batch-show analysis.

Usage:
  python analyze.py                           # Morning Dew only (default)
  python analyze.py /path/to/track.mp3 out.json   # Arbitrary track
"""

import json
import sys
from pathlib import Path

import librosa
import numpy as np
from sklearn.cluster import AgglomerativeClustering

AUDIO_DIR = Path(__file__).resolve().parents[3] / "data" / "audio" / "1977-05-08"
DEFAULT_AUDIO = AUDIO_DIR / "gd77-05-08s2t08.mp3"
DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "data" / "morning-dew-analysis.json"

SR = 22050
HOP_LENGTH = 735  # 22050 / 30 = 735 samples per frame
FPS = 30


def normalize(arr: np.ndarray) -> np.ndarray:
    """Min-max normalize to 0-1 range."""
    mn, mx = arr.min(), arr.max()
    if mx - mn < 1e-10:
        return np.zeros_like(arr)
    return (arr - mn) / (mx - mn)


def band_energy(S: np.ndarray, freqs: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Sum spectral energy in a frequency band per frame."""
    mask = (freqs >= lo) & (freqs < hi)
    if not mask.any():
        return np.zeros(S.shape[1])
    return S[mask, :].sum(axis=0)


def detect_sections(y: np.ndarray, sr: int, n_frames: int, rms_norm: np.ndarray) -> list:
    """Detect song sections via agglomerative clustering on MFCC features."""
    print("Detecting sections ...")
    mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=HOP_LENGTH, n_mfcc=13)

    # Use larger window for section-level features (~ 5 seconds)
    seg_hop = int(5 * FPS)  # 150 frames
    n_segs = max(1, n_frames // seg_hop)

    # Average MFCC features per segment
    seg_features = np.zeros((n_segs, mfcc.shape[0]))
    for i in range(n_segs):
        start = i * seg_hop
        end = min((i + 1) * seg_hop, mfcc.shape[1])
        if start < mfcc.shape[1]:
            seg_features[i] = mfcc[:, start:end].mean(axis=1)

    # Cluster into sections (cap at 12 sections for a typical song)
    n_clusters = min(max(3, n_segs // 4), 12)
    if n_segs <= n_clusters:
        n_clusters = max(2, n_segs - 1)

    clustering = AgglomerativeClustering(
        n_clusters=n_clusters,
        connectivity=np.diag(np.ones(n_segs - 1), 1) + np.diag(np.ones(n_segs - 1), -1),
    )
    labels = clustering.fit_predict(seg_features)

    # Merge consecutive segments with same label into sections
    sections = []
    current_label = labels[0]
    section_start = 0

    for i in range(1, len(labels)):
        if labels[i] != current_label:
            frame_start = section_start * seg_hop
            frame_end = min(i * seg_hop, n_frames)
            avg_energy = float(rms_norm[frame_start:frame_end].mean()) if frame_end > frame_start else 0.0
            energy_label = "high" if avg_energy > 0.5 else ("mid" if avg_energy > 0.25 else "low")
            sections.append({
                "frameStart": frame_start,
                "frameEnd": frame_end,
                "label": f"section_{len(sections)}",
                "energy": energy_label,
                "avgEnergy": round(avg_energy, 3),
            })
            section_start = i
            current_label = labels[i]

    # Final section
    frame_start = section_start * seg_hop
    frame_end = n_frames
    avg_energy = float(rms_norm[frame_start:frame_end].mean()) if frame_end > frame_start else 0.0
    energy_label = "high" if avg_energy > 0.5 else ("mid" if avg_energy > 0.25 else "low")
    sections.append({
        "frameStart": frame_start,
        "frameEnd": frame_end,
        "label": f"section_{len(sections)}",
        "energy": energy_label,
        "avgEnergy": round(avg_energy, 3),
    })

    print(f"Detected {len(sections)} sections")
    return sections


def analyze_track(audio_path: Path, output_path: Path):
    """Full analysis pipeline for a single track."""
    if not audio_path.exists():
        print(f"ERROR: Audio file not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading {audio_path} ...")
    y, sr = librosa.load(str(audio_path), sr=SR, mono=True)
    duration = len(y) / sr
    n_frames = int(np.ceil(duration * FPS))
    print(f"Duration: {duration:.1f}s | Frames: {n_frames} | SR: {sr}")

    # --- RMS energy ---
    print("Computing RMS energy ...")
    rms = librosa.feature.rms(y=y, hop_length=HOP_LENGTH)[0]
    rms_norm = normalize(rms)

    # --- Spectral centroid ---
    print("Computing spectral centroid ...")
    cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=HOP_LENGTH)[0]
    cent_norm = normalize(cent)

    # --- Onset strength envelope ---
    print("Computing onset strength ...")
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP_LENGTH)
    onset_norm = normalize(onset_env)

    # --- Beat tracking ---
    print("Tracking beats ...")
    tempo, beat_frames = librosa.beat.beat_track(
        y=y, sr=sr, hop_length=HOP_LENGTH, units="frames"
    )
    # librosa >= 0.10 returns tempo as ndarray
    tempo_val = float(tempo[0]) if hasattr(tempo, '__len__') else float(tempo)
    beat_set = set(int(b) for b in beat_frames)
    print(f"Tempo: {tempo_val:.1f} BPM | Beats: {len(beat_set)}")

    # --- STFT (shared for band energy + spectral contrast + flatness) ---
    print("Computing STFT ...")
    S = np.abs(librosa.stft(y, hop_length=HOP_LENGTH))
    freqs = librosa.fft_frequencies(sr=sr)

    # --- Band energy (4 bands) ---
    print("Computing band energy ...")
    sub = normalize(band_energy(S, freqs, 0, 100))
    low = normalize(band_energy(S, freqs, 100, 400))
    mid = normalize(band_energy(S, freqs, 400, 2000))
    high = normalize(band_energy(S, freqs, 2000, 8000))

    # --- Chroma CQT (12 pitch classes) ---
    print("Computing chroma CQT ...")
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP_LENGTH)
    # chroma shape: (12, n_chroma_frames) — already 0-1 range

    # --- Spectral contrast (7 bands) ---
    print("Computing spectral contrast ...")
    contrast = librosa.feature.spectral_contrast(S=S, sr=sr, n_bands=6)
    # contrast shape: (7, n_frames) — normalize each band independently
    contrast_norm = np.zeros_like(contrast)
    for b in range(contrast.shape[0]):
        contrast_norm[b] = normalize(contrast[b])

    # --- Spectral flatness ---
    print("Computing spectral flatness ...")
    flatness = librosa.feature.spectral_flatness(S=S)[0]
    flatness_norm = normalize(flatness)

    # --- Align all arrays to n_frames ---
    def pad_or_trim(arr: np.ndarray, length: int) -> np.ndarray:
        if len(arr) >= length:
            return arr[:length]
        return np.pad(arr, (0, length - len(arr)), mode="edge")

    def pad_or_trim_2d(arr: np.ndarray, length: int) -> np.ndarray:
        if arr.shape[1] >= length:
            return arr[:, :length]
        return np.pad(arr, ((0, 0), (0, length - arr.shape[1])), mode="edge")

    rms_norm = pad_or_trim(rms_norm, n_frames)
    cent_norm = pad_or_trim(cent_norm, n_frames)
    onset_norm = pad_or_trim(onset_norm, n_frames)
    sub = pad_or_trim(sub, n_frames)
    low = pad_or_trim(low, n_frames)
    mid = pad_or_trim(mid, n_frames)
    high = pad_or_trim(high, n_frames)
    chroma = pad_or_trim_2d(chroma, n_frames)
    contrast_norm = pad_or_trim_2d(contrast_norm, n_frames)
    flatness_norm = pad_or_trim(flatness_norm, n_frames)

    # --- Section detection ---
    sections = detect_sections(y, sr, n_frames, rms_norm)

    # --- Build output ---
    print("Building JSON ...")
    frames = []
    for i in range(n_frames):
        frames.append({
            "rms": round(float(rms_norm[i]), 4),
            "centroid": round(float(cent_norm[i]), 4),
            "onset": round(float(onset_norm[i]), 4),
            "beat": i in beat_set,
            "sub": round(float(sub[i]), 4),
            "low": round(float(low[i]), 4),
            "mid": round(float(mid[i]), 4),
            "high": round(float(high[i]), 4),
            "chroma": [round(float(chroma[c, i]), 3) for c in range(12)],
            "contrast": [round(float(contrast_norm[c, i]), 3) for c in range(7)],
            "flatness": round(float(flatness_norm[i]), 4),
        })

    output = {
        "meta": {
            "source": str(audio_path.name),
            "duration": round(duration, 2),
            "fps": FPS,
            "sr": SR,
            "hopLength": HOP_LENGTH,
            "totalFrames": n_frames,
            "tempo": round(tempo_val, 1),
            "sections": sections,
        },
        "frames": frames,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f)

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Wrote {output_path} ({size_mb:.1f} MB, {n_frames} frames)")
    return output


def main():
    if len(sys.argv) >= 3:
        audio_path = Path(sys.argv[1])
        output_path = Path(sys.argv[2])
    else:
        audio_path = DEFAULT_AUDIO
        output_path = DEFAULT_OUTPUT

    analyze_track(audio_path, output_path)


if __name__ == "__main__":
    main()
