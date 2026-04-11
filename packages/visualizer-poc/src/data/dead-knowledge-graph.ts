/**
 * Dead Knowledge Graph — cultural intelligence about Grateful Dead shows.
 *
 * The engine reacts to audio but doesn't understand the cultural weight of
 * specific moments. "Scarlet Begonias" -> "Fire on the Mountain" is one of
 * the most anticipated transitions in a Dead show, but without this graph
 * the engine treats it like any other segue.
 *
 * This module encodes:
 *   - Famous segue pairs with visual treatment hints and significance scores
 *   - Song-specific peak moment knowledge (where climaxes typically happen)
 *   - Show structure roles (openers, closers, deep jam signals)
 *
 * All lookups use normalized titles (lowercase, strip non-alphanumeric) for
 * flexible matching against varied setlist formats.
 */

// ─── Types ───

/** Famous segue pairs with visual treatment hints */
export interface SegueKnowledge {
  from: string; // normalized song title
  to: string;
  /** Cultural significance (0-1). 1.0 = iconic (Scarlet->Fire), 0.5 = notable */
  significance: number;
  /** Visual treatment during the transition */
  treatment: "explosive" | "ethereal" | "building" | "seamless" | "dramatic";
  /** Description for debug/logging */
  description: string;
}

/** Song-specific peak moment knowledge */
export interface PeakMoment {
  song: string; // normalized
  /** When in the song this typically happens (0-1 progress) */
  typicalProgress: number;
  /** How significant this peak is (0-1) */
  significance: number;
  /** What kind of peak */
  type:
    | "jam_peak"
    | "vocal_climax"
    | "band_eruption"
    | "quiet_beauty"
    | "crowd_eruption";
  description: string;
}

/** Show-level knowledge */
export interface ShowStructureKnowledge {
  /** Songs that typically open Set 1 */
  set1Openers: string[];
  /** Songs that typically open Set 2 */
  set2Openers: string[];
  /** Songs that signal "the band is going deep" */
  deepJamSignals: string[];
  /** Songs that are always encore closers */
  encoreClosers: string[];
}

// ─── Title Normalization ───

/** Strip non-alphanumeric, lowercase — matches song-identities.ts pattern */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── Famous Segue Pairs ───

