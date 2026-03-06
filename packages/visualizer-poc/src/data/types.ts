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
  | "oil_projector"
  | "tie_dye"
  | "cosmic_dust"
  | "vintage_film"
  | "cosmic_voyage"
  | "inferno"
  | "deep_ocean"
  | "aurora";

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
  /** Number of art variants generated (for seed-based selection) */
  artVariantCount?: number;
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

/** Functional category for overlay components — determines texture routing and scoring.
 *  atmospheric: background canvas layers (starfields, smoke, fog)
 *  sacred: center-stage spiritual/Dead iconography (stealies, mandalas)
 *  reactive: energy-responsive effects (explosions, lasers, plasma)
 *  geometric: mathematical patterns (fractals, spirographs)
 *  nature: organic/cosmic elements (fireflies, aurora, nebulae)
 *  character: animated Dead figures (bears, skeletons, terrapin)
 *  artifact: static show elements (posters, venue photos)
 *  info: text-based overlays (song title, DNA, stats)
 *  hud: heads-up display elements (waveform, spectrum)
 *  distortion: post-processing effects (grain, aberration, glitch)
 */
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

/** Mood/affinity tags for overlay scoring — each tag responds to different audio features.
 *  cosmic: high spectral centroid + chroma spread
 *  organic: low tempo, mid energy, high sub-bass
 *  mechanical: high tempo, strong beats
 *  psychedelic: high flatness (noise), high energy variance
 *  festival: high energy, set 2 bonus
 *  contemplative: low energy, low tempo
 *  dead-culture: always mild positive (Dead iconography)
 *  intense: high peak energy ratio
 *  retro: slight positive for variety
 *  aquatic: high sub-bass, mid energy
 */
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
  /** Approximate percentage of frames this component is visible (0-100).
   *  100 = always renders, 20 = visible ~20% due to internal cycling.
   *  Used by rotation engine to adjust overlay count per window. */
  dutyCycle?: number;
  /** Continuous energy response curve: [threshold, peak, falloff].
   *  threshold: energy level where overlay starts responding (0-1)
   *  peak: energy level for maximum response (0-1)
   *  falloff: rate of decay above peak (higher = faster falloff) */
  energyResponse?: [threshold: number, peak: number, falloff: number];
}

/** Summary audio profile computed from a song's analysis frames.
 *  Used by overlay selector to score overlays against a song's character.
 *  Built once per song via buildSongProfile().
 */
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

/** Per-overlay energy phase hint from Claude curation */
export type OverlayPhaseHint = "low" | "mid" | "high";

/** Generated overlay schedule for the full show.
 *  Maps each trackId to its curated overlay set with energy phase hints.
 *  Generated by Claude intelligent curation or rule-based fallback.
 */
export interface OverlaySchedule {
  generatedAt: string;
  /** Model used for intelligent curation (absent for rule-based) */
  model?: string;
  songs: Record<string, {
    title: string;
    activeOverlays: string[];
    totalCount: number;
    /** Claude's reasoning for overlay choices (intelligent mode only) */
    reasoning?: string;
    /** Per-overlay energy phase hints (intelligent mode only) */
    energyHints?: Record<string, OverlayPhaseHint>;
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

// ─── Milestone Types ───

/** A historically significant moment at this show */
export interface Milestone {
  trackId: string;
  type: "debut" | "revival" | "rare" | "return";
  headline: string;
  subtext: string;
}

/** Show-specific milestone data */
export interface MilestoneData {
  showDate: string;
  milestones: Milestone[];
}

/** Within-song signature moment — frame-accurate musical highlight.
 *  These are manually curated timestamps for iconic musical moments
 *  (solos, peaks, transitions) that deserve visual emphasis.
 *  Data lives in signature-moments.json; consumed by SongVisualizer
 *  for brief bloom/flash effects at the marked frames.
 */
export interface SignatureMoment {
  trackId: string;
  /** Frame number within the song */
  frame: number;
  /** Brief label (e.g., "Garcia solo peaks") — not displayed, for curation */
  label: string;
  /** Visual effect intensity (0-1, default 0.5) */
  intensity?: number;
}

/** Full show timeline mapping songs to global frame offsets.
 *  Generated by analyze_show.py, consumed by concat pipeline.
 *  totalDuration is in seconds; totalFrames at 30fps.
 */
export interface ShowTimeline {
  date: string;
  totalFrames: number;
  totalDuration: number;
  tracks: TimelineEntry[];
}
