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


def align(config):
    import whisperx
    import torch

    audio_path = config["audioPath"]
    lyrics = config["lyrics"]
    language = config.get("language", "en")
    model_name = config.get("model", "large-v3")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    # Step 1: Load WhisperX model and transcribe with lyrics as vocabulary hint
    model = whisperx.load_model(model_name, device, compute_type=compute_type)
    audio = whisperx.load_audio(audio_path)

    result = model.transcribe(audio, language=language, initial_prompt=lyrics)

    # Step 2: Force-align transcription to audio
    align_model, metadata = whisperx.load_align_model(
        language_code=language, device=device
    )
    aligned = whisperx.align(
        result["segments"], align_model, metadata, audio, device,
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

    return {"ok": True, "words": words, "segments": segments}


if __name__ == "__main__":
    try:
        config = json.loads(sys.stdin.read())
        result = align(config)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