const SEGUE_KNOWLEDGE: SegueKnowledge[] = [
  // === Tier 1: Iconic (significance >= 0.9) ===
  {
    from: "scarletbegonias",
    to: "fireonthemountain",
    significance: 1.0,
    treatment: "explosive",
    description:
      "The most iconic segue in Dead history. The Bobby riff drops, the crowd erupts. Every Deadhead waits for this moment.",
  },
  {
    from: "chinacatsunflower",
    to: "iknowyourider",
    significance: 1.0,
    treatment: "seamless",
    description:
      "Inseparable since 1971. The jam dissolves China Cat into the galloping Rider groove — pure liquid transition.",
  },
  {
    from: "helpontheway",
    to: "slipknot",
    significance: 0.95,
    treatment: "building",
    description:
      "The opening salvo of the Help>Slip>Frank trilogy. Intricate composed passages give way to the rhythmic engine of Slipknot.",
  },
  {
    from: "slipknot",
    to: "franklinstower",
    significance: 0.95,
    treatment: "explosive",
    description:
      "Slipknot's coiled tension releases into Franklin's Tower's joyful sunrise. One of the great payoff moments.",
  },
  {
    from: "darkstar",
    to: "ststephen",
    significance: 0.9,
    treatment: "dramatic",
    description:
      "Dark Star's cosmic void suddenly crystallizes into St. Stephen's martial strut. The 1969 archetype.",
  },
  {
    from: "darkstar",
    to: "theotherone",
    significance: 0.9,
    treatment: "dramatic",
    description:
      "Two heavyweight jam vehicles collide. Dark Star's formlessness meets The Other One's driving chaos.",
  },
  {
    from: "ststephen",
    to: "theeleven",
    significance: 0.9,
    treatment: "explosive",
    description:
      "St. Stephen's 'one man gathers' section launches into The Eleven's frantic 11/8 time signature.",
  },
  {
    from: "ststephen",
    to: "notfadeaway",
    significance: 0.9,
    treatment: "explosive",
    description:
      "Stephen's rhythmic thrust transforms into the Bo Diddley beat of NFA. Classic late-60s pairing.",
  },

  // === Tier 2: Signature (significance 0.8-0.89) ===
  {
    from: "estimatedprophet",
    to: "eyesoftheworld",
    significance: 0.85,
    treatment: "building",
    description:
      "Estimated's apocalyptic intensity gradually thaws into the warm optimism of Eyes of the World.",
  },
  {
    from: "theotherone",
    to: "wharfrat",
    significance: 0.8,
    treatment: "ethereal",
    description:
      "The Other One's psychedelic storm calms into Wharf Rat's redemptive ballad. Contrast as art.",
  },
  {
    from: "playingintheband",
    to: "unclejohnsband",
    significance: 0.8,
    treatment: "ethereal",
    description:
      "Playing's expansive jam space narrows into Uncle John's focused folk harmony.",
  },
  {
    from: "playingintheband",
    to: "theotherone",
    significance: 0.8,
    treatment: "dramatic",
    description:
      "Playing's open jam dissolves into The Other One's frantic descent. Deep second set territory.",
  },
  {
    from: "theotherone",
    to: "morningdew",
    significance: 0.85,
    treatment: "dramatic",
    description:
      "The Other One's chaos gives way to Morning Dew's post-apocalyptic beauty. Devastating sequence.",
  },
  {
    from: "terrapinstation",
    to: "playingintheband",
    significance: 0.8,
    treatment: "building",
    description:
      "Terrapin's suite structure flows into Playing's open jam canvas. Late 70s signature.",
  },
  {
    from: "eyesoftheworld",
    to: "stellablue",
    significance: 0.8,
    treatment: "ethereal",
    description:
      "Eyes' dancing optimism fades into Stella Blue's melancholy. The emotional comedown.",
  },
  {
    from: "darkstar",
    to: "wharfrat",
    significance: 0.8,
    treatment: "ethereal",
    description:
      "Dark Star's void slowly condenses into Wharf Rat's humanity. The cosmic meets the earthbound.",
  },

  // === Tier 3: Notable (significance 0.6-0.79) ===
  {
    from: "hesgone",
    to: "truckin",
    significance: 0.75,
    treatment: "building",
    description:
      "He's Gone's mournful farewell builds into Truckin's road-worn resilience.",
  },
  {
    from: "truckin",
    to: "theotherone",
    significance: 0.75,
    treatment: "dramatic",
    description:
      "Truckin's boogie dissolves into The Other One's psychedelic undertow. Classic descent.",
  },
  {
    from: "notfadeaway",
    to: "goingdowntheroadfeelingbad",
    significance: 0.75,
    treatment: "explosive",
    description:
      "NFA's pounding beat seamlessly morphs into GDTRFB's singalong jubilation.",
  },
  {
    from: "birdsong",
    to: "letitgrow",
    significance: 0.7,
    treatment: "ethereal",
    description:
      "Bird Song's soaring lament descends into Let It Grow's meditative unfurling.",
  },
  {
    from: "letitgrow",
    to: "drums",
    significance: 0.65,
    treatment: "building",
    description:
      "Let It Grow winds down into the primal percussion of Drums.",
  },
  {
    from: "drums",
    to: "space",
    significance: 0.7,
    treatment: "ethereal",
    description:
      "Primal drumming dissolves into the electronic void of Space. The nightly ritual.",
  },
  {
    from: "drumsspace",
    to: "morningdew",
    significance: 0.85,
    treatment: "dramatic",
    description:
      "Space's alien soundscape gives birth to Morning Dew. The most devastating post-Drums emergence.",
  },
  {
    from: "scarletbegonias",
    to: "touchofgrey",
    significance: 0.6,
    treatment: "building",
    description:
      "Late-era pairing. Scarlet's optimism feeds into Touch of Grey's bittersweet resilience.",
  },
  {
    from: "sugarmagnolia",
    to: "sunshinedaydream",
    significance: 0.9,
    treatment: "explosive",
    description:
      "Sugar Magnolia's rock groove explodes into the coda of Sunshine Daydream. The ultimate party closer.",
  },
  {
    from: "samsonanddelilah",
    to: "theotherone",
    significance: 0.65,
    treatment: "building",
    description:
      "Samson's driving power transitions into The Other One's untethered exploration.",
  },
  {
    from: "weatherreportsuite",
    to: "letitgrow",
    significance: 0.8,
    treatment: "building",
    description:
      "Weather Report Suite's structured beauty blooms into Let It Grow's expansive jam.",
  },
  {
    from: "darkstar",
    to: "morningdew",
    significance: 0.9,
    treatment: "dramatic",
    description:
      "Two of the heaviest songs in the repertoire linked. Dark Star births Morning Dew from the void.",
  },
  {
    from: "theotherone",
    to: "stellablue",
    significance: 0.7,
    treatment: "ethereal",
    description:
      "The Other One's frenzy dissolves into Stella Blue's aching beauty.",
  },
  {
    from: "playingintheband",
    to: "drums",
    significance: 0.65,
    treatment: "building",
    description:
      "Playing's open jam space hands off to the primal percussion of Drums.",
  },
];

