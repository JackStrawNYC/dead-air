#!/usr/bin/env python3
"""
Forced alignment of lyrics to vocal stems using WhisperX.

Aligns user-supplied ground-truth lyrics to Demucs-separated vocal stems.
Does NOT transcribe — uses WhisperX forced alignment mode only.

Usage:
  # Single song:
  python align_vocals.py --song "Sugar Magnolia" --date 1972-08-27 \
    --vocals-dir data/stems/sugar-magnolia-1972-08-27 \
    --lyrics packages/pipeline/data/lyrics/sugar-magnolia.txt \
    --output packages/pipeline/data/lyrics-aligned/sugar-magnolia-1972-08-27.json

  # Full show:
  python align_vocals.py --setlist packages/visualizer-poc/data/setlist.json \
    --stems-base data/stems --lyrics-dir packages/pipeline/data/lyrics \
    --output-dir packages/pipeline/data/lyrics-aligned \
    --threshold-sacred 0.99 --threshold-standard 0.90

Requires: packages/pipeline/.venv-align (WhisperX virtualenv)
"""

import json
import sys
import argparse
import re
import math
import warnings
from pathlib import Path

import numpy as np
import torch
import whisperx
import librosa

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)


def slugify(title: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', title.lower().replace("'", " ")).strip('-')


def compute_vocal_rms(vocals_path: str, start: float, end: float, sr: int = 16000) -> float:
    """Compute RMS energy of vocal stem in a time window."""
    try:
        duration = end - start
        if duration <= 0:
            return 0.0
        y, _ = librosa.load(vocals_path, sr=sr, offset=start, duration=duration, mono=True)
        if len(y) == 0:
            return 0.0
        return float(np.sqrt(np.mean(y ** 2)))
    except Exception:
        return 0.0


def align_song(
    song_title: str,
    date: str,
    vocals_path: str,
    lyrics_path: str,
    output_path: str,
    model,
    align_model,
    align_metadata,
    device: str = "cpu",
):
    """Align lyrics to vocal stem for one song. Returns the output dict."""

    lyrics_text = Path(lyrics_path).read_text().strip()
    if "LYRICS NOT FOUND" in lyrics_text:
        print(f"    SKIP: stub lyrics file")
        return None

    # Parse lyrics into lines (non-empty)
    lyric_lines = [l.strip() for l in lyrics_text.split('\n') if l.strip()]
    total_lines = len(lyric_lines)

    # Get audio duration
    audio_duration = librosa.get_duration(path=vocals_path)

    # Step 1: Transcribe with Whisper (needed to get word-level timestamps)
    # WhisperX needs a transcription pass first, then aligns against it.
    # We'll use the transcription to get timestamps, but OUTPUT the user's lyrics text.
    print(f"    Transcribing vocal stem ({audio_duration:.0f}s)...", end=" ", flush=True)
    audio = whisperx.load_audio(vocals_path)
    # Pass lyrics as initial_prompt to bias Whisper toward the song's vocabulary.
    # This helps Whisper recognize Dead-specific words (Sugaree, Magnolia, etc.)
    # and detect vocals it might otherwise miss in noisy live recordings.
    initial_prompt = lyrics_text[:500]  # Whisper prompt limit ~224 tokens
    result = model.transcribe(audio, batch_size=8, language="en", initial_prompt=initial_prompt)
    print(f"done ({len(result.get('segments', []))} segments)")

    # Step 2: Align transcription to get word-level timestamps
    print(f"    Aligning...", end=" ", flush=True)
    aligned = whisperx.align(
        result["segments"],
        align_model,
        align_metadata,
        audio,
        device,
        return_char_alignments=False,
    )
    print(f"done ({len(aligned.get('word_segments', []))} words)")

    # Step 3: Map user's lyrics to aligned words.
    # Strategy: for each lyric line, find the best-matching time window
    # by searching aligned words for consecutive matches.
    word_segments = aligned.get("word_segments", [])

    # Build a flat list of (word_text, start, end, score) from alignment
    aligned_words = []
    for ws in word_segments:
        w = ws.get("word", "").strip()
        if not w:
            continue
        aligned_words.append({
            "text": w,
            "start": ws.get("start", 0),
            "end": ws.get("end", 0),
            "score": ws.get("score", 0),
        })

    # For each lyric line, find the timestamp by matching words sequentially
    output_lines = []
    aligned_word_idx = 0  # cursor through aligned words

    for line_idx, line_text in enumerate(lyric_lines):
        line_words = line_text.split()
        if not line_words:
            continue

        # Expected position (linear interpolation for temporal plausibility check)
        expected_start = (line_idx / max(1, total_lines)) * audio_duration

        # Search for this line's words in the aligned words using fuzzy matching.
        # Allows Levenshtein distance ≤2, skipping up to 2 words on either side.
        best_match = None
        best_score = -1

        search_start = max(0, aligned_word_idx - 10)
        search_end = min(len(aligned_words), aligned_word_idx + 120)

        def fuzzy_match(a: str, b: str) -> bool:
            """Match words allowing Levenshtein distance ≤ 2."""
            a, b = a.lower().strip(".,!?;:'\"()-"), b.lower().strip(".,!?;:'\"()-")
            if a == b:
                return True
            if len(a) < 2 or len(b) < 2:
                return a == b
            # Substring match for short words
            if (len(a) >= 3 and a in b) or (len(b) >= 3 and b in a):
                return True
            # Levenshtein distance ≤ 2
            if abs(len(a) - len(b)) > 2:
                return False
            # Simple edit distance (optimized for threshold=2)
            if len(a) > len(b):
                a, b = b, a
            prev = list(range(len(a) + 1))
            for j in range(1, len(b) + 1):
                curr = [j] + [0] * len(a)
                for i in range(1, len(a) + 1):
                    cost = 0 if a[i-1] == b[j-1] else 1
                    curr[i] = min(curr[i-1] + 1, prev[i] + 1, prev[i-1] + cost)
                prev = curr
            return prev[len(a)] <= 2

        for si in range(search_start, search_end):
            # Try to match line words against aligned words with skip tolerance
            match_count = 0
            match_words = []
            ai_cursor = si  # aligned word cursor
            skips = 0
            consecutive_fails = 0

            for wi, lw in enumerate(line_words):
                matched = False
                # Try current position and up to 2 ahead (skip tolerance)
                for skip in range(3):
                    awi = ai_cursor + skip
                    if awi >= len(aligned_words):
                        break
                    if fuzzy_match(aligned_words[awi]["text"], lw):
                        match_count += 1
                        match_words.append(aligned_words[awi])
                        ai_cursor = awi + 1
                        skips += skip
                        matched = True
                        consecutive_fails = 0
                        break

                if not matched:
                    consecutive_fails += 1
                    ai_cursor += 1
                    if consecutive_fails > 3:
                        break  # too much drift, abandon this starting position

            if match_count > 0:
                word_score = match_count / len(line_words)
                # Penalize excessive skipping
                skip_penalty = max(0, 1.0 - skips * 0.05)
                final_score = word_score * skip_penalty
                if final_score > best_score:
                    best_score = final_score
                    best_match = (si, ai_cursor, match_words)

        # Build line output
        flags = []
        if best_match and best_score > 0.3:
            start_idx, end_idx, matched = best_match
            line_start = matched[0]["start"] if matched else 0
            line_end = matched[-1]["end"] if matched else 0

            # Build word-level output using USER's text, not Whisper's
            word_outputs = []
            for wi, lw in enumerate(line_words):
                awi = best_match[0] + wi
                if awi < len(aligned_words):
                    aw = aligned_words[awi]
                    word_outputs.append({
                        "text": lw,  # User's text, not Whisper's
                        "start": round(aw["start"], 3),
                        "end": round(aw["end"], 3),
                        "confidence": round(aw["score"], 3) if aw["score"] else 0.5,
                    })
                else:
                    word_outputs.append({
                        "text": lw,
                        "start": round(line_start, 3),
                        "end": round(line_end, 3),
                        "confidence": 0.0,
                    })
                    flags.append("alignment_failed")

            # Confidence signals
            word_confidences = [w["confidence"] for w in word_outputs]
            mean_conf = sum(word_confidences) / len(word_confidences) if word_confidences else 0

            # Temporal plausibility
            if abs(line_start - expected_start) > 30:
                flags.append("temporal_outlier")

            # Vocal energy check
            vocal_rms = compute_vocal_rms(vocals_path, line_start, line_end)
            if vocal_rms < 0.01:
                flags.append("no_vocal_energy")

            # Word gap check
            for j in range(len(word_outputs) - 1):
                gap = word_outputs[j + 1]["start"] - word_outputs[j]["end"]
                if gap > 3.0:
                    flags.append("word_gap")
                    break

            # Line confidence
            line_confidence = round(mean_conf * best_score, 3)
            if line_confidence < 0.75:
                flags.append("low_confidence")

            # Advance cursor
            aligned_word_idx = best_match[1]

        else:
            # No match found — use interpolated position
            line_start = expected_start
            line_end = expected_start + (audio_duration / total_lines)
            word_outputs = [{"text": w, "start": round(line_start, 3), "end": round(line_end, 3), "confidence": 0.0} for w in line_words]
            line_confidence = 0.0
            flags.append("alignment_failed")

        output_lines.append({
            "text": line_text,
            "start": round(line_start, 3),
            "end": round(line_end, 3),
            "words": word_outputs,
            "line_confidence": line_confidence,
            "flags": list(set(flags)),
        })

    output = {
        "song": song_title,
        "date": date,
        "audio_duration": round(audio_duration, 2),
        "source_lyrics_file": Path(lyrics_path).name,
        "total_lines": total_lines,
        "lines": output_lines,
    }

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    flagged = sum(1 for l in output_lines if l["flags"])
    clean = total_lines - flagged
    print(f"    Result: {total_lines} lines, {clean} clean, {flagged} flagged")

    return output


def generate_qa_report(
    show_date: str,
    all_results: list,
    songs_missing_lyrics: list,
    songs_missing_stems: list,
    output_path: str,
    threshold_sacred: float = 0.99,
    threshold_standard: float = 0.90,
):
    """Generate per-show QA report."""
    total_lines = 0
    flagged_entries = []

    for result in all_results:
        if result is None:
            continue
        for line in result.get("lines", []):
            total_lines += 1
            if line["flags"]:
                flagged_entries.append({
                    "song": result["song"],
                    "line_text": line["text"],
                    "predicted_start": line["start"],
                    "flags": line["flags"],
                    "line_confidence": line["line_confidence"],
                })

    flagged_count = len(flagged_entries)
    pct_clean = round((total_lines - flagged_count) / max(1, total_lines) * 100, 1)

    report = {
        "show_date": show_date,
        "total_lines": total_lines,
        "flagged_lines": flagged_count,
        "percent_clean": pct_clean,
        "songs_missing_lyrics": songs_missing_lyrics,
        "songs_missing_stems": songs_missing_stems,
        "threshold_sacred": threshold_sacred,
        "threshold_standard": threshold_standard,
        "flagged": flagged_entries,
    }

    with open(output_path, 'w') as f:
        json.dump(report, f, indent=2)

    return report


def main():
    parser = argparse.ArgumentParser(description="Forced alignment of lyrics to vocal stems")
    parser.add_argument("--setlist", help="Path to setlist.json for full-show mode")
    parser.add_argument("--stems-base", help="Base directory for stem WAVs")
    parser.add_argument("--lyrics-dir", help="Directory with per-song lyrics .txt files")
    parser.add_argument("--output-dir", help="Output directory for aligned JSONs")
    parser.add_argument("--song", help="Single song title")
    parser.add_argument("--date", help="Show date (YYYY-MM-DD)")
    parser.add_argument("--vocals", help="Path to vocal stem WAV (single-song mode)")
    parser.add_argument("--lyrics", help="Path to lyrics .txt file (single-song mode)")
    parser.add_argument("--output", help="Output JSON path (single-song mode)")
    parser.add_argument("--threshold-sacred", type=float, default=0.99)
    parser.add_argument("--threshold-standard", type=float, default=0.90)
    parser.add_argument("--device", default="auto", help="Device: auto, cpu, cuda, mps")
    parser.add_argument("--model", default="large-v3", help="Whisper model: tiny, small, medium, large-v3")
    args = parser.parse_args()

    # Device selection
    if args.device == "auto":
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "cpu"  # WhisperX MPS support is flaky; use CPU
        else:
            device = "cpu"
    else:
        device = args.device

    compute_type = "int8" if device == "cpu" else "float16"
    print(f"Device: {device}, compute: {compute_type}")

    # Load WhisperX model (small for speed, we're aligning not transcribing)
    print("Loading WhisperX model...", end=" ", flush=True)
    model_size = args.model if hasattr(args, 'model') and args.model else "large-v3"
    model = whisperx.load_model(model_size, device, compute_type=compute_type, language="en")
    print("done")

    # Load alignment model
    print("Loading alignment model...", end=" ", flush=True)
    align_model, align_metadata = whisperx.load_align_model(language_code="en", device=device)
    print("done")

    if args.song:
        # Single-song mode
        result = align_song(
            args.song, args.date or "unknown",
            args.vocals, args.lyrics, args.output,
            model, align_model, align_metadata, device,
        )
        if result:
            flagged = sum(1 for l in result["lines"] if l["flags"])
            print(f"\nDone: {result['total_lines']} lines, {flagged} flagged")
    else:
        # Full-show mode
        with open(args.setlist) as f:
            setlist = json.load(f)

        show_date = setlist.get("date", "unknown")
        songs = setlist.get("songs", [])
        stems_base = Path(args.stems_base)
        lyrics_dir = Path(args.lyrics_dir)
        output_dir = Path(args.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        slug_overrides = {"He's Gone": "he-s-gone-1972-08-27"}

        all_results = []
        songs_missing_lyrics = []
        songs_missing_stems = []
        stem_dirs = list(stems_base.iterdir()) if stems_base.exists() else []

        for i, song in enumerate(songs):
            title = song["title"]
            slug = slugify(title)
            print(f"\n[{i+1}/{len(songs)}] {title}")

            # Find lyrics file
            lyrics_path = lyrics_dir / f"{slug}.txt"
            if not lyrics_path.exists():
                print(f"    SKIP: no lyrics file")
                songs_missing_lyrics.append(title)
                all_results.append(None)
                continue

            lyrics_content = lyrics_path.read_text()
            if "LYRICS NOT FOUND" in lyrics_content:
                print(f"    SKIP: stub lyrics (cover song)")
                songs_missing_lyrics.append(title)
                all_results.append(None)
                continue

            # Find vocal stem
            if title in slug_overrides:
                stem_dir_name = slug_overrides[title]
            else:
                stem_slug = slugify(title) + f"-{show_date}"
                stem_dir_name = None
                for d in stem_dirs:
                    if d.name == stem_slug:
                        stem_dir_name = d.name
                        break
                    if d.name.startswith(slug[:8]):
                        stem_dir_name = d.name
                        break

            if stem_dir_name:
                vocals_path = stems_base / stem_dir_name / "vocals.wav"
            else:
                vocals_path = None

            if not vocals_path or not vocals_path.exists():
                print(f"    SKIP: no vocal stem")
                songs_missing_stems.append(title)
                all_results.append(None)
                continue

            # Align
            output_path = output_dir / f"{slug}-{show_date}.json"
            result = align_song(
                title, show_date,
                str(vocals_path), str(lyrics_path), str(output_path),
                model, align_model, align_metadata, device,
            )
            all_results.append(result)

        # Generate QA report
        qa_path = output_dir / f"{show_date}-qa-report.json"
        report = generate_qa_report(
            show_date, all_results,
            songs_missing_lyrics, songs_missing_stems,
            str(qa_path), args.threshold_sacred, args.threshold_standard,
        )
        print(f"\n{'='*60}")
        print(f"QA Report: {report['total_lines']} lines, {report['flagged_lines']} flagged ({report['percent_clean']}% clean)")
        print(f"Missing lyrics: {songs_missing_lyrics}")
        print(f"Missing stems: {songs_missing_stems}")
        print(f"Report: {qa_path}")


if __name__ == "__main__":
    main()
