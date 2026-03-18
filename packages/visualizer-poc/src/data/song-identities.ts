/**
 * Song Identity Data Layer — per-song visual personality definitions.
 *
 * Each entry defines a song's visual character: preferred shaders, color palette,
 * overlay scoring modifiers, climax behavior, and segue styles. These feed into
 * SceneRouter, overlay-rotation, EnergyEnvelope, and SegueCrossfade to make
 * every song visually distinct.
 *
 * Covers 30 most-played Grateful Dead songs with curated visual identities.
 *
 * **Extending for a new band:**
 * Song identities are looked up by title via `lookupSongIdentity()`. For a new
 * band, add entries to `SONG_IDENTITIES` keyed by normalized title (lowercase,
 * alphanumeric only) and add aliases to `SONG_ALIASES`. Songs without entries
 * gracefully fall through to defaults everywhere — no code changes needed.
 * Consider creating a separate file (e.g. `phish-song-identities.ts`) and
 * merging into SONG_IDENTITIES at init time based on BandConfig.
 */

import type { VisualMode, ColorPalette, OverlayTag, TrackMeta, EnhancedFrameData } from "./types";
import type { DrumsSpaceSubPhase } from "../utils/drums-space-phase";

// ─── Types ───

export type TransitionStyle = "dissolve" | "morph" | "flash" | "void" | "radial_wipe" | "distortion_morph" | "luminance_key" | "kaleidoscope_dissolve" | "prismatic_split" | "chromatic_wipe" | "feedback_dissolve" | "spiral_vortex" | "interference_pattern" | "pixel_scatter";

export interface ClimaxBehavior {
  /** Peak saturation offset (additive, default from climax-state) */
  peakSaturation?: number;
  /** Peak brightness offset (additive) */
  peakBrightness?: number;
  /** Whether to trigger a brief white flash at climax onset */
  flash?: boolean;
  /** Overlay density multiplier during climax */
  climaxDensityMult?: number;
}

export interface SongIdentity {
  /** Preferred shader modes — weighted 3x in selection pool */
  preferredModes: VisualMode[];
  /** Color palette override */
  palette: ColorPalette;
  /** Overlay names to boost in scoring (+0.30) */
  overlayBoost?: string[];
  /** Overlay names to suppress in scoring (-0.40) */
  overlaySuppress?: string[];
  /** Multiplier on overlay count (0.5 = sparse, 2.0 = dense) */
  overlayDensity?: number;
  /** Texture routing keyword bonuses (+0.15 per match) */
  moodKeywords?: OverlayTag[];
  /** Per-song climax behavior overrides */
  climaxBehavior?: ClimaxBehavior;
  /** Segue visual style entering this song */
  transitionIn?: TransitionStyle;
  /** Segue visual style leaving this song */
  transitionOut?: TransitionStyle;
  /** Drums/Space sub-phase shader overrides */
  drumsSpaceShaders?: Partial<Record<DrumsSpaceSubPhase, VisualMode>>;
  /** Additive hue shift for EnergyEnvelope (degrees) */
  hueShift?: number;
  /** Additive saturation offset for EnergyEnvelope */
  saturationOffset?: number;
}

// ─── Song Identity Registry ───

