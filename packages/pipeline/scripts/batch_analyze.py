#!/usr/bin/env python3
"""Batch audio analysis for Dead Air pipeline.

Processes all audio files in a show directory through analyze_audio.py.
Outputs one JSON analysis file per track.

Usage:
    python batch_analyze.py --audio-dir ./audio/ --output-dir ./analysis/
    python batch_analyze.py --audio-dir ./audio/ --output-dir ./analysis/ --parallel 4
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed


def analyze_single(audio_path: str, output_path: str, script_dir: str) -> dict:
    """Run analyze_audio.py on a single file."""
    analyze_script = os.path.join(script_dir, "analyze_audio.py")

    config = {
        "audioPath": audio_path,
        "analyses": [
            "energy", "tempo", "spectral", "onsets", "key",
            "chroma", "contrast", "beats", "sections",
            "stems", "melodic", "chords", "structure",
            "deep_audio"
        ]
    }

    try:
        result = subprocess.run(
            [sys.executable, analyze_script],
            input=json.dumps(config),
            capture_output=True,
            text=True,
            timeout=600,  # 10 minutes per track
        )

        if result.returncode != 0:
            return {
                "file": audio_path,
                "ok": False,
                "error": f"Process exited with code {result.returncode}: {result.stderr[:500]}"
            }

        analysis = json.loads(result.stdout)

        # Write output
        with open(output_path, "w") as f:
            json.dump(analysis, f)

        return {
            "file": audio_path,
            "ok": True,
            "duration": analysis.get("durationSec", 0),
            "output": output_path
        }

    except subprocess.TimeoutExpired:
        return {"file": audio_path, "ok": False, "error": "Timeout (>10min)"}
    except json.JSONDecodeError as e:
        return {"file": audio_path, "ok": False, "error": f"Invalid JSON output: {e}"}
    except Exception as e:
        return {"file": audio_path, "ok": False, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Batch analyze audio files for a show")
    parser.add_argument("--audio-dir", required=True, help="Directory containing audio files")
    parser.add_argument("--output-dir", required=True, help="Output directory for analysis JSON")
    parser.add_argument("--parallel", type=int, default=1, help="Number of parallel workers (default: 1)")
    parser.add_argument("--ext", default=".mp3", help="Audio file extension (default: .mp3)")
    args = parser.parse_args()

    audio_dir = Path(args.audio_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    script_dir = str(Path(__file__).parent.resolve())

    if not audio_dir.exists():
        print(f"Error: Audio directory not found: {audio_dir}", file=sys.stderr)
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    # Find audio files
    audio_files = sorted(audio_dir.glob(f"*{args.ext}"))
    if not audio_files:
        print(f"Error: No {args.ext} files found in {audio_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(audio_files)} audio files in {audio_dir}")
    print(f"Output directory: {output_dir}")
    print(f"Parallel workers: {args.parallel}")
    print()

    # Process files
    results = []
    if args.parallel <= 1:
        for i, audio_path in enumerate(audio_files):
            output_path = str(output_dir / f"{audio_path.stem}-analysis.json")
            print(f"[{i+1}/{len(audio_files)}] Analyzing {audio_path.name}...")
            result = analyze_single(str(audio_path), output_path, script_dir)
            results.append(result)
            if result["ok"]:
                print(f"  ✓ {result.get('duration', 0):.1f}s → {Path(result['output']).name}")
            else:
                print(f"  ✗ {result['error']}")
    else:
        with ProcessPoolExecutor(max_workers=args.parallel) as executor:
            futures = {}
            for audio_path in audio_files:
                output_path = str(output_dir / f"{audio_path.stem}-analysis.json")
                future = executor.submit(
                    analyze_single, str(audio_path), output_path, script_dir
                )
                futures[future] = audio_path.name

            for future in as_completed(futures):
                name = futures[future]
                result = future.result()
                results.append(result)
                if result["ok"]:
                    print(f"  ✓ {name} ({result.get('duration', 0):.1f}s)")
                else:
                    print(f"  ✗ {name}: {result['error']}")

    # Summary
    ok_count = sum(1 for r in results if r["ok"])
    fail_count = len(results) - ok_count
    total_duration = sum(r.get("duration", 0) for r in results if r["ok"])

    print(f"\nBatch analysis complete:")
    print(f"  ✓ {ok_count} succeeded ({total_duration:.0f}s total audio)")
    if fail_count > 0:
        print(f"  ✗ {fail_count} failed")

    # Write batch summary
    summary_path = str(output_dir / "batch-summary.json")
    with open(summary_path, "w") as f:
        json.dump({
            "audioDir": str(audio_dir),
            "totalFiles": len(audio_files),
            "succeeded": ok_count,
            "failed": fail_count,
            "totalDurationSec": total_duration,
            "results": results
        }, f, indent=2)

    if fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
