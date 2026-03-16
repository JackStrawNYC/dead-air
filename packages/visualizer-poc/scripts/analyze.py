#!/usr/bin/env python3
"""
Enhanced audio analysis for Cornell '77 at 30fps frame resolution.

Extracts per-frame features using librosa with hop_length=735 (30fps at sr=22050).
Supports single-track and batch-show analysis.
Optional stem-specific features when --stems-dir is provided.

Usage:
  python analyze.py                                          # Morning Dew only (default)
  python analyze.py /path/to/track.mp3 out.json              # Arbitrary track
  python analyze.py /path/to/track.mp3 out.json /stems/dir   # With stem features
"""

import json
import os
import sys
from pathlib import Path

import librosa
import numpy as np
from sklearn.cluster import AgglomerativeClustering

# Support env var overrides for Docker (fall back to relative paths for local dev)
_AUDIO_DIR_ENV = os.environ.get("DEAD_AIR_AUDIO_DIR")
_DATA_DIR_ENV = os.environ.get("DEAD_AIR_DATA_DIR")

DEFAULT_AUDIO_DIR = Path(_AUDIO_DIR_ENV) if _AUDIO_DIR_ENV else Path(__file__).resolve().parent.parent / "public" / "audio"
DEFAULT_AUDIO = DEFAULT_AUDIO_DIR / "gd77-05-08s2t08.mp3"
DEFAULT_OUTPUT = (Path(_DATA_DIR_ENV) if _DATA_DIR_ENV else Path(__file__).resolve().parent.parent / "data") / "morning-dew-analysis.json"

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
            energy_label = "high" if avg_energy > 0.35 else ("mid" if avg_energy > 0.15 else "low")
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
    energy_label = "high" if avg_energy > 0.35 else ("mid" if avg_energy > 0.15 else "low")
    sections.append({
        "frameStart": frame_start,
        "frameEnd": frame_end,
        "label": f"section_{len(sections)}",
        "energy": energy_label,
        "avgEnergy": round(avg_energy, 3),
    })

    print(f"Detected {len(sections)} sections")
    return sections


def analyze_stems(stems_dir: Path, n_frames: int) -> dict:
    """Extract per-frame features from separated stems (bass, drums, vocals, other)."""
    result = {"available": False}

    bass_path = stems_dir / "bass.wav"
    drums_path = stems_dir / "drums.wav"
    vocals_path = stems_dir / "vocals.wav"
    other_path = stems_dir / "other.wav"

    if not bass_path.exists() or not drums_path.exists():
        print(f"Stems not found in {stems_dir}, skipping stem analysis")
        return result

    print("Analyzing stem: bass.wav ...")
    y_bass, _ = librosa.load(str(bass_path), sr=SR, mono=True)
    bass_rms = librosa.feature.rms(y=y_bass, hop_length=HOP_LENGTH)[0]
    bass_rms_norm = normalize(bass_rms)
    bass_rms_norm = pad_or_trim_1d(bass_rms_norm, n_frames)

    print("Analyzing stem: drums.wav ...")
    y_drums, _ = librosa.load(str(drums_path), sr=SR, mono=True)
    drum_onset = librosa.onset.onset_strength(y=y_drums, sr=SR, hop_length=HOP_LENGTH)
    drum_onset_norm = normalize(drum_onset)
    drum_onset_norm = pad_or_trim_1d(drum_onset_norm, n_frames)

    drum_tempo, drum_beat_frames = librosa.beat.beat_track(
        y=y_drums, sr=SR, hop_length=HOP_LENGTH, units="frames"
    )
    drum_tempo_val = float(drum_tempo[0]) if hasattr(drum_tempo, '__len__') else float(drum_tempo)
    drum_beat_set = set(int(b) for b in drum_beat_frames)

    result = {
        "available": True,
        "bassRms": bass_rms_norm,
        "drumOnset": drum_onset_norm,
        "drumBeatSet": drum_beat_set,
        "stemTempo": round(drum_tempo_val, 1),
    }
    print(f"Stem analysis: bass RMS frames={len(bass_rms_norm)}, drum beats={len(drum_beat_set)}, tempo={drum_tempo_val:.1f}")

    # ── Vocals stem ──
    if vocals_path.exists():
        print("Analyzing stem: vocals.wav ...")
        y_vocals, _ = librosa.load(str(vocals_path), sr=SR, mono=True)
        vocal_rms = librosa.feature.rms(y=y_vocals, hop_length=HOP_LENGTH)[0]
        vocal_rms_norm = normalize(vocal_rms)
        vocal_rms_norm = pad_or_trim_1d(vocal_rms_norm, n_frames)

        # Dynamic presence threshold: P70 of non-zero vocal frames
        nonzero_vocal = vocal_rms_norm[vocal_rms_norm > 0.01]
        if len(nonzero_vocal) > 0:
            vocal_threshold = float(np.percentile(nonzero_vocal, 70))
        else:
            vocal_threshold = 0.1
        vocal_presence = vocal_rms_norm > vocal_threshold

        result["vocalRms"] = vocal_rms_norm
        result["vocalPresence"] = vocal_presence
        result["vocalMean"] = round(float(vocal_rms_norm.mean()), 4)
        print(f"  Vocal RMS frames={len(vocal_rms_norm)}, presence threshold={vocal_threshold:.3f}, presence ratio={vocal_presence.mean():.2%}")
    else:
        print(f"  vocals.wav not found in {stems_dir}, skipping vocal analysis")

    # ── Other stem (guitar/keys) ──
    if other_path.exists():
        print("Analyzing stem: other.wav ...")
        y_other, _ = librosa.load(str(other_path), sr=SR, mono=True)
        other_rms = librosa.feature.rms(y=y_other, hop_length=HOP_LENGTH)[0]
        other_rms_norm = normalize(other_rms)
        other_rms_norm = pad_or_trim_1d(other_rms_norm, n_frames)

        other_centroid = librosa.feature.spectral_centroid(y=y_other, sr=SR, hop_length=HOP_LENGTH)[0]
        other_centroid_norm = normalize(other_centroid)
        other_centroid_norm = pad_or_trim_1d(other_centroid_norm, n_frames)

        result["otherRms"] = other_rms_norm
        result["otherCentroid"] = other_centroid_norm
        result["otherMean"] = round(float(other_rms_norm.mean()), 4)
        print(f"  Other RMS frames={len(other_rms_norm)}, centroid frames={len(other_centroid_norm)}")
    else:
        print(f"  other.wav not found in {stems_dir}, skipping other analysis")

    return result


