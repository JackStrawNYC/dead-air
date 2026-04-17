# Python Pipeline Audit

Generated: 2026-04-15

Scope note: `packages/pipeline/` currently contains 4 Python files:
- `packages/pipeline/scripts/align_lyrics.py`
- `packages/pipeline/scripts/analyze_audio.py`
- `packages/pipeline/scripts/batch_analyze.py`
- `packages/pipeline/scripts/separate_stems.py`

The prompt mentions `scripts/analyze.py` and `scripts/semantic_analysis.py`, but those files are not present in the current workspace, so this audit covers the actual Python surface that exists today.

## packages/pipeline/scripts/analyze_audio.py

### `estimate_key` (line 16)

- Line 31-32 | Edge cases / Data integrity | medium
  Problem: `np.corrcoef(rotated, major_profile)[0, 1]` and the minor equivalent can produce `NaN` when `chroma_vector` is all zeros or constant, which is exactly what silence / near-silence can generate. Because `NaN > best_corr` is always false, the function silently falls back to the initialized `"C major"` answer instead of surfacing `"unknown"` or a low-confidence key.
  Code: `corr_major = float(np.corrcoef(rotated, major_profile)[0, 1])`
  Recommendation: Guard against zero-variance chroma before calling `corrcoef`, and use `np.nan_to_num(..., nan=-1.0)` or return an explicit `"unknown"` / confidence score when the input is degenerate.

### `analyze` (line 43)

- Line 46-79 | Data integrity | high
  Problem: The function does not produce the per-frame JSON contract described in the project context. It emits a mixed bag of feature arrays (`energy`, `spectralCentroid`), sparse event times (`onsets`), a global tempo list, and a single key string. That shape is not compatible with a downstream renderer expecting one object per frame with consistent fields.
  Code: `result = {"ok": True, "durationSec": round(float(duration), 2)}`
  Recommendation: Build a frame-indexed output structure at the target FPS and populate every frame with a consistent schema, even when some features need interpolation or default values.

- Line 46 | Math correctness | high
  Problem: The default hop length is hard-coded to `2205`, which is 10 Hz only when `sampleRate == 22050`. The project context says the renderer consumes 30 fps features. If callers override `sampleRate`, the comment becomes false and the temporal resolution silently changes again.
  Code: `hop = config.get("hopLength", 2205)  # 10 Hz at sr=22050`
  Recommendation: Derive `hopLength` from an explicit target FPS, for example `hop = round(sr / fps)`, and make FPS part of the contract instead of baking in one sample-rate-specific constant.

- Line 47-49 and 57-79 | Data integrity / Error handling | high
  Problem: Unsupported requested analyses are silently ignored. `batch_analyze.py` asks for `chroma`, `contrast`, `beats`, `sections`, `stems`, `melodic`, `chords`, `structure`, and `deep_audio`, but this function only implements five analyses and never reports that the others were skipped.
  Code: `requested = set(config.get("analyses", ["energy", "tempo", "spectral", "onsets", "key"]))`
  Recommendation: Validate `requested` against a supported-analysis allowlist and either fail fast on unknown names or return an explicit `unsupportedAnalyses` field.

- Line 52 | Edge cases / Math correctness | medium
  Problem: `mono=True` collapses stereo to mono before any analysis. That makes the script incapable of preserving channel-specific timing or spatial cues and diverges from the project description’s richer stem/spatial pipeline.
  Code: `y, sr = librosa.load(path, sr=sr, mono=True)`
  Recommendation: Make mono downmix an explicit opt-in, or load stereo first and downmix only for analyses that truly require it.

- Line 62-64 | Data integrity | medium
  Problem: `librosa.beat.tempo()` returns one or more global tempo estimates, not a beat grid or per-frame/local tempo series. Downstream code expecting frame-aligned tempo or beat-state data cannot use this field directly.
  Code: `tempo = librosa.beat.tempo(y=y, sr=sr, hop_length=hop)`
  Recommendation: Output beat frames / beat times and, if needed, interpolate a local-tempo signal to the frame grid instead of returning the global estimator output verbatim.

- Line 71-74 | Data integrity | medium
  Problem: The onset output is sparse event times, while the project context calls for per-frame features such as onset strength and beat grid. Returning only times makes this feature inconsistent with the array-shaped outputs above and impossible to zip into one frame record.
  Code: `result["onsets"] = [round(float(t), 3) for t in onset_times]`
  Recommendation: Export onset strength per frame and, if event times are also useful, include them in a separate explicitly named field.

- Line 55-79 and 88 | Edge cases / JSON integrity | medium
  Problem: No `NaN` / `inf` sanitation is performed before `json.dumps`. `librosa`/`numpy` can emit `NaN` on silent or degenerate inputs. Python will serialize those as `NaN`, which is not strict JSON and can break stricter parsers.
  Code: `print(json.dumps(result))`
  Recommendation: Run arrays and scalars through `np.nan_to_num` and use `json.dumps(..., allow_nan=False)` so invalid numeric output fails loudly.

