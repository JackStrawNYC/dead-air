/**
 * Song Art Prompts — curated scene descriptions for AI image generation.
 *
 * Each song gets a scene description + palette guidance that drives
 * Replicate/Flux/Grok Aurora image generation. Era style prefixes
 * modulate the aesthetic to match the show's time period.
 */

import { createLogger } from '@dead-air/core';

const log = createLogger('assets:song-art-prompts');

// ─── Era Style Prefixes ───

export type ShowEra = 'primal' | 'classic' | 'hiatus' | 'touch_of_grey' | 'revival';

const ERA_STYLE_PREFIX: Record<ShowEra, string> = {
  primal: 'raw psychedelic 1960s concert photography, grainy film stock, neon stage lights, underground acid rock aesthetic',
  classic: 'golden age 1970s rock concert, warm amber stage lighting, analog film grain, backstage candid feel',
  hiatus: 'early 1980s new wave influence, cleaner production, muted earth tones with occasional neon accents',
  touch_of_grey: 'late 1980s stadium rock era, MTV-era polish, saturated colors, arena lighting rigs',
  revival: '1990s farewell tour energy, mature jam band aesthetic, tie-dye nostalgia, outdoor festival vibes',
};

/**
 * Detect show era from date string.
 */
export function detectEra(date: string): ShowEra {
  const year = parseInt(date.slice(0, 4));
  if (year < 1974) return 'primal';
  if (year < 1979) return 'classic';
  if (year < 1985) return 'hiatus';
  if (year < 1990) return 'touch_of_grey';
  return 'revival';
}

// ─── Energy Descriptors ───

function energyDescriptor(avgEnergy: number): string {
  if (avgEnergy > 0.7) return 'explosive energy, crowd surging, sweat and light';
  if (avgEnergy > 0.4) return 'building momentum, focused intensity, locked-in groove';
  if (avgEnergy > 0.2) return 'meditative flow, gentle sway, contemplative space';
  return 'hushed stillness, intimate whisper, sparse beauty';
}

// ─── Palette Guidance ───

function paletteGuidance(primary: number, secondary: number): string {
  const hueToColor = (h: number): string => {
    if (h < 30 || h >= 330) return 'crimson red';
    if (h < 60) return 'amber gold';
    if (h < 90) return 'warm yellow';
    if (h < 150) return 'forest green';
    if (h < 210) return 'ocean blue';
    if (h < 270) return 'deep indigo';
    if (h < 330) return 'violet purple';
    return 'ruby';
  };
  return `color palette dominated by ${hueToColor(primary)} with ${hueToColor(secondary)} accents`;
}

// ─── Curated Song Prompts ───

const SONG_PROMPTS: Record<string, string> = {
  // Set 1 staples
  bertha: 'Bertha with radiant smile emerging from swirling psychedelic roses, American Beauty album art style, dancing bears circling',
  deal: 'Neon poker table under smoky spotlight, cards flying in slow motion, vintage Vegas meets Haight-Ashbury',
  cassidy: 'Mythic cowboy silhouette against vast western sky at golden hour, desert stars beginning to appear',
  jackaroe: 'Moonlit ship on dark waters, feminine figure at the helm, stars reflecting in obsidian sea',
  sugaree: 'Weathered acoustic guitar surrounded by morning glories and honeybees, southern porch at dawn',
  tennesseeJed: 'Rolling Tennessee hills with wildflowers, vintage pickup truck, warm sunset amber light',

  // Exploratory vehicles
  darkstar: 'Vast cosmic nebula with spiral galaxies, Steal Your Face skull emerging from stardust, infinite void of deep space',
  theotherone: 'Lightning storm over ancient amphitheater, thunder bolts tracing skull patterns in electric blue',
  playingintheband: 'Infinite fractal staircase ascending through clouds, kaleidoscopic mandala at the peak, musical notes as constellations',
  birdsong: 'Ethereal forest clearing at dawn, songbirds made of prismatic light, morning mist and dew drops on spider webs',
  estimated: 'Prophet figure on mountaintop surrounded by sacred geometry, eyes made of galaxies, robes of tie-dye nebulae',

  // Emotional anchors
  morningdew: 'Post-apocalyptic dawn breaking over still waters, single figure silhouetted, first rays of hope after devastation',
  stellablue: 'Bioluminescent ocean under starlit sky, lonely figure on shore, deep blue melancholy beauty',
  wharfrat: 'Rain-soaked waterfront bar at 3am, neon reflections in puddles, lonely saxophone player in the doorway',
  brokedownpalace: 'Abandoned Victorian palace being reclaimed by wildflowers, crumbling elegance, sunset through broken windows',
  blackmuddy: 'Mississippi delta at midnight, ancient cypress trees draped in Spanish moss, moon reflecting in still black water',

  // Party/peak songs
  fireaonthemountain: 'Volcanic eruption with dancing figures silhouetted, lava flows forming Steal Your Face, cosmic fire',
  scarletbegonias: 'Field of brilliant scarlet flowers stretching to horizon, hummingbirds and butterflies, golden afternoon light',
  caseyjones: 'Psychedelic locomotive bursting through dimensional portal, steam and sparks and rainbow trails',
  goodlovinredbailey: 'Electric dancehall with strobe lights, ecstatic crowd, energy waves radiating from stage',
  notfadeaway: 'Eternal flame burning in ancient stone circle, stars wheeling overhead in long exposure, permanence and persistence',

  // Drums/Space
  drums: 'Massive drum circle in desert at night, bonfires casting long shadows, tribal rhythms visualized as geometric patterns',
  space: 'Deep space void with distant galaxies, cosmic wind carrying echoes, abstract color fields dissolving into nothing',

  // Closers
  usjblues: 'Underground juke joint, blue neon, cigarette smoke catching colored light, raw blues authenticity',
  onemoreSaturdayNight: 'Saturday night street party, confetti and streamers, vintage marquee lights, joyful chaos',
};

// ─── Public API ───

export interface SongArtPromptOptions {
  songTitle: string;
  songKey: string;
  era: ShowEra;
  palette?: { primary: number; secondary: number };
  avgEnergy?: number;
  variant?: number;
}

/**
 * Build a complete image generation prompt for a song.
 */
export function buildSongArtPrompt(options: SongArtPromptOptions): string {
  const { songKey, era, palette, avgEnergy = 0.5, variant = 0 } = options;

  const eraPrefix = ERA_STYLE_PREFIX[era];
  const songDesc = SONG_PROMPTS[songKey] ?? `Grateful Dead performing ${options.songTitle}, psychedelic concert visualization, cosmic energy`;
  const energyDesc = energyDescriptor(avgEnergy);
  const paletteDesc = palette ? paletteGuidance(palette.primary, palette.secondary) : '';

  // Variant adds subtle variation to the prompt
  const variantSuffix = variant > 0 ? `, alternate perspective ${variant}, unique composition` : '';

  return [
    eraPrefix,
    songDesc,
    energyDesc,
    paletteDesc,
    'no text, no watermark, cinematic composition, 16:9 aspect ratio',
    variantSuffix,
  ].filter(Boolean).join(', ');
}

/**
 * Check if a song has a curated prompt (hero songs get higher quality generation).
 */
export function isHeroSong(songKey: string): boolean {
  return songKey in SONG_PROMPTS;
}
