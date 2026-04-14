#!/usr/bin/env python3
"""
Manifest Smoother — transforms raw audio-reactive uniforms into flowing,
cinematic visual parameters.

The raw manifest has per-frame audio values that change abruptly every frame.
This script applies:
  1. Exponential moving average (EMA) to all audio-reactive fields
  2. Time scaling to slow shader internal animations
  3. Energy compression to limit visual range during non-climax sections
  4. Gaussian pulse shaping for beat/onset events

The result: visuals that breathe and flow WITH the music instead of
twitching at every transient.

Usage:
  python3 smooth-manifest.py input.json output.json [--time-scale 0.4] [--preview]
"""

import json
import math
import sys
import argparse

# ─── Smoothing Configuration ───

# EMA time constants (in seconds). Higher = smoother/slower response.
SMOOTH_CONFIG = {
    # Core energy signals — smooth heavily for flowing brightness
    "energy":        {"tau": 1.0,  "compress": True},
    "slow_energy":   {"tau": 1.5,  "compress": True},
    "fast_energy":   {"tau": 0.6,  "compress": True},

    # Beat/onset — keep SOME punch but remove the harsh spikes
    "beat":          {"tau": 0.15, "compress": False},
    "onset":         {"tau": 0.2,  "compress": False},
    "beat_time":     {"tau": 0.0,  "compress": False},  # don't smooth (it's a clock)

    # Bass/spectral — smooth for gentle color/motion response
    "bass":          {"tau": 0.8,  "compress": True},
    "spectral_flux": {"tau": 0.6,  "compress": False},
    "spectral_centroid": {"tau": 1.0, "compress": False},

    # Stem energy — smooth so instrument-reactive effects flow
    "stem_drums":    {"tau": 0.5,  "compress": True},
    "stem_bass":     {"tau": 0.8,  "compress": True},
    "vocal_energy":  {"tau": 0.8,  "compress": True},
    "stem_other":    {"tau": 0.8,  "compress": True},

    # Harmonic/timbral — these should change very slowly
    "chroma_hue":        {"tau": 2.0, "compress": False},
    "harmonic_tension":  {"tau": 1.5, "compress": False},
    "timbral_brightness":{"tau": 1.5, "compress": False},
    "timbral_flux":      {"tau": 1.0, "compress": False},

    # Derived signals
    "tempo_derivative":  {"tau": 1.0, "compress": False},
    "dynamic_range":     {"tau": 1.0, "compress": False},
    "space_score":       {"tau": 2.0, "compress": False},
}

# Fields to NOT smooth (clocks, indices, flags)
SKIP_FIELDS = {
    "frame", "time", "beat_time", "shader_id", "secondary_shader_id",
    "blend_progress", "blend_mode", "coherence", "section_type",
    "reactive_trigger_index", "chord_index", "melodic_pitch",
    "melodic_direction", "peak_approaching", "energy_forecast",
    "beat_stability", "song_progress", "shader_hold_progress",
    "peak_of_show", "motion_blur_samples",
    # Config/per-show values
    "era_brightness", "envelope_saturation",
    "show_grain_character", "show_bloom_character",
    "show_temperature_character", "show_contrast_character",
    "param_complexity", "param_drum_reactivity", "param_vocal_weight",
}

# Time fields to scale (slow down shader animations)
TIME_FIELDS = {"time", "dynamic_time"}


def ema_alpha(tau: float, fps: float) -> float:
    """EMA coefficient from time constant and framerate."""
    if tau <= 0:
        return 1.0  # no smoothing
    return 1.0 - math.exp(-1.0 / (tau * fps))


def compress_energy(value: float, intensity: float, floor: float = 0.05) -> float:
    """
    Compress energy range based on section intensity.
    intensity 0 (quiet section) → output range [floor, 0.45]
    intensity 1 (climax)        → output range [floor, 0.95]
    """
    max_out = 0.45 + intensity * 0.50
    return floor + value * (max_out - floor)


def estimate_section_intensity(frames: list, idx: int, window: int = 300) -> float:
    """
    Estimate how 'intense' the current section is by looking at
    a window of surrounding frames' energy. Returns 0-1.
    """
    start = max(0, idx - window)
    end = min(len(frames), idx + window)
    window_frames = frames[start:end]
    if not window_frames:
        return 0.5

    avg_energy = sum(f.get("energy", 0) for f in window_frames) / len(window_frames)
    max_energy = max(f.get("energy", 0) for f in window_frames)

    # Use both average and peak to determine intensity
    # High avg + high peak = true climax
    # High peak but low avg = isolated spike (should still be compressed)
    intensity = avg_energy * 0.6 + max_energy * 0.4

    # Map through a curve that keeps most of the show in low-intensity mode
    # Only sustained high energy triggers full intensity
    return min(1.0, intensity ** 0.7 * 1.5)


