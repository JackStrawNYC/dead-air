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
import { seeded, seededShuffle } from "../utils/seededRandom";
import { hashString } from "../utils/hash";
import { deriveChromaPalette } from "../utils/chroma-palette";
import songIdentitiesJson from "./song-identities.json";

// ─── JSON Override Layer ───
// Dashboard edits write to data/song-identities.json; lookupSongIdentity checks it first.
// Uses dynamic require to avoid webpack bundling 'fs' in the browser context.

let jsonOverrides: Record<string, SongIdentity> | null = null;
let jsonOverridesLoaded = false;

function loadJsonOverrides(): Record<string, SongIdentity> | null {
  if (jsonOverridesLoaded) return jsonOverrides;
  jsonOverridesLoaded = true;
  try {
    // Dynamic require so webpack doesn't try to bundle 'fs' and 'path'
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = typeof require !== "undefined" ? require("fs") : null;
    const path = typeof require !== "undefined" ? require("path") : null;
    if (!fs || !path) return jsonOverrides;
    const jsonPath = path.resolve(__dirname, "../../data/song-identities.json");
    if (fs.existsSync(jsonPath)) {
      jsonOverrides = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    }
  } catch {
    // Silently fall through to TS defaults (expected in browser/Remotion bundle)
  }
  return jsonOverrides;
}

// ─── Types ───

export type TransitionStyle = "dissolve" | "morph" | "flash" | "void" | "radial_wipe" | "distortion_morph" | "luminance_key" | "kaleidoscope_dissolve" | "prismatic_split" | "chromatic_wipe" | "feedback_dissolve" | "spiral_vortex" | "interference_pattern" | "pixel_scatter" | "vine_grow" | "particle_scatter" | "gravity_well" | "curtain_rise";

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

/** Narrative arc type — shapes visual pacing throughout the song */
export type NarrativeArc =
  | "build_to_climax"
  | "meditative_journey"
  | "story_arc"
  | "energy_cycle"
  | "elegy"
  | "celebration"
  | "jam_vehicle";

export interface VisualPacing {
  /** Extra intro breathing frames (default 300) */
  introBreathingFrames?: number;
  /** Build rate: 0.5=slow, 1=normal, 2=fast */
  buildRate?: number;
  /** Climax visual style */
  climaxStyle?: "explosive" | "transcendent" | "sustained" | "subtle";
}

export interface SongIdentity {
  /** Preferred shader modes — show-seed narrows to 4 "show modes" that dominate selection (~80%) */
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
  /** Song narrative arc — shapes overlay density and shader routing */
  narrativeArc?: NarrativeArc;
  /** Thematic tags describing the song's story/mood */
  thematicTags?: string[];
  /** Visual pacing overrides */
  visualPacing?: VisualPacing;
}

// ─── Song Identity Registry (loaded from JSON) ───

