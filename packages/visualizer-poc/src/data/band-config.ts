/**
 * Band Configuration — artist-specific settings for portable visualizer.
 *
 * Everything that makes this "Dead Air" instead of a generic visualizer
 * lives here. Swap this config to visualize any artist's live shows.
 *
 * To adapt for a new artist:
 *   1. Create a new config object following the BandConfig interface
 *   2. Update ACTIVE_CONFIG to point to the new config
 *   3. Artist-specific overlay components should be conditionally imported
 *      based on config.overlayTags.culture
 */

// ─── Band Config Interface ───

export interface EraDefinition {
  id: string;
  label: string;
  yearRange: [number, number];
  /** CSS filter string for color grading */
  colorGrade: string;
  /** Bloom accent color */
  bloomColor: string;
  /** Typography style preset */
  typography: {
    fontFamily: string;
    fontWeight: number;
    letterSpacing: string;
    textTransform?: "uppercase" | "none";
    color: string;
    subtitleColor: string;
  };
}

export interface BandConfig {
  /** Default band name */
  bandName: string;
  /** Key musician names (for quote attribution, component labels) */
  musicians: string[];
  /** Era definitions for visual theming */
  eras: EraDefinition[];
  /** Known segue pairs — song title arrays that flow into each other */
  sacredSegues: string[][];
  /** Famous lyrics for overlay display */
  lyrics: string[];
  /** Musician quotes for overlay display */
  quotes: Array<{ text: string; attribution: string }>;
  /** Venue types relevant to this artist's era */
  venueTypes: string[];
  /** Tag name for artist-specific culture overlays */
  overlayTags: {
    /** Tag used in overlay registry for artist-specific components */
    culture: string;
  };
}

// ─── Grateful Dead Configuration ───