// Build lookup map: "from→to" → SegueKnowledge
const segueMap = new Map<string, SegueKnowledge>();
for (const segue of SEGUE_KNOWLEDGE) {
  segueMap.set(`${segue.from}→${segue.to}`, segue);
}

// ─── Peak Moments ───

const PEAK_MOMENTS: PeakMoment[] = [
  // Dark Star — the cosmic centerpiece
  {
    song: "darkstar",
    typicalProgress: 0.4,
    significance: 0.95,
    type: "jam_peak",
    description:
      "First jam peak — the band locks into a groove before dissolving into chaos.",
  },
  {
    song: "darkstar",
    typicalProgress: 0.65,
    significance: 0.85,
    type: "quiet_beauty",
    description:
      "The eye of the storm — a moment of stillness before the second verse or segue.",
  },

  // Playing in the Band
  {
    song: "playingintheband",
    typicalProgress: 0.5,
    significance: 0.9,
    type: "band_eruption",
    description:
      "The jam reaches peak intensity — all six musicians firing simultaneously.",
  },

  // Eyes of the World
  {
    song: "eyesoftheworld",
    typicalProgress: 0.3,
    significance: 0.75,
    type: "quiet_beauty",
    description:
      "The gentle introductory jam — Garcia's clean tone dancing over Phil's bass.",
  },
  {
    song: "eyesoftheworld",
    typicalProgress: 0.7,
    significance: 0.9,
    type: "jam_peak",
    description:
      "Eyes reaches full flight — the band locks into the groove and Garcia soars.",
  },

  // Wharf Rat
  {
    song: "wharfrat",
    typicalProgress: 0.6,
    significance: 0.85,
    type: "vocal_climax",
    description:
      "'I'll get up and fly away' — Garcia's voice breaks through with desperate hope.",
  },

  // Morning Dew
  {
    song: "morningdew",
    typicalProgress: 0.55,
    significance: 0.8,
    type: "vocal_climax",
    description:
      "'I guess it doesn't matter anyway' — the weight of the world in Garcia's voice.",
  },
  {
    song: "morningdew",
    typicalProgress: 0.8,
    significance: 1.0,
    type: "crowd_eruption",
    description:
      "The final guitar crescendo — Garcia pushes to the absolute limit. The crowd loses it.",
  },

  // Sugar Magnolia / Sunshine Daydream
  {
    song: "sugarmagnolia",
    typicalProgress: 0.85,
    significance: 0.9,
    type: "crowd_eruption",
    description:
      "The transition into Sunshine Daydream — pure euphoria, the crowd sings along.",
  },

  // Not Fade Away
  {
    song: "notfadeaway",
    typicalProgress: 0.3,
    significance: 0.7,
    type: "band_eruption",
    description:
      "The Bo Diddley beat locks in — the entire venue becomes a single pulse.",
  },
  {
    song: "notfadeaway",
    typicalProgress: 0.7,
    significance: 0.85,
    type: "crowd_eruption",
    description:
      "Peak audience participation — everyone chanting, clapping, singing.",
  },

  // St. Stephen
  {
    song: "ststephen",
    typicalProgress: 0.7,
    significance: 0.9,
    type: "band_eruption",
    description:
      "'One man gathers what another man spills' — the band hits the stop-time section.",
  },

  // The Other One
  {
    song: "theotherone",
    typicalProgress: 0.4,
    significance: 0.9,
    type: "jam_peak",
    description:
      "The first major jam peak — driving, relentless, Phil bombs shaking the floor.",
  },
  {
    song: "theotherone",
    typicalProgress: 0.75,
    significance: 0.8,
    type: "quiet_beauty",
    description:
      "The quiet passage — the band pulls back to near-silence before rebuilding.",
  },

  // Terrapin Station
  {
    song: "terrapinstation",
    typicalProgress: 0.35,
    significance: 0.8,
    type: "vocal_climax",
    description:
      "'Inspiration, move me brightly' — the suite's emotional centerpiece.",
  },
  {
    song: "terrapinstation",
    typicalProgress: 0.75,
    significance: 0.85,
    type: "band_eruption",
    description:
      "The At a Siding instrumental peak — the full band arrangement blooms.",
  },

  // Bird Song
  {
    song: "birdsong",
    typicalProgress: 0.55,
    significance: 0.85,
    type: "jam_peak",
    description:
      "Bird Song takes flight — Garcia's lead floats over the band's shimmering bed.",
  },
  {
    song: "birdsong",
    typicalProgress: 0.3,
    significance: 0.7,
    type: "quiet_beauty",
    description:
      "The gentle opening passages — 'all I know is something like a bird'.",
  },

  // Estimated Prophet
  {
    song: "estimatedprophet",
    typicalProgress: 0.65,
    significance: 0.85,
    type: "band_eruption",
    description:
      "'California!' — Weir's primal scream as the band reaches maximum intensity.",
  },

  // Truckin'
  {
    song: "truckin",
    typicalProgress: 0.6,
    significance: 0.75,
    type: "jam_peak",
    description:
      "The post-verses jam section — the band stretches out from the familiar structure.",
  },

  // Stella Blue
  {
    song: "stellablue",
    typicalProgress: 0.7,
    significance: 0.85,
    type: "vocal_climax",
    description:
      "'It all rolls into one' — Garcia's voice carries decades of weariness and beauty.",
  },
  {
    song: "stellablue",
    typicalProgress: 0.4,
    significance: 0.7,
    type: "quiet_beauty",
    description:
      "The mid-song instrumental — Garcia's guitar weeps through gentle chord changes.",
  },

  // Brokedown Palace
  {
    song: "brokedownpalace",
    typicalProgress: 0.75,
    significance: 0.9,
    type: "vocal_climax",
    description:
      "'Fare you well, fare you well' — the ultimate goodbye. Pure emotional devastation.",
  },

  // Fire on the Mountain
  {
    song: "fireonthemountain",
    typicalProgress: 0.5,
    significance: 0.85,
    type: "jam_peak",
    description:
      "The jam reaches its zenith — locked-in groove, Garcia wailing over the hypnotic riff.",
  },

  // Scarlet Begonias
  {
    song: "scarletbegonias",
    typicalProgress: 0.65,
    significance: 0.8,
    type: "jam_peak",
    description:
      "The jam builds toward the transition to Fire — anticipation mounting.",
  },

  // Jack Straw
  {
    song: "jackstraw",
    typicalProgress: 0.8,
    significance: 0.75,
    type: "band_eruption",
    description:
      "'We can share the women, we can share the wine' — the song's climactic final verse.",
  },

  // Shakedown Street
  {
    song: "shakedownstreet",
    typicalProgress: 0.55,
    significance: 0.8,
    type: "jam_peak",
    description:
      "The funk jam locks in — Garcia's wah-wah guitar over the irresistible groove.",
  },

  // China Cat Sunflower
  {
    song: "chinacatsunflower",
    typicalProgress: 0.7,
    significance: 0.85,
    type: "jam_peak",
    description:
      "The jam dissolves structure — the band navigates toward the Rider transition.",
  },

  // Uncle John's Band
  {
    song: "unclejohnsband",
    typicalProgress: 0.6,
    significance: 0.75,
    type: "vocal_climax",
    description:
      "'Come hear Uncle John's Band' — the crowd sings along in communal harmony.",
  },
];

