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
  /** Stem-separated bass RMS energy (from Demucs bass.wav), 0-1 */
  stemBassRms?: number;
  /** Stem-separated drum onset strength (from Demucs drums.wav), 0-1 */
  stemDrumOnset?: number;
  /** Stem-separated drum beat detected on this frame */
  stemDrumBeat?: boolean;
  /** Stem-separated vocal RMS energy (from Demucs vocals.wav), 0-1 */
  stemVocalRms?: number;
  /** Vocal presence detected (singing above P70 threshold) */
  stemVocalPresence?: boolean;
  /** Stem-separated other (guitar/keys) RMS energy, 0-1 */
  stemOtherRms?: number;
  /** Stem-separated other spectral centroid (brightness), 0-1 */
  stemOtherCentroid?: number;
  /** Per-frame local tempo (BPM, 8s sliding window) */
  localTempo?: number;
  /** Beat confidence: clarity of beat structure (0-1) */
  beatConfidence?: number;
  /** Whether this frame is a downbeat (first beat of measure) */
  downbeat?: boolean;
  /** Melodic pitch (0-1 MIDI-normalized: 0=A0, 1=C8) */
  melodicPitch?: number;
  /** Melodic pitch confidence (0-1) */
  melodicConfidence?: number;
  /** Melodic direction: +1 rising, -1 falling, 0 steady */
  melodicDirection?: number;
  /** Chord index (0-23: 12 major + 12 minor) */
  chordIndex?: number;
  /** Chord detection confidence (0-1) */
  chordConfidence?: number;
  /** Harmonic tension: rate of chord change over 2s window (0-1) */
  harmonicTension?: number;
  /** Section type label (verse, chorus, bridge, solo, jam, intro, outro) */
  sectionType?: string;
  /** Improvisation score: 0 = structured, 1 = highly improvisational */
  improvisationScore?: number;
  /** Tempo rate of change: -1 decelerating, 0 steady, +1 accelerating */
  tempoDerivative?: number;
  /** Dynamic range: 0 compressed, 1 open/wide (peak/RMS ratio per 1s window) */
  dynamicRange?: number;
  /** Space passage score: 0-1 composite (low energy + high flatness + low beat confidence + no vocals) */
  spaceScore?: number;
  /** Timbral brightness: 0 dark/acoustic, 1 bright/electric (high MFCC ratio) */
  timbralBrightness?: number;
  /** Timbral flux: 0-1 rate of timbral change (L2 norm of MFCC deltas) */
  timbralFlux?: number;
  /** Vocal pitch from isolated vocal stem (0-1 MIDI-normalized) */
  vocalPitch?: number;
  /** Vocal pitch confidence from isolated vocal stem (0-1) */
  vocalPitchConfidence?: number;
  // ─── Krumhansl-Schmuckler key detection (Tier 3) ───
  /** Tonic note normalized 0..1 (corresponds to indices 0..11 = C..B) */
  keyTonic?: number;
  /** 0 = minor key, 1 = major key */
  keyMode?: number;
  /** Confidence of the detected key, 0..1 */
  keyConfidence?: number;
  /** 1 only at the boundary frame of a detected key change, else 0 */
  keyChange?: number;
  // ─── Silence / applause classifier (Tier 3) ───
  /** Silence between songs: rms<0.05 + low beat-conf + low onset, 0..1 */
  silenceScore?: number;
  /** Audience applause: mid-energy broadband flat spectrum + low beat-conf */
  applauseScore?: number;
  /** Music present: tracked beats + non-flat spectrum + nontrivial energy */
  musicScore?: number;
  /** Vocal share of tonal energy: vocalRms / (vocalRms + otherRms + bassRms).
   *  0..1 — distinguishes "Jerry sings" (~1) from "Jerry solos" (~0). Tier 3. */
  vocalEnergyRatio?: number;
  /** CLAP semantic score: psychedelic (0-1) */
  semantic_psychedelic?: number;
  /** CLAP semantic score: aggressive (0-1) */
  semantic_aggressive?: number;
  /** CLAP semantic score: tender (0-1) */
  semantic_tender?: number;
  /** CLAP semantic score: cosmic (0-1) */
  semantic_cosmic?: number;
  /** CLAP semantic score: rhythmic (0-1) */
  semantic_rhythmic?: number;
  /** CLAP semantic score: ambient (0-1) */
  semantic_ambient?: number;
  /** CLAP semantic score: chaotic (0-1) */
  semantic_chaotic?: number;
  /** CLAP semantic score: triumphant (0-1) */
  semantic_triumphant?: number;
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
  /** Whether stem separation data is available */
  stemsAvailable?: boolean;
  /** Tempo derived from drum stem beat tracking */
  stemTempo?: number;
  /** Mean vocal RMS across all frames */
  stemVocalMean?: number;
  /** Mean other (guitar/keys) RMS across all frames */
  stemOtherMean?: number;
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
  | "aurora"
  | "crystal_cavern"
  | "fluid_light"
  | "void_light"
  | "fluid_2d"
  | "spectral_analyzer"
  | "particle_swarm"
  | "crystalline_growth"
  | "climax_surge"
  | "kaleidoscope"
  | "fractal_zoom"
  | "sacred_geometry"
  | "reaction_diffusion"
  | "mandala_engine"
  | "fractal_flames"
  | "feedback_recursion"
  | "truchet_tiling"
  | "diffraction_rings"
  | "plasma_field"
  | "voronoi_flow"
  | "electric_arc"
  | "morphogenesis"
  | "stained_glass"
  | "neural_web"
  | "smoke_rings"
  | "aurora_curtains"
  | "digital_rain"
  | "lava_flow"
  | "mycelium_network"
  | "ink_wash"
  | "coral_reef"
  | "solar_flare"
  | "galaxy_spiral"
  | "warp_field"
  | "signal_decay"
  | "databend"
  | "volumetric_clouds"
  | "volumetric_smoke"
  | "volumetric_nebula"
  | "river"
  | "space_travel"
  | "mountain_fire"
  | "forest"
  | "flower_field"
  | "desert_road"
  | "ocean"
  | "campfire"
  | "rain_street"
  | "aurora_sky"
  | "storm"
  | "canyon"
  | "liquid_mandala"
  | "bioluminescence"
  | "neon_grid"
  | "warm_nebula"
  | "prism_refraction"
  | "cellular_automata"
  | "acid_melt"
  | "blacklight_glow"
  | "spinning_spiral"
  | "liquid_projector"
  | "protean_clouds"
  | "dark_star_void"
  | "star_nest"
  | "morning_dew_fog"
  | "wharf_rat_storm"
  | "fire_mountain_smoke"
  | "estimated_prophet_mist"
  | "nimitz_aurora"
  | "scarlet_golden_haze"
  | "terrapin_nebula"
  | "st_stephen_lightning"
  | "seascape"
  | "concert_beams"
  | "particle_burst"
  | "molten_glass"
  | "combustible_voronoi"
  | "fractal_temple"
  | "luminous_cavern"
  | "ancient_forest"
  | "desert_cathedral"
  | "cosmic_cathedral"
  | "molten_forge"
  | "creation"
  | "dual_shader"
  | "dual_blend"
  | "smoke_and_mirrors"
  | "highway_horizon"
  | "honeycomb_cathedral"
  | "campfire_embers"
  | "neon_casino"
  | "storm_vortex"
  | "psychedelic_garden"
  | "cosmic_railroad"
  | "desert_cantina"
  | "earthquake_fissure"
  | "mobius_amphitheater"
  | "memorial_drift"
  | "boxcar_tunnel"
  | "aviary_canopy"
  | "clockwork_temple"
  | "event_horizon"
  | "canyon_chase"
  | "porch_twilight"
  | "bloom_explosion"
  | "locomotive_engine"
  | "dance_floor_prism"
  | "stained_glass_dissolution"
  | "crystalline_void"
  | "amber_drift"
  | "obsidian_mirror"
  | "spectral_bridge"
  | "ember_meadow";

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
  /** CSS mix-blend-mode for song art layer (default "screen") */
  artBlendMode?: string;
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
/** Mood/affinity tag — string to support band-specific culture tags without type changes.
 *  Well-known values: cosmic, organic, mechanical, psychedelic, festival,
 *  contemplative, intense, retro, aquatic, plus band culture tags (e.g. "dead-culture"). */