def smooth_manifest(manifest: dict, time_scale: float = 0.4, fps: float = 60.0) -> dict:
    """Apply smoothing, time scaling, and energy compression to manifest frames."""
    frames = manifest["frames"]
    total = len(frames)

    print(f"Smoothing {total} frames at {fps}fps, time_scale={time_scale}")

    # Pre-compute section intensities (5-second windows)
    print("  Computing section intensities...")
    intensities = []
    for i in range(total):
        if i % 10000 == 0:
            intensities_so_far = len(intensities)
        intensities.append(estimate_section_intensity(frames, i, window=int(fps * 5)))

    # Compute EMA alphas
    alphas = {field: ema_alpha(cfg["tau"], fps) for field, cfg in SMOOTH_CONFIG.items()}

    # Initialize EMA state from first frame
    ema_state = {}
    for field in SMOOTH_CONFIG:
        if field in frames[0]:
            ema_state[field] = float(frames[0].get(field, 0))

    # Process frames
    print("  Smoothing frames...")
    smoothed_frames = []
    for i, frame in enumerate(frames):
        if i % 50000 == 0:
            print(f"    {i}/{total} ({100*i/total:.0f}%)")

        new_frame = dict(frame)  # shallow copy
        intensity = intensities[i]

        # Scale time fields
        for tf in TIME_FIELDS:
            if tf in new_frame:
                # Base time scale, relaxed toward 1.0 during climax
                effective_scale = time_scale + (1.0 - time_scale) * intensity * 0.5
                new_frame[tf] = frame[tf] * effective_scale

        # Smooth and compress audio-reactive fields
        for field, cfg in SMOOTH_CONFIG.items():
            if field not in frame or field in SKIP_FIELDS:
                continue

            raw = float(frame[field])
            alpha = alphas[field]

            # EMA update
            if field in ema_state:
                ema_state[field] = ema_state[field] * (1 - alpha) + raw * alpha
            else:
                ema_state[field] = raw

            smoothed = ema_state[field]

            # Energy compression
            if cfg.get("compress"):
                smoothed = compress_energy(smoothed, intensity)

            new_frame[field] = smoothed

        # Smooth any numeric fields not explicitly configured
        # (catch-all for fields like contrast bands, etc.)
        # Skip: they might be arrays or non-numeric

        smoothed_frames.append(new_frame)

    manifest["frames"] = smoothed_frames
    print(f"  Done. {total} frames smoothed.")
    return manifest


def main():
    parser = argparse.ArgumentParser(description="Smooth manifest for flowing visuals")
    parser.add_argument("input", help="Input manifest.json path")
    parser.add_argument("output", help="Output smoothed manifest path")
    parser.add_argument("--time-scale", type=float, default=0.4,
                        help="Time scaling factor (0.4 = 2.5x slower animations)")
    parser.add_argument("--fps", type=float, default=60.0,
                        help="Manifest framerate")
    parser.add_argument("--preview", action="store_true",
                        help="Print before/after stats for first 1000 frames")
    args = parser.parse_args()

    print(f"Loading {args.input}...")
    with open(args.input) as f:
        manifest = json.load(f)

    if args.preview:
        # Show before stats
        frames = manifest["frames"][:1000]
        energies = [f.get("energy", 0) for f in frames]
        print(f"\nBefore smoothing (first 1000 frames):")
        print(f"  energy: min={min(energies):.4f} max={max(energies):.4f} avg={sum(energies)/len(energies):.4f}")
        deltas = [abs(energies[i]-energies[i-1]) for i in range(1, len(energies))]
        print(f"  energy jitter (avg delta): {sum(deltas)/len(deltas):.6f}")

    manifest = smooth_manifest(manifest, time_scale=args.time_scale, fps=args.fps)

    if args.preview:
        frames = manifest["frames"][:1000]
        energies = [f.get("energy", 0) for f in frames]
        print(f"\nAfter smoothing (first 1000 frames):")
        print(f"  energy: min={min(energies):.4f} max={max(energies):.4f} avg={sum(energies)/len(energies):.4f}")
        deltas = [abs(energies[i]-energies[i-1]) for i in range(1, len(energies))]
        print(f"  energy jitter (avg delta): {sum(deltas)/len(deltas):.6f}")

    print(f"\nWriting {args.output}...")
    with open(args.output, "w") as f:
        json.dump(manifest, f)
    print("Done!")


if __name__ == "__main__":
    main()