// Build lookup map: normalized song → PeakMoment[]
const peakMap = new Map<string, PeakMoment[]>();
for (const peak of PEAK_MOMENTS) {
  const existing = peakMap.get(peak.song) ?? [];
  existing.push(peak);
  peakMap.set(peak.song, existing);
}

// ─── Show Structure Knowledge ───

export const SHOW_STRUCTURE: ShowStructureKnowledge = {
  set1Openers: [
    "Jack Straw",
    "Bertha",
    "Shakedown Street",
    "Cold Rain and Snow",
    "Alabama Getaway",
    "Feel Like a Stranger",
    "Hell in a Bucket",
    "Touch of Grey",
    "Mississippi Half-Step",
    "Music Never Stopped",
    "Promised Land",
    "Let the Good Times Roll",
  ],
  set2Openers: [
    "Scarlet Begonias",
    "Playing in the Band",
    "Samson and Delilah",
    "China Cat Sunflower",
    "Help on the Way",
    "St. Stephen",
    "Estimated Prophet",
    "Truckin'",
    "Shakedown Street",
    "Iko Iko",
  ],
  deepJamSignals: [
    "Dark Star",
    "The Other One",
    "Playing in the Band",
    "Bird Song",
    "Eyes of the World",
    "Terrapin Station",
    "Weather Report Suite",
    "The Eleven",
    "Morning Dew",
    "Estimated Prophet",
    "He's Gone",
    "Wharf Rat",
    "Stella Blue",
  ],
  encoreClosers: [
    "One More Saturday Night",
    "Brokedown Palace",
    "U.S. Blues",
    "Not Fade Away",
    "Johnny B. Goode",
    "Sugar Magnolia",
    "It's All Over Now, Baby Blue",
    "And We Bid You Goodnight",
    "Box of Rain",
    "Attics of My Life",
  ],
};