export type OverlayTag = string;

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
  /** Quality tier: A=essential, B=good, C=archived (excluded from selection) */
  tier?: "A" | "B" | "C";
  /** Visual complexity: 1=simple/subtle, 2=moderate, 3=busy/complex.
   *  Defaults to weight value if not set. Used to cap total visual complexity per song. */
  complexity?: 1 | 2 | 3;
  /** Selection rarity (0-1, default 1.0). Values < 1.0 add a random gate:
   *  the overlay only passes if rng() < rarity, creating "surprise" appearances. */
  rarity?: number;
  /** Audio affinity: AudioSnapshot field name → score weight (-1 to 1).
   *  Positive = overlay thrives with high values. Negative = suppressed.
   *  e.g. { spectralFlux: 0.8, energy: 0.5, vocalPresence: -0.3 } */
  audioAffinity?: Partial<Record<string, number>>;
  /** CSS mix-blend-mode for this overlay (default "screen") */
  blendMode?: "screen" | "overlay" | "multiply" | "soft-light" | "color-dodge" | "luminosity";
  /** Visual prominence class — controls exclusion rules during selection.
   *  hero: iconic foreground imagery (Stealie, Bolt, Bear) — max 1 per window.
   *  accent: reactive/decorative focus elements — max 1 per window.
   *  ambient: background textures (starfield, smoke, grain) — unlimited.
   *  Defaults to "ambient" if not set. */
  prominence?: "hero" | "accent" | "ambient";
  /** Screen region for spatial distribution. Prevents focal overlays from stacking
   *  at screen center. The rotation engine enforces max 1 overlay per focal region.
   *  center: large central focal elements (mandalas, sacred geometry)
   *  upper-left, upper-right, lower-left, lower-right: quadrant-assigned focal elements
   *  edge: full-frame ambient overlays (grain, smoke, fog) — no collision limit
   *  Defaults to "edge" if not set. */
  region?: "center" | "upper-left" | "upper-right" | "lower-left" | "lower-right" | "edge";
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
  /** Average vocal presence across all frames (0-1, 0 if no stems) */
  avgVocalPresence: number;
  /** Average drum onset energy across all frames (0-1, 0 if no stems) */
  avgDrumEnergy: number;
  /** Average other (guitar/keys) centroid across all frames (0-1, 0 if no stems) */
  avgOtherCentroid: number;
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
  /** Era classification for visual theming (band-specific, e.g. "primal", "classic") */
  era?: string;
  /** Venue type for ambient theming (e.g. "theater", "arena", "amphitheater") */
  venueType?: string;
  /** Tour name (e.g., "Spring 1977", "Fall 1989") */
  tourName?: string;
  /** 1-based night in consecutive run (e.g. night 3 of a 4-night stand) */
  nightInRun?: number;
  /** Total nights in this run */
  totalNights?: number;
  /** Days since last show (0 = consecutive) */
  daysOff?: number;
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
