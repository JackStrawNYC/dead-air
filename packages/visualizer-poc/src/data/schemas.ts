/**
 * Zod schemas for runtime validation of all JSON data files.
 *
 * Mirrors the TypeScript interfaces in types.ts but adds runtime validation
 * so malformed data fails fast with clear error messages instead of causing
 * mysterious rendering bugs downstream.
 *
 * Usage:
 *   import { SetlistSchema, parseSetlist } from "./schemas";
 *   const setlist = parseSetlist(rawJson);  // throws ZodError on invalid data
 */

import { z } from "zod";

// ─── Shared primitives ───

const UnitFloat = z.number().min(0).max(1);
const Hue = z.number().min(0).max(360);
const PositiveInt = z.number().int().nonnegative();

// ─── Audio Analysis Schemas ───

export const EnhancedFrameDataSchema = z.object({
  rms: z.number(),
  centroid: z.number(),
  onset: z.number(),
  beat: z.boolean(),
  sub: z.number(),
  low: z.number(),
  mid: z.number(),
  high: z.number(),
  chroma: z.tuple([
    z.number(), z.number(), z.number(), z.number(),
    z.number(), z.number(), z.number(), z.number(),
    z.number(), z.number(), z.number(), z.number(),
  ]),
  contrast: z.tuple([
    z.number(), z.number(), z.number(), z.number(),
    z.number(), z.number(), z.number(),
  ]),
  flatness: z.number(),
  stemBassRms: z.number().optional(),
  stemDrumOnset: z.number().optional(),
  stemDrumBeat: z.boolean().optional(),
  stemVocalRms: z.number().optional(),
  stemVocalPresence: z.boolean().optional(),
  stemOtherRms: z.number().optional(),
  stemOtherCentroid: z.number().optional(),
  localTempo: z.number().optional(),
  beatConfidence: z.number().optional(),
  downbeat: z.boolean().optional(),
  melodicPitch: z.number().optional(),
  melodicConfidence: z.number().optional(),
  melodicDirection: z.number().optional(),
  chordIndex: z.number().optional(),
  chordConfidence: z.number().optional(),
  harmonicTension: z.number().optional(),
  sectionType: z.string().optional(),
  improvisationScore: z.number().optional(),
  tempoDerivative: z.number().optional(),
  dynamicRange: z.number().optional(),
  spaceScore: z.number().optional(),
  timbralBrightness: z.number().optional(),
  timbralFlux: z.number().optional(),
  vocalPitch: z.number().optional(),
  vocalPitchConfidence: z.number().optional(),
  semantic_psychedelic: z.number().optional(),
  semantic_aggressive: z.number().optional(),
  semantic_tender: z.number().optional(),
  semantic_cosmic: z.number().optional(),
  semantic_rhythmic: z.number().optional(),
  semantic_ambient: z.number().optional(),
  semantic_chaotic: z.number().optional(),
  semantic_triumphant: z.number().optional(),
});

/** Legacy 8-field frame format (auto-upgraded by analysis-loader) */
export const FrameDataSchema = z.object({
  rms: z.number(),
  centroid: z.number(),
  onset: z.number(),
  beat: z.boolean(),
  sub: z.number(),
  low: z.number(),
  mid: z.number(),
  high: z.number(),
});

const EnergyLevel = z.enum(["low", "mid", "high"]);

export const SectionBoundarySchema = z.object({
  frameStart: PositiveInt,
  frameEnd: PositiveInt,
  label: z.string(),
  energy: EnergyLevel,
  avgEnergy: z.number(),
});

export const TrackMetaSchema = z.object({
  source: z.string(),
  duration: z.number().positive(),
  fps: z.number().positive(),
  sr: z.number().positive(),
  hopLength: z.number().positive(),
  totalFrames: PositiveInt,
  tempo: z.number().positive(),
  sections: z.array(SectionBoundarySchema),
  stemsAvailable: z.boolean().optional(),
  stemTempo: z.number().optional(),
  stemVocalMean: z.number().optional(),
  stemOtherMean: z.number().optional(),
});

export const TrackAnalysisSchema = z.object({
  meta: TrackMetaSchema,
  frames: z.array(EnhancedFrameDataSchema),
});

/** Accepts both enhanced (28-field) and legacy (8-field) frame formats */
export const FlexibleTrackAnalysisSchema = z.object({
  meta: TrackMetaSchema,
  frames: z.array(z.union([EnhancedFrameDataSchema, FrameDataSchema])),
});

// ─── Setlist Schemas ───

