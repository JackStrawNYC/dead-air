/**
 * Song-to-visual-theme lookup table.
 *
 * Maps well-known Grateful Dead songs to psychedelic art descriptions.
 * Used by the system prompt (injected as context for Claude) and as
 * fallback enrichment when the AI doesn't generate strong visual themes.
 */

export const SONG_VISUAL_THEMES: Record<string, string> = {
  'Jack Straw':
    'two outlaws under a fractal desert sky, neon cacti, swirling starfield',
  'Scarlet Begonias':
    'scarlet flowers blooming through cosmic nebula, stardust trails',
  'Morning Dew':
    'post-apocalyptic sunrise over crystalline wasteland, ethereal light',
  'Dark Star':
    'infinite cosmic void with spiraling galaxies, aurora borealis fractals',
  'Fire on the Mountain':
    'blazing mountain peak with rivers of molten light, ember spirals ascending into aurora sky',
  'Eyes of the World':
    'giant luminous eye reflecting a fractal Earth, prismatic light rays, cosmic awareness',
  'China Cat Sunflower':
    'kaleidoscopic sunflower with crystalline petals, Cheshire cat dissolving into prismatic fractals',
  'I Know You Rider':
    'lone rider on a trail of liquid starlight, desert mesa under swirling cosmic sky',
  'St. Stephen':
    'stained glass saint shattering into prismatic shards, medieval geometry meets cosmic energy',
  'The Other One':
    'fractured reality splitting into parallel dimensions, electric lightning between mirrored worlds',
  'Playing in the Band':
    'musicians dissolving into pure sound waves, instruments morphing into flowing light streams',
  'Estimated Prophet':
    'wild-eyed prophet on a cliff above churning fractal ocean, lightning and revelation',
  'Terrapin Station':
    'ancient stone station at the edge of the cosmos, terrapin shells spiraling into galaxies',
  'Help on the Way':
    'labyrinthine crystal corridors reflecting infinite pathways, geometric precision melting into organic flow',
  'Slipknot!':
    'tightening spiral of interlocked geometric shapes, tension building in chromatic layers',
  "Franklin's Tower":
    'great bell tower radiating concentric rings of golden light, wildflowers blooming in the resonance',
  'Truckin\'':
    'endless highway dissolving into fractal horizon, neon motel signs melting into desert mirage',
  'Sugar Magnolia':
    'enormous magnolia blossom opening to reveal a universe of golden pollen and butterflies',
  'Uncle John\'s Band':
    'circle of spectral musicians in a moonlit meadow, fireflies forming constellations',
  'Bird Song':
    'luminous birds trailing ribbons of pure color across a dawn sky, feathers dissolving into music notes',
  'Wharf Rat':
    'rain-soaked waterfront at twilight, neon reflections in puddles, solitary figure silhouetted against harbor light',
  'Stella Blue':
    'deep blue void with a single fading star, melancholy light cascading like slow rain',
  'Not Fade Away':
    'pulsing heartbeat ripple expanding outward through layers of warm light, eternal rhythm',
  'Drums':
    'tribal rhythmic patterns radiating from center, concentric percussion waves in deep earth tones',
  'Space':
    'formless cosmic void, nebula clouds shifting between dimensions, pure abstract energy',
  'Sugaree':
    'bittersweet golden sunset over rolling fields, honey-colored light dissolving into twilight',
  'Deal':
    'playing cards exploding into geometric patterns, aces and jokers spiraling through neon casino light',
  'Casey Jones':
    'locomotive bursting through a wall of steam and prismatic light, railroad tracks bending into infinity',
  'Bertha':
    'wild woman dancing in a storm of electric petals, lightning and laughter in equal measure',
  'The Wheel':
    'enormous cosmic wheel turning slowly through starfields, spokes of pure light connecting all things',
  'Althea':
    'woman made of flowing water and wildflowers standing at a crossroads, gentle psychedelic warmth',
};

/**
 * Generate a fallback visual theme for unlisted songs based on mood.
 */
export function generateThemeForSong(
  songName: string,
  mood?: string,
): string {
  // Check for exact match first
  const exact = SONG_VISUAL_THEMES[songName];
  if (exact) return exact;

  // Check for partial match (handles "Scarlet Begonias > Fire on the Mountain" etc.)
  for (const [key, theme] of Object.entries(SONG_VISUAL_THEMES)) {
    if (songName.includes(key) || key.includes(songName)) {
      return theme;
    }
  }

  // Mood-based fallback
  switch (mood) {
    case 'cosmic':
      return 'swirling cosmic nebula, deep space colors shifting and morphing, ethereal light';
    case 'psychedelic':
      return 'kaleidoscopic fractal patterns, vivid saturated colors, organic flowing shapes';
    case 'electric':
      return 'crackling electric energy arcs, neon lightning, high-voltage color bursts';
    case 'dark':
      return 'deep shadows with faint bioluminescent glow, mysterious organic forms';
    case 'earthy':
      return 'ancient forest with golden light filtering through canopy, roots forming mandalas';
    case 'warm':
    default:
      return 'flowing liquid color morphing through warm spectrum, gentle organic psychedelic patterns';
  }
}

/**
 * Format the theme lookup table as context for injection into the system prompt.
 */
export function formatThemesForPrompt(): string {
  const lines = Object.entries(SONG_VISUAL_THEMES)
    .map(([song, theme]) => `  - "${song}": ${theme}`)
    .join('\n');

  return `## SONG VISUAL THEMES REFERENCE\n\nUse these as inspiration for concert_audio scenePrompts. Match the song's story and lyrics to the visual theme.\n\n${lines}`;
}
