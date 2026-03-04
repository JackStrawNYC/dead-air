#!/usr/bin/env python3
"""Upload a video to YouTube via the Data API v3 with resumable upload and progress."""

import argparse
import http.client
import json
import os
import sys
import time
from pathlib import Path

import google.auth.transport.requests
import google_auth_oauthlib.flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
]

SCRIPT_DIR = Path(__file__).resolve().parent
CLIENT_SECRET = SCRIPT_DIR / "client_secret.json"
TOKEN_CACHE = SCRIPT_DIR / "token.json"

# Retry config for resumable uploads
MAX_RETRIES = 10
RETRIABLE_STATUS_CODES = [500, 502, 503, 504]
CHUNK_SIZE = 256 * 1024 * 50  # ~12.5 MB chunks (good for large files)


def get_authenticated_service() -> object:
    """Build an authenticated YouTube API client, caching tokens on disk."""
    creds = None

    if TOKEN_CACHE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_CACHE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(google.auth.transport.requests.Request())
        else:
            flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
                str(CLIENT_SECRET), SCOPES
            )
            creds = flow.run_local_server(port=0)

        TOKEN_CACHE.write_text(creds.to_json())

    return build("youtube", "v3", credentials=creds)


def parse_chapters(chapters_path: str) -> str:
    """Parse a chapters file into YouTube-formatted timestamp lines.

    Expected format per line:  HH:MM:SS Title
    Also accepts:              MM:SS Title
    """
    lines = Path(chapters_path).read_text().strip().splitlines()
    formatted = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # Split on first space after the timestamp
        parts = line.split(None, 1)
        if len(parts) == 2:
            timestamp, title = parts
            formatted.append(f"{timestamp} {title}")
        else:
            formatted.append(line)

    if not formatted:
        return ""

    # YouTube requires the first chapter to start at 0:00
    first_ts = formatted[0].split(None, 1)[0]
    if first_ts not in ("0:00", "00:00", "0:00:00", "00:00:00"):
        print(f"Warning: First chapter starts at {first_ts}, not 0:00. "
              "YouTube requires chapters to start at 0:00.")

    return "\n".join(formatted)


def format_size(nbytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if nbytes < 1024:
            return f"{nbytes:.1f} {unit}"
        nbytes /= 1024
    return f"{nbytes:.1f} TB"


def resumable_upload(request, file_size: int) -> str:
    """Execute a resumable upload with retries and progress display."""
    response = None
    retry = 0

    while response is None:
        try:
            status, response = request.next_chunk()
            if status:
                pct = status.progress() * 100
                uploaded = int(status.resumable_progress)
                sys.stdout.write(
                    f"\r  Uploading: {pct:5.1f}%  "
                    f"({format_size(uploaded)} / {format_size(file_size)})"
                )
                sys.stdout.flush()
        except HttpError as e:
            if e.resp.status in RETRIABLE_STATUS_CODES:
                retry += 1
                if retry > MAX_RETRIES:
                    raise
                wait = 2 ** retry
                print(f"\n  HTTP {e.resp.status}, retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise
        except (http.client.HTTPException, ConnectionError, OSError) as e:
            retry += 1
            if retry > MAX_RETRIES:
                raise
            wait = 2 ** retry
            print(f"\n  Connection error ({e}), retrying in {wait}s...")
            time.sleep(wait)

    sys.stdout.write("\r  Uploading: 100.0%  -- done.                    \n")
    sys.stdout.flush()

    video_id = response["id"]
    return video_id


def upload_video(youtube, args) -> str:
    """Upload a video and return the video ID."""
    file_path = Path(args.file).resolve()
    if not file_path.exists():
        sys.exit(f"Error: Video file not found: {file_path}")

    file_size = file_path.stat().st_size
    print(f"File:  {file_path}")
    print(f"Size:  {format_size(file_size)}")

    # Build description
    description = args.description or ""
    if args.chapters:
        chapters_text = parse_chapters(args.chapters)
        if chapters_text:
            separator = "\n\n" if description else ""
            description = f"{description}{separator}Chapters:\n{chapters_text}"

    tags = [t.strip() for t in args.tags.split(",")] if args.tags else []

    body = {
        "snippet": {
            "title": args.title,
            "description": description,
            "tags": tags,
            "categoryId": args.category,
        },
        "status": {
            "privacyStatus": args.privacy,
            "selfDeclaredMadeForKids": False,
        },
    }

    media = MediaFileUpload(
        str(file_path),
        chunksize=CHUNK_SIZE,
        resumable=True,
    )

    request = youtube.videos().insert(
        part="snippet,status",
        body=body,
        media_body=media,
    )

    print(f"Title: {args.title}")
    print(f"Privacy: {args.privacy}")
    print()

    video_id = resumable_upload(request, file_size)
    return video_id


def set_thumbnail(youtube, video_id: str, thumbnail_path: str) -> None:
    """Upload and set a custom thumbnail for the video."""
    thumb = Path(thumbnail_path).resolve()
    if not thumb.exists():
        print(f"Warning: Thumbnail file not found: {thumb}")
        return

    print(f"Setting thumbnail: {thumb}")
    media = MediaFileUpload(str(thumb), resumable=False)
    youtube.thumbnails().set(videoId=video_id, media_body=media).execute()
    print("Thumbnail set successfully.")


def main():
    parser = argparse.ArgumentParser(
        description="Upload a video to YouTube via the Data API v3."
    )
    parser.add_argument("--file", required=True, help="Path to the video file.")
    parser.add_argument("--title", required=True, help="Video title.")
    parser.add_argument("--description", default="", help="Video description.")
    parser.add_argument("--tags", default="", help="Comma-separated tags.")
    parser.add_argument(
        "--category", default="10", help="Numeric category ID (default: 10 = Music)."
    )
    parser.add_argument(
        "--privacy",
        default="unlisted",
        choices=["public", "unlisted", "private"],
        help="Privacy status (default: unlisted).",
    )
    parser.add_argument("--thumbnail", default=None, help="Path to thumbnail image.")
    parser.add_argument(
        "--chapters",
        default=None,
        help="Path to a chapters file with lines in 'HH:MM:SS Title' format.",
    )
    args = parser.parse_args()

    youtube = get_authenticated_service()
    video_id = upload_video(youtube, args)

    if args.thumbnail:
        set_thumbnail(youtube, video_id, args.thumbnail)

    url = f"https://youtu.be/{video_id}"
    print(f"\nUpload complete! Video URL: {url}")


if __name__ == "__main__":
    main()