- Line 57-79 | Performance | low
  Problem: Each feature family is recomputed independently from the raw waveform, which means repeated spectral work for long files even though several features could share an STFT/chroma basis.
  Code: `librosa.feature.rms(...)`, `librosa.feature.spectral_centroid(...)`, `librosa.feature.chroma_stft(...)`
  Recommendation: Precompute reusable transforms when the script grows beyond this simplified feature set, especially for 3+ hour concert files.

### `if __name__ == "__main__"` block (line 84)

- Line 85-90 | Error handling | low
  Problem: The top-level handler catches every exception and collapses it to `str(e)`, which drops the traceback and the exception type.
  Code: `except Exception as e:`
  Recommendation: Preserve structured context in the JSON error payload and also log a traceback to stderr for debugging.

## packages/pipeline/scripts/batch_analyze.py

### `analyze_single` (line 20)

- Line 24-31 and 50-61 | Data integrity | high
  Problem: The config requests many analyses that `analyze_audio.py` never implements (`chroma`, `contrast`, `beats`, `sections`, `stems`, `melodic`, `chords`, `structure`, `deep_audio`), but this function still writes the child JSON and marks the track as succeeded as long as the subprocess exits cleanly.
  Code: `"analyses": ["energy", "tempo", "spectral", "onsets", "key", "chroma", ...]`
  Recommendation: Keep the requested analysis list in one shared contract, validate the child output against it, and fail if required fields are missing.

- Line 43-48 | Error handling | medium
  Problem: On non-zero exit, the error payload only includes `stderr`. `analyze_audio.py` writes its JSON error object to `stdout`, so the most useful message is often discarded here.
  Code: `"error": f"Process exited with code {result.returncode}: {result.stderr[:500]}"`
  Recommendation: Include both `stdout` and `stderr` excerpts in the failure payload, or attempt to parse an `{"ok": false}` JSON error from `stdout` first.

- Line 67-68 | Error handling | low
  Problem: The final broad `except Exception` hides the difference between filesystem, subprocess, and JSON failures.
  Code: `except Exception as e:`
  Recommendation: Catch expected exception types separately and preserve exception class names in the returned error.

### `main` (line 71)

- Line 90 | Edge cases | medium
  Problem: `glob(f"*{args.ext}")` is top-level only and case-sensitive. It will miss nested album/show folder structures and files like `.MP3` / `.Flac`, which are common in archival audio collections.
  Code: `audio_files = sorted(audio_dir.glob(f"*{args.ext}"))`
  Recommendation: Decide whether the intended contract is recursive discovery; if so, use `rglob` and normalize extensions case-insensitively.

- Line 113-124 | Performance | medium
  Problem: The parallel path uses a `ProcessPoolExecutor` whose workers only call `analyze_single`, and `analyze_single` immediately launches another Python subprocess. That double-forks each task and adds avoidable process overhead and memory pressure.
  Code: `with ProcessPoolExecutor(max_workers=args.parallel) as executor:`
  Recommendation: Use a `ThreadPoolExecutor` (since the heavy work is in the child subprocess anyway) or launch the subprocesses directly from the parent.

- Line 124 | Error handling | medium
  Problem: `future.result()` is unguarded. If a worker crashes or the pool breaks, the whole batch run aborts here without converting the failure into a per-file result or writing a complete summary.
  Code: `result = future.result()`
  Recommendation: Wrap `future.result()` in `try/except`, emit a synthetic failure result for that file, and continue collecting the rest of the batch where possible.

### Dead code

- No material dead-code findings in this file beyond the contract drift above.

## packages/pipeline/scripts/separate_stems.py

### `detect_device` (line 21)

- No material findings. The CUDA/MPS/CPU priority is straightforward, and the `hasattr(..., "mps")` guard is better than the equivalent probe in `align_lyrics.py`.

### `separate` (line 38)

- Line 57-66 | Error handling / Data integrity | high
  Problem: `--two-stems` is emitted as a bare flag with no value. Demucs expects a stem name/value for that option, so enabling `twoStems` produces a malformed command line.
  Code: `"--two-stems" if config.get("twoStems") else ""`
  Recommendation: Pass the actual requested stem target, for example `["--two-stems", "vocals"]`, and validate the config before spawning Demucs.

- Line 35, 101-106 | Data integrity | high
  Problem: The function always expects four canonical outputs, even when `twoStems` mode is requested. A valid two-stem run would still be reported as failure because it can never satisfy `len(stems_found) == 4`.
  Code: `if len(stems_found) != 4:`
  Recommendation: Make the expected outputs depend on the chosen Demucs mode, or disallow `twoStems` in this wrapper until the downstream contract supports it.

- Line 75-83 and 94-97 | Performance / Disk leak | medium
  Problem: Early returns on Demucs failure or missing output directories skip cleanup of `_demucs_tmp`, so failed runs can accumulate large temporary artifacts on disk.
  Code: `if result.returncode != 0: return {...}` and `if not demucs_out.exists(): return {...}`
  Recommendation: Wrap the staging directory lifecycle in `try/finally` so temporary output is cleaned on both success and failure.

