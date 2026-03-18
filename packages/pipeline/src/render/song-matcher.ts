/**
 * Song name matching — handles Dead abbreviations, segue notation, aliases.
 * Extracted from composition-builder.ts.
 */

// Common Dead song abbreviations / nicknames → canonical names
const SONG_ALIASES: Record<string, string[]> = {
  'china cat sunflower': ['china cat', 'china'],
  'i know you rider': ['rider', 'i know you rider'],
  'playing in the band': ["playin' in the band", 'playin', 'pitb'],
  'the other one': ['other one'],
  'not fade away': ['nfa'],
  'goin\' down the road feeling bad': ['gdtrfb', "goin' down the road", 'going down the road feeling bad'],
  'good lovin\'': ['good lovin'],
  'truckin\'': ['truckin'],
  'drums': ['drums/space', 'drums > space'],
  'space': ['drums/space', 'space > drums'],
  'he\'s gone': ['hes gone'],
  'friend of the devil': ['fotd', 'friend of the devil'],
  'st. stephen': ['saint stephen', 'st stephen'],
  'saint stephen': ['st. stephen', 'st stephen'],
  'wharf rat': ['warf rat'],
  'me and my uncle': ['me & my uncle'],
};

/**
 * Match song names, handling:
 * - Segue notation: ">", "-->", "->", "→", "~>"
 * - Reprise suffixes
 * - Common abbreviations and nicknames
 * - Substring/prefix matching for partial names
 * - Punctuation normalization (apostrophes, hyphens)
 */
export function matchSongName(scriptName: string, candidateName: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s*\(reprise\)\s*$/i, '')
      // Normalize segue separators to " > "
      .replace(/\s*[-~]?-+>\s*/g, ' > ')
      .replace(/\s*→\s*/g, ' > ')
      // Normalize punctuation
      .replace(/['']/g, "'")
      .trim();

  const a = normalize(scriptName);
  const b = normalize(candidateName);

  // Exact match
  if (a === b) return true;

  // Split segues and match any part
  const splitSegue = (s: string) =>
    s.includes(' > ') ? s.split(' > ').map((p) => p.trim()) : [s];

  const aParts = splitSegue(a);
  const bParts = splitSegue(b);

  // Any part of A matches any part of B
  for (const ap of aParts) {
    for (const bp of bParts) {
      if (ap === bp) return true;

      // Check aliases in both directions
      for (const [canonical, aliases] of Object.entries(SONG_ALIASES)) {
        const allNames = [canonical, ...aliases];
        if (allNames.includes(ap) && allNames.includes(bp)) return true;
      }

      // Substring match: "China Cat" matches "China Cat Sunflower"
      if (ap.length >= 5 && (bp.startsWith(ap) || ap.startsWith(bp))) return true;
    }
  }

  return false;
}
