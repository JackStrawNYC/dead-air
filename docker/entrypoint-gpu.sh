#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-help}"
shift 2>/dev/null || true

case "$CMD" in
  separate-stems)
    # Supports JSON on stdin OR --audio-path= / --output-dir= CLI args
    if [ $# -gt 0 ] && [[ "$1" == --* ]]; then
      AUDIO_PATH=""
      OUTPUT_DIR=""
      MODEL="htdemucs"
      for arg in "$@"; do
        case "$arg" in
          --audio-path=*) AUDIO_PATH="${arg#*=}" ;;
          --output-dir=*) OUTPUT_DIR="${arg#*=}" ;;
          --model=*) MODEL="${arg#*=}" ;;
        esac
      done
      if [ -z "$AUDIO_PATH" ] || [ -z "$OUTPUT_DIR" ]; then
        echo '{"ok":false,"error":"--audio-path and --output-dir are required"}' >&2
        exit 1
      fi
      echo "{\"audioPath\":\"$AUDIO_PATH\",\"outputDir\":\"$OUTPUT_DIR\",\"model\":\"$MODEL\"}" | exec python /app/separate_stems.py
    else
      # JSON on stdin
      exec python /app/separate_stems.py "$@"
    fi
    ;;
  align-lyrics)
    exec python /app/align_lyrics.py "$@"
    ;;
  analyze-audio)
    exec python /app/analyze_audio.py "$@"
    ;;
  healthcheck)
    exec python /app/healthcheck.py --image=gpu "$@"
    ;;
  shell)
    exec /bin/bash "$@"
    ;;
  python)
    exec python "$@"
    ;;
  help|--help|-h)
    echo "dead-air-gpu entrypoint"
    echo ""
    echo "Commands:"
    echo "  separate-stems   Run Demucs stem separation"
    echo "  align-lyrics     Run WhisperX forced alignment"
    echo "  analyze-audio    Run lightweight audio analysis"
    echo "  healthcheck      Verify all dependencies"
    echo "  shell            Open a bash shell"
    echo "  python           Run arbitrary Python"
    echo ""
    echo "Stem separation accepts JSON on stdin or CLI args:"
    echo "  echo '{\"audioPath\":\"/data/audio/t.mp3\",\"outputDir\":\"/data/stems/t\"}' | docker run -i dead-air-gpu separate-stems"
    echo "  docker run dead-air-gpu separate-stems --audio-path=/data/audio/t.mp3 --output-dir=/data/stems/t"
    ;;
  *)
    echo "Unknown command: $CMD" >&2
    echo "Run with 'help' for usage info" >&2
    exit 1
    ;;
esac
