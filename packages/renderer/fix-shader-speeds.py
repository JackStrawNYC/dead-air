#!/usr/bin/env python3
"""
Fix shader animation speeds by reducing hardcoded multipliers in GLSL source.

The manifest's `shaders` field contains full GLSL source for each shader.
This script:
  1. Caps direct time multipliers: sin(uTime * 14.0) → sin(uTime * 2.5)
  2. Caps flowTime multipliers: flowTime * 3.0 → flowTime * 1.2
  3. Reduces energy reactivity: energy * 2.5 → energy * 1.0
  4. Applies moderate EMA smoothing to audio uniforms
  5. Keeps time at 1.0x (no scaling artifacts)

The result: shaders animate at max ~2.5Hz instead of 14Hz,
noise evolves gently, energy response is proportional not explosive.
"""

import json
import re
import math
import sys


# ─── GLSL Speed Fixes ───

def cap_multiplier(match, field, max_val):
    """Replace field * N with field * min(N, max_val)."""
    prefix = match.group(1)  # sin(, cos(, or just the field reference
    value = float(match.group(2))
    if value > max_val:
        return f"{prefix}{max_val:.1f}"
    return match.group(0)


def fix_shader_glsl(source: str) -> str:
    """Reduce speed multipliers in a single shader's GLSL source."""
    fixed = source

    # 1. Cap uTime * N and uDynamicTime * N in sin/cos (max 2.5)
    #    sin(uTime * 14.0) → sin(uTime * 2.5)
    for time_var in ["uTime", "uDynamicTime", "uBeatTime"]:
        pattern = rf"((?:sin|cos)\s*\([^)]*?{time_var}\s*\*\s*)(\d+\.?\d*)"
        def replacer_trig(m, tv=time_var):
            val = float(m.group(2))
            if val > 2.5:
                return f"{m.group(1)}2.5"
            return m.group(0)
        fixed = re.sub(pattern, replacer_trig, fixed)

        # Also catch: vec3(..., uTime * N) in noise/fbm calls
        pattern2 = rf"({time_var}\s*\*\s*)(\d+\.?\d*)"
        def replacer_general(m, tv=time_var):
            val = float(m.group(2))
            # Only cap very high values (> 3.0) for general usage
            # Leave moderate values (0.01-3.0) alone
            if val > 3.0:
                return f"{m.group(1)}2.0"
            return m.group(0)
        fixed = re.sub(pattern2, replacer_general, fixed)

    # 2. Cap flowTime * N (max 1.2 for noise, 0.8 for sin/cos)
    #    flowTime * 3.0 → flowTime * 1.2
    pattern = r"(flowTime\s*\*\s*)(\d+\.?\d*)"
    def replacer_flow(m):
        val = float(m.group(2))
        if val > 1.2:
            return f"{m.group(1)}1.2"
        return m.group(0)
    fixed = re.sub(pattern, replacer_flow, fixed)

    # 3. Cap ventTime multipliers (max 0.2 base)
    #    ventTime = uDynamicTime * (0.7 + ...) → ventTime = uDynamicTime * (0.15 + ...)
    fixed = re.sub(
        r"(ventTime\s*=\s*uDynamicTime\s*\*\s*\()0\.\d+",
        r"\g<1>0.15",
        fixed
    )

    # 4. Reduce energy reactivity multipliers
    #    energy * 2.5 → energy * 1.0
    for energy_var in ["energy", "uEnergy"]:
        pattern = rf"({energy_var}\s*\*\s*)(\d+\.?\d*)"
        def replacer_energy(m, ev=energy_var):
            val = float(m.group(2))
            if val > 1.2:
                return f"{m.group(1)}{min(val, 1.2):.1f}"
            return m.group(0)
        fixed = re.sub(pattern, replacer_energy, fixed)

    # 5. Reduce drumOnset/bass reactivity
    for react_var in ["drumOnset", "drumOn", "bassVibration"]:
        pattern = rf"({react_var}\s*\*\s*)(\d+\.?\d*)"
        def replacer_react(m, rv=react_var):
            val = float(m.group(2))
            if val > 0.8:
                return f"{m.group(1)}{min(val * 0.4, 0.8):.2f}"
            return m.group(0)
        fixed = re.sub(pattern, replacer_react, fixed)

    # 6. Slow down base flowTime derivation
    #    flowTime = uDynamicTime * (0.12 + ...) → flowTime = uDynamicTime * (0.04 + ...)
    pattern = r"(flowTime\s*=\s*uDynamicTime\s*\*\s*(?:\()?)(\d+\.\d+)"
    def replacer_flowbase(m):
        val = float(m.group(2))
        if val > 0.05:
            return f"{m.group(1)}{val * 0.4:.3f}"
        return m.group(0)
    fixed = re.sub(pattern, replacer_flowbase, fixed)

    return fixed


def smooth_frames(frames: list, fps: float = 60.0) -> list:
    """Apply moderate EMA smoothing to audio-reactive uniforms."""
    # Moderate smoothing — enough to remove jitter, not enough to kill responsiveness
    smooth_fields = {
        "energy": 1.5,
        "slow_energy": 2.0,
        "fast_energy": 1.0,
        "bass": 1.2,
        "onset": 0.4,
        "beat": 0.3,
        "spectral_flux": 1.0,
        "stem_drums": 0.8,
        "stem_bass": 1.2,
        "vocal_energy": 1.2,
        "timbral_brightness": 2.0,
        "timbral_flux": 1.5,
        "chroma_hue": 3.0,
        "harmonic_tension": 2.0,
    }

    alphas = {f: 1 - math.exp(-1/(tau*fps)) for f, tau in smooth_fields.items()}
    ema = {}

    for i, frame in enumerate(frames):
        for field, alpha in alphas.items():
            if field not in frame:
                continue
            raw = float(frame[field])
            if field not in ema:
                ema[field] = raw
            ema[field] = ema[field] * (1 - alpha) + raw * alpha
            frame[field] = ema[field]

    return frames


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]

    print(f"Loading {input_path}...")
    with open(input_path) as f:
        manifest = json.load(f)

    # Fix shader GLSL speeds
    shaders = manifest.get("shaders", {})
    print(f"Fixing {len(shaders)} shaders...")
    changes_total = 0
    for shader_id, source in shaders.items():
        fixed = fix_shader_glsl(source)
        if fixed != source:
            changes_total += 1
            manifest["shaders"][shader_id] = fixed
    print(f"  Modified {changes_total}/{len(shaders)} shaders")

    # Smooth audio uniforms
    print(f"Smoothing {len(manifest['frames'])} frames...")
    manifest["frames"] = smooth_frames(manifest["frames"])

    print(f"Writing {output_path}...")
    with open(output_path, "w") as f:
        json.dump(manifest, f)

    print("Done!")


if __name__ == "__main__":
    main()