export const SONG_IDENTITIES: Record<string, SongIdentity> =
  songIdentitiesJson as Record<string, SongIdentity>;

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
  // Phase 9 Wave 5 aliases
  "touchofgrey": "touchofgrey",
  "touch": "touchofgrey",
  "grey": "touchofgrey",
  "goingdowntheroad": "goingdowntheroad",
  "gdtrfb": "goingdowntheroad",
  "goingdowntheroadfeelinbad": "goingdowntheroad",
  "mississippihalfstep": "mississippihalfstep",
  "halfstep": "mississippihalfstep",
  "mississippi": "mississippihalfstep",
  "weatherreportsuite": "weatherreportsuite",
  "weatherreport": "weatherreportsuite",
  "wrs": "weatherreportsuite",
  "turnonthelovelight": "turnonthelovelight",
  "lovelight": "turnonthelovelight",
  "totll": "turnonthelovelight",
  "samsonanddelilah": "samsonanddelilah",
  "samson": "samsonanddelilah",
  "johnnybjgoode": "johnnybjgoode",
  "johnnybgoode": "johnnybjgoode",
  "johnny": "johnnybjgoode",
  "usblues": "usblues",
  "brokedownpalace": "brokedownpalace",
  "brokedown": "brokedownpalace",
  "blackpeter": "blackpeter",
  "cumberlandblues": "cumberlandblues",
  "cumberland": "cumberlandblues",
  "looselucy": "looselucy",
  "lucy": "looselucy",
  "direwolf": "direwolf",
  "dire": "direwolf",
  "comesametime": "comesametime",
  "itmusthavebeen": "itmusthavebeen",
  "itmusthavebeentheroses": "itmusthavebeen",
  "roses": "itmusthavebeen",
  // Fix 3: 50+ new song aliases
  "hesgone": "hesgone",
  "hes gone": "hesgone",
  "gone": "hesgone",
  "letitgrow": "letitgrow",
  "let it grow": "letitgrow",
  "themusicneverstopped": "themusicneverstopped",
  "musicneverstopped": "themusicneverstopped",
  "tmns": "themusicneverstopped",
  "cassidy": "cassidy",
  "rambleonrose": "rambleonrose",
  "ramble": "rambleonrose",
  "tennesseejed": "tennesseejed",
  "jed": "tennesseejed",
  "meandmyuncle": "meandmyuncle",
  "uncle": "meandmyuncle",
  "bigriver": "bigriver",
  "theeleven": "theeleven",
  "eleven": "theeleven",
  "atticsofmylife": "atticsofmylife",
  "attics": "atticsofmylife",
  "shipoffools": "shipoffools",
  "ship": "shipoffools",
  "peggyo": "peggyo",
  "peggy": "peggyo",
  "chinadoll": "chinadoll",
  "blackmuddyriver": "blackmuddyriver",
  "muddy": "blackmuddyriver",
  "mexicaliblues": "mexicaliblues",
  "mexicali": "mexicaliblues",
  "bigrailroadblues": "bigrailroadblues",
  "railroad": "bigrailroadblues",
  "candyman": "candyman",
  "hightime": "hightime",
  "tolaymedown": "tolaymedown",
  "laymedown": "tolaymedown",
  "standingonthemoon": "standingonthemoon",
  "standing": "standingonthemoon",
  "somanyroads": "somanyroads",
  "daysbetween": "daysbetween",
  "days": "daysbetween",
  "liberty": "liberty",
  "foolishheart": "foolishheart",
  "victimorthecrime": "victimorthecrime",
  "victim": "victimorthecrime",
  "crazyfingers": "crazyfingers",
  "herecomessunshine": "herecomessunshine",
  "sunshine": "herecomessunshine",
  "missionintherain": "missionintherain",
  "mission": "missionintherain",
  "crypticalenvelopment": "crypticalenvelopment",
  "cryptical": "crypticalenvelopment",
  "thatsitfortheotherone": "thatsitfortheotherone",
  "cosmiccharlie": "cosmiccharlie",
  "alligator": "alligator",
  "caution": "caution",
  "cautiondontsteponthetrax": "caution",
  "newpotatocaboose": "newpotatocaboose",
  "potato": "newpotatocaboose",
  "clementine": "clementine",
  "mountainsofthemoon": "mountainsofthemoon",
  "mountains": "mountainsofthemoon",
  "dupreesdiamondblues": "dupreesdiamondblues",
  "duprees": "dupreesdiamondblues",
  "sageandspirit": "sageandspirit",
  "sage": "sageandspirit",
  "ikoiko": "ikoiko",
  "iko": "ikoiko",
  "wangdangdoodle": "wangdangdoodle",
  "staggerlee": "staggerlee",
  "stagger": "staggerlee",
  "sambaintherain": "sambaintherain",
  "samba": "sambaintherain",
  "prideofcucamonga": "prideofcucamonga",
  "cucamonga": "prideofcucamonga",
};

// ─── Lookup ───

/**
 * Look up a song's visual identity by title.
 * Handles normalization and aliases for flexible matching.
 * Returns undefined for songs without curated identities (fallback to defaults).
 */
export function lookupSongIdentity(title: string): SongIdentity | undefined {
  const normalized = normalizeTitle(title);

  // 1. Check JSON overrides first (dashboard-edited)
  const overrides = loadJsonOverrides();
  if (overrides) {
    if (overrides[normalized]) return overrides[normalized];
    const aliased = SONG_ALIASES[normalized];
    if (aliased && overrides[aliased]) return overrides[aliased];
  }

  // 2. Fall back to TS defaults
  if (SONG_IDENTITIES[normalized]) {
    return SONG_IDENTITIES[normalized];
  }

  const aliased = SONG_ALIASES[normalized];
  if (aliased && SONG_IDENTITIES[aliased]) {
    return SONG_IDENTITIES[aliased];
  }

  return undefined;
}

