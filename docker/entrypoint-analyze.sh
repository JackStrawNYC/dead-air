#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-analyze}"
shift 2>/dev/null || true

case "$CMD" in
  analyze)
    exec python /app/analyze.py "$@"
    ;;
  analyze-show)
    exec python /app/analyze_show.py "$@"
    ;;
  healthcheck)
    exec python /app/healthcheck.py --image=analyze "$@"
    ;;
  shell)
    exec /bin/bash "$@"
    ;;
  python)
    exec python "$@"
    ;;
  *.py)
    # Backward compat: allow `docker run ... analyze.py /data/audio/track.mp3 out.json`
    exec python "/app/$CMD" "$@"
    ;;
  help|--help|-h)
    echo "dead-air-analyze entrypoint"
    echo ""
    echo "Commands:"
    echo "  analyze        Run single-track analysis (default)"
    echo "  analyze-show   Run batch show analysis"
    echo "  healthcheck    Verify all dependencies"
    echo "  shell          Open a bash shell"
    echo "  python         Run arbitrary Python"
    echo "  *.py           Run a Python script in /app/"
    echo ""
    echo "Examples:"
    echo "  docker run dead-air-analyze analyze /data/audio/track.mp3 /data/output/out.json"
    echo "  docker run dead-air-analyze analyze-show --resume"
    ;;
  *)
    echo "Unknown command: $CMD" >&2
    echo "Run with 'help' for usage info" >&2
    exit 1
    ;;
esac