export const SONG_IDENTITIES: Record<string, SongIdentity> = {
  // ══════════════════════════════════════════
  // SET 1 STAPLES — warm, recognizable, grounded
  // ══════════════════════════════════════════

  "bertha": {
    preferredModes: ["concert_lighting", "tie_dye", "liquid_light", "fractal_flames"],
    palette: { primary: 15, secondary: 45, saturation: 0.95 }, // warm orange/gold
    overlayBoost: ["Bertha", "BearParade", "BreathingStealie"],
    moodKeywords: ["festival", "dead-culture"],
    climaxBehavior: { peakSaturation: 0.55, flash: true },
  },

  "deal": {
    preferredModes: ["concert_lighting", "inferno", "tie_dye", "fractal_flames"],
    palette: { primary: 10, secondary: 40, saturation: 1.0 }, // hot red/orange
    overlayBoost: ["ThirteenPointBolt", "ParticleExplosion"],
    moodKeywords: ["intense", "festival"],
    climaxBehavior: { peakBrightness: 0.25, flash: true },
  },

  "sugaree": {
    preferredModes: ["liquid_light", "oil_projector", "vintage_film"],
    palette: { primary: 30, secondary: 200, saturation: 0.85 }, // amber/sky blue
    overlayBoost: ["JerryGuitar", "RoseOverlay", "SacredGeometry"],
    overlaySuppress: ["LaserShow", "WallOfSound"],
    moodKeywords: ["contemplative", "organic"],
    overlayDensity: 0.7,
    hueShift: 5,
  },

  "althea": {
    preferredModes: ["liquid_light", "oil_projector", "aurora", "feedback_recursion", "voronoi_flow", "aurora_curtains"],
    palette: { primary: 180, secondary: 280, saturation: 0.9 }, // teal/purple
    overlayBoost: ["SacredGeometry", "MandalaGenerator", "JerryGuitar"],
    moodKeywords: ["contemplative", "psychedelic"],
    overlayDensity: 0.8,
  },

  "friendofthedevil": {
    preferredModes: ["vintage_film", "lo_fi_grain", "oil_projector"],
    palette: { primary: 25, secondary: 160, saturation: 0.75 }, // warm gold/green
    overlayBoost: ["VWBusParade", "Fireflies", "SkeletonBand"],
    moodKeywords: ["organic", "retro"],
    overlayDensity: 0.6,
    saturationOffset: -0.05,
  },

  "ripple": {
    preferredModes: ["aurora", "deep_ocean", "crystal_cavern", "diffraction_rings", "stained_glass", "smoke_rings"],
    palette: { primary: 200, secondary: 270, saturation: 0.7, brightness: 0.95 }, // cool blue/lavender
    overlayBoost: ["Fireflies", "RoseOverlay", "BoxOfRain"],
    overlaySuppress: ["LaserShow", "ParticleExplosion", "WallOfSound"],
    moodKeywords: ["contemplative", "organic"],
    overlayDensity: 0.5,
    hueShift: -8,
    saturationOffset: -0.08,
  },

  "caseyjones": {
    preferredModes: ["concert_lighting", "tie_dye", "inferno", "fractal_flames"],
    palette: { primary: 5, secondary: 50, saturation: 1.0 }, // red/yellow
    overlayBoost: ["VWBusParade", "BearParade", "ThirteenPointBolt"],
    moodKeywords: ["festival", "intense"],
    climaxBehavior: { flash: true, peakSaturation: 0.5 },
  },

  "unclejohnsband": {
    preferredModes: ["liquid_light", "aurora", "oil_projector"],
    palette: { primary: 40, secondary: 220, saturation: 0.85 }, // warm gold/blue
    overlayBoost: ["SacredGeometry", "JerryGuitar", "BreathingStealie"],
    moodKeywords: ["organic", "dead-culture"],
    overlayDensity: 0.8,
  },

  "shakedownstreet": {
    preferredModes: ["concert_lighting", "tie_dye", "inferno", "lava_flow"],
    palette: { primary: 290, secondary: 50, saturation: 1.0 }, // magenta/gold
    overlayBoost: ["BearParade", "SkeletonBand", "LaserShow"],
    moodKeywords: ["festival", "psychedelic"],
    climaxBehavior: { peakSaturation: 0.5, climaxDensityMult: 1.8 },
  },

  // ══════════════════════════════════════════
  // SET 2 EXPLORERS — cosmic, deep, transcendent
  // ══════════════════════════════════════════

  "darkstar": {
    preferredModes: ["cosmic_voyage", "deep_ocean", "crystal_cavern", "mandala_engine", "feedback_recursion", "morphogenesis", "neural_web"],
    palette: { primary: 260, secondary: 180, saturation: 0.6, brightness: 0.85 }, // deep indigo/teal
    overlayBoost: ["DarkStarPortal", "CosmicStarfield", "SacredGeometry"],
    overlaySuppress: ["BearParade", "VWBusParade", "CrowdDance"],
    moodKeywords: ["cosmic", "contemplative"],
    overlayDensity: 0.4,
    hueShift: -15,
    saturationOffset: -0.1,
    climaxBehavior: { peakBrightness: 0.3, peakSaturation: 0.6 },
    transitionOut: "void",
  },

  "fireonthemountain": {
    preferredModes: ["inferno", "liquid_light", "concert_lighting", "fractal_flames", "lava_flow"],
    palette: { primary: 10, secondary: 45, saturation: 1.0, brightness: 1.05 }, // deep red/fire
    overlayBoost: ["EmberRise", "ThirteenPointBolt", "ParticleExplosion"],
    moodKeywords: ["intense", "festival"],
    climaxBehavior: { peakSaturation: 0.6, peakBrightness: 0.25, flash: true, climaxDensityMult: 1.6 },
    transitionIn: "morph", // from Scarlet
  },

  "scarletbegonias": {
    preferredModes: ["tie_dye", "liquid_light", "concert_lighting", "fractal_flames", "plasma_field"],
    palette: { primary: 0, secondary: 330, saturation: 1.0 }, // scarlet red/rose
    overlayBoost: ["ChinaCatSunflower", "TieDyeWash", "BreathingStealie"],
    moodKeywords: ["psychedelic", "festival"],
    transitionOut: "morph", // into Fire
    climaxBehavior: { peakSaturation: 0.5 },
  },

  "eyesoftheworld": {
    preferredModes: ["aurora", "cosmic_voyage", "liquid_light", "truchet_tiling", "stained_glass"],
    palette: { primary: 170, secondary: 50, saturation: 0.9 }, // aquamarine/gold
    overlayBoost: ["CosmicStarfield", "SacredGeometry", "Fireflies"],
    overlaySuppress: ["WallOfSound"],
    moodKeywords: ["cosmic", "organic"],
    overlayDensity: 0.7,
    climaxBehavior: { peakBrightness: 0.2, peakSaturation: 0.45 },
  },

  "morningdew": {
    preferredModes: ["stark_minimal", "crystal_cavern", "deep_ocean", "mandala_engine", "diffraction_rings", "stained_glass", "aurora_curtains"],
    palette: { primary: 210, secondary: 30, saturation: 0.7, brightness: 0.9 }, // dawn blue/amber
    overlayBoost: ["RoseOverlay", "Fireflies", "SacredGeometry"],
    overlaySuppress: ["BearParade", "VWBusParade", "LaserShow"],
    moodKeywords: ["contemplative", "organic"],
    overlayDensity: 0.5,
    hueShift: -5,
    climaxBehavior: { peakBrightness: 0.35, peakSaturation: 0.65, flash: true, climaxDensityMult: 0.5 },
  },

  "stellablue": {
    preferredModes: ["deep_ocean", "cosmic_voyage", "aurora", "diffraction_rings", "smoke_rings"],
    palette: { primary: 220, secondary: 280, saturation: 0.65, brightness: 0.88 }, // deep blue/violet
    overlayBoost: ["CosmicStarfield", "RoseOverlay", "Fireflies"],
    overlaySuppress: ["LaserShow", "ParticleExplosion", "CrowdDance"],
    moodKeywords: ["contemplative", "cosmic"],
    overlayDensity: 0.4,
    hueShift: -10,
    saturationOffset: -0.1,
  },

  "notfadeaway": {
    preferredModes: ["concert_lighting", "inferno", "tie_dye", "fractal_flames", "electric_arc", "lava_flow"],
    palette: { primary: 20, secondary: 340, saturation: 1.0 }, // warm orange/magenta
    overlayBoost: ["BearParade", "SkeletonBand", "WallOfSound"],
    moodKeywords: ["festival", "intense"],
    climaxBehavior: { peakSaturation: 0.55, flash: true },
  },

  "estimatedprophet": {
    preferredModes: ["cosmic_voyage", "crystal_cavern", "inferno", "feedback_recursion", "electric_arc", "neural_web"],
    palette: { primary: 270, secondary: 30, saturation: 0.95 }, // deep purple/gold
    overlayBoost: ["DarkStarPortal", "SacredGeometry", "FractalZoom"],
    moodKeywords: ["cosmic", "intense"],
    climaxBehavior: { peakBrightness: 0.3, peakSaturation: 0.6, flash: true },
    transitionOut: "flash",
  },

  "chinacatsunflower": {
    preferredModes: ["tie_dye", "liquid_light", "oil_projector", "fractal_flames", "plasma_field"],
    palette: { primary: 50, secondary: 320, saturation: 1.0 }, // golden yellow/pink
    overlayBoost: ["ChinaCatSunflower", "TieDyeWash", "BearParade"],
    moodKeywords: ["psychedelic", "festival"],
    transitionOut: "morph", // into Rider
  },

  "iknowyourider": {
    preferredModes: ["concert_lighting", "tie_dye", "liquid_light"],
    palette: { primary: 30, secondary: 350, saturation: 0.95 }, // amber/rose
    overlayBoost: ["BreathingStealie", "SkeletonBand"],
    moodKeywords: ["festival", "dead-culture"],
    transitionIn: "morph", // from China Cat
    climaxBehavior: { flash: true },
  },

  "truckin": {
    preferredModes: ["concert_lighting", "vintage_film", "tie_dye"],
    palette: { primary: 35, secondary: 200, saturation: 0.9 }, // golden/blue
    overlayBoost: ["VWBusParade", "BearParade", "SkeletonBand"],
    moodKeywords: ["festival", "retro"],
  },

  "sugarmagnolia": {
    preferredModes: ["tie_dye", "concert_lighting", "liquid_light"],
    palette: { primary: 340, secondary: 60, saturation: 1.0 }, // pink/golden
    overlayBoost: ["SugarMagnolia", "ChinaCatSunflower", "BearParade"],
    moodKeywords: ["festival", "organic"],
    climaxBehavior: { peakSaturation: 0.5, flash: true },
  },

  "terrapinstation": {
    preferredModes: ["cosmic_voyage", "crystal_cavern", "aurora", "truchet_tiling", "stained_glass", "aurora_curtains"],
    palette: { primary: 160, secondary: 280, saturation: 0.85 }, // sea green/purple
    overlayBoost: ["MarchingTerrapins", "DancingTerrapinOverlay", "SacredGeometry", "CosmicStarfield"],
    moodKeywords: ["cosmic", "organic"],
    overlayDensity: 0.7,
    climaxBehavior: { peakBrightness: 0.2, peakSaturation: 0.5 },
  },

  "playingintheband": {
    preferredModes: ["liquid_light", "cosmic_voyage", "tie_dye", "fractal_flames", "voronoi_flow", "neural_web"],
    palette: { primary: 280, secondary: 60, saturation: 0.9 }, // purple/gold
    overlayBoost: ["FractalZoom", "MandalaGenerator", "DarkStarPortal"],
    moodKeywords: ["psychedelic", "cosmic"],
    overlayDensity: 0.6,
    climaxBehavior: { peakSaturation: 0.55 },
    transitionOut: "morph",
  },

  "theotherone": {
    preferredModes: ["inferno", "concert_lighting", "liquid_light", "mandala_engine", "feedback_recursion", "electric_arc", "digital_rain"],
    palette: { primary: 350, secondary: 20, saturation: 1.0, brightness: 1.05 }, // crimson/scarlet
    overlayBoost: ["ParticleExplosion", "LightningBoltOverlay", "ThirteenPointBolt"],
    moodKeywords: ["intense", "psychedelic"],
    climaxBehavior: { peakSaturation: 0.6, peakBrightness: 0.25, flash: true },
    transitionOut: "flash",
  },

  "wharfrat": {
    preferredModes: ["stark_minimal", "deep_ocean", "vintage_film", "diffraction_rings", "aurora_curtains"],
    palette: { primary: 210, secondary: 150, saturation: 0.6, brightness: 0.88 }, // steel blue/sage
    overlayBoost: ["RoseOverlay", "Fireflies", "JerryGuitar"],
    overlaySuppress: ["LaserShow", "ParticleExplosion", "CrowdDance"],
    moodKeywords: ["contemplative", "organic"],
    overlayDensity: 0.4,
    hueShift: -5,
    saturationOffset: -0.08,
    transitionIn: "void", // from The Other One
    climaxBehavior: { peakBrightness: 0.3, peakSaturation: 0.5 },
  },

  "birdsong": {
    preferredModes: ["aurora", "cosmic_voyage", "crystal_cavern", "truchet_tiling", "voronoi_flow", "smoke_rings"],
    palette: { primary: 170, secondary: 60, saturation: 0.8 }, // teal/golden
    overlayBoost: ["Fireflies", "CosmicStarfield", "SacredGeometry"],
    overlaySuppress: ["WallOfSound"],
    moodKeywords: ["organic", "cosmic"],
    overlayDensity: 0.6,
    climaxBehavior: { peakBrightness: 0.25, peakSaturation: 0.5 },
  },

  "helpontheway": {
    preferredModes: ["crystal_cavern", "cosmic_voyage", "liquid_light", "truchet_tiling"],
    palette: { primary: 240, secondary: 30, saturation: 0.9 }, // royal blue/gold
    overlayBoost: ["SacredGeometry", "FractalZoom"],
    moodKeywords: ["cosmic", "intense"],
    transitionOut: "morph", // into Slipknot
  },

  "slipknot": {
    preferredModes: ["inferno", "liquid_light", "concert_lighting", "fractal_flames"],
    palette: { primary: 10, secondary: 270, saturation: 1.0 }, // fire/purple
    overlayBoost: ["FractalZoom", "MandalaGenerator", "ParticleExplosion"],
    moodKeywords: ["intense", "psychedelic"],
    transitionIn: "morph", // from Help on the Way
    transitionOut: "morph", // into Franklin's Tower
    climaxBehavior: { peakSaturation: 0.6, flash: true },
  },

  "franklinstower": {
    preferredModes: ["concert_lighting", "tie_dye", "liquid_light"],
    palette: { primary: 45, secondary: 320, saturation: 0.95 }, // gold/magenta
    overlayBoost: ["BearParade", "BreathingStealie", "SkeletonBand"],
    moodKeywords: ["festival", "dead-culture"],
    transitionIn: "morph", // from Slipknot
    climaxBehavior: { flash: true, peakSaturation: 0.5 },
  },

  "ststephen": {
    preferredModes: ["concert_lighting", "inferno", "liquid_light", "fractal_flames", "electric_arc", "digital_rain"],
    palette: { primary: 300, secondary: 45, saturation: 0.95 }, // magenta/gold
    overlayBoost: ["SkeletonBand", "ThirteenPointBolt", "SacredGeometry"],
    moodKeywords: ["intense", "dead-culture"],
    climaxBehavior: { peakSaturation: 0.55, flash: true },
    transitionOut: "flash",
  },

  // ══════════════════════════════════════════
  // CORNELL 5/8/77 — remaining setlist songs
  // ══════════════════════════════════════════

  "newminglewoodblues": {
    preferredModes: ["concert_lighting", "inferno", "tie_dye"],
    palette: { primary: 15, secondary: 50, saturation: 1.0 }, // hot orange/gold
    overlayBoost: ["ThirteenPointBolt", "SkeletonBand"],
    moodKeywords: ["intense", "festival"],
    overlayDensity: 1.2,
    climaxBehavior: { peakSaturation: 0.5, flash: true },
  },

  "loser": {
    preferredModes: ["vintage_film", "oil_projector", "liquid_light"],
    palette: { primary: 30, secondary: 180, saturation: 0.7, brightness: 0.9 }, // amber/teal
    overlayBoost: ["JerryGuitar", "RoseOverlay", "SkeletonRoses"],
    overlaySuppress: ["LaserShow", "ParticleExplosion", "CrowdDance"],
    moodKeywords: ["contemplative", "dead-culture"],
    overlayDensity: 0.6,
    hueShift: -3,
    saturationOffset: -0.05,
  },

  "elpaso": {
    preferredModes: ["vintage_film", "lo_fi_grain"],
    palette: { primary: 35, secondary: 160, saturation: 0.75 }, // warm gold/sage
    overlayBoost: ["VWBusParade", "Fireflies"],
    moodKeywords: ["retro", "organic"],
    overlayDensity: 0.5,
    saturationOffset: -0.08,
  },

  "theyloveeachother": {
    preferredModes: ["liquid_light", "tie_dye", "oil_projector"],
    palette: { primary: 340, secondary: 50, saturation: 0.95 }, // rose/golden
    overlayBoost: ["BreathingStealie", "BearParade"],
    moodKeywords: ["organic", "festival"],
    overlayDensity: 0.9,
    climaxBehavior: { peakSaturation: 0.45 },
  },

  "jackstraw": {
    preferredModes: ["concert_lighting", "inferno", "liquid_light", "digital_rain"],
    palette: { primary: 10, secondary: 300, saturation: 1.0 }, // red/purple
    overlayBoost: ["SkeletonBand", "ThirteenPointBolt", "LightningBoltOverlay"],
    moodKeywords: ["intense", "dead-culture"],
    overlayDensity: 1.1,
    climaxBehavior: { peakSaturation: 0.55, flash: true },
  },

  "lazylightnin": {
    preferredModes: ["tie_dye", "concert_lighting", "liquid_light"],
    palette: { primary: 55, secondary: 280, saturation: 1.0 }, // electric yellow/violet
    overlayBoost: ["LightningBoltOverlay", "TieDyeWash", "BearParade"],
    moodKeywords: ["psychedelic", "festival"],
    overlayDensity: 1.0,
    climaxBehavior: { peakSaturation: 0.5 },
    transitionOut: "morph", // into Supplication
  },

  "supplication": {
    preferredModes: ["inferno", "liquid_light", "concert_lighting"],
    palette: { primary: 5, secondary: 40, saturation: 1.0, brightness: 1.05 }, // deep red/fire
    overlayBoost: ["ParticleExplosion", "EmberRise", "FractalZoom"],
    moodKeywords: ["intense", "psychedelic"],
    overlayDensity: 1.3,
    climaxBehavior: { peakSaturation: 0.6, peakBrightness: 0.25, flash: true, climaxDensityMult: 1.6 },
    transitionIn: "morph", // from Lazy Lightnin'
  },

  "browneyedwomen": {
    preferredModes: ["oil_projector", "vintage_film", "liquid_light"],
    palette: { primary: 25, secondary: 190, saturation: 0.85 }, // warm brown/teal
    overlayBoost: ["JerryGuitar", "BreathingStealie", "RoseOverlay"],
    moodKeywords: ["organic", "dead-culture"],
    overlayDensity: 0.7,
    climaxBehavior: { peakSaturation: 0.45 },
  },

  "mamatried": {
    preferredModes: ["vintage_film", "lo_fi_grain"],
    palette: { primary: 40, secondary: 170, saturation: 0.7 }, // dusty gold/sage
    overlayBoost: ["VWBusParade", "JerryGuitar"],
    moodKeywords: ["retro", "organic"],
    overlayDensity: 0.5,
    saturationOffset: -0.06,
  },

  "rowjimmy": {
    preferredModes: ["deep_ocean", "aurora", "liquid_light", "diffraction_rings", "voronoi_flow", "smoke_rings"],
    palette: { primary: 210, secondary: 270, saturation: 0.65, brightness: 0.9 }, // ocean blue/lavender
    overlayBoost: ["Fireflies", "RoseOverlay", "SacredGeometry"],
    overlaySuppress: ["LaserShow", "ParticleExplosion", "CrowdDance"],
    moodKeywords: ["contemplative", "organic"],
    overlayDensity: 0.4,
    hueShift: -8,
    saturationOffset: -0.08,
    climaxBehavior: { peakBrightness: 0.25, peakSaturation: 0.4 },
  },

  "dancininthestreet": {
    preferredModes: ["concert_lighting", "tie_dye", "inferno", "plasma_field"],
    palette: { primary: 350, secondary: 55, saturation: 1.0 }, // magenta/gold
    overlayBoost: ["BearParade", "LaserShow", "CrowdDance"],
    moodKeywords: ["festival", "intense"],
    overlayDensity: 1.4,
    climaxBehavior: { peakSaturation: 0.55, flash: true, climaxDensityMult: 1.8 },
  },

  "drumsspace": {
    preferredModes: ["cosmic_voyage", "crystal_cavern", "deep_ocean", "feedback_recursion", "morphogenesis", "neural_web"],
    palette: { primary: 260, secondary: 180, saturation: 0.5, brightness: 0.8 }, // deep indigo/teal
    overlayBoost: ["DarkStarPortal", "SacredGeometry", "CosmicStarfield", "DrumCircle"],
    overlaySuppress: ["BearParade", "VWBusParade", "CrowdDance", "SkeletonBand"],
    moodKeywords: ["cosmic", "contemplative"],
    overlayDensity: 0.3,
    hueShift: -20,
    saturationOffset: -0.12,
    climaxBehavior: { peakBrightness: 0.2, peakSaturation: 0.4 },
    drumsSpaceShaders: {
      drums_tribal: "electric_arc",
      space_ambient: "morphogenesis",
      transition: "voronoi_flow",
    },
  },

  "onemoresaturdaynight": {
    preferredModes: ["concert_lighting", "inferno", "tie_dye", "lava_flow"],
    palette: { primary: 20, secondary: 320, saturation: 1.0 }, // warm orange/magenta
    overlayBoost: ["BearParade", "ParticleExplosion", "LaserShow", "SkeletonBand"],
    moodKeywords: ["festival", "intense"],
    overlayDensity: 1.5,
    climaxBehavior: { peakSaturation: 0.55, flash: true, climaxDensityMult: 1.8 },
  },
};