export const VisualModeSchema = z.enum([
  "liquid_light", "particle_nebula", "concert_lighting",
  "lo_fi_grain", "stark_minimal", "oil_projector",
  "tie_dye", "cosmic_dust", "vintage_film",
  "cosmic_voyage", "inferno", "deep_ocean", "aurora",
  "crystal_cavern", "fluid_light", "void_light",
  "fluid_2d", "spectral_analyzer", "particle_swarm",
  "crystalline_growth", "climax_surge", "kaleidoscope",
  "fractal_zoom", "sacred_geometry", "reaction_diffusion",
  "mandala_engine", "fractal_flames", "feedback_recursion",
  "truchet_tiling", "diffraction_rings", "plasma_field",
  "voronoi_flow", "electric_arc", "morphogenesis",
  "stained_glass", "neural_web", "smoke_rings",
  "aurora_curtains", "digital_rain", "lava_flow",
  "mycelium_network", "ink_wash", "coral_reef",
  "solar_flare", "galaxy_spiral", "warp_field",
  "signal_decay", "databend", "volumetric_clouds",
  "volumetric_smoke", "volumetric_nebula", "river",
  "space_travel", "forest", "mountain_fire", "flower_field",
  "desert_road", "ocean", "campfire", "rain_street",
  "aurora_sky", "storm", "canyon",
  "liquid_mandala", "bioluminescence", "neon_grid",
  "warm_nebula", "prism_refraction", "cellular_automata",
  "spinning_spiral",
]);

export const ColorPaletteSchema = z.object({
  primary: Hue,
  secondary: Hue,
  saturation: UnitFloat.optional(),
  brightness: UnitFloat.optional(),
});

export const SceneVideoCategorySchema = z.enum([
  "landscape", "venue", "psychedelic", "nocturnal", "era", "cosmic",
]);

export const SceneVideoSchema = z.object({
  src: z.string(),
  category: SceneVideoCategorySchema,
});

export const SectionOverrideSchema = z.object({
  sectionIndex: PositiveInt,
  mode: VisualModeSchema,
});

export const OverlayOverridesSchema = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  targetCount: z.number().int().positive().optional(),
});

export const SetlistEntrySchema = z.object({
  trackId: z.string().regex(/^s\d+t\d+$/, "Track ID must match s{set}t{track} format"),
  title: z.string().min(1),
  set: z.number().int().min(1).max(3),
  trackNumber: z.number().int().min(1),
  defaultMode: VisualModeSchema,
  audioFile: z.string(),
  sectionOverrides: z.array(SectionOverrideSchema).optional(),
  palette: ColorPaletteSchema.optional(),
  overlayOverrides: OverlayOverridesSchema.optional(),
  songArt: z.string().optional(),
  sceneVideos: z.array(SceneVideoSchema).optional(),
  segueInto: z.boolean().optional(),
  artVariantCount: z.number().int().positive().optional(),
});

export const EraSchema = z.enum(["primal", "classic", "hiatus", "touch_of_grey", "revival"]);

export const VenueTypeSchema = z.enum([
  "theater", "arena", "amphitheater", "festival", "club", "ballroom",
]);

export const ShowSetlistSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  venue: z.string().min(1),
  bandName: z.string().optional(),
  taperInfo: z.string().optional(),
  showSeed: z.number().optional(),
  era: EraSchema.optional(),
  venueType: VenueTypeSchema.optional(),
  tourName: z.string().optional(),
  nightInRun: z.number().int().min(1).optional(),
  totalNights: z.number().int().min(1).optional(),
  daysOff: z.number().int().min(0).optional(),
  songs: z.array(SetlistEntrySchema).min(1),
  showPoster: z.string().optional(),
});

// ─── Show Timeline Schema ───

export const TimelineEntrySchema = z.object({
  trackId: z.string(),
  globalFrameStart: PositiveInt,
  globalFrameEnd: PositiveInt,
  totalFrames: PositiveInt,
  missing: z.boolean().optional(),
});

export const ShowTimelineSchema = z.object({
  date: z.string(),
  totalFrames: PositiveInt,
  totalDuration: z.number().positive(),
  tracks: z.array(TimelineEntrySchema),
});

// ─── Show Context Schema ───

export const ChapterEntrySchema = z.object({
  before: z.string().optional(),
  after: z.string().optional(),
  text: z.string(),
  stats: z.object({
    timesPlayed: z.number().optional(),
    firstPlayed: z.string().optional(),
    notable: z.string().optional(),
  }).optional(),
});

export const ShowContextSchema = z.object({
  date: z.string().optional(),
  venue: z.string().optional(),
  chapters: z.array(ChapterEntrySchema),
});

// ─── Narration Schema ───

export const NarrationSongSchema = z.object({
  listenFor: z.array(z.string()),
  context: z.string().optional(),
  songHistory: z.string().optional(),
});

