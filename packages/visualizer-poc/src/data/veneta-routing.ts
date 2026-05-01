/**
 * Veneta Routing — show-specific song identities for the Veneta 8/27/72 show
 * (Sunshine Daydream, Old Renaissance Faire Grounds, Veneta, Oregon).
 *
 * This file overrides the default song identities for ALL 21 songs in the
 * Veneta setlist. Each song gets:
 *
 *   1. SHADER FAMILY: 3-5 related shaders that flow into each other naturally
 *      (anchor, jam variant, climax variant, contemplative variant)
 *
 *   2. CURATED OVERLAY POOL with 4 role categories:
 *      - SOUL overlays (1-2): song-specific identity (SugareeRose for Sugaree)
 *      - SHOW overlays (4-5): always present in Veneta (sun, heat, swimmers)
 *      - GENERAL overlays (2-4): variety without breaking mood
 *      - CULTURE overlays (1-2): Dead identity (stealies, bears)
 *
 *   3. PALETTE & MOOD calibrated to the song's character
 *
 * The 5 SHOW overlays present in EVERY song's pool (the visual signature
 * of Veneta itself):
 *   - OregonSunBlaze (the 100°F sun, defining experience)
 *   - HeatShimmer (rising heat distortion)
 *   - VenetaSwimmers (naked hippies in the river)
 *   - RenaissanceFaireBanner (medieval pageantry of the venue)
 *   - SunshineDaydreamCamera (the documentary being filmed)
 *
 * Plus OregonMeadow appears in many songs as ambient ground.
 *
 * Usage:
 *   import { isVenetaShow, getVenetaSongIdentity } from "./veneta-routing";
 *   if (isVenetaShow(showDate)) {
 *     const identity = getVenetaSongIdentity(songTitle) ?? lookupSongIdentity(songTitle);
 *   }
 */

import type { SongIdentity } from "./song-identities";

// ─── Veneta show identifier ───

/** Show date that triggers Veneta routing. */
export const VENETA_SHOW_DATE = "1972-08-27";

/** Returns true if the given show date is the Veneta 8/27/72 show. */
export function isVenetaShow(showDate?: string): boolean {
  if (!showDate) return false;
  return showDate === VENETA_SHOW_DATE || showDate.includes("1972-08-27");
}

// ─── Show-level overlays present in every song's pool ───

/**
 * Overlays that should be heavily boosted in EVERY Veneta song.
 * These are the visual signature of the show itself.
 */
export const VENETA_SHOW_OVERLAYS: string[] = [
  "OregonSunBlaze",
  "HeatShimmer",
  "VenetaSwimmers",
  "RenaissanceFaireBanner",
  "SunshineDaydreamCamera",
];

// ─── Veneta-Specific Song Identities ───

/**
 * Each song's complete visual identity for the Veneta show.
 * Overrides the default Grateful Dead identities when the show date matches.
 *
 * Shader family is encoded in preferredModes — the rotation engine picks
 * from these based on energy/section. Order matters: anchor first, then
 * jam variant, climax variant, contemplative variant.
 */