// ─── Title Normalization ───

/** Strip non-alphanumeric, lowercase — matches media-resolver.ts pattern */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Extended title aliases for song lookup (normalized form → registry key) */
const SONG_ALIASES: Record<string, string> = {
  // Common abbreviations and alternate names
  "nfa": "notfadeaway",
  "fotm": "fireonthemountain",
  "eotw": "eyesoftheworld",
  "pitb": "playingintheband",
  "ujb": "unclejohnsband",
  "chinacatsunfloweriknowourider": "chinacatsunflower",
  "chinacat": "chinacatsunflower",
  "chinacat sunflower": "chinacatsunflower",
  "rider": "iknowyourider",
  "iknowurider": "iknowyourider",
  "scarlet": "scarletbegonias",
  "fire": "fireonthemountain",
  "fireinthemountain": "fireonthemountain",
  "estimated": "estimatedprophet",
  "terrapin": "terrapinstation",
  "terrapinstationmedley": "terrapinstation",
  "playing": "playingintheband",
  "playinintheband": "playingintheband",
  "theother one": "theotherone",
  "otherone": "theotherone",
  "wharf": "wharfrat",
  "stella": "stellablue",
  "bird": "birdsong",
  "birdsong": "birdsong",
  "birdssong": "birdsong",
  "sugar": "sugarmagnolia",
  "sugarmagnoliesunshine": "sugarmagnolia",
  "magnolia": "sugarmagnolia",
  "trucking": "truckin",
  "fotd": "friendofthedevil",
  "devil": "friendofthedevil",
  "dew": "morningdew",
  "helpslipfranklin": "helpontheway",
  "helpslipfrank": "helpontheway",
  "helpontheway": "helpontheway",
  "slipknot!": "slipknot",
  "franklins": "franklinstower",
  "ststephen": "ststephen",
  "saintstephen": "ststephen",
  "shakedown": "shakedownstreet",
  "casey": "caseyjones",
  "darkstar": "darkstar",
  "dark star": "darkstar",
  // Cornell setlist aliases
  "minglewood": "newminglewoodblues",
  "newminglewood": "newminglewoodblues",
  "minglewoodblues": "newminglewoodblues",
  "elpaso": "elpaso",
  "el paso": "elpaso",
  "tleo": "theyloveeachother",
  "theyloveechother": "theyloveeachother",
  "jack": "jackstraw",
  "lazy": "lazylightnin",
  "lazylightning": "lazylightnin",
  "lazylightnin": "lazylightnin",
  "supplication": "supplication",
  "bew": "browneyedwomen",
  "browneyed": "browneyedwomen",
  "browneyedwomen": "browneyedwomen",
  "mama": "mamatried",
  "mamatried": "mamatried",
  "rowjimmy": "rowjimmy",
  "row": "rowjimmy",
  "dancin": "dancininthestreet",
  "dancinginthestreet": "dancininthestreet",
  "dancininthestreets": "dancininthestreet",
  "drums": "drumsspace",
  "space": "drumsspace",
  "drumsspace": "drumsspace",
  "drums space": "drumsspace",
  "omsn": "onemoresaturdaynight",
  "saturdaynight": "onemoresaturdaynight",
  "onemore": "onemoresaturdaynight",
};

