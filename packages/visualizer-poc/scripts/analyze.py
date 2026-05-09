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
    stem_data = None  # initialized here; populated later if stems_dir is provided
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

    # --- Adaptive beat tracking: per-frame local tempo ---
    print("Computing local tempo (8s sliding window) ...")
    onset_str = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP_LENGTH)
    win_frames = int(8 * FPS)  # 8 second window
    local_tempo_arr = np.full(n_frames, tempo_val, dtype=np.float64)
    beat_confidence_arr = np.zeros(n_frames, dtype=np.float64)
    for i in range(0, n_frames, win_frames // 2):  # 50% overlap
        lo_f = max(0, i - win_frames // 2)
        hi_f = min(len(onset_str), i + win_frames // 2)
        if hi_f - lo_f < FPS:  # minimum 1s window
            continue
        window_onset = onset_str[lo_f:hi_f]
        try:
            local_t = librosa.beat.tempo(onset_envelope=window_onset, sr=sr, hop_length=HOP_LENGTH)
            lt = float(local_t[0]) if hasattr(local_t, '__len__') else float(local_t)
            # Beat confidence: ratio of onset strength peak to mean (higher = clearer beat)
            confidence = float(window_onset.max() / (window_onset.mean() + 1e-8))
            confidence = min(1.0, confidence / 5.0)  # normalize to 0-1
            # Fill the window with this local tempo
            fill_lo = max(0, i)
            fill_hi = min(n_frames, i + win_frames // 2)
            local_tempo_arr[fill_lo:fill_hi] = lt
            beat_confidence_arr[fill_lo:fill_hi] = confidence
        except Exception:
            pass
    # Smooth local tempo with 2s Gaussian for stability
    from scipy.ndimage import gaussian_filter1d
    local_tempo_arr = gaussian_filter1d(local_tempo_arr, sigma=FPS)
    local_tempo_arr = pad_or_trim_1d(local_tempo_arr, n_frames)
    beat_confidence_arr = pad_or_trim_1d(beat_confidence_arr, n_frames)

    # --- Downbeat detection ---
    print("Detecting downbeats ...")
    downbeat_set = set()
    if len(beat_frames) >= 4:
        # Estimate beats per measure from tempo (assume 4/4)
        beats_per_measure = 4
        for bi in range(0, len(beat_frames), beats_per_measure):
            downbeat_set.add(int(beat_frames[bi]))
    print(f"Local tempo range: {local_tempo_arr.min():.1f}-{local_tempo_arr.max():.1f} BPM | Downbeats: {len(downbeat_set)}")

    # --- Melodic contour (pitch tracking via piptrack) ---
    print("Extracting melodic contour ...")
    pitches, magnitudes = librosa.piptrack(y=y, sr=sr, hop_length=HOP_LENGTH)
    # Pick the pitch with highest magnitude per frame
    melodic_pitch = np.zeros(pitches.shape[1])
    melodic_confidence = np.zeros(pitches.shape[1])
    for t in range(pitches.shape[1]):
        mag_col = magnitudes[:, t]
        idx_max = mag_col.argmax()
        if mag_col[idx_max] > 0:
            melodic_pitch[t] = pitches[idx_max, t]
            melodic_confidence[t] = mag_col[idx_max]
    # Convert Hz to MIDI-like 0-1 range (27.5 Hz = A0 = 0, 4186 Hz = C8 = 1)
    melodic_pitch_norm = np.zeros_like(melodic_pitch)
    nonzero = melodic_pitch > 0
    if nonzero.any():
        midi = 12 * np.log2(melodic_pitch[nonzero] / 440.0) + 69
        melodic_pitch_norm[nonzero] = np.clip((midi - 21) / (108 - 21), 0, 1)
    melodic_confidence_norm = normalize(melodic_confidence)
    # Compute contour direction: +1 rising, -1 falling, 0 steady
    melodic_direction = np.zeros(len(melodic_pitch_norm))
    for t in range(1, len(melodic_pitch_norm)):
        delta = melodic_pitch_norm[t] - melodic_pitch_norm[t - 1]
        melodic_direction[t] = np.clip(delta * 20, -1, 1)  # amplify small changes
    melodic_pitch_norm = pad_or_trim_1d(melodic_pitch_norm, n_frames)
    melodic_confidence_norm = pad_or_trim_1d(melodic_confidence_norm, n_frames)
    melodic_direction = pad_or_trim_1d(melodic_direction, n_frames)
    print(f"Melodic contour: {np.count_nonzero(melodic_pitch_norm)} pitched frames / {n_frames} total")

    # --- Chroma CQT (compute early — needed by chord detection below) ---
    # Note: chroma is also used later for pad/trim alignment. We assign it here
    # so chord detection has it available, and it gets pad_or_trim_2d'd later.
    print("Computing chroma CQT (early pass for chord detection) ...")
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP_LENGTH)

    # --- Chord progression detection (chroma-based) ---
    print("Detecting chord progressions ...")
    # Use 24 chord templates (12 major + 12 minor)
    chord_names = []
    note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    major_template = np.array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], dtype=float)
    minor_template = np.array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0], dtype=float)
    chord_templates = []
    for i in range(12):
        chord_templates.append(np.roll(major_template, i))
        chord_names.append(f"{note_names[i]}")
        chord_templates.append(np.roll(minor_template, i))
        chord_names.append(f"{note_names[i]}m")
    chord_templates = np.array(chord_templates)  # (24, 12)

    # Unit-normalize the templates so the dot product against a unit-normalized
    # chroma vector is true cosine similarity, bounded in [0, 1] for non-negative
    # inputs. Without this normalization the templates have L2 norm sqrt(3) and
    # scores reach ~1.73 — confidence bleeds past 1.0 (mean 1.19 on Veneta), all
    # downstream `> 0.3` / `> 0.6` thresholds become meaningless, and the
    # smoothstep(0.3, 0.6, x) used in 8 shaders saturates regardless of true
    # match quality. argmax is preserved (uniform scaling doesn't change ranking).
    chord_template_norms = np.linalg.norm(chord_templates, axis=1, keepdims=True)
    chord_templates_n = chord_templates / (chord_template_norms + 1e-8)

    # Smooth chroma over ~0.5s window for chord stability
    chroma_smooth_win = max(1, int(FPS * 0.5))
    chroma_smoothed = np.zeros_like(chroma)
    for t in range(chroma.shape[1]):
        lo_s = max(0, t - chroma_smooth_win // 2)
        hi_s = min(chroma.shape[1], t + chroma_smooth_win // 2 + 1)
        chroma_smoothed[:, t] = chroma[:, lo_s:hi_s].mean(axis=1)

    chord_idx_arr = np.zeros(n_frames, dtype=int)
    chord_confidence_arr = np.zeros(n_frames)
    harmonic_tension_arr = np.zeros(n_frames)
    for t in range(min(n_frames, chroma_smoothed.shape[1])):
        frame_chroma = chroma_smoothed[:, t]
        if frame_chroma.sum() < 0.01:
            continue
        frame_chroma_n = frame_chroma / (np.linalg.norm(frame_chroma) + 1e-8)
        # Cosine similarity (both vectors unit-normalized) → bounded in [0, 1]
        # for non-negative chroma. Defensive clip handles any FP edge.
        scores = chord_templates_n @ frame_chroma_n
        best_idx = scores.argmax()
        chord_idx_arr[t] = best_idx
        chord_confidence_arr[t] = float(np.clip(scores[best_idx], 0.0, 1.0))

    # Harmonic tension: rate of chord change over 2s window
    tension_window = int(FPS * 2)
    for t in range(n_frames):
        lo_t = max(0, t - tension_window // 2)
        hi_t = min(n_frames, t + tension_window // 2)
        if hi_t - lo_t < 2:
            continue
        changes = np.sum(np.diff(chord_idx_arr[lo_t:hi_t]) != 0)
        harmonic_tension_arr[t] = min(1.0, changes / (hi_t - lo_t))

    # Convert chord indices to string labels for metadata
    chord_label_arr = [chord_names[int(c)] for c in chord_idx_arr]
    harmonic_tension_arr = pad_or_trim_1d(harmonic_tension_arr, n_frames)
    chord_confidence_arr = pad_or_trim_1d(chord_confidence_arr, n_frames)
    print(f"Chord detection: {len(set(chord_label_arr))} unique chords, avg tension={harmonic_tension_arr.mean():.3f}")

    # --- Key detection (Krumhansl-Schmuckler) ---
    # Per-window estimate (5 seconds), interpolated to per-frame.
    # Krumhansl-Schmuckler correlates the smoothed chroma vector against
    # 24 key profiles (12 major + 12 minor) and picks the highest match.
    # Source: same algorithm exists in analyze_audio.py:16-40 but was never
    # integrated into the main pipeline (audit Tier 3).
    print("Detecting song key (Krumhansl-Schmuckler) ...")
    KS_MAJOR = np.array(
        [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
    )
    KS_MINOR = np.array(
        [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
    )

    def estimate_key_window(chroma_vec):
        """Returns (tonic_idx 0-11, mode 0=minor 1=major, confidence 0-1)."""
        s = chroma_vec.sum()
        if s < 1e-3:
            return 0, 1, 0.0
        norm = chroma_vec / s
        best_corr = -2.0
        best_tonic = 0
        best_mode = 1
        for i in range(12):
            rotated = np.roll(norm, -i)
            cm = float(np.corrcoef(rotated, KS_MAJOR)[0, 1])
            cn = float(np.corrcoef(rotated, KS_MINOR)[0, 1])
            if cm > best_corr:
                best_corr = cm
                best_tonic = i
                best_mode = 1
            if cn > best_corr:
                best_corr = cn
                best_tonic = i
                best_mode = 0
        # Map correlation [-1, 1] to confidence [0, 1] with a soft floor —
        # values < 0.3 are essentially noise, values > 0.7 are strong.
        conf = max(0.0, min(1.0, (best_corr - 0.2) / 0.6))
        return best_tonic, best_mode, conf

    key_window_frames = int(5 * FPS)  # 5s windows
    key_tonic_arr = np.zeros(n_frames, dtype=float)
    key_mode_arr = np.zeros(n_frames, dtype=float)
    key_confidence_arr = np.zeros(n_frames, dtype=float)
    key_change_arr = np.zeros(n_frames, dtype=int)
    prev_tonic, prev_mode = -1, -1
    for w_start in range(0, n_frames, key_window_frames // 2):  # 50% overlap
        w_end = min(n_frames, w_start + key_window_frames)
        if w_end - w_start < FPS:
            continue
        # Use chroma_smoothed if available, else raw chroma
        win_chroma = chroma_smoothed[:, w_start:min(w_end, chroma_smoothed.shape[1])]
        if win_chroma.shape[1] < 1:
            continue
        avg_chroma = win_chroma.mean(axis=1)
        tonic, mode, conf = estimate_key_window(avg_chroma)
        # Key-change flag: only fire once when key actually shifts AND
        # confidence is high enough to trust the call.
        if conf > 0.5 and (tonic != prev_tonic or mode != prev_mode):
            if prev_tonic >= 0:
                key_change_arr[w_start] = 1
            prev_tonic = tonic
            prev_mode = mode
        # Fill the window
        for i in range(w_start, w_end):
            key_tonic_arr[i] = tonic / 11.0  # normalize 0-1
            key_mode_arr[i] = float(mode)     # 0 minor, 1 major
            key_confidence_arr[i] = conf
    print(f"Key detection: tonic mean={key_tonic_arr.mean():.3f}, "
          f"mode mean={key_mode_arr.mean():.3f}, conf mean={key_confidence_arr.mean():.3f}, "
          f"key changes={int(key_change_arr.sum())}")

    # --- Improvisation score ---
    # Composite score (0-1) from tempo variance (25%), harmonic novelty (25%),
    # beat instability × energy (30%), harmonic tension (20%).
    #
    # Calibration (May 2026): the prior divisors (tempo_std/15, changes/4)
    # were set for unrealistic extremes — typical Dead jam tempo drift is
    # 4-8 BPM (not 15) and chord-change rate caps near 2/sec (not 4). Combined
    # with a 1-second Gaussian over an already 3-second analysis window, real
    # jams maxed at ~0.5 and never crossed the 0.65 improv_spike trigger.
    # Recalibrated below: divisors match observed ranges, post-smooth sigma
    # cut from FPS (1s) → FPS/4 (~0.25s) so peaks survive.
    print("Computing improvisation score ...")
    improv_window = int(3 * FPS)  # 3s analysis window
    improv_arr = np.zeros(n_frames)
    for i in range(n_frames):
        lo_i = max(0, i - improv_window // 2)
        hi_i = min(n_frames, i + improv_window // 2)
        win_len = hi_i - lo_i
        if win_len < FPS:
            continue

        # Tempo variance: typical Dead jam drift is 4-8 BPM. /8 hits 1.0
        # at ~8 BPM std (real jams), where /15 needed unrealistic 15 BPM
        # std and never saturated.
        tempos = local_tempo_arr[lo_i:hi_i]
        tempo_std = np.std(tempos) if len(tempos) > 2 else 0.0
        tempo_var = min(1.0, tempo_std / 8.0)

        # Harmonic novelty: chord change rate. Realistic ceiling is ~2/sec
        # (any faster is template noise, not real chord changes).
        chords_win = chord_idx_arr[lo_i:hi_i]
        changes = np.sum(np.diff(chords_win) != 0)
        changes_per_sec = changes / (win_len / FPS)
        harm_novelty = min(1.0, changes_per_sec / 2.0)

        # Beat instability × energy
        beat_stab = np.mean(beat_confidence_arr[lo_i:hi_i])
        avg_energy = np.mean(rms_norm[lo_i:hi_i])
        beat_instab = (1.0 - beat_stab) * min(1.0, avg_energy * 3.0)

        # Harmonic tension
        avg_tension = np.mean(harmonic_tension_arr[lo_i:hi_i])

        improv_arr[i] = (
            tempo_var * 0.25 +
            harm_novelty * 0.25 +
            beat_instab * 0.30 +
            avg_tension * 0.20
        )

    # Light smoothing (~0.25s) — removes single-frame jitter but preserves
    # the 3-5 second improv peaks the trigger system is gated on. The
    # previous sigma=FPS (1s) flattened those peaks below threshold.
    from scipy.ndimage import gaussian_filter1d
    improv_arr = gaussian_filter1d(improv_arr, sigma=FPS / 4.0)
    improv_arr = np.clip(improv_arr, 0.0, 1.0)
    improv_arr = pad_or_trim_1d(improv_arr, n_frames)
    print(f"Improvisation: mean={improv_arr.mean():.3f}, max={improv_arr.max():.3f}")

    # --- Structural semantics (self-similarity matrix → section labels) ---
    print("Computing structural semantics ...")
    # Build self-similarity from MFCC features
    mfcc_full = librosa.feature.mfcc(y=y, sr=sr, hop_length=HOP_LENGTH, n_mfcc=13)
    # Downsample to ~2Hz for tractable similarity matrix
    ds_factor = max(1, FPS // 2)
    mfcc_ds = mfcc_full[:, ::ds_factor]
    n_ds = mfcc_ds.shape[1]
    # Cosine self-similarity
    mfcc_norms = np.linalg.norm(mfcc_ds, axis=0, keepdims=True)
    mfcc_unit = mfcc_ds / (mfcc_norms + 1e-8)
    ssm = mfcc_unit.T @ mfcc_unit  # (n_ds, n_ds)

    # Diagonal-band energy: high diagonal = repeating (verse/chorus), low = unique (bridge/solo)
    section_type_arr = ["jam"] * n_frames
    diag_energy = np.zeros(n_ds)
    for lag in range(1, min(n_ds, int(30 * FPS / ds_factor))):  # up to 30s lags
        diag = np.diagonal(ssm, offset=lag)
        diag_energy[:len(diag)] += diag

    if n_ds > 0:
        diag_energy_norm = normalize(diag_energy)
        # Combine with vocal presence for section classification
        vocal_ds = np.zeros(n_ds)
        if stem_data and stem_data["available"] and "vocalPresence" in stem_data:
            vp = stem_data["vocalPresence"].astype(float)
            vp_padded = pad_or_trim_1d(vp, n_frames)
            for di in range(n_ds):
                src_frame = di * ds_factor
                end_frame = min(src_frame + ds_factor, n_frames)
                vocal_ds[di] = float(vp_padded[src_frame:end_frame].mean())

        for di in range(n_ds):
            src_frame = di * ds_factor
            end_frame = min(src_frame + ds_factor, n_frames)
            has_vocals = vocal_ds[di] > 0.5 if stem_data and "vocalPresence" in (stem_data or {}) else False
            repetition = diag_energy_norm[di]
            local_e = float(rms_norm[src_frame:end_frame].mean()) if end_frame > src_frame else 0

            if local_e < 0.08:
                label = "intro" if src_frame < n_frames * 0.1 else "outro" if src_frame > n_frames * 0.85 else "bridge"
            elif has_vocals and repetition > 0.6:
                label = "chorus"
            elif has_vocals:
                label = "verse"
            elif repetition > 0.5 and local_e > 0.25:
                label = "chorus"
            elif local_e > 0.4:
                label = "solo"
            elif repetition < 0.3:
                label = "bridge"
            else:
                label = "jam"

            for fi in range(src_frame, min(end_frame, n_frames)):
                section_type_arr[fi] = label

    # --- Space score override: when spaceScore > 0.6 contiguously, override sectionType to "space" ---
    # (computed after space_score below, applied after section_type_arr is built)

    # Count section type distribution
    from collections import Counter
    type_counts = Counter(section_type_arr)
    print(f"Structural semantics: {dict(type_counts)}")

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
    # (already computed earlier for chord detection — reusing)
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

    # --- Silence / applause classifier (Tier 3) ---
    # Differentiates dead-air silence (between songs), audience applause,
    # and music. Three soft scores per frame, all 0..1:
    #   silenceScore   — true silence (very low RMS, no beats, no flux)
    #   applauseScore  — broadband flat energy (applause / cheering)
    #   musicScore     — present music (inverse — useful as a gate)
    # Placed AFTER flatness_norm + improv block so all four inputs
    # (rms_norm, flatness_norm, beat_confidence_arr, onset_norm) and
    # gaussian_filter1d (imported in improv block) are available.
    print("Computing silence/applause classifier ...")
    silence_score_arr = np.zeros(n_frames)
    applause_score_arr = np.zeros(n_frames)
    music_score_arr = np.zeros(n_frames)
    for i in range(n_frames):
        e = float(rms_norm[i])
        flat = float(flatness_norm[i])
        bc = float(beat_confidence_arr[i])
        oset = float(onset_norm[i]) if i < len(onset_norm) else 0.0
        if e < 0.05 and bc < 0.30 and oset < 0.10:
            sil = (1.0 - e / 0.05) * 0.6 + (1.0 - bc / 0.30) * 0.4
            silence_score_arr[i] = max(0.0, min(1.0, sil))
        if e > 0.05 and e < 0.45 and flat > 0.55 and bc < 0.35:
            app = (flat - 0.55) / 0.45 * 0.5
            app += min(1.0, e / 0.30) * 0.3
            app += (1.0 - bc / 0.35) * 0.2
            applause_score_arr[i] = max(0.0, min(1.0, app))
        if e > 0.10 and (bc > 0.35 or flat < 0.50):
            mu = 0.0
            mu += min(1.0, e / 0.40) * 0.4
            mu += min(1.0, bc / 0.6) * 0.3
            mu += (1.0 - min(1.0, flat / 0.55)) * 0.3
            music_score_arr[i] = max(0.0, min(1.0, mu))
    from scipy.ndimage import gaussian_filter1d as _gf  # may already be imported above
    silence_score_arr = _gf(silence_score_arr, sigma=FPS / 6.0)
    applause_score_arr = _gf(applause_score_arr, sigma=FPS / 6.0)
    music_score_arr = _gf(music_score_arr, sigma=FPS / 6.0)
    print(f"Silence classifier: silence frames={int((silence_score_arr > 0.5).sum())}, "
          f"applause frames={int((applause_score_arr > 0.5).sum())}, "
          f"music frames={int((music_score_arr > 0.5).sum())}")

    # --- Section detection ---
    sections = detect_sections(y, sr, n_frames, rms_norm)

    # --- Optional stem analysis ---
    stem_data = None
    if stems_dir is not None:
        stem_data = analyze_stems(stems_dir, n_frames)

    # --- Level 2: Deep audio features ---

    # Tempo derivative: rate of tempo change (-1 to +1)
    print("Computing tempo derivative ...")
    tempo_derivative_arr = np.gradient(local_tempo_arr)
    tempo_derivative_arr = gaussian_filter1d(tempo_derivative_arr, sigma=FPS)  # 1s Gaussian
    # Normalize: ±10 BPM/s → ±1
    tempo_derivative_arr = np.clip(tempo_derivative_arr / 10.0, -1.0, 1.0)
    tempo_derivative_arr = pad_or_trim_1d(tempo_derivative_arr, n_frames)

    # Dynamic range: peak/RMS ratio per 1s window (0-1)
    print("Computing dynamic range ...")
    dynamic_range_arr = np.zeros(n_frames)
    dr_window = FPS  # 1 second
    for i in range(n_frames):
        lo_dr = max(0, i - dr_window // 2)
        hi_dr = min(len(rms), i + dr_window // 2)
        if hi_dr <= lo_dr:
            continue
        win_rms = rms[lo_dr:hi_dr]  # use raw rms, not normalized
        peak_val = win_rms.max()
        mean_val = win_rms.mean()
        if mean_val > 1e-8:
            ratio = peak_val / mean_val
            # Typical ratio 1-10, normalize to 0-1
            dynamic_range_arr[i] = min(1.0, (ratio - 1.0) / 9.0)
    dynamic_range_arr = pad_or_trim_1d(dynamic_range_arr, n_frames)

    # Space score: composite (0-1) — weighted: low energy(.3) + high flatness(.25) + low beat confidence(.25) + no vocals(.2)
    print("Computing space score ...")
    space_score_arr = np.zeros(n_frames)
    for i in range(n_frames):
        energy_comp = max(0, 1.0 - rms_norm[i] * 4.0)  # low energy → high
        flatness_comp = flatness_norm[i]  # high flatness → high
        beat_comp = max(0, 1.0 - beat_confidence_arr[i] * 2.0)  # low beat confidence → high
        vocal_comp = 1.0  # default: no vocals
        if stem_data and stem_data["available"] and "vocalPresence" in stem_data:
            vocal_comp = 0.0 if bool(stem_data["vocalPresence"][i]) else 1.0
        space_score_arr[i] = energy_comp * 0.3 + flatness_comp * 0.25 + beat_comp * 0.25 + vocal_comp * 0.2
    space_score_arr = np.clip(space_score_arr, 0.0, 1.0)
    space_score_arr = pad_or_trim_1d(space_score_arr, n_frames)

    # Space score override: when spaceScore > 0.6 contiguously for >= 2s, override sectionType to "space"
    SPACE_THRESHOLD = 0.6
    SPACE_MIN_FRAMES = int(2 * FPS)  # 2 seconds contiguous
    in_space = False
    space_start = 0
    for i in range(n_frames):
        if space_score_arr[i] > SPACE_THRESHOLD:
            if not in_space:
                in_space = True
                space_start = i
        else:
            if in_space and (i - space_start) >= SPACE_MIN_FRAMES:
                for fi in range(space_start, i):
                    section_type_arr[fi] = "space"
            in_space = False
    # Handle trailing space
    if in_space and (n_frames - space_start) >= SPACE_MIN_FRAMES:
        for fi in range(space_start, n_frames):
            section_type_arr[fi] = "space"

    # Timbral brightness: high MFCC bins / total ratio (0-1)
    print("Computing timbral brightness ...")
    mfcc_brightness = librosa.feature.mfcc(y=y, sr=sr, hop_length=HOP_LENGTH, n_mfcc=20)
    # High MFCC bins (10-19) vs total energy
    high_mfcc = np.abs(mfcc_brightness[10:, :]).sum(axis=0)
    total_mfcc = np.abs(mfcc_brightness).sum(axis=0) + 1e-8
    timbral_brightness_arr = normalize(high_mfcc / total_mfcc)
    timbral_brightness_arr = pad_or_trim_1d(timbral_brightness_arr, n_frames)

    # Timbral flux: L2 norm of MFCC deltas (0-1)
    print("Computing timbral flux ...")
    mfcc_delta = np.diff(mfcc_brightness, axis=1)
    timbral_flux_raw = np.linalg.norm(mfcc_delta, axis=0)
    timbral_flux_arr = normalize(timbral_flux_raw)
    # Pad to n_frames (diff loses 1 frame)
    timbral_flux_arr = np.concatenate([[0], timbral_flux_arr])
    timbral_flux_arr = pad_or_trim_1d(timbral_flux_arr, n_frames)

    # Vocal pitch isolation: piptrack on vocal stem
    vocal_pitch_arr = np.zeros(n_frames)
    vocal_pitch_conf_arr = np.zeros(n_frames)
    vocals_path = (stems_dir / "vocals.wav") if stems_dir else Path("nonexistent")
    if stem_data and stem_data["available"] and vocals_path.exists():
        print("Extracting vocal melody (piptrack on vocal stem) ...")
        y_vocals_pitch, _ = librosa.load(str(vocals_path), sr=SR, mono=True)
        vp_pitches, vp_mags = librosa.piptrack(y=y_vocals_pitch, sr=SR, hop_length=HOP_LENGTH)
        for t in range(min(vp_pitches.shape[1], n_frames)):
            mag_col = vp_mags[:, t]
            idx_max = mag_col.argmax()
            if mag_col[idx_max] > 0:
                hz = vp_pitches[idx_max, t]
                if hz > 0:
                    midi = 12 * np.log2(hz / 440.0) + 69
                    vocal_pitch_arr[t] = np.clip((midi - 21) / (108 - 21), 0, 1)
                    vocal_pitch_conf_arr[t] = mag_col[idx_max]
        vocal_pitch_conf_arr = normalize(vocal_pitch_conf_arr)
        vocal_pitch_arr = pad_or_trim_1d(vocal_pitch_arr, n_frames)
        vocal_pitch_conf_arr = pad_or_trim_1d(vocal_pitch_conf_arr, n_frames)
        print(f"Vocal pitch: {np.count_nonzero(vocal_pitch_arr)} pitched frames / {n_frames} total")

    space_count = sum(1 for s in section_type_arr if s == "space")
    print(f"Level 2 features: tempoDerivative range=[{tempo_derivative_arr.min():.3f}, {tempo_derivative_arr.max():.3f}], "
          f"dynamicRange mean={dynamic_range_arr.mean():.3f}, spaceScore mean={space_score_arr.mean():.3f}, "
          f"space frames={space_count}, timbralBrightness mean={timbral_brightness_arr.mean():.3f}, "
          f"timbralFlux mean={timbral_flux_arr.mean():.3f}")

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
            "localTempo": round(float(local_tempo_arr[i]), 1),
            "beatConfidence": round(float(beat_confidence_arr[i]), 3),
            "downbeat": i in downbeat_set,
            "melodicPitch": round(float(melodic_pitch_norm[i]), 4),
            "melodicConfidence": round(float(melodic_confidence_norm[i]), 3),
            "melodicDirection": round(float(melodic_direction[i]), 3),
            "chordIndex": int(chord_idx_arr[i]),
            "chordConfidence": round(float(chord_confidence_arr[i]), 3),
            "harmonicTension": round(float(harmonic_tension_arr[i]), 3),
            "sectionType": section_type_arr[i],
            "improvisationScore": round(float(improv_arr[i]), 3),
            "tempoDerivative": round(float(tempo_derivative_arr[i]), 4),
            "dynamicRange": round(float(dynamic_range_arr[i]), 4),
            "spaceScore": round(float(space_score_arr[i]), 4),
            "timbralBrightness": round(float(timbral_brightness_arr[i]), 4),
            "timbralFlux": round(float(timbral_flux_arr[i]), 4),
            "vocalPitch": round(float(vocal_pitch_arr[i]), 4),
            "vocalPitchConfidence": round(float(vocal_pitch_conf_arr[i]), 4),
            # Krumhansl-Schmuckler key detection (Tier 3)
            "keyTonic": round(float(key_tonic_arr[i]), 4),       # 0..1 normalized 0-11 tonic index
            "keyMode": round(float(key_mode_arr[i]), 1),         # 0=minor, 1=major
            "keyConfidence": round(float(key_confidence_arr[i]), 3),
            "keyChange": int(key_change_arr[i]),                  # 1 only on key-change boundary frame
            # Silence / applause classifier (Tier 3)
            "silenceScore": round(float(silence_score_arr[i]), 3),
            "applauseScore": round(float(applause_score_arr[i]), 3),
            "musicScore": round(float(music_score_arr[i]), 3),
        }
        # Add stem-specific fields when available
        if stem_data and stem_data["available"]:
            bass_rms = float(stem_data["bassRms"][i])
            frame["stemBassRms"] = round(bass_rms, 4)
            frame["stemDrumOnset"] = round(float(stem_data["drumOnset"][i]), 4)
            frame["stemDrumBeat"] = i in stem_data["drumBeatSet"]
            vocal_rms = 0.0
            other_rms = 0.0
            if "vocalRms" in stem_data:
                vocal_rms = float(stem_data["vocalRms"][i])
                frame["stemVocalRms"] = round(vocal_rms, 4)
                frame["stemVocalPresence"] = bool(stem_data["vocalPresence"][i])
            if "otherRms" in stem_data:
                other_rms = float(stem_data["otherRms"][i])
                frame["stemOtherRms"] = round(other_rms, 4)
                frame["stemOtherCentroid"] = round(float(stem_data["otherCentroid"][i]), 4)
            # Vocal-vs-instrumental ratio (Tier 3): vocalEnergyRatio of total
            # tonal-source energy (vocal + other + bass). Drums excluded
            # because they're not part of the "who's playing what" signal.
            # 1.0 = pure vocal (Garcia singing acapella), 0.0 = pure instrumental
            # (Garcia soloing or band jamming), 0.5 = balanced. Distinguishes
            # "Jerry sings" from "Jerry solos" — useful for vocal-aware
            # routing/grading.
            tonal_total = vocal_rms + other_rms + bass_rms
            if tonal_total > 1e-4:
                frame["vocalEnergyRatio"] = round(vocal_rms / tonal_total, 4)
            else:
                frame["vocalEnergyRatio"] = 0.0
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

    # --- Level 3: CLAP semantic analysis (optional — graceful fallback) ---
    # Skip with SKIP_CLAP=1 env var for faster analysis when CLAP model is unavailable
    if os.environ.get("SKIP_CLAP") != "1":
        try:
            from semantic_analysis import load_clap_model, compute_text_embeddings, analyze_audio_semantic, SEMANTIC_PROBES
            print("Running CLAP semantic analysis ...")
            clap_model = load_clap_model()
            text_embeds = compute_text_embeddings(clap_model, SEMANTIC_PROBES)
            semantic_scores, _ = analyze_audio_semantic(str(audio_path), clap_model, text_embeds)
            # Merge 8 semantic scores per frame
            semantic_categories = list(semantic_scores.keys())
            for i in range(n_frames):
                for cat in semantic_categories:
                    scores_list = semantic_scores[cat]
                    if i < len(scores_list):
                        frames[i][f"semantic_{cat}"] = round(float(scores_list[i]), 4)
            print(f"CLAP semantic analysis: {len(semantic_categories)} categories merged into {n_frames} frames")
        except ImportError:
            print("CLAP not available (laion-clap not installed), skipping semantic analysis")
        except Exception as e:
            print(f"CLAP semantic analysis failed (graceful fallback): {e}")
    else:
        print("CLAP semantic analysis skipped (SKIP_CLAP=1)")

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
    # --stdin-json mode: read JSON from stdin, write TrackAnalysis JSON to stdout
    if "--stdin-json" in sys.argv:
        import tempfile
        input_data = json.loads(sys.stdin.read())
        audio_path = Path(input_data["audioPath"])
        stems_dir = Path(input_data["stemsDir"]) if input_data.get("stemsDir") else None
        # Write to temp file, then output to stdout
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            result = analyze_track(audio_path, tmp_path, stems_dir)
            # Read and output the JSON to stdout
            with open(tmp_path, "r") as f:
                sys.stdout.write(f.read())
        finally:
            tmp_path.unlink(missing_ok=True)
        return

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
