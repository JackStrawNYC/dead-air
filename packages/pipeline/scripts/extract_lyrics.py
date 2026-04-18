#!/usr/bin/env python3
"""
Extract lyrics from The Complete Annotated Grateful Dead Lyrics (OCR text).

Parses the messy OCR dump, finds each song by title, extracts the lyric lines
between the title and the annotation section. Writes one .txt file per song
to packages/pipeline/data/lyrics/{song-slug}.txt.

Cover songs not in the book get a stub file.

Usage:
  python extract_lyrics.py \
    --source /tmp/lyrics-source/The\ Complete\ Annotated\ Grateful\ Dead\ Lyrics_djvu.txt \
    --setlist /path/to/setlist.json \
    --output-dir packages/pipeline/data/lyrics/
"""

import json
import re
import sys
import argparse
from pathlib import Path


def slugify(title: str) -> str:
    """Convert song title to filename slug."""
    return re.sub(r'[^a-z0-9]+', '-', title.lower().replace("'", " ")).strip('-')


def find_song_in_text(lines: list[str], title: str) -> tuple[int, int] | None:
    """Find the lyrics section for a song in the OCR text.

    Returns (start_line, end_line) of the lyrics section, or None if not found.
    The lyrics start after the title line and end before annotation markers.
    """
    title_lower = title.lower().strip()

    # Search for the title as a standalone line (not in TOC, not in annotations)
    candidates = []
    for i, line in enumerate(lines):
        stripped = line.strip().lower()
        # Match: line IS the title (possibly with OCR artifacts)
        if stripped == title_lower or stripped == title_lower.replace("'", "'"):
            # Skip if it's a TOC entry (has page number after it)
            next_line = lines[i + 1].strip() if i + 1 < len(lines) else ""
            if re.match(r'^\d+$', next_line):
                continue  # TOC entry
            # Skip if previous line is a page header
            prev_line = lines[i - 1].strip() if i > 0 else ""
            if 'annotated' in prev_line.lower() or 'complete' in prev_line.lower():
                pass  # This is fine — page header before lyrics
            candidates.append(i)

    if not candidates:
        return None

    # Use the FIRST candidate that's followed by actual lyrics (not annotations)
    for title_line in candidates:
        # Scan forward to find lyrics start (skip blank lines after title)
        lyrics_start = title_line + 1
        while lyrics_start < len(lines) and lines[lyrics_start].strip() == '':
            lyrics_start += 1

        # Skip credits line if present ("Words by...")
        if lyrics_start < len(lines) and re.match(r'^(Words|Music|Lyrics)\s+(by|and)', lines[lyrics_start].strip(), re.I):
            lyrics_start += 1
            while lyrics_start < len(lines) and lines[lyrics_start].strip() == '':
                lyrics_start += 1

        # Find lyrics end: annotations start with a numbered footnote marker
        # Pattern: "l Title" or "1 Title" or just a long prose paragraph about the song
        lyrics_end = lyrics_start
        consecutive_prose = 0
        for j in range(lyrics_start, min(lyrics_start + 200, len(lines))):
            line = lines[j].strip()

            # Annotation markers: "l SongTitle" or "1 SongTitle" (footnote reference)
            if re.match(r'^[lI1]\s+' + re.escape(title_lower[0].upper() + title_lower[1:]), line):
                lyrics_end = j
                break

            # Also detect: long prose lines (>80 chars) with periods = annotation text
            if len(line) > 80 and '.' in line:
                consecutive_prose += 1
                if consecutive_prose >= 2:
                    lyrics_end = j - 1
                    break
            else:
                consecutive_prose = 0

            # Page headers
            if 'annotated' in line.lower() and 'grateful' in line.lower():
                continue  # skip page header, don't end

            lyrics_end = j + 1

        # Verify we got something that looks like lyrics (short lines, some content)
        lyric_lines = [lines[k].strip() for k in range(lyrics_start, lyrics_end) if lines[k].strip()]
        if len(lyric_lines) >= 3:
            return (lyrics_start, lyrics_end)

    return None