export const VENETA_SONG_IDENTITIES: Record<string, SongIdentity> = {
  // ═══ SET 1 ═══

  /** "The Promised Land" — Chuck Berry cover, road trip opener */
  promisedland: {
    preferredModes: [
      "highway_horizon", // anchor — driving energy
      "neon_grid", // jam — synthwave road
      "ember_meadow", // bridge — warm organic
      "desert_road", // contemplative — open landscape
      "climax_surge", // climax
    ],
    palette: { primary: 35, secondary: 200, saturation: 1.0 },
    overlayBoost: [
      // Soul
      "LiquidLightBorder",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "TieDyeWash",
      "MeteorShower",
    ],
    overlayDensity: 1.0,
    moodKeywords: ["festival", "intense"],
    narrativeArc: "celebration",
    thematicTags: ["road", "opener", "rolling"],
    transitionOut: "morph",
  },

  /** "Sugaree" — wistful warm love song */
  sugaree: {
    preferredModes: [
      "warm_nebula", // anchor — wistful warmth
      "amber_drift", // bridge — slow contemplative
      "fluid_light", // jam — flowing
      "aurora_curtains", // climax — bright warm
      "scarlet_golden_haze", // alt — golden
    ],
    palette: { primary: 15, secondary: 340, saturation: 0.95 },
    overlayBoost: [
      // Soul
      "Fireflies",
      "GodRays",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "Fireflies",
      "FibonacciSpiral",
    ],
    overlayDensity: 1.1,
    moodKeywords: ["contemplative", "organic", "dead-culture"],
    narrativeArc: "story_arc",
    thematicTags: ["wistful", "love", "warm"],
    transitionOut: "dissolve",
  },

  /** "Me And My Uncle" — cowboy murder ballad */
  meandmyuncle: {
    preferredModes: [
      "desert_road", // anchor — cowboy country
      "warm_nebula", // jam — warm dust
      "ember_meadow", // bridge
      "scarlet_golden_haze", // alt
    ],
    palette: { primary: 25, secondary: 195, saturation: 0.9 },
    overlayBoost: [
      // Soul
      "SmokeWisps",
      "HeatShimmer",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General
      "OregonSunBlaze",
    ],
    overlayDensity: 0.9,
    moodKeywords: ["organic", "festival"],
    narrativeArc: "story_arc",
    thematicTags: ["cowboy", "western", "outlaw"],
  },

  /** "Deal" — gambling song */
  deal: {
    preferredModes: [
      "neon_casino", // anchor — gambling energy
      "neon_grid", // jam
      "spectral_bridge", // bridge
      "ember_meadow", // contemplative
      "climax_surge", // climax
    ],
    palette: { primary: 350, secondary: 180, saturation: 1.0 },
    overlayBoost: [
      // Soul
      "KaleidoscopeFilter",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General
      "TieDyeWash",
      "MeteorShower",
      "FibonacciSpiral",
    ],
    overlayDensity: 1.0,
    moodKeywords: ["festival", "intense"],
    narrativeArc: "celebration",
    thematicTags: ["gambling", "warning", "rolling"],
  },

  /** "Black Throated Wind" — Bob Weir wind/road song */
  blackthroatedwind: {
    preferredModes: [
      "desert_road", // anchor — windswept road
      "warm_nebula", // contemplative
      "stark_minimal", // bridge — solitude
      "spectral_bridge", // jam
    ],
    palette: { primary: 20, secondary: 220, saturation: 0.85 },
    overlayBoost: [
      // Soul
      "FogBank",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "TieDyeWash",
    ],
    overlayDensity: 0.9,
    moodKeywords: ["contemplative", "organic"],
    narrativeArc: "story_arc",
    thematicTags: ["road", "wind", "freedom"],
  },

  /** "China Cat Sunflower" — psychedelic feline */
  chinacatsunflower: {
    preferredModes: [
      "warm_nebula", // anchor — warm wistful
      "fluid_light", // jam — flowing
      "ember_meadow", // bridge
      "aurora_curtains", // climax
      "scarlet_golden_haze", // alt
    ],
    palette: { primary: 50, secondary: 320, saturation: 1.0 },
    overlayBoost: [
      // Soul (China Cat has its own overlay!)
      "PrismRainbow",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "Fireflies",
      "FibonacciSpiral",
      "TieDyeWash",
    ],
    overlayDensity: 1.2,
    moodKeywords: ["psychedelic", "organic", "dead-culture"],
    narrativeArc: "energy_cycle",
    thematicTags: ["psychedelic", "feline", "iconic"],
    transitionOut: "morph", // segues into I Know You Rider
  },

  /** "I Know You Rider" — train traveling song (paired with China Cat) */
  iknowyourider: {
    preferredModes: [
      "neon_grid", // anchor — locomotion
      "highway_horizon", // jam
      "warm_nebula", // bridge
      "climax_surge", // climax — peak
      "ember_meadow", // contemplative
    ],
    palette: { primary: 40, secondary: 200, saturation: 1.0 },
    overlayBoost: [
      // Soul (THE iconic train imagery)
      "MeteorShower",
      "LiquidLightBorder",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "TieDyeWash",
    ],
    overlayDensity: 1.2,
    moodKeywords: ["festival", "intense", "dead-culture"],
    narrativeArc: "build_to_climax",
    thematicTags: ["train", "rolling", "iconic"],
    climaxBehavior: { peakSaturation: 0.6, flash: true },
    transitionIn: "morph",
  },

  /** "Mexicali Blues" — Bob Weir Mexico/border song */
  mexicaliblues: {
    preferredModes: [
      "desert_road", // anchor
      "warm_nebula", // jam
      "ember_meadow", // bridge
      "scarlet_golden_haze", // alt
    ],
    palette: { primary: 30, secondary: 170, saturation: 0.95 },
    overlayBoost: [
      // Soul
      "HeatShimmer",
      "SmokeWisps",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "TieDyeWash",
    ],
    overlayDensity: 1.0,
    moodKeywords: ["retro", "festival"],
    narrativeArc: "story_arc",
    thematicTags: ["mexico", "border", "warm"],
  },

  /** "SmokeWisps" — peppy Dead anthem */
  bertha: {
    preferredModes: [
      "warm_nebula", // anchor
      "fluid_light", // jam
      "aurora_curtains", // climax
      "ember_meadow", // bridge
      "spectral_bridge", // alt
    ],
    palette: { primary: 25, secondary: 320, saturation: 1.0 },
    overlayBoost: [
      // Soul
      "SmokeWisps",
      "FibonacciSpiral",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "FibonacciSpiral",
      "TieDyeWash",
    ],
    overlayDensity: 1.2,
    moodKeywords: ["dead-culture", "festival"],
    narrativeArc: "celebration",
    thematicTags: ["iconic", "rolling", "dead-culture"],
  },

  // ═══ SET 2 ═══

  /** "Playing In The Band" — improv jam vehicle */
  playingintheband: {
    preferredModes: [
      "fluid_light", // anchor — flowing improv
      "spectral_bridge", // jam — universal
      "warm_nebula", // contemplative
      "kaleidoscope", // exploration
      "void_light", // bridge — abstract
    ],
    palette: { primary: 45, secondary: 280, saturation: 0.95 },
    overlayBoost: [
      // Soul
      "KaleidoscopeFilter",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "FibonacciSpiral",
      "TieDyeWash",
    ],
    overlayDensity: 1.1,
    moodKeywords: ["psychedelic", "festival"],
    narrativeArc: "jam_vehicle",
    thematicTags: ["improvisation", "exploration"],
  },

  /** "He's Gone" — sad farewell song */
  hesgone: {
    preferredModes: [
      "obsidian_mirror", // anchor — quiet stillness
      "stark_minimal", // bridge
      "amber_drift", // contemplative warm
      "warm_nebula", // gentle
      "ink_wash", // somber
    ],
    palette: { primary: 220, secondary: 30, saturation: 0.7 },
    overlayBoost: [
      // Soul
      "SmokeWisps",
      "CosmicStarfield",
      // Show (slightly suppressed for somber mood)
      "OregonSunBlaze",
      "HeatShimmer",
      "RenaissanceFaireBanner",
      // General + Culture
      "HeatShimmer",
      "FibonacciSpiral",
    ],
    overlaySuppress: ["MeteorShower", "TieDyeWash"],
    overlayDensity: 0.7, // sparse — mournful
    moodKeywords: ["contemplative", "organic"],
    narrativeArc: "elegy",
    thematicTags: ["loss", "farewell", "tender"],
    visualPacing: { introBreathingFrames: 600, buildRate: 0.5, climaxStyle: "subtle" },
  },

  /** "Jack Straw" — outlaw story, train robbery */
  jackstraw: {
    preferredModes: [
      "highway_horizon", // anchor
      "desert_road", // jam
      "warm_nebula", // bridge
      "climax_surge", // climax — peak duet
      "neon_grid", // alt
    ],
    palette: { primary: 30, secondary: 200, saturation: 1.0 },
    overlayBoost: [
      // Soul
      "HeatShimmer",
      "SmokeWisps",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "TieDyeWash",
    ],
    overlayDensity: 1.1,
    moodKeywords: ["intense", "festival"],
    narrativeArc: "build_to_climax",
    thematicTags: ["outlaw", "western", "dueling"],
    climaxBehavior: { peakSaturation: 0.5, flash: true },
  },

  /** "Bird Song" — Janis tribute, soaring contemplative */
  birdsong: {
    preferredModes: [
      "warm_nebula", // anchor — soaring
      "amber_drift", // contemplative
      "aurora_curtains", // jam — flowing
      "fluid_light", // alt
      "scarlet_golden_haze", // climax
    ],
    palette: { primary: 40, secondary: 200, saturation: 0.9 },
    overlayBoost: [
      // Soul
      "CosmicStarfield",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "Fireflies",
      "FibonacciSpiral",
    ],
    overlaySuppress: ["MeteorShower"],
    overlayDensity: 0.9,
    moodKeywords: ["contemplative", "organic"],
    narrativeArc: "meditative_journey",
    thematicTags: ["tender", "tribute", "soaring"],
    visualPacing: { introBreathingFrames: 450, buildRate: 0.7, climaxStyle: "transcendent" },
  },

  /** "Greatest Story Ever Told" — biblical/mythical Bob Weir song */
  greateststoryevertold: {
    preferredModes: [
      "sacred_geometry", // anchor — biblical
      "ember_meadow", // bridge
      "warm_nebula", // jam
      "climax_surge", // climax
      "fractal_temple", // alt
    ],
    palette: { primary: 45, secondary: 280, saturation: 0.95 },
    overlayBoost: [
      // Soul
      "GodRays",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "FibonacciSpiral",
      "TieDyeWash",
    ],
    overlayDensity: 1.0,
    moodKeywords: ["intense", "festival"],
    narrativeArc: "build_to_climax",
    thematicTags: ["biblical", "mythical", "epic"],
    climaxBehavior: { peakSaturation: 0.5, flash: true },
  },

  /** "Drums / Space" — cosmic percussion exploration */
  drumsspace: {
    preferredModes: [
      "void_light", // anchor — cosmic
      "dark_star_void", // jam
      "obsidian_mirror", // bridge — stillness
      "spectral_bridge", // alt
      "creation", // contemplative
    ],
    palette: { primary: 270, secondary: 60, saturation: 0.85 },
    overlayBoost: [
      // Soul (Drums/Space has its own existing overlays)
      "SpaceDrums",
      "SpaceDrums",
      "SpaceDrums",
      // Show (only the most cosmic/atmospheric)
      "OregonSunBlaze",
      "HeatShimmer",
      "SunshineDaydreamCamera",
      // General + Culture
      "FibonacciSpiral",
      "DarkStarPortal",
    ],
    overlayDensity: 1.0,
    moodKeywords: ["cosmic", "psychedelic", "contemplative"],
    narrativeArc: "meditative_journey",
    thematicTags: ["percussion", "cosmic", "exploration"],
    drumsSpaceShaders: {
      drums_tribal: "void_light",
      transition: "creation",
      space_ambient: "dark_star_void",
      space_textural: "obsidian_mirror",
      space_melodic: "warm_nebula",
      reemergence: "void_light",
    },
  },

  // ═══ SET 3 ═══

  /** "Dark Star" — THE legendary Veneta Dark Star (33 minutes) */
  darkstar: {
    preferredModes: [
      "dark_star_void", // anchor
      "void_light", // exploration
      "creation", // build
      "warm_nebula", // contemplative
      "spectral_bridge", // transition
      "obsidian_mirror", // quiet
      "fluid_light", // jam peak
    ],
    palette: { primary: 270, secondary: 30, saturation: 0.9 },
    overlayBoost: [
      // Soul (Dark Star deepest cut: KeseyFurthur)
      "DarkStarPortal",
      "DarkStarAscent",
      // Show (Veneta-essential)
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "CosmicStarfield",
      "FibonacciSpiral",
      "SpaceDrums",
    ],
    overlayDensity: 0.4, // sparse — let deep feedback shader dominate
    moodKeywords: ["cosmic", "psychedelic", "dead-culture"],
    narrativeArc: "meditative_journey",
    thematicTags: ["cosmic", "exploration", "iconic", "veneta-defining"],
    visualPacing: { introBreathingFrames: 600, buildRate: 0.6, climaxStyle: "transcendent" },
    climaxBehavior: { peakSaturation: 0.4, peakBrightness: 0.2 },
    transitionOut: "morph", // → El Paso
  },

  /** "El Paso" — Marty Robbins cowboy ballad */
  elpaso: {
    preferredModes: [
      "desert_road", // anchor
      "warm_nebula", // jam
      "ember_meadow", // bridge
      "scarlet_golden_haze", // alt
    ],
    palette: { primary: 20, secondary: 350, saturation: 0.95 },
    overlayBoost: [
      // Soul
      "SmokeWisps",
      "HeatShimmer",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "TieDyeWash",
    ],
    overlayDensity: 1.0,
    moodKeywords: ["retro", "festival"],
    narrativeArc: "story_arc",
    thematicTags: ["cowboy", "love", "death"],
    transitionIn: "morph", // ← Dark Star
  },

  /** "Sing Me Back Home" — Merle Haggard prison song */
  singmebackhome: {
    preferredModes: [
      "obsidian_mirror", // anchor — somber stillness
      "stark_minimal", // bridge
      "amber_drift", // warm contemplative
      "warm_nebula", // gentle
      "ink_wash", // somber
    ],
    palette: { primary: 25, secondary: 220, saturation: 0.7 },
    overlayBoost: [
      // Soul
      "FogBank",
      "SmokeWisps",
      // Show (toned down)
      "OregonSunBlaze",
      "HeatShimmer",
      "SunshineDaydreamCamera",
      // General + Culture
      "HeatShimmer",
      "FibonacciSpiral",
    ],
    overlaySuppress: ["MeteorShower", "TieDyeWash"],
    overlayDensity: 0.7,
    moodKeywords: ["contemplative", "organic"],
    narrativeArc: "elegy",
    thematicTags: ["prison", "death-row", "tender"],
    visualPacing: { introBreathingFrames: 600, buildRate: 0.5, climaxStyle: "subtle" },
  },

  /** "Sugar Magnolia" — Bob Weir's romantic anthem */
  sugarmagnolia: {
    preferredModes: [
      "ember_meadow", // anchor — golden hour meadow
      "warm_nebula", // jam
      "fluid_light", // climax — flowing
      "aurora_curtains", // alt
      "scarlet_golden_haze", // contemplative
    ],
    palette: { primary: 45, secondary: 320, saturation: 1.0 },
    overlayBoost: [
      // Soul
      "GodRays",
      "TieDyeWash",
      "PrismRainbow",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "MeteorShower",
    ],
    overlayDensity: 1.1,
    moodKeywords: ["festival", "organic", "dead-culture"],
    narrativeArc: "celebration",
    thematicTags: ["romantic", "joyous", "iconic"],
    climaxBehavior: { peakSaturation: 0.5 },
  },

  /** "Casey Jones" — train song with cocaine reference */
  caseyjones: {
    preferredModes: [
      "neon_grid", // anchor — locomotion
      "highway_horizon", // jam
      "ember_meadow", // bridge
      "climax_surge", // climax
      "warm_nebula", // contemplative
    ],
    palette: { primary: 30, secondary: 200, saturation: 1.0 },
    overlayBoost: [
      // Soul
      "LiquidLightBorder",
      "MeteorShower",
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture
      "HeatShimmer",
      "TieDyeWash",
      "MeteorShower",
    ],
    overlayDensity: 1.2,
    moodKeywords: ["festival", "intense", "dead-culture"],
    narrativeArc: "celebration",
    thematicTags: ["train", "warning", "iconic"],
    climaxBehavior: { peakSaturation: 0.55 },
  },

  /** "One More Saturday Night" — Saturday night party closer */
  onemoresaturdaynight: {
    preferredModes: [
      "neon_casino", // anchor — party energy
      "neon_grid", // jam
      "climax_surge", // climax
      "spectral_bridge", // alt
      "ember_meadow", // bridge
    ],
    palette: { primary: 350, secondary: 180, saturation: 1.0 },
    overlayBoost: [
      // Show
      ...VENETA_SHOW_OVERLAYS,
      // General + Culture (party!)
      "HeatShimmer",
      "MeteorShower",
      "TieDyeWash",
      "TieDyeWash",
      "FibonacciSpiral",
    ],
    overlayDensity: 1.3,
    moodKeywords: ["festival", "intense"],
    narrativeArc: "celebration",
    thematicTags: ["party", "joyous", "saturday-night"],
    climaxBehavior: { peakSaturation: 0.6, flash: true },
  },

  /** "And We Bid You Goodnight" — gospel a cappella closer */
  andwebidyougoodnight: {
    preferredModes: [
      "obsidian_mirror", // anchor — sacred stillness
      "amber_drift", // warm contemplative
      "warm_nebula", // gentle
      "stark_minimal", // bridge
      "sacred_geometry", // alt
    ],
    palette: { primary: 30, secondary: 220, saturation: 0.75 },
    overlayBoost: [
      // Soul
      "GodRays",
      // Show (gentle versions)
      "OregonSunBlaze",
      "HeatShimmer",
      "SunshineDaydreamCamera",
      // General + Culture
      "HeatShimmer",
      "FibonacciSpiral",
    ],
    overlaySuppress: ["MeteorShower", "TieDyeWash"],
    overlayDensity: 0.7,
    moodKeywords: ["contemplative", "organic", "dead-culture"],
    narrativeArc: "elegy",
    thematicTags: ["gospel", "farewell", "sacred"],
    visualPacing: { introBreathingFrames: 750, buildRate: 0.4, climaxStyle: "transcendent" },
    transitionIn: "dissolve",
    transitionOut: "void",
  },

};

