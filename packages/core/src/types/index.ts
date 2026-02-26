// ── Show / Concert Metadata ──

export interface ShowMetadata {
  /** archive.org identifier, e.g. "gd1977-05-08.sbd.miller" */
  archiveId: string;
  /** ISO date string, e.g. "1977-05-08" */
  date: string;
  venue: string;
  city: string;
  state: string;
  setlist: SetlistSong[];
  source: string;
  /** Source quality rating 1-10 */
  sourceRating: number;
  taper?: string;
  notes?: string;
}

export interface SetlistSong {
  songName: string;
  setNumber: number;
  position: number;
  isSegue: boolean;
  coverArtist?: string;
}

export interface ShowIngest {
  show: ShowMetadata;
  /** Paths to downloaded audio files */
  audioFiles: string[];
  /** Total duration in seconds */
  totalDurationSec: number;
  /** Recording quality grade */
  qualityGrade: string;
  ingestedAt: string;
}

// ── Audio Analysis ──

export interface AudioAnalysis {
  showId: string;
  songSegments: SongSegment[];
  banterTranscripts: BanterTranscript[];
  perSongAnalysis: SongAnalysisData[];
  stemAnalysis: StemAnalysisData[];
  peakMoments: PeakMoment[];
}

export interface SongSegment {
  songName: string;
  startTime: number;
  endTime: number;
  duration: number;
  filePath: string;
}

export interface BanterTranscript {
  startTime: number;
  endTime: number;
  text: string;
  speakerGuess?: string;
}

export interface SongAnalysisData {
  songName: string;
  durationSec: number;
  bpm: number[];
  energy: number[];
  spectralCentroid: number[];
  onsets: number[];
  key?: string;
  mood?: string;
}

export interface StemAnalysisData {
  songName: string;
  stem: 'drums' | 'bass' | 'other' | 'vocals';
  energy: number[];
}

export interface PeakMoment {
  timestamp: number;
  intensity: number;
  description: string;
}

// ── Episode / Script ──

export interface EpisodeScript {
  episodeTitle: string;
  episodeType: 'gateway' | 'deep_dive' | 'song_history' | 'top_list';
  introNarration: string;
  setBreakNarration: string;
  outroNarration: string;
  segments: EpisodeSegment[];
  youtube: {
    title: string;
    description: string;
    tags: string[];
    chapters: { time: string; label: string }[];
  };
  thumbnailPrompt: string;
  shortsMoments: ShortsMoment[];
  /** Legacy impact statement for closing card (optional — auto-generated if missing) */
  legacyStatement?: string;
  /** Attribution for legacy statement */
  legacyAttribution?: string;
}

export interface SongDNAData {
  timesPlayed: number;
  firstPlayed: string;   // "1966" or "March 1966"
  lastPlayed: string;
  rank?: string;          // "This version: #198 of 271"
}

export interface ArchiveReview {
  reviewer: string;
  rating: number;         // 1-5 stars
  text: string;           // truncated to ~200 chars
  date?: string;
}

export interface SongStatistic {
  songName: string;
  timesPlayed: number;
  firstPlayed: string;    // ISO date
  lastPlayed: string;     // ISO date
}

export interface ListenForMoment {
  songName: string;
  timestampSec: number;
  description: string;    // "Listen for Phil's bass run steering into Space"
}

export interface EpisodeSegment {
  type: 'narration' | 'concert_audio' | 'context_text';
  narrationKey?: 'intro' | 'set_break' | 'outro';
  songName?: string;
  startTimeInSong?: number;
  excerptDuration?: number;
  textLines?: TextLine[];
  songDNA?: SongDNAData;
  visual: {
    scenePrompts: string[];
    colorPalette: string[];
    mood: 'warm' | 'cosmic' | 'electric' | 'dark' | 'earthy' | 'psychedelic';
    visualIntensity: number;
    motionPrompts?: string[];
  };
}

export interface TextLine {
  text: string;
  displayDuration: number;
  style: 'fact' | 'quote' | 'analysis' | 'transition' | 'listenFor' | 'fanQuote';
}

export interface ShortsMoment {
  timestamp: string;
  duration: number;
  hookText: string;
}

// ── Asset Management ──

export type AssetType =
  | 'image'
  | 'narration'
  | 'thumbnail'
  | 'archival'
  | 'short';

export type AssetStatus = 'pending' | 'generating' | 'ready' | 'failed';

export interface Asset {
  id: string;
  episodeId: string;
  type: AssetType;
  service: string;
  promptHash?: string;
  filePath: string;
  cost: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ── Cost Tracking ──

export interface CostEntry {
  id: number;
  episodeId: string;
  service: string;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  cost: number;
  createdAt: string;
}

// ── Analytics ──

export interface AnalyticsSnapshot {
  id: number;
  episodeId: string;
  date: string;
  views: number;
  watchHours: number;
  avgViewDuration: number;
  avgViewPercentage: number;
  ctr: number;
  subscribersGained: number;
  revenue?: number;
  createdAt: string;
}

// ── Pipeline State ──

export type PipelineStage =
  | 'queued'
  | 'ingesting'
  | 'analyzing'
  | 'scripting'
  | 'generating'
  | 'rendering'
  | 'qa'
  | 'publishing'
  | 'published'
  | 'failed';

// ── Config ──

export interface DeadAirConfig {
  env: 'development' | 'production' | 'test';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  paths: {
    data: string;
    assets: string;
    renders: string;
    database: string;
  };
  api: {
    archiveOrgEmail?: string;
    archiveOrgPassword?: string;
    openaiKey?: string;
    anthropicKey?: string;
    replicateToken?: string;
    xaiApiKey?: string;
    flickrApiKey?: string;
    elevenlabsKey?: string;
    elevenlabsVoiceId?: string;
    setlistfmKey?: string;
  };
  youtube: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
  };
  remotion: {
    concurrency: number;
  };
  aws: {
    accessKeyId?: string;
    secretAccessKey?: string;
    region: string;
  };
}
