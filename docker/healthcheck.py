#!/usr/bin/env python3
"""Health check script for Dead Air Docker images.

Verifies that required Python packages and system tools are importable.

Usage:
  python healthcheck.py --image=analyze   # Check librosa, numpy, soundfile, sklearn
  python healthcheck.py --image=gpu       # Check torch, demucs, whisperx (+ analyze deps)
"""
import shutil
import sys


def check_import(module_name: str) -> bool:
    try:
        __import__(module_name)
        return True
    except ImportError:
        return False


def check_binary(name: str) -> bool:
    return shutil.which(name) is not None


def main():
    image = "analyze"
    for arg in sys.argv[1:]:
        if arg.startswith("--image="):
            image = arg.split("=", 1)[1]

    checks = {
        "librosa": check_import("librosa"),
        "numpy": check_import("numpy"),
        "soundfile": check_import("soundfile"),
        "sklearn": check_import("sklearn"),
        "ffmpeg": check_binary("ffmpeg"),
    }

    if image == "gpu":
        checks.update({
            "torch": check_import("torch"),
            "demucs": check_import("demucs"),
            "whisperx": check_import("whisperx"),
        })

    failed = [name for name, ok in checks.items() if not ok]

    for name, ok in sorted(checks.items()):
        status = "OK" if ok else "FAIL"
        print(f"  {status}  {name}")

    if failed:
        print(f"\nHealth check FAILED: {', '.join(failed)}")
        sys.exit(1)
    else:
        print(f"\nAll {len(checks)} checks passed ({image} image)")
        sys.exit(0)


if __name__ == "__main__":
    main()
