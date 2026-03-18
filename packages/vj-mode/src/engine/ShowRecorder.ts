/**
 * ShowRecorder — records and plays back VJ show events.
 * Captures scene changes, palette changes, blackout/freeze toggles, and preset recalls.
 * Events are timestamped relative to recording start for playback synchronization.
 */

export type ShowEventType =
  | "scene_change"
  | "palette_change"
  | "blackout"
  | "freeze"
  | "preset_recall"
  | "auto_transition_toggle"
  | "lock_scene";

export interface ShowEvent {
  /** Milliseconds from recording start */
  timestamp: number;
  type: ShowEventType;
  payload: Record<string, unknown>;
}

export interface ShowRecording {
  version: 1;
  startedAt: string;
  duration: number;
  events: ShowEvent[];
}

export type ShowDispatch = (event: ShowEvent) => void;

export class ShowRecorder {
  private _events: ShowEvent[] = [];
  private _startTime = 0;
  private _isRecording = false;
  private _isPlaying = false;
  private _playbackTimeouts: ReturnType<typeof setTimeout>[] = [];

  get isRecording(): boolean {
    return this._isRecording;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get eventCount(): number {
    return this._events.length;
  }

  /** Start recording events */
  startRecording(): void {
    this._events = [];
    this._startTime = performance.now();
    this._isRecording = true;
  }

  /** Stop recording and return the recording */
  stopRecording(): ShowRecording {
    this._isRecording = false;
    const duration = performance.now() - this._startTime;
    return {
      version: 1,
      startedAt: new Date().toISOString(),
      duration,
      events: [...this._events],
    };
  }

  /** Record a single event (only while recording) */
  recordEvent(type: ShowEventType, payload: Record<string, unknown>): void {
    if (!this._isRecording) return;
    const timestamp = performance.now() - this._startTime;
    this._events.push({ timestamp, type, payload });
  }

  /** Start playback of a recording, dispatching events at correct timing */
  startPlayback(recording: ShowRecording, dispatch: ShowDispatch): void {
    this.stopPlayback();
    this._isPlaying = true;

    for (const event of recording.events) {
      const timeout = setTimeout(() => {
        if (this._isPlaying) {
          dispatch(event);
        }
      }, event.timestamp);
      this._playbackTimeouts.push(timeout);
    }

    // Auto-stop after recording duration
    const endTimeout = setTimeout(() => {
      this._isPlaying = false;
    }, recording.duration);
    this._playbackTimeouts.push(endTimeout);
  }

  /** Stop playback */
  stopPlayback(): void {
    this._isPlaying = false;
    for (const t of this._playbackTimeouts) {
      clearTimeout(t);
    }
    this._playbackTimeouts = [];
  }

  /** Export recording as JSON string */
  exportJSON(recording: ShowRecording): string {
    return JSON.stringify(recording, null, 2);
  }

  /** Import recording from JSON string */
  importJSON(json: string): ShowRecording {
    const parsed = JSON.parse(json);
    if (parsed.version !== 1) {
      throw new Error(`Unsupported recording version: ${parsed.version}`);
    }
    return parsed as ShowRecording;
  }
}
