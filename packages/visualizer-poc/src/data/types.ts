/**
 * TypeScript interfaces for enhanced audio analysis data.
 * Matches the output of scripts/analyze.py (enhanced version).
 */

/** Single frame of audio analysis — 28 fields per frame at 30fps */
export interface EnhancedFrameData {
  /** RMS energy, normalized 0-1 */
  rms: number;
  /** Spectral centroid (brightness), normalized 0-1 */
  centroid: number;
  /** Onset strength, normalized 0-1 */
  onset: number;
  /** Whether a beat was detected on this frame */
  beat: boolean;
  /** Sub-bass energy (0-100Hz), normalized 0-1 */
  sub: number;
  /** Low energy (100-400Hz), normalized 0-1 */
  low: number;
  /** Mid energy (400-2000Hz), normalized 0-1 */
  mid: number;
  /** High energy (2000-8000Hz), normalized 0-1 */
  high: number;
  /** Chroma CQT — 12 pitch classes (C, C#, D, ..., B), each 0-1 */
  chroma: [number, number, number, number, number, number, number, number, number, number, number, number];
  /** Spectral contrast — 7 frequency bands, each normalized 0-1 */
  contrast: [number, number, number, number, number, number, number];
  /** Spectral flatness — 0 = tonal, 1 = noise-like */
  flatness: number;
}

/** Legacy frame data from POC (subset of EnhancedFrameData) */
export interface FrameData {
  rms: number;
  centroid: number;
  onset: number;
  beat: boolean;
  sub: number;
  low: number;
  mid: number;
  high: number;
}

/** Section boundary detected by agglomerative clustering */
export interface SectionBoundary {
  /** First frame of section (inclusive) */
  frameStart: number;
  /** Last frame of section (exclusive) */
  frameEnd: number;
  /** Auto-generated label (e.g., "section_0", "section_1") */
  label: string;
  /** Energy classification: "low" | "mid" | "high" */
  energy: "low" | "mid" | "high";
  /** Average RMS energy across the section */
  avgEnergy: number;
}

/** Track analysis metadata */
export interface TrackMeta {
  source: string;
  duration: number;
  fps: number;
  sr: number;
  hopLength: number;
  totalFrames: number;
  tempo: number;
  sections: SectionBoundary[];
}

/** Complete analysis JSON for a single track */
export interface TrackAnalysis {
  meta: TrackMeta;
  frames: EnhancedFrameData[];
}

/** Visual mode for a scene */
export type VisualMode =
  | "liquid_light"
  | "particle_nebula"
  | "concert_lighting"
  | "lo_fi_grain"
  | "stark_minimal"
  | "oil_projector";

/** Per-section mode override in setlist */
export interface SectionOverride {
  /** Section index (0-based) from analysis sections */
  sectionIndex: number;
  /** Visual mode to use for this section */
  mode: VisualMode;
}

/** Color palette definition */
export interface ColorPalette {
  /** Primary hue (0-360) */
  primary: number;
  /** Secondary hue (0-360) */
  secondary: number;
  /** Saturation multiplier (0-1, default 1) */
  saturation?: number;
  /** Brightness multiplier (0-1, default 1) */
  brightness?: number;
}

/** Scene video category for atmospheric AI-generated clips */
export type SceneVideoCategory =
  | "landscape"    // Mountains, rivers, wide vistas
  | "venue"        // 1970s concert venue interiors, stage lighting
  | "psychedelic"  // Liquid light projections, saturated abstract
  | "nocturnal"    // Moonlit, campfire, deep blue/amber
  | "era"          // 1977 candid photography aesthetic
  | "cosmic";      // Deep space, nebulae, aurora

/** AI-generated atmospheric video clip for scene layer */
export interface SceneVideo {
  /** Path relative to public/ (e.g. "assets/scene-videos/s2t08-001.mp4") */
  src: string;
  /** Visual category */
  category: SceneVideoCategory;
}