def clean_lyrics(lines: list[str], start: int, end: int) -> list[str]:
    """Clean extracted lyrics lines."""
    result = []
    for i in range(start, end):
        line = lines[i].strip()

        # Skip empty lines (preserve as paragraph breaks)
        if not line:
            if result and result[-1] != '':
                result.append('')
            continue

        # Skip page headers
        if 'annotated' in line.lower() and ('grateful' in line.lower() or 'dead' in line.lower()):
            continue
        if re.match(r'^\d{1,3}\s+(The|the)\s+comp', line, re.I):
            continue

        # Skip page numbers (standalone digits)
        if re.match(r'^\d{1,3}$', line):
            continue

        # Skip verse/chorus markers but keep the content
        if line.lower() in ('(chorus)', 'chorus:', '(repeat chorus)'):
            # Don't add — the chorus text should already be present
            continue

        # Skip OCR artifacts (single characters, random numbers with spaces)
        if len(line) <= 2 and not line.isalpha():
            continue

        # Clean OCR artifacts
        line = re.sub(r'^[lI1]\s+', '', line)  # leading footnote markers
        line = re.sub(r'\s{2,}', ' ', line)    # collapse multiple spaces

        result.append(line)

    # Trim trailing empty lines
    while result and result[-1] == '':
        result.pop()

    return result


def main():
    parser = argparse.ArgumentParser(description="Extract lyrics from annotated Dead lyrics book")
    parser.add_argument("--source", required=True, help="Path to OCR text file")
    parser.add_argument("--setlist", required=True, help="Path to setlist.json")
    parser.add_argument("--output-dir", required=True, help="Output directory for lyrics .txt files")
    args = parser.parse_args()

    source_path = Path(args.source)
    with open(args.setlist) as f:
        setlist = json.load(f)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(source_path) as f:
        lines = f.readlines()

    # Known cover songs not in the Dead's original lyrics book
    COVER_SONGS = {
        "Promised Land",      # Chuck Berry
        "Me and My Uncle",    # John Phillips
        "El Paso",            # Marty Robbins
        "Sing Me Back Home",  # Merle Haggard
    }

    # Title variants for OCR matching
    TITLE_VARIANTS = {
        "I Know You Rider": ["i know you rider", "i know you, rider"],
        "Greatest Story Ever Told": ["greatest story ever told", "the greatest story ever told"],
        "One More Saturday Night": ["one more saturday night"],
        "Sugar Magnolia": ["sugar magnolia", "sugar magnolia / sunshine daydream"],
        "He's Gone": ["he's gone", "he' s gone", "hes gone"],
        "Playing in the Band": ["playing in the band"],
    }

    songs = setlist.get('songs', [])
    summary = []

    for song in songs:
        title = song['title']
        slug = slugify(title)
        out_path = output_dir / f"{slug}.txt"

        # Skip if already extracted (cache)
        if out_path.exists():
            existing = out_path.read_text().strip()
            if existing and "LYRICS NOT FOUND" not in existing:
                summary.append((title, slug, "cached", len(existing.split('\n'))))
                continue

        # Cover songs: write stub
        if title in COVER_SONGS:
            out_path.write_text("LYRICS NOT FOUND — PLEASE ADD MANUALLY\n")
            summary.append((title, slug, "cover (stub)", 0))
            continue

        # Try to find in the OCR text
        variants = TITLE_VARIANTS.get(title, [title.lower()])
        if title.lower() not in variants:
            variants.insert(0, title.lower())

        found = None
        for variant in variants:
            # Try exact title search
            result = find_song_in_text(lines, variant)
            if result:
                found = result
                break

        if found:
            start, end = found
            cleaned = clean_lyrics(lines, start, end)
            if cleaned:
                out_path.write_text('\n'.join(cleaned) + '\n')
                summary.append((title, slug, "extracted", len(cleaned)))
            else:
                out_path.write_text("LYRICS NOT FOUND — PLEASE ADD MANUALLY\n")
                summary.append((title, slug, "extraction failed", 0))
        else:
            out_path.write_text("LYRICS NOT FOUND — PLEASE ADD MANUALLY\n")
            summary.append((title, slug, "not found in source", 0))

    # Print summary
    print(f"\n{'Song':<35} {'Slug':<30} {'Status':<25} {'Lines':>5}")
    print("-" * 100)
    for title, slug, status, line_count in summary:
        print(f"{title:<35} {slug:<30} {status:<25} {line_count:>5}")

    extracted = sum(1 for _, _, s, _ in summary if s in ('extracted', 'cached'))
    stubs = sum(1 for _, _, s, _ in summary if 'stub' in s or 'not found' in s or 'failed' in s)
    print(f"\nExtracted: {extracted}/{len(songs)}, Stubs: {stubs}/{len(songs)}")


if __name__ == "__main__":
    main()