/**
 * Narrow a song's preferred modes to a show-specific subset.
 * From 7 preferred → `count` "show modes" per song per show.
 * Deterministic: same seed + title = same subset every time.
 */
export function getShowModesForSong(
  preferredModes: VisualMode[],
  showSeed: number,
  songTitle: string,
  count = 4,
): VisualMode[] {
  if (preferredModes.length <= count) return [...preferredModes];
  return seededShuffle(preferredModes, showSeed + hashString(songTitle) + 0x50DE)
    .slice(0, count);
}

/**
 * Pick a song's base shader mode from its preferredModes using the show seed.
 * Same show seed + same title → same mode. Different show seed → different mode.
 * Picks from the narrowed show-mode subset (4 of 7) for stronger show-to-show variety.
 * Falls back to defaultMode when no identity or empty preferredModes.
 */
export function resolveSongMode(
  title: string,
  defaultMode: VisualMode,
  showSeed: number,
): VisualMode {
  const identity = lookupSongIdentity(title);
  if (!identity?.preferredModes?.length) return defaultMode;
  const showModes = getShowModesForSong(identity.preferredModes, showSeed, title);
  const rng = seeded(showSeed + hashString(title) + 0x50DF); // different salt than shuffle
  return showModes[Math.floor(rng() * showModes.length)];
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

  // 2. Derive palette from chroma content (musically-meaningful colors)
  const chromaPalette = deriveChromaPalette(frames);

  // 3. Derive preferred modes from energy and tempo
  const preferredModes: VisualMode[] = [];
  if (avgEnergy > 0.25) {
    preferredModes.push("liquid_light", "inferno", "electric_arc", "plasma_field", "solar_flare", "databend");
    if (tempo > 140) preferredModes.push("concert_lighting");
  } else if (avgEnergy > 0.12) {
    preferredModes.push("oil_projector", "cosmic_voyage", "voronoi_flow", "morphogenesis", "galaxy_spiral", "warp_field", "mycelium_network");
    if (avgSub > 0.3) preferredModes.push("deep_ocean");
  } else {
    preferredModes.push("aurora", "deep_ocean", "stained_glass", "ink_wash", "coral_reef");
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

  // 5. Compute peak energy ratio + dominant chroma index
  let peakCount = 0;
  const chromaSums = new Array(12).fill(0);
  for (const frame of frames) {
    if (frame.rms > 0.25) peakCount++;
    for (let c = 0; c < 12; c++) {
      chromaSums[c] += frame.chroma[c];
    }
  }
  const peakEnergyRatio = peakCount / frames.length;
  let dominantChromaIdx = 0;
  for (let c = 1; c < 12; c++) {
    if (chromaSums[c] > chromaSums[dominantChromaIdx]) dominantChromaIdx = c;
  }

  // 6. Derive overlay density from energy — restrained: less is more
  const overlayDensity: number = avgEnergy > 0.25 ? 0.9 : avgEnergy < 0.12 ? 0.4 : 0.6;

  // 7. Derive climax behavior from peak energy ratio
  const climaxBehavior: SongIdentity["climaxBehavior"] = peakEnergyRatio > 0.4
    ? { peakSaturation: 0.6, peakBrightness: 0.25, flash: true, climaxDensityMult: 1.6 }
    : peakEnergyRatio > 0.2
    ? { peakSaturation: 0.5, peakBrightness: 0.15, flash: true }
    : { peakSaturation: 0.4, peakBrightness: 0.1 };

  // 8. Derive hue shift from dominant chroma (-15 to +15 degrees)
  const hueShift = Math.round((dominantChromaIdx / 12) * 30 - 15);

  // 9. Derive saturation offset from flatness
  const saturationOffset: number = avgFlatness > 0.4 ? -0.05 : avgFlatness < 0.15 ? 0.05 : 0;

  // 10. Derive overlay boost from audio character — Dead iconography matched to song feel
  //
  // Stem analysis: compute avg vocal/drum/guitar presence across the song
  const avgVocal = frames.reduce((s, f) => s + (f.stemVocalRms ?? 0), 0) / frames.length;
  const avgDrums = frames.reduce((s, f) => s + (f.stemDrumOnset ?? 0), 0) / frames.length;
  const avgGuitar = frames.reduce((s, f) => s + (f.stemOtherRms ?? 0), 0) / frames.length;
  const avgBass = frames.reduce((s, f) => s + (f.stemBassRms ?? 0), 0) / frames.length;

  const overlayBoost: string[] = [];

  // High energy rockers: bolt/lightning/pyrotechnics
  if (avgEnergy > 0.25 && tempo > 120) {
    overlayBoost.push("ThirteenPointBolt", "StealYourFaceOff", "LightningBoltOverlay");
    if (avgDrums > 0.15) overlayBoost.push("Pyrotechnics");
  }
  // High energy party songs: bears + lasers + skeleton band
  if (avgEnergy > 0.20 && tempo > 110) {
    overlayBoost.push("BearParade", "LaserShow", "SkeletonBand");
  }
  // Guitar-forward / Jerry songs: spotlight + stealie kaleidoscope
  if (avgGuitar > 0.15 && avgVocal > 0.08) {
    overlayBoost.push("JerrySpotlight", "StealYourFaceKaleidoscope");
  }
  // Groove/jam songs: terrapins march, skull kaleidoscope
  if (avgEnergy > 0.12 && avgEnergy < 0.25 && avgBass > 0.12) {
    overlayBoost.push("MarchingTerrapins", "DancingTerrapinOverlay", "SkullKaleidoscope");
  }
  // Contemplative / ballads: breathing stealie, skeleton roses, skeleton couple
  if (avgEnergy < 0.15) {
    overlayBoost.push("BreathingStealie", "SkeletonRoses", "SkeletonCouple", "StealieFade");
    if (avgVocal > 0.06) overlayBoost.push("JerrySpotlight");
  }
  // Cosmic / spacey: dark star portal, rainbow
  if (avgFlatness > 0.35 && avgEnergy < 0.20) {
    overlayBoost.push("DarkStarPortal", "RainbowArc", "PrismRainbow");
  }
  // Deep bass presence: wall of sound, fog laser
  if (avgBass > 0.20) {
    overlayBoost.push("WallOfSound", "FogLaser");
  }
  // Country/folk (low tempo, mid energy, vocal): sunflower stealie
  if (tempo < 120 && avgVocal > 0.08 && avgEnergy < 0.20) {
    overlayBoost.push("SunflowerStealie");
  }
  // Always include at least one sacred Dead icon
  if (overlayBoost.length === 0) {
    overlayBoost.push("BreathingStealie", "StealieFade");
  }
  // Deduplicate
  const uniqueBoost = [...new Set(overlayBoost)];

  // 11. Derive overlay suppress — keep HUD/spectral overlays out, suppress energy mismatches
  const overlaySuppress: string[] = [
    // HUD overlays should almost never appear via identity boost
    "SpectrumAnalyzer", "VUMeters", "Oscilloscope", "RadialSpectrum",
    "PianoRoll", "StemSeparation", "WaterfallSpectrogram",
  ];
  // Suppress high-energy overlays for quiet songs
  if (avgEnergy < 0.12) {
    overlaySuppress.push("LaserShow", "Pyrotechnics", "SpotlightFollow", "LightningBoltOverlay");
  }
  // Suppress contemplative overlays for rockers
  if (avgEnergy > 0.25) {
    overlaySuppress.push("SkeletonCouple", "StealieFade", "RainbowArc");
  }

  // 12. Build the identity
  return {
    preferredModes,
    palette: chromaPalette,
    moodKeywords: keywords,
    overlayDensity,
    climaxBehavior,
    hueShift,
    saturationOffset,
    overlayBoost: uniqueBoost.length > 0 ? uniqueBoost : undefined,
    overlaySuppress: overlaySuppress.length > 0 ? overlaySuppress : undefined,
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