// ─── Veneta-specific aliases (handle title variations) ───

export const VENETA_SONG_ALIASES: Record<string, string> = {
  // Common variations
  "promised land": "promisedland",
  "thepromisedland": "promisedland",
  "the promised land": "promisedland",
  "meandmyuncle": "meandmyuncle",
  "me and my uncle": "meandmyuncle",
  "blackthroatedwind": "blackthroatedwind",
  "black throated wind": "blackthroatedwind",
  "chinacatsunflower": "chinacatsunflower",
  "china cat sunflower": "chinacatsunflower",
  "chinacat": "chinacatsunflower",
  "iknowyourider": "iknowyourider",
  "i know you rider": "iknowyourider",
  "rider": "iknowyourider",
  "mexicaliblues": "mexicaliblues",
  "mexicali blues": "mexicaliblues",
  "playingintheband": "playingintheband",
  "playing in the band": "playingintheband",
  "playin": "playingintheband",
  "playin in the band": "playingintheband",
  "hesgone": "hesgone",
  "he's gone": "hesgone",
  "hes gone": "hesgone",
  "jackstraw": "jackstraw",
  "jack straw": "jackstraw",
  "birdsong": "birdsong",
  "bird song": "birdsong",
  "greateststoryevertold": "greateststoryevertold",
  "greatest story ever told": "greateststoryevertold",
  "greatest story": "greateststoryevertold",
  "drumsspace": "drumsspace",
  "drums space": "drumsspace",
  "drums/space": "drumsspace",
  "drums": "drumsspace",
  "space": "drumsspace",
  "darkstar": "darkstar",
  "dark star": "darkstar",
  "elpaso": "elpaso",
  "el paso": "elpaso",
  "singmebackhome": "singmebackhome",
  "sing me back home": "singmebackhome",
  "sugarmagnolia": "sugarmagnolia",
  "sugar magnolia": "sugarmagnolia",
  "sugarmag": "sugarmagnolia",
  "caseyjones": "caseyjones",
  "casey jones": "caseyjones",
  "onemoresaturdaynight": "onemoresaturdaynight",
  "one more saturday night": "onemoresaturdaynight",
  "saturdaynight": "onemoresaturdaynight",
  "andwebidyougoodnight": "andwebidyougoodnight",
  "and we bid you goodnight": "andwebidyougoodnight",
  "wewillsurvive": "andwebidyougoodnight",
  "bid you goodnight": "andwebidyougoodnight",
  "goodnight": "andwebidyougoodnight",
};