/** Single song in the setlist */
export interface SetlistEntry {
  /** Track identifier (e.g., "s2t08") */
  trackId: string;
  /** Song title */
  title: string;
  /** Set number (1, 2, or 3 for encore) */
  set: number;
  /** Track number within the set */
  trackNumber: number;
  /** Default visual mode for this song */
  defaultMode: VisualMode;
  /** Per-section mode overrides */
  sectionOverrides?: SectionOverride[];
  /** Audio file path relative to audio dir */
  audioFile: string;
  /** Optional color palette override */
  palette?: ColorPalette;
  /** Manual overlay overrides for this song */
  overlayOverrides?: OverlayOverrides;
  /** Path to per-song poster art (relative to public/) */
  songArt?: string;
  /** AI-generated atmospheric scene videos */
  sceneVideos?: SceneVideo[];
  /** This song flows directly into the next (segue) — no fade-out, next song skips fade-in + art */
  segueInto?: boolean;
}

/** Manual overlay overrides per song */
export interface OverlayOverrides {
  /** Force these overlays on regardless of scoring */
  include?: string[];
  /** Force these overlays off regardless of scoring */
  exclude?: string[];
  /** Override the total target count */
  targetCount?: number;
}

// ─── Overlay Scheduling Types ───

export type OverlayCategory =
  | "atmospheric"
  | "sacred"
  | "reactive"
  | "geometric"
  | "nature"
  | "character"
  | "artifact"
  | "info"
  | "hud"
  | "distortion";

export type OverlayTag =
  | "cosmic"
  | "organic"
  | "mechanical"
  | "psychedelic"
  | "festival"
  | "contemplative"
  | "dead-culture"
  | "intense"
  | "retro"
  | "aquatic";

/** Static metadata for a single overlay component */
export interface OverlayEntry {
  /** Component name (matches import/registry key) */
  name: string;
  /** Render layer (1-10) */
  layer: number;
  /** Visual category */
  category: OverlayCategory;
  /** 1-3 mood/affinity tags */
  tags: OverlayTag[];
  /** Energy band affinity */
  energyBand: "low" | "mid" | "high" | "any";
  /** Visual weight: 1=subtle, 2=moderate, 3=dominant */
  weight: 1 | 2 | 3;
  /** If true, always rendered regardless of selection */
  alwaysActive?: boolean;
}

/** Summary audio profile computed from a song's analysis frames */
export interface SongProfile {
  trackId: string;
  title: string;
  set: number;
  avgEnergy: number;
  energyVariance: number;
  dominantEnergyBand: "low" | "mid" | "high";
  peakEnergyRatio: number;
  avgCentroid: number;
  avgFlatness: number;
  avgSub: number;
  chromaSpread: number;
  tempo: number;
  sectionCount: number;
}

/** Generated overlay schedule for the full show */
export interface OverlaySchedule {
  generatedAt: string;
  songs: Record<string, {
    title: string;
    activeOverlays: string[];
    totalCount: number;
  }>;
}

/** Full show setlist manifest */
export interface ShowSetlist {
  /** Show date */
  date: string;
  /** Venue */
  venue: string;
  /** Band name (defaults to "Grateful Dead") */
  bandName?: string;
  /** Taper/source info for bootleg label */
  taperInfo?: string;
  /** Explicit show-level PRNG seed (auto-derived from date+venue if omitted) */
  showSeed?: number;
  /** Era classification for visual theming */
  era?: "primal" | "classic" | "hiatus" | "touch_of_grey" | "revival";
  /** Venue type for ambient theming */
  venueType?: "theater" | "arena" | "amphitheater" | "festival" | "club" | "ballroom";
  /** Tour name (e.g., "Spring 1977", "Fall 1989") */
  tourName?: string;
  /** All songs in order */
  songs: SetlistEntry[];
  /** Path to show intro poster art (relative to public/) */
  showPoster?: string;
}

/** Timeline entry for the full show (computed from analysis) */
export interface TimelineEntry {
  trackId: string;
  /** Global frame offset where this track starts */
  globalFrameStart: number;
  /** Global frame offset where this track ends */
  globalFrameEnd: number;
  /** Total frames in this track */
  totalFrames: number;
}

/** Full show timeline (generated by analyze_show.py) */
export interface ShowTimeline {
  date: string;
  totalFrames: number;
  totalDuration: number;
  tracks: TimelineEntry[];
}
