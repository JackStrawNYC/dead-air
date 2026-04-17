#!/usr/bin/env python3
"""
Semantic audio analysis using CLAP (Contrastive Language-Audio Pretraining).

Processes audio in 2s windows with 0.5s hop, scoring each window against
8 semantic probe text sets via cosine similarity. Interpolates to 30fps
and applies 1s Gaussian smoothing.

Requires: laion-clap>=1.1.4, torch, numpy, scipy

Usage:
  python semantic_analysis.py /path/to/audio.mp3 output.json
  python semantic_analysis.py --stdin-json  # reads JSON {audioPath, outputPath} from stdin
"""

import json
import sys
from pathlib import Path

import numpy as np

SR = 48000  # CLAP's expected sample rate
FPS = 30
WINDOW_SEC = 2.0
HOP_SEC = 0.5

# ─── Semantic Probes ───
# Each probe set defines text descriptions for a musical semantic category.
# CLAP scores audio against each probe; the maximum score becomes the category score.

SEMANTIC_PROBES = {
    "psychedelic": [
        "psychedelic swirling effects",
        "trippy spacey atmosphere",
        "liquid light show",
        "distorted guitar feedback",
    ],
    "aggressive": [
        "loud aggressive driving rock",
        "powerful energetic peak",
        "heavy distorted guitar",
        "intense pounding drums",
    ],
    "tender": [
        "gentle acoustic ballad",
        "soft intimate quiet singing",
        "delicate fingerpicking guitar",
        "sweet melodic piano",
    ],
    "cosmic": [
        "vast cosmic space music",
        "deep expansive soundscape",
        "ethereal ambient drone",
        "interstellar voyage atmosphere",
    ],
    "rhythmic": [
        "strong steady beat groove",
        "funky rhythmic danceable",
        "tight percussion pattern",
        "syncopated bass line",
    ],
    "ambient": [
        "ambient atmospheric drone",
        "quiet minimal texture",
        "environmental soundscape",
        "peaceful meditative music",
    ],
    "chaotic": [
        "dissonant experimental noise",
        "chaotic free improvisation",
        "atonal cacophony",
        "unpredictable wild music",
    ],
    "triumphant": [
        "triumphant climactic peak",
        "euphoric uplifting resolution",
        "victorious celebratory music",
        "grand majestic crescendo",
    ],
}


def load_clap_model():
    """Load CLAP model (cached at HF_HOME, ~600MB first download)."""
    try:
        import laion_clap
    except ImportError:
        print("ERROR: laion-clap not installed. Install with: pip install laion-clap>=1.1.4", file=sys.stderr)
        sys.exit(1)

    print("Loading CLAP model (music_speech_audioset_epoch_15_esc_89.98) ...")
    model = laion_clap.CLAP_Module(enable_fusion=False, amodel="HTSAT-tiny")
    model.load_ckpt()  # downloads default checkpoint (~300MB) on first run
    print("CLAP model loaded.")
    return model


def compute_text_embeddings(model, probes: dict) -> dict:
    """Pre-compute text embeddings for all probe sets."""
    text_embeds = {}
    for category, texts in probes.items():
        embeds = model.get_text_embedding(texts, use_tensor=False)
        # embeds: (N, D) — average for a single representative vector
        text_embeds[category] = embeds
    return text_embeds


def analyze_audio_semantic(audio_path: str, model, text_embeds: dict) -> dict:
    """
    Score audio windows against semantic probes.

    Returns dict with 8 semantic score arrays, each at 30fps.
    """
    import librosa
    from scipy.ndimage import gaussian_filter1d

    print(f"Loading audio: {audio_path} ...")
    y, sr = librosa.load(audio_path, sr=SR, mono=True)
    duration = len(y) / sr
    n_frames = int(np.ceil(duration * FPS))
    print(f"Duration: {duration:.1f}s | Target frames: {n_frames}")

    # Process in windows
    window_samples = int(WINDOW_SEC * SR)
    hop_samples = int(HOP_SEC * SR)
    n_windows = max(1, int((len(y) - window_samples) / hop_samples) + 1)

    # Pre-allocate score arrays (per window)
    window_scores = {cat: np.zeros(n_windows) for cat in SEMANTIC_PROBES}
    window_times = np.zeros(n_windows)  # center time of each window

    print(f"Processing {n_windows} windows ({WINDOW_SEC}s window, {HOP_SEC}s hop) ...")
    for wi in range(n_windows):
        start = wi * hop_samples
        end = min(start + window_samples, len(y))
        chunk = y[start:end]

        # Pad short chunks
        if len(chunk) < window_samples:
            chunk = np.pad(chunk, (0, window_samples - len(chunk)), mode="constant")

        window_times[wi] = (start + end) / 2 / SR

        # Get audio embedding
        # CLAP expects float32 audio at 48kHz
        audio_embed = model.get_audio_embedding_from_data(
            [chunk.astype(np.float32)], use_tensor=False
        )  # (1, D)

        # Score against each category's text probes
        for category, text_embed in text_embeds.items():
            # Cosine similarity between audio embedding and each text probe
            # audio_embed: (1, D), text_embed: (N, D)
            audio_norm = audio_embed / (np.linalg.norm(audio_embed, axis=-1, keepdims=True) + 1e-8)
            text_norm = text_embed / (np.linalg.norm(text_embed, axis=-1, keepdims=True) + 1e-8)
            similarities = (audio_norm @ text_norm.T)[0]  # (N,)
            # Take max similarity across probes as the category score
            window_scores[category][wi] = float(np.max(similarities))

    # Interpolate window scores to 30fps frame resolution
    print("Interpolating to 30fps ...")
    frame_times = np.arange(n_frames) / FPS
    result = {}

    for category in SEMANTIC_PROBES:
        if n_windows <= 1:
            # Single window — constant score
            result[category] = np.full(n_frames, window_scores[category][0])
        else:
            # Linear interpolation
            interpolated = np.interp(frame_times, window_times[:n_windows], window_scores[category][:n_windows])
            # Normalize to 0-1 range
            mn, mx = interpolated.min(), interpolated.max()
            if mx - mn > 1e-6:
                interpolated = (interpolated - mn) / (mx - mn)
            else:
                interpolated = np.zeros(n_frames)
            # 1s Gaussian smooth
            interpolated = gaussian_filter1d(interpolated, sigma=FPS)
            result[category] = interpolated

    # Print summary
    for cat in sorted(result.keys()):
        arr = result[cat]
        print(f"  {cat}: mean={arr.mean():.3f}, max={arr.max():.3f}")

    return {cat: arr.tolist() for cat, arr in result.items()}, n_frames


def main():
    if "--stdin-json" in sys.argv:
        input_data = json.loads(sys.stdin.read())
        audio_path = input_data["audioPath"]
        output_path = input_data.get("outputPath")
    elif len(sys.argv) >= 3:
        audio_path = sys.argv[1]
        output_path = sys.argv[2]
    else:
        print("Usage: python semantic_analysis.py <audio_path> <output_path>", file=sys.stderr)
        sys.exit(1)

    model = load_clap_model()
    text_embeds = compute_text_embeddings(model, SEMANTIC_PROBES)
    scores, n_frames = analyze_audio_semantic(audio_path, model, text_embeds)

    output = {
        "semantic": scores,
        "nFrames": n_frames,
    }

    if output_path:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(output, f)
        print(f"Wrote semantic analysis to {output_path}")
    else:
        sys.stdout.write(json.dumps(output))


if __name__ == "__main__":
    main()