def pad_or_trim_1d(arr: np.ndarray, length: int) -> np.ndarray:
    """Pad or trim a 1D array to exact length."""
    if len(arr) >= length:
        return arr[:length]
    return np.pad(arr, (0, length - len(arr)), mode="edge")


def analyze_track(audio_path: Path, output_path: Path, stems_dir: Path | None = None):
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
    def pad_or_trim_2d(arr: np.ndarray, length: int) -> np.ndarray:
        if arr.shape[1] >= length:
            return arr[:, :length]
        return np.pad(arr, ((0, 0), (0, length - arr.shape[1])), mode="edge")

    rms_norm = pad_or_trim_1d(rms_norm, n_frames)
    cent_norm = pad_or_trim_1d(cent_norm, n_frames)
    onset_norm = pad_or_trim_1d(onset_norm, n_frames)
    sub = pad_or_trim_1d(sub, n_frames)
    low = pad_or_trim_1d(low, n_frames)
    mid = pad_or_trim_1d(mid, n_frames)
    high = pad_or_trim_1d(high, n_frames)
    chroma = pad_or_trim_2d(chroma, n_frames)
    contrast_norm = pad_or_trim_2d(contrast_norm, n_frames)
    flatness_norm = pad_or_trim_1d(flatness_norm, n_frames)

    # --- Section detection ---
    sections = detect_sections(y, sr, n_frames, rms_norm)

    # --- Optional stem analysis ---
    stem_data = None
    if stems_dir is not None:
        stem_data = analyze_stems(stems_dir, n_frames)

    # --- Build output ---
    print("Building JSON ...")
    frames = []
    for i in range(n_frames):
        frame = {
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
        }
        # Add stem-specific fields when available
        if stem_data and stem_data["available"]:
            frame["stemBassRms"] = round(float(stem_data["bassRms"][i]), 4)
            frame["stemDrumOnset"] = round(float(stem_data["drumOnset"][i]), 4)
            frame["stemDrumBeat"] = i in stem_data["drumBeatSet"]
            if "vocalRms" in stem_data:
                frame["stemVocalRms"] = round(float(stem_data["vocalRms"][i]), 4)
                frame["stemVocalPresence"] = bool(stem_data["vocalPresence"][i])
            if "otherRms" in stem_data:
                frame["stemOtherRms"] = round(float(stem_data["otherRms"][i]), 4)
                frame["stemOtherCentroid"] = round(float(stem_data["otherCentroid"][i]), 4)
        frames.append(frame)

    meta = {
        "source": str(audio_path.name),
        "duration": round(duration, 2),
        "fps": FPS,
        "sr": SR,
        "hopLength": HOP_LENGTH,
        "totalFrames": n_frames,
        "tempo": round(tempo_val, 1),
        "sections": sections,
    }
    if stem_data and stem_data["available"]:
        meta["stemsAvailable"] = True
        meta["stemTempo"] = stem_data["stemTempo"]
        if "vocalMean" in stem_data:
            meta["stemVocalMean"] = stem_data["vocalMean"]
        if "otherMean" in stem_data:
            meta["stemOtherMean"] = stem_data["otherMean"]

    output = {
        "meta": meta,
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

    stems_dir = Path(sys.argv[3]) if len(sys.argv) >= 4 else None
    analyze_track(audio_path, output_path, stems_dir)


if __name__ == "__main__":
    main()