export const GRATEFUL_DEAD_CONFIG: BandConfig = {
  bandName: "Grateful Dead",
  musicians: ["Jerry Garcia", "Bob Weir", "Phil Lesh", "Bill Kreutzmann", "Mickey Hart", "Keith Godchaux", "Donna Godchaux", "Brent Mydland", "Vince Welnick"],

  eras: [
    {
      id: "primal",
      label: "Primal Dead",
      yearRange: [1965, 1967],
      colorGrade: "sepia(0.15) contrast(1.05) brightness(0.95)",
      bloomColor: "rgba(255, 180, 100, 0.08)",
      typography: {
        fontFamily: "'Playfair Display', Georgia, serif",
        fontWeight: 700,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
        color: "rgba(255, 220, 180, 0.9)",
        subtitleColor: "rgba(255, 220, 180, 0.5)",
      },
    },
    {
      id: "classic",
      label: "Classic Era",
      yearRange: [1968, 1979],
      colorGrade: "saturate(1.05) brightness(1.02)",
      bloomColor: "rgba(255, 200, 150, 0.06)",
      typography: {
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "none",
        color: "rgba(255, 255, 255, 0.9)",
        subtitleColor: "rgba(255, 255, 255, 0.45)",
      },
    },
    {
      id: "hiatus",
      label: "Hiatus Years",
      yearRange: [1975, 1976],
      colorGrade: "saturate(0.85) brightness(0.95) hue-rotate(-5deg)",
      bloomColor: "rgba(150, 180, 255, 0.06)",
      typography: {
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: 300,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "rgba(200, 210, 230, 0.85)",
        subtitleColor: "rgba(200, 210, 230, 0.4)",
      },
    },
    {
      id: "touch_of_grey",
      label: "Touch of Grey Era",
      yearRange: [1987, 1990],
      colorGrade: "saturate(1.15) contrast(1.08)",
      bloomColor: "rgba(255, 100, 200, 0.08)",
      typography: {
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: 500,
        letterSpacing: "0.03em",
        textTransform: "none",
        color: "rgba(255, 255, 255, 0.92)",
        subtitleColor: "rgba(255, 255, 255, 0.5)",
      },
    },
    {
      id: "revival",
      label: "Revival",
      yearRange: [1991, 1995],
      colorGrade: "saturate(1.0) brightness(1.0)",
      bloomColor: "rgba(200, 200, 200, 0.05)",
      typography: {
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 400,
        letterSpacing: "0.03em",
        textTransform: "none",
        color: "rgba(240, 240, 240, 0.88)",
        subtitleColor: "rgba(240, 240, 240, 0.42)",
      },
    },
  ],

  sacredSegues: [
    ["Scarlet Begonias", "Fire on the Mountain"],
    ["St. Stephen", "Not Fade Away"],
    ["China Cat Sunflower", "I Know You Rider"],
    ["Playing in the Band", "Uncle John's Band"],
    ["Help on the Way", "Slipknot!", "Franklin's Tower"],
    ["The Other One", "Wharf Rat"],
    ["Estimated Prophet", "Eyes of the World"],
    ["Drums", "Space"],
    ["Drums / Space", "Morning Dew"],
    ["Not Fade Away", "Going Down the Road Feeling Bad"],
  ],

  lyrics: [
    "What a long strange trip it's been",
    "Ripple in still water",
    "Once in a while you get shown the light",
    "Shall we go, you and I, while we can?",
    "Nothing left to do but smile, smile, smile",
    "Driving that train, high on cocaine",
    "Wake up to find out that you are the eyes of the world",
    "Let there be songs to fill the air",
    "If I knew the way, I would take you home",
    "Without love in the dream it will never come true",
    "Sometimes the light's all shining on me",
    "Such a long long time to be gone, and a short time to be there",
    "Believe it if you need it, if you don't just pass it on",
    "Into the closing of my mind",
    "Let it be known there is a fountain that was not made by the hands of men",
    "Going where the wind don't blow so strange",
    "There is a road, no simple highway",
    "In the land of the dark the ship of the sun is drawn by the Grateful Dead",
    "Comes a time when the blind man takes your hand",
    "The bus came by and I got on, that's when it all began",
    "Ain't no time to hate, barely time to wait",
    "Saint Stephen with a rose, in and out of the garden he goes",
  ],

  quotes: [
    { text: "Somebody has to do something, and it's just incredibly pathetic that it has to be us.", attribution: "Jerry Garcia" },
    { text: "I don't know why, the Grateful Dead is like bad beer or something — people just keep coming back for more.", attribution: "Jerry Garcia" },
    { text: "We're like licorice. Not everybody likes licorice, but the people who like licorice really like licorice.", attribution: "Jerry Garcia" },
    { text: "You don't want to be the best at what you do, you want to be the only one.", attribution: "Jerry Garcia" },
    { text: "What we do is as American as lynch mobs. America has always been a complex place.", attribution: "Jerry Garcia" },
    { text: "Too much of a good thing is just about right.", attribution: "Jerry Garcia" },
    { text: "Once in a while you can get shown the light in the strangest of places if you look at it right.", attribution: "Jerry Garcia" },
    { text: "The music never stopped.", attribution: "Bob Weir" },
  ],

  venueTypes: ["theater", "arena", "amphitheater", "festival", "club", "ballroom"],

  overlayTags: {
    culture: "dead-culture",
  },
};

// ─── Active Config ───

/** The currently active band configuration. Change this to support other artists. */
export const BAND_CONFIG: BandConfig = GRATEFUL_DEAD_CONFIG;

// ─── Helper accessors ───

/** Get era definition by ID, or undefined if not found */
export function getEra(eraId: string): EraDefinition | undefined {
  return BAND_CONFIG.eras.find((e) => e.id === eraId);
}

/** Get all era IDs as a union type */
export function getEraIds(): string[] {
  return BAND_CONFIG.eras.map((e) => e.id);
}

/** Check if a segue pair is "sacred" (well-known) */
export function isSacredSegue(fromTitle: string, toTitle: string): boolean {
  const fromLower = fromTitle.toLowerCase();
  const toLower = toTitle.toLowerCase();
  return BAND_CONFIG.sacredSegues.some((pair) => {
    for (let i = 0; i < pair.length - 1; i++) {
      if (pair[i].toLowerCase() === fromLower && pair[i + 1].toLowerCase() === toLower) {
        return true;
      }
    }
    return false;
  });
}

/** Get a random lyric (deterministic given a seed) */
export function getSeededLyric(seed: number): string {
  return BAND_CONFIG.lyrics[Math.abs(seed) % BAND_CONFIG.lyrics.length];
}

/** Get a random quote (deterministic given a seed) */
export function getSeededQuote(seed: number): { text: string; attribution: string } {
  return BAND_CONFIG.quotes[Math.abs(seed) % BAND_CONFIG.quotes.length];
}