// ─── Lookup ───

/**
 * Look up a song's visual identity by title.
 * Handles normalization and aliases for flexible matching.
 * Returns undefined for songs without curated identities (fallback to defaults).
 */
export function lookupSongIdentity(title: string): SongIdentity | undefined {
  const normalized = normalizeTitle(title);

  // Direct match
  if (SONG_IDENTITIES[normalized]) {
    return SONG_IDENTITIES[normalized];
  }

  // Alias match
  const aliased = SONG_ALIASES[normalized];
  if (aliased && SONG_IDENTITIES[aliased]) {
    return SONG_IDENTITIES[aliased];
  }

  return undefined;
}

// ─── Fallback Identity Generation ───

/**
 * Generate a fallback identity from audio analysis when no curated identity exists.
 * Derives visual parameters from the song's acoustic profile so that every song
 * gets a reasonable visual personality even without manual curation.
 *
 * Heuristics:
 * - Palette primary hue derived from spectral centroid (bright → warm, dark → cool)
 * - Secondary hue is a triadic complement (+120 degrees)
 * - Saturation from spectral flatness (tonal → saturated, noisy → desaturated)
 * - Preferred modes from energy level and tempo
 * - Mood keywords from combined acoustic features
 */
export function generateFallbackIdentity(
  trackId: string,
  title: string,
  meta: TrackMeta,
  frames: EnhancedFrameData[],
): SongIdentity {
  if (frames.length === 0) {
    // Degenerate case: no frames — return a neutral identity
    return {
      preferredModes: ["liquid_light", "oil_projector"],
      palette: { primary: 200, secondary: 320, saturation: 0.8 },
      moodKeywords: [],
    };
  }

  // 1. Compute average acoustic features across all frames
  const avgEnergy = frames.reduce((sum, f) => sum + f.rms, 0) / frames.length;
  const avgCentroid = frames.reduce((sum, f) => sum + f.centroid, 0) / frames.length;
  const avgFlatness = frames.reduce((sum, f) => sum + f.flatness, 0) / frames.length;
  const avgSub = frames.reduce((sum, f) => sum + f.sub, 0) / frames.length;
  const tempo = meta.tempo;

  // 2. Derive palette from centroid (bright songs = warm hue)
  //    Map centroid 0-1 to hue degrees: low centroid → cool blue (216°), high → warm orange (29°)
  const primaryHue = Math.round(216 - avgCentroid * 187); // 29° (warm) to 216° (cool)
  //    Secondary: triadic complement (+120°)
  const secondaryHue = (primaryHue + 120) % 360;
  //    Saturation from flatness: tonal (low flatness) → high saturation
  const saturation = 0.7 + (1.0 - avgFlatness) * 0.3;

  // 3. Derive preferred modes from energy and tempo
  const preferredModes: VisualMode[] = [];
  if (avgEnergy > 0.25) {
    preferredModes.push("liquid_light", "inferno", "electric_arc", "plasma_field");
    if (tempo > 140) preferredModes.push("concert_lighting");
  } else if (avgEnergy > 0.12) {
    preferredModes.push("oil_projector", "cosmic_voyage", "voronoi_flow", "morphogenesis");
    if (avgSub > 0.3) preferredModes.push("deep_ocean");
  } else {
    preferredModes.push("aurora", "deep_ocean", "stained_glass");
    if (avgFlatness > 0.4) preferredModes.push("void_light");
    else preferredModes.push("cosmic_dust");
  }

  // 4. Derive mood keywords
  const keywords: OverlayTag[] = [];
  if (avgEnergy > 0.25) keywords.push("intense", "energetic");
  else if (avgEnergy > 0.12) keywords.push("flowing", "dynamic");
  else keywords.push("contemplative", "ethereal");

  if (avgSub > 0.3) keywords.push("deep");
  if (avgCentroid > 0.5) keywords.push("bright");
  if (avgFlatness > 0.4) keywords.push("textural");
  if (tempo > 140) keywords.push("driving");
  else if (tempo < 90) keywords.push("spacious");

  // 5. Build the identity — no transition overrides or D/S shaders for fallbacks
  return {
    preferredModes,
    palette: {
      primary: primaryHue,
      secondary: secondaryHue,
      saturation,
    },
    moodKeywords: keywords,
  };
}

/**
 * Look up a curated song identity, falling back to auto-generation from audio data.
 * Always returns a SongIdentity — either curated or derived from acoustic features.
 *
 * Use this when audio analysis data is available and you want guaranteed identity.
 * For cases where audio data is not available, use `lookupSongIdentity()` instead.
 */
export function getOrGenerateSongIdentity(
  trackId: string,
  title: string,
  meta: TrackMeta,
  frames: EnhancedFrameData[],
): SongIdentity {
  return lookupSongIdentity(title) ?? generateFallbackIdentity(trackId, title, meta, frames);
}