// ─── Lookup function ───

/**
 * Normalize a song title for lookup (lowercase, alphanumeric only).
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── JSON Override Layer (audit Wave 2.4: no-code show routing) ───
// data/shows/{date}/routing.json takes precedence over the inline TS
// VENETA_SONG_IDENTITIES so non-developers can iterate on visual direction.
// The inline TS stays as a fallback (and as canonical seed for `extract-show-routing.mts`).

let _jsonRoutingCache: Record<string, SongIdentity> | null = null;
let _jsonRoutingLoaded = false;

function loadShowRoutingJson(): Record<string, SongIdentity> | null {
  if (_jsonRoutingLoaded) return _jsonRoutingCache;
  _jsonRoutingLoaded = true;
  // Skip in browser/Remotion bundle — fs/path aren't available there.
  if (typeof window !== "undefined") return _jsonRoutingCache;
  try {
    // Hide require from webpack so it doesn't try to bundle fs.
    // eslint-disable-next-line no-eval
    const _require = eval("require");
    const fs = _require("fs");
    const path = _require("path");
    if (!fs || !path) return _jsonRoutingCache;
    const jsonPath = path.resolve(__dirname, "../../data/shows", VENETA_SHOW_DATE, "routing.json");
    if (!fs.existsSync(jsonPath)) return _jsonRoutingCache;
    const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as { songs?: Record<string, SongIdentity> };
    if (raw && raw.songs && typeof raw.songs === "object") {
      _jsonRoutingCache = raw.songs;
    }
  } catch {
    // Silent fall-through to TS defaults — expected in browser/Remotion bundle.
  }
  return _jsonRoutingCache;
}

/**
 * Look up a Veneta-specific song identity by title.
 * Returns undefined if no Veneta-specific identity exists for this song,
 * in which case the caller should fall back to the default lookupSongIdentity().
 *
 * Lookup order: routing.json (if present) → inline VENETA_SONG_IDENTITIES.
 *
 * Only call this when isVenetaShow(showDate) is true.
 */
