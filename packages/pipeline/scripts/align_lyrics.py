#!/usr/bin/env python3
"""WhisperX forced alignment sidecar for Dead Air pipeline.

Reads JSON config on stdin, outputs word-level alignment on stdout.
Dependencies: whisperx, torch

Input: {"audioPath": "/path/to/song.mp3", "lyrics": "Long distance runner...", "language": "en", "model": "large-v3"}
Output: {"ok": true, "words": [...], "segments": [...]}
"""
import sys
import json
import os

# Suppress noisy warnings before importing heavy libs
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

# Fix SSL certificates on macOS Python (needed for model downloads)
try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
except ImportError:
    pass

def align(config):
    # Redirect stdout to stderr during alignment so whisperx log noise
    # doesn't corrupt the JSON output on stdout
    real_stdout = sys.stdout
    sys.stdout = sys.stderr

    import logging
    # Force all existing and future loggers to stderr
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)
    logging.basicConfig(stream=sys.stderr, level=logging.WARNING, force=True)

    import whisperx
    import torch

    audio_path = config["audioPath"]
    lyrics = config["lyrics"]
    language = config.get("language", "en")
    model_name = config.get("model", "large-v3")

    # CTranslate2 (used by faster-whisper inside WhisperX) only supports CUDA/CPU
    if torch.cuda.is_available():
        transcribe_device = "cuda"
        compute_type = "float16"
    else:
        transcribe_device = "cpu"
        compute_type = "int8"

    # For alignment (wav2vec2 via torch), MPS may work
    if torch.cuda.is_available():
        align_device = "cuda"
    elif torch.backends.mps.is_available():
        align_device = "mps"
    else:
        align_device = "cpu"

    # Step 1: Load WhisperX model and transcribe with lyrics as vocabulary hint
    asr_options = {"initial_prompt": lyrics}
    model = whisperx.load_model(
        model_name, transcribe_device, compute_type=compute_type,
        asr_options=asr_options
    )
    audio = whisperx.load_audio(audio_path)

    result = model.transcribe(audio, language=language)

    # Step 2: Force-align transcription to audio
    # MPS may not be supported for wav2vec2 — gracefully fall back to CPU
    try:
        align_model, metadata = whisperx.load_align_model(
            language_code=language, device=align_device
        )
    except Exception:
        align_device = "cpu"
        align_model, metadata = whisperx.load_align_model(
            language_code=language, device=align_device
        )
    aligned = whisperx.align(
        result["segments"], align_model, metadata, audio, align_device,
        return_char_alignments=False
    )

    # Step 3: Extract word-level timestamps
    words = []
    for seg in aligned.get("segments", []):
        for w in seg.get("words", []):
            word_entry = {
                "word": w.get("word", "").strip(),
                "start": round(w.get("start", 0), 3),
                "end": round(w.get("end", 0), 3),
            }
            if "score" in w:
                word_entry["score"] = round(w["score"], 3)
            if word_entry["word"]:
                words.append(word_entry)

    # Step 4: Extract segment-level timestamps
    segments = []
    for seg in aligned.get("segments", []):
        segments.append({
            "start": round(seg.get("start", 0), 3),
            "end": round(seg.get("end", 0), 3),
            "text": seg.get("text", "").strip(),
        })

    # Restore stdout
    sys.stdout = real_stdout

    return {"ok": True, "words": words, "segments": segments}


if __name__ == "__main__":
    # Save original stdout before anything can redirect it
    _original_stdout = sys.stdout
    try:
        config = json.loads(sys.stdin.read())
        result = align(config)
        _original_stdout.write(json.dumps(result) + "\n")
    except Exception as e:
        _original_stdout.write(json.dumps({"ok": False, "error": str(e)}) + "\n")
        sys.exit(1)