export const FanReviewSchema = z.object({
  text: z.string(),
  reviewer: z.string(),
  stars: z.number().int().min(1).max(5).optional(),
});

export const NarrationSchema = z.object({
  showDate: z.string().optional(),
  tourContext: z.string().optional(),
  setNarration: z.object({
    set1Intro: z.string().optional(),
    set2Intro: z.string().optional(),
    encoreIntro: z.string().optional(),
  }).optional(),
  songs: z.record(z.string(), NarrationSongSchema).optional(),
  fanReviews: z.array(FanReviewSchema).optional(),
});

// ─── Milestones Schema ───

export const MilestoneSchema = z.object({
  trackId: z.string(),
  type: z.enum(["debut", "revival", "rare", "return"]),
  headline: z.string(),
  subtext: z.string(),
});

export const MilestoneDataSchema = z.object({
  showDate: z.string(),
  milestones: z.array(MilestoneSchema),
});

// ─── Song Stats Schema ───

export const SongStatsEntrySchema = z.object({
  title: z.string(),
  timesPlayed: z.number().int().nonnegative(),
  firstPlayed: z.string(),
  lastPlayed: z.string(),
  notable: z.string().optional(),
  gapShows: z.number().int().nonnegative().optional(),
  lastPlayedDate: z.string().optional(),
});

export const SongStatsSchema = z.object({
  showDate: z.string().optional(),
  source: z.string().optional(),
  songs: z.record(z.string(), SongStatsEntrySchema),
});

// ─── Overlay Schedule Schema ───

export const OverlayPhaseHintSchema = z.enum(["low", "mid", "high"]);

export const OverlayScheduleSchema = z.object({
  generatedAt: z.string(),
  model: z.string().optional(),
  songs: z.record(z.string(), z.object({
    title: z.string(),
    activeOverlays: z.array(z.string()),
    totalCount: z.number().int(),
    reasoning: z.string().optional(),
    energyHints: z.record(z.string(), OverlayPhaseHintSchema).optional(),
  })),
});

// ─── Image Library Schema ───

export const LibraryAssetSchema = z.object({
  id: z.string(),
  path: z.string(),
  type: z.enum(["image", "video"]),
  songKey: z.string(),
  category: z.enum(["song", "general"]).optional(),
  tags: z.array(z.string()),
  sizeBytes: z.number().optional(),
  addedAt: z.string().optional(),
  originalFile: z.string().optional(),
  song: z.string().optional(),
  sourceShow: z.string().optional(),
});

export const ImageLibrarySchema = z.object({
  version: z.number(),
  assets: z.array(LibraryAssetSchema),
});

// ─── Lyric Triggers Schema ───

export const LyricTriggerDefSchema = z.object({
  id: z.string(),
  phrase: z.string(),
  song: z.string(),
  visual: z.string(),
  mediaType: z.enum(["image", "video"]),
  hold_seconds: z.number().positive(),
  pre_roll_seconds: z.number().optional(),
  image_prompt: z.string().optional(),
  video_prompt: z.string().optional(),
});

export const LyricTriggersConfigSchema = z.object({
  showId: z.string().optional(),
  defaults: z.object({
    transition_in: z.string(),
    transition_out: z.string(),
    pre_roll_seconds: z.number(),
    hold_seconds: z.number(),
    min_gap_seconds: z.number(),
    blend_mode: z.string(),
    opacity: z.number(),
  }).optional(),
  triggers: z.array(LyricTriggerDefSchema),
});

// ─── Lyric Alignment Schema ───

export const AlignmentWordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
  score: z.number().optional(),
});

export const AlignmentDataSchema = z.object({
  songName: z.string().optional(),
  trackId: z.string().optional(),
  source: z.string().optional(),
  words: z.array(AlignmentWordSchema),
});

// ─── Validated Loaders ───
// These provide clear error messages when data files are malformed.

/**
 * Parse and validate setlist JSON. Throws ZodError with path details on failure.
 */
export function parseSetlist(data: unknown) {
  return ShowSetlistSchema.parse(data);
}

/**
 * Parse and validate track analysis JSON.
 * Accepts both legacy (8-field) and enhanced (28-field) frame formats.
 */
export function parseTrackAnalysis(data: unknown) {
  return FlexibleTrackAnalysisSchema.parse(data);
}

/**
 * Parse and validate show timeline JSON.
 */
export function parseShowTimeline(data: unknown) {
  return ShowTimelineSchema.parse(data);
}

/**
 * Safely parse with fallback — returns null instead of throwing.
 * Use for optional data files (narration, milestones, song-stats, etc.)
 */
export function safeParse<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  console.warn("Schema validation failed:", result.error.issues.map(i =>
    `${i.path.join(".")}: ${i.message}`
  ).join("; "));
  return null;
}