export function getVenetaSongIdentity(title: string): SongIdentity | undefined {
  const normalized = normalizeTitle(title);
  const titleLower = title.toLowerCase().trim();

  const overrides = loadShowRoutingJson();

  // 1) JSON override layer
  if (overrides) {
    if (overrides[normalized]) return overrides[normalized];
    const aliased = VENETA_SONG_ALIASES[normalized];
    if (aliased && overrides[aliased]) return overrides[aliased];
    const aliasedDirect = VENETA_SONG_ALIASES[titleLower];
    if (aliasedDirect && overrides[aliasedDirect]) return overrides[aliasedDirect];
  }

  // 2) Inline TS fallback
  if (VENETA_SONG_IDENTITIES[normalized]) {
    return VENETA_SONG_IDENTITIES[normalized];
  }
  const aliased = VENETA_SONG_ALIASES[normalized];
  if (aliased && VENETA_SONG_IDENTITIES[aliased]) {
    return VENETA_SONG_IDENTITIES[aliased];
  }
  const aliasedDirect = VENETA_SONG_ALIASES[titleLower];
  if (aliasedDirect && VENETA_SONG_IDENTITIES[aliasedDirect]) {
    return VENETA_SONG_IDENTITIES[aliasedDirect];
  }

  return undefined;
}