// Normalized lookup sets for show roles
const set1OpenerSet = new Set(
  SHOW_STRUCTURE.set1Openers.map(normalizeTitle),
);
const set2OpenerSet = new Set(
  SHOW_STRUCTURE.set2Openers.map(normalizeTitle),
);
const deepJamSet = new Set(
  SHOW_STRUCTURE.deepJamSignals.map(normalizeTitle),
);
const encoreCloserSet = new Set(
  SHOW_STRUCTURE.encoreClosers.map(normalizeTitle),
);

// ─── Lookup Functions ───

/**
 * Look up cultural knowledge about a specific segue pair.
 * Returns undefined if the pair has no special significance.
 * Directional: Scarlet->Fire is different from Fire->Scarlet.
 */
export function getSegueKnowledge(
  fromTitle: string,
  toTitle: string,
): SegueKnowledge | undefined {
  const key = `${normalizeTitle(fromTitle)}→${normalizeTitle(toTitle)}`;
  return segueMap.get(key);
}

/**
 * Get all known peak moments for a song.
 * Returns empty array if no peak knowledge exists.
 * Results are sorted by typicalProgress ascending.
 */
export function getPeakMoments(title: string): PeakMoment[] {
  const normalized = normalizeTitle(title);
  const moments = peakMap.get(normalized) ?? [];
  return [...moments].sort((a, b) => a.typicalProgress - b.typicalProgress);
}

/**
 * Get the typical show role for a song.
 * A song may serve multiple roles across different shows, but this returns
 * the most characteristic one (priority: deep_jam > set2_opener > set1_opener > encore_closer).
 */
export function getShowRole(
  title: string,
): "set1_opener" | "set2_opener" | "deep_jam" | "encore_closer" | undefined {
  const normalized = normalizeTitle(title);
  // Priority order: deep jam is the strongest signal
  if (deepJamSet.has(normalized)) return "deep_jam";
  if (set2OpenerSet.has(normalized)) return "set2_opener";
  if (set1OpenerSet.has(normalized)) return "set1_opener";
  if (encoreCloserSet.has(normalized)) return "encore_closer";
  return undefined;
}

/**
 * Get the cultural significance of a segue pair (0-1).
 * Returns 0 for unknown pairs.
 */
export function getSegueSignificance(
  fromTitle: string,
  toTitle: string,
): number {
  return getSegueKnowledge(fromTitle, toTitle)?.significance ?? 0;
}

/**
 * Get all registered segue pairs. Useful for iteration/debugging.
 */
export function getAllSegues(): readonly SegueKnowledge[] {
  return SEGUE_KNOWLEDGE;
}

/**
 * Get all registered peak moments. Useful for iteration/debugging.
 */
export function getAllPeakMoments(): readonly PeakMoment[] {
  return PEAK_MOMENTS;
}
