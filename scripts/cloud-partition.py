#!/usr/bin/env python3
"""
Partition 21 Veneta tracks into chunks and weighted-bin-pack them across N instances
of varying GPU speeds, so each instance finishes in roughly equal wall time.

Usage: cloud-partition.py <instances.txt>

instances.txt format (one per line):
  <name> <gpu_type> <relative_speed> <ssh_host> <ssh_port>
e.g.
  inst-01  4090   1.00  185.61.165.201  47292
  inst-02  4090D  0.89  185.169.79.118  12345
  inst-03  5090   1.32  162.157.136.13  23456
  inst-04  4080   0.61  74.48.78.46     34567

Outputs JSON with assignments per instance.
"""

import json
import sys
from pathlib import Path

REPO = Path(__file__).parent.parent
TIMELINE = REPO / "packages/visualizer-poc/data/shows/1972-08-27/show-timeline.json"

# Max chunk size in frames. Smaller = better load balance, more chunks.
# 14000 frames @ 0.88 fps @4K = 4.4h per chunk max → flexibility for bin-pack.
MAX_CHUNK_FRAMES = 14000

def load_tracks():
    with open(TIMELINE) as f:
        data = json.load(f)
    return [(t["trackId"], t["totalFrames"]) for t in data["tracks"]]

def split_into_chunks(track_id, total_frames, max_size):
    """Split a track into evenly-sized chunks of <= max_size frames each."""
    if total_frames <= max_size:
        return [(track_id, 0, total_frames - 1, total_frames)]
    n_chunks = (total_frames + max_size - 1) // max_size  # ceil
    chunk_size = (total_frames + n_chunks - 1) // n_chunks  # ceil divide for even split
    chunks = []
    start = 0
    for i in range(n_chunks):
        end = min(start + chunk_size, total_frames) - 1
        chunks.append((track_id, start, end, end - start + 1))
        start = end + 1
    return chunks

def bin_pack_weighted(chunks, instances):
    """Greedy weighted bin-packing: assign each chunk (largest first) to the
    instance with the lowest current 'time' = sum_frames / instance_speed.
    """
    chunks_sorted = sorted(chunks, key=lambda c: -c[3])  # by frames desc
    buckets = {inst["name"]: [] for inst in instances}
    times = {inst["name"]: 0.0 for inst in instances}
    speeds = {inst["name"]: inst["speed"] for inst in instances}

    for chunk in chunks_sorted:
        # Pick instance with minimum projected time
        best = min(times.keys(), key=lambda n: times[n] + chunk[3] / speeds[n])
        buckets[best].append(chunk)
        times[best] += chunk[3] / speeds[best]

    return buckets, times

def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    instances_file = sys.argv[1]
    instances = []
    with open(instances_file) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) < 5:
                print(f"Bad line: {line}", file=sys.stderr)
                continue
            instances.append({
                "name": parts[0],
                "gpu": parts[1],
                "speed": float(parts[2]),
                "ssh_host": parts[3],
                "ssh_port": int(parts[4]),
            })

    tracks = load_tracks()
    total_frames = sum(t[1] for t in tracks)

    # Split into chunks
    all_chunks = []
    for track_id, frames in tracks:
        all_chunks.extend(split_into_chunks(track_id, frames, MAX_CHUNK_FRAMES))

    # Bin-pack with weighted speeds
    buckets, times = bin_pack_weighted(all_chunks, instances)

    # Compute predicted wall time (max bucket time / 0.88 fps_per_speed_unit)
    # 0.88 fps is the 4K rate of a 4090 at speed=1.0
    # times[name] is "frame-units" — divide by (fps_per_speed × speed already applied)
    # Actually times[name] = sum(frames / speed). To get hours: divide by (0.88 × 3600).
    # Wait, let me redo: the "time" is in frames per unit speed; multiply by frames-per-second.
    fps_per_unit = 0.88  # 4090 baseline at 4K
    wall_hours = {n: t / fps_per_unit / 3600 for n, t in times.items()}
    max_h = max(wall_hours.values())
    min_h = min(wall_hours.values())

    print(f"=== Veneta '72 chunk partition ===", file=sys.stderr)
    print(f"Total tracks: {len(tracks)}", file=sys.stderr)
    print(f"Total frames: {total_frames:,}", file=sys.stderr)
    print(f"Total chunks: {len(all_chunks)}", file=sys.stderr)
    print(f"Instances:    {len(instances)}", file=sys.stderr)
    print(f"Max chunk size: {MAX_CHUNK_FRAMES:,} frames", file=sys.stderr)
    print(f"", file=sys.stderr)
    print(f"=== Per-instance assignments ===", file=sys.stderr)
    for inst in instances:
        bucket = buckets[inst["name"]]
        bucket_frames = sum(c[3] for c in bucket)
        h = wall_hours[inst["name"]]
        print(f"  {inst['name']:<10} {inst['gpu']:<8} speed={inst['speed']:.2f}  "
              f"chunks={len(bucket):2d}  frames={bucket_frames:>7,}  "
              f"~{h:.1f}h @4K", file=sys.stderr)
    print(f"", file=sys.stderr)
    print(f"=== Wall time estimate ===", file=sys.stderr)
    print(f"  Min instance:  {min_h:.1f}h", file=sys.stderr)
    print(f"  Max instance:  {max_h:.1f}h  (this is the bottleneck)", file=sys.stderr)
    print(f"  Spread:        {max_h - min_h:.1f}h", file=sys.stderr)

    # JSON output to stdout
    output = {
        "show": "1972-08-27",
        "total_frames": total_frames,
        "fps_per_unit": fps_per_unit,
        "max_wall_hours": max_h,
        "instances": [],
    }
    for inst in instances:
        bucket = buckets[inst["name"]]
        output["instances"].append({
            "name": inst["name"],
            "gpu": inst["gpu"],
            "speed": inst["speed"],
            "ssh_host": inst["ssh_host"],
            "ssh_port": inst["ssh_port"],
            "predicted_hours": wall_hours[inst["name"]],
            "chunks": [
                {"track": c[0], "start": c[1], "end": c[2], "frames": c[3]}
                for c in bucket
            ],
        })

    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    main()