- Line 86-106 | Data integrity | medium
  Problem: The code moves whatever stems exist into the final destination before checking whether the set is complete. If only some stems were produced, the function returns an error but leaves partial final outputs behind.
  Code: `if src.exists(): shutil.move(str(src), str(dst))`
  Recommendation: First verify the complete expected stem set in the temp directory, then move everything atomically into the final destination.

- Line 72 | Edge cases / Performance | medium
  Problem: The hard-coded 600-second timeout is likely too short for multi-hour concert audio on CPU or slower GPUs, which makes long archival runs fail even when Demucs is progressing normally.
  Code: `timeout=600`
  Recommendation: Make the timeout configurable and scale the default to input duration or device class.

### Module-level dead code

- Line 11 | Dead code | low
  Problem: `os` is imported but never used.
  Code: `import os`
  Recommendation: Remove the stale import.

### `if __name__ == "__main__"` block (line 111)

- Line 112-118 | Error handling | low
  Problem: The top-level handler catches every exception and reduces it to a string, losing traceback context during Demucs invocation failures.
  Code: `except Exception as e:`
  Recommendation: Preserve traceback details on stderr while still emitting a structured JSON error to stdout.

## packages/pipeline/scripts/align_lyrics.py

### `align` (line 24)

- Line 61-68 | Data integrity | high
  Problem: Passing the full lyrics as `initial_prompt` is only a transcription hint, not a guarantee that the returned words match the provided lyrics. The output words and segments still come from the ASR transcript, so misrecognitions can survive and then be aligned as if they were ground truth lyrics.
  Code: `asr_options = {"initial_prompt": lyrics}`
  Recommendation: If the product needs true lyric alignment, add a reconciliation step between supplied lyrics and recognized transcript or use a forced-alignment path that anchors the provided text directly.

- Line 72-80 | Error handling | high
  Problem: The code catches every exception from `whisperx.load_align_model(...)` and silently retries on CPU. That hides real failures like unsupported languages, missing models, broken installs, or bad metadata as if they were merely device-compatibility issues.
  Code: `except Exception:`
  Recommendation: Catch only the device/backend exceptions you expect, and surface all other failures without reclassifying them as CPU fallbacks.

- Line 90-106 | Data integrity | high
  Problem: Missing timestamps are coerced to `0` for both words and segments. An unaligned word therefore becomes a fake `0.000 -> 0.000` timestamp instead of clearly signaling missing data.
  Code: `"start": round(w.get("start", 0), 3), "end": round(w.get("end", 0), 3)`
  Recommendation: Preserve `None`/missing values, or drop words/segments that do not have both timestamps.

- Line 27-28 and 109-110 | Error handling / State safety | medium
  Problem: `sys.stdout` is redirected to `sys.stderr` and restored only on the success path. Any exception before line 109 leaves the process-global stdout mutated.
  Code: `sys.stdout = sys.stderr`
  Recommendation: Use `try/finally` around the redirection so stdout is restored even when alignment fails.

- Line 39-42 and 66 | Edge cases / Error handling | medium
  Problem: The function does not validate that the audio file exists or that `lyrics` is non-empty before loading WhisperX models and audio.
  Code: `audio_path = config["audioPath"]` / `lyrics = config["lyrics"]`
  Recommendation: Validate required inputs up front and fail before expensive model initialization.

- Line 95-96 and 121 | Data integrity | medium
  Problem: Alignment scores can be `NaN`, and those values are rounded and serialized without sanitation. Python emits them as `NaN`, which is not strict JSON.
  Code: `word_entry["score"] = round(w["score"], 3)`
  Recommendation: Sanitize scores with `math.isfinite` or `np.nan_to_num`, and use `json.dumps(..., allow_nan=False)`.

- Line 55-56 | Edge cases | low
  Problem: `torch.backends.mps.is_available()` is called without an `hasattr(..., "mps")` guard. Some torch builds/platforms expose different backend surfaces, so this is less defensive than `detect_device()` in `separate_stems.py`.
  Code: `elif torch.backends.mps.is_available():`
  Recommendation: Mirror the guarded backend probe pattern used in `detect_device()`.

- Line 62-68 and 73-84 | Performance | low
  Problem: The script loads WhisperX and alignment models fresh on every invocation. As a one-shot sidecar this is workable, but repeated use across many songs pays model initialization cost every time.
  Code: `model = whisperx.load_model(...)` and `align_model, metadata = whisperx.load_align_model(...)`
  Recommendation: If this is used in batch mode, consider a longer-lived worker process that caches models per device/language.

### `if __name__ == "__main__"` block (line 115)

- Line 118-123 | Error handling | low
  Problem: The top-level handler catches every exception and returns only `str(e)`, which makes operational debugging harder.
  Code: `except Exception as e:`
  Recommendation: Preserve traceback detail on stderr while keeping the JSON error contract on stdout.
