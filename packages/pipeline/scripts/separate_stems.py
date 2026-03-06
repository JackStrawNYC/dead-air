#!/usr/bin/env python3
"""Demucs stem separation sidecar for Dead Air pipeline.

Reads JSON config on stdin, outputs JSON result on stdout.
Dependencies: demucs, torch

Input:  {"audioPath": "/path/to/song.mp3", "outputDir": "/path/to/stems/trackId", "model": "htdemucs"}
Output: {"ok": true, "stems": ["vocals.wav","drums.wav","bass.wav","other.wav"], "elapsed": 42.3}
"""
import json
import os
import shutil
import sys
import time
from pathlib import Path

# Redirect stderr to suppress Demucs/torch noise from corrupting JSON stdout
_real_stderr = sys.stderr


def detect_device():
    """Auto-detect best available device: CUDA > MPS > CPU."""
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass
    return "cpu"


CANONICAL_STEMS = ["vocals.wav", "drums.wav", "bass.wav", "other.wav"]


def separate(config: dict) -> dict:
    audio_path = Path(config["audioPath"])
    output_dir = Path(config["outputDir"])
    model_name = config.get("model", "htdemucs")

    if not audio_path.exists():
        return {"ok": False, "error": f"Audio file not found: {audio_path}"}

    output_dir.mkdir(parents=True, exist_ok=True)

    device = detect_device()
    print(f"Using device: {device}, model: {model_name}", file=_real_stderr)

    t0 = time.time()

    # Run Demucs via subprocess to isolate its noisy imports
    import subprocess

    # Build demucs command
    cmd = [
        sys.executable, "-m", "demucs",
        "--two-stems" if config.get("twoStems") else "",
        "-n", model_name,
        "-d", device,
        "-o", str(output_dir / "_demucs_tmp"),
        str(audio_path),
    ]
    # Remove empty strings from cmd
    cmd = [c for c in cmd if c]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=600,  # 10 minute timeout
    )

    if result.returncode != 0:
        return {"ok": False, "error": f"Demucs failed: {result.stderr[-500:]}"}

    # Demucs outputs to: _demucs_tmp/{model_name}/{track_name}/vocals.wav etc.
    track_name = audio_path.stem
    demucs_out = output_dir / "_demucs_tmp" / model_name / track_name

    if not demucs_out.exists():
        return {"ok": False, "error": f"Demucs output dir not found: {demucs_out}"}

    # Move stems to canonical locations
    stems_found = []
    for stem_name in CANONICAL_STEMS:
        src = demucs_out / stem_name
        dst = output_dir / stem_name
        if src.exists():
            shutil.move(str(src), str(dst))
            stems_found.append(stem_name)

    # Clean up temp directory
    tmp_dir = output_dir / "_demucs_tmp"
    if tmp_dir.exists():
        shutil.rmtree(str(tmp_dir))

    elapsed = round(time.time() - t0, 1)

    if len(stems_found) != 4:
        return {
            "ok": False,
            "error": f"Expected 4 stems, got {len(stems_found)}: {stems_found}",
            "elapsed": elapsed,
        }

    return {"ok": True, "stems": stems_found, "elapsed": elapsed}


if __name__ == "__main__":
    try:
        config = json.loads(sys.stdin.read())
        result = separate(config)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
