/**
 * AudioAnalyzer — owns AudioContext + AnalyserNode for real-time FFT.
 * Supports microphone input and audio file playback.
 *
 * fftSize options:
 *   2048 (default) — ~46ms latency, 21.5 Hz bin resolution. Best frequency detail.
 *   1024           — ~23ms latency, 43 Hz bin resolution. Snappier transient response.
 */

export interface AudioAnalyzerOptions {
  /** FFT size: 1024 for low latency, 2048 for better frequency resolution (default: 2048) */
  fftSize?: 1024 | 2048;
  /** Smoothing time constant for AnalyserNode (0-1, default: 0.3) */
  smoothingTimeConstant?: number;
}

export class AudioAnalyzer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private _frequencyData = new Float32Array(1024);
  private _isActive = false;
  private readonly _fftSize: 1024 | 2048;
  private readonly _smoothing: number;

  constructor(options?: AudioAnalyzerOptions) {
    this._fftSize = options?.fftSize ?? 2048;
    this._smoothing = options?.smoothingTimeConstant ?? 0.3;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 44100;
  }

  get fftSize(): number {
    return this._fftSize;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = this._fftSize;
      this.analyser.smoothingTimeConstant = this._smoothing;
      this.gainNode = this.ctx.createGain();
      this.gainNode.connect(this.analyser);
      this._frequencyData = new Float32Array(this.analyser.frequencyBinCount);
    }
    return this.ctx;
  }

  async connectMicrophone(): Promise<void> {
    this.disconnect();
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = ctx.createMediaStreamSource(stream);
    this.source.connect(this.gainNode!);
    this._isActive = true;
  }

  connectFile(url: string): HTMLAudioElement {
    this.disconnect();
    const ctx = this.ensureContext();

    this.audioElement = new Audio();
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.src = url;

    this.source = ctx.createMediaElementSource(this.audioElement);
    this.source.connect(this.gainNode!);
    // Also connect to destination so we hear the audio
    this.gainNode!.connect(ctx.destination);
    this._isActive = true;

    return this.audioElement;
  }

  getFrequencyData(): Float32Array {
    if (this.analyser) {
      this.analyser.getFloatFrequencyData(this._frequencyData);
    }
    return this._frequencyData;
  }

  getTimeDomainData(): Float32Array {
    const data = new Float32Array(this.analyser?.fftSize ?? 2048);
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(data);
    }
    return data;
  }

  private disconnect(): void {
    if (this.source) {
      this.source.disconnect();
      // Stop mic stream tracks
      if (this.source instanceof MediaStreamAudioSourceNode) {
        const stream = (this.source as MediaStreamAudioSourceNode).mediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
      this.source = null;
    }
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = "";
      this.audioElement = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      if (this.analyser) {
        this.gainNode.connect(this.analyser);
      }
    }
    this._isActive = false;
  }

  dispose(): void {
    this.disconnect();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.analyser = null;
      this.gainNode = null;
    }
  }
}
