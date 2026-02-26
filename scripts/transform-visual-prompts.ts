#!/usr/bin/env tsx
/**
 * transform-visual-prompts.ts
 *
 * Post-processes an existing script.json to replace documentary-style
 * scenePrompts in concert_audio segments with visionary poster art prompts
 * themed to each song's lyrics and story.
 *
 * Usage:
 *   pnpm exec tsx scripts/transform-visual-prompts.ts data/scripts/1977-05-08/script.json
 *   pnpm exec tsx scripts/transform-visual-prompts.ts data/scripts/1977-05-08/script.json --dry-run
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve } from 'path';

// ── Song themes (inlined to avoid workspace module resolution) ──

const SONG_VISUAL_THEMES: Record<string, string> = {
  'Jack Straw': 'two outlaws under a fractal desert sky, neon cacti, swirling starfield',
  'Scarlet Begonias': 'scarlet flowers blooming through cosmic nebula, stardust trails',
  'Morning Dew': 'post-apocalyptic sunrise over crystalline wasteland, ethereal light',
  'Dark Star': 'infinite cosmic void with spiraling galaxies, aurora borealis fractals',
  'Fire on the Mountain': 'blazing mountain peak with rivers of molten light, ember spirals ascending into aurora sky',
  'Fire On The Mountain': 'blazing mountain peak with rivers of molten light, ember spirals ascending into aurora sky',
  'Eyes of the World': 'giant luminous eye reflecting a fractal Earth, prismatic light rays',
  'China Cat Sunflower': 'kaleidoscopic sunflower with crystalline petals, Cheshire cat dissolving into prismatic fractals',
  'I Know You Rider': 'lone rider on a trail of liquid starlight, desert mesa under swirling cosmic sky',
  'St. Stephen': 'stained glass saint shattering into prismatic shards, medieval geometry meets cosmic energy',
  'Saint Stephen': 'stained glass saint shattering into prismatic shards, medieval geometry meets cosmic energy',
  'The Other One': 'fractured reality splitting into parallel dimensions, electric lightning between mirrored worlds',
  'Playing in the Band': 'musicians dissolving into pure sound waves, instruments morphing into flowing light streams',
  'Estimated Prophet': 'wild-eyed prophet on a cliff above churning fractal ocean, lightning and revelation',
  'Terrapin Station': 'ancient stone station at the edge of the cosmos, terrapin shells spiraling into galaxies',
  'Help on the Way': 'labyrinthine crystal corridors reflecting infinite pathways, geometric precision melting into organic flow',
  'Slipknot!': 'tightening spiral of interlocked geometric shapes, tension building in chromatic layers',
  "Franklin's Tower": 'great bell tower radiating concentric rings of golden light, wildflowers blooming in the resonance',
  "Truckin'": 'endless highway dissolving into fractal horizon, neon motel signs melting into desert mirage',
  'Sugar Magnolia': 'enormous magnolia blossom opening to reveal a universe of golden pollen and butterflies',
  "Uncle John's Band": 'circle of spectral musicians in a moonlit meadow, fireflies forming constellations',
  'Bird Song': 'luminous birds trailing ribbons of pure color across a dawn sky, feathers dissolving into music notes',
  'Wharf Rat': 'rain-soaked waterfront at twilight, neon reflections in puddles, solitary figure silhouetted',
  'Stella Blue': 'deep blue void with a single fading star, melancholy light cascading like slow rain',
  'Not Fade Away': 'pulsing heartbeat ripple expanding outward through layers of warm light, eternal rhythm',
  'Drums': 'tribal rhythmic patterns radiating from center, concentric percussion waves in deep earth tones',
  'Space': 'formless cosmic void, nebula clouds shifting between dimensions, pure abstract energy',
  'Sugaree': 'bittersweet golden sunset over rolling fields, honey-colored light dissolving into twilight',
  'Deal': 'playing cards exploding into geometric patterns, aces and jokers spiraling through neon light',
  'Casey Jones': 'locomotive bursting through a wall of steam and prismatic light, railroad tracks bending into infinity',
  'Bertha': 'wild woman dancing in a storm of electric petals, lightning and laughter in equal measure',
  'The Wheel': 'enormous cosmic wheel turning slowly through starfields, spokes of pure light',
  'Althea': 'woman made of flowing water and wildflowers standing at a crossroads, gentle warmth',
  'Loser': 'lone gambler at a cosmic card table, chips dissolving into stardust, twilight desert saloon',
  'El Paso': 'desert canyon at sunset, silhouettes of riders against blazing fractal sky, Western mythic energy',
  'They Love Each Other': 'two luminous figures merging in a field of wildflowers, golden light spiraling between them',
  'Lazy Lightning': 'crackling slow-motion lightning bolts arcing across prismatic sky, electric lavender clouds',
  'Supplication': 'kneeling figure in a cathedral of light beams, stained glass fracturing into living color',
  'Brown Eyed Women': 'sepia-toned woman with eyes of amber fire, vintage Americana dissolving into warm fractals',
  'Mama Tried': 'dusty highway stretching through golden heartland, fence posts morphing into guitar necks',
  'Row Jimmy': 'gentle river flowing through bioluminescent landscape, moonlight on water, contemplative stillness',
  "Dancin' In The Streets": "city streets exploding with color and movement, buildings morphing into dancing forms",
  'Dancin\' In The Streets': "city streets exploding with color and movement, buildings morphing into dancing forms",
  'Minglewood Blues': 'crossroads at midnight, devil silhouette against crimson sky, blues flame rising',
  'One More Saturday Night': 'cosmic jukebox erupting with prismatic light, dance floor spiraling into starfield',
};

function getTheme(songName: string, mood: string): string {
  if (SONG_VISUAL_THEMES[songName]) return SONG_VISUAL_THEMES[songName];
  // Partial match
  for (const [key, theme] of Object.entries(SONG_VISUAL_THEMES)) {
    if (songName.includes(key) || key.includes(songName)) return theme;
  }
  // Mood fallback
  switch (mood) {
    case 'cosmic': return 'swirling cosmic nebula, deep space colors shifting, ethereal light';
    case 'electric': return 'crackling electric energy arcs, neon lightning, high-voltage color bursts';
    case 'dark': return 'deep shadows with faint bioluminescent glow, mysterious organic forms';
    case 'earthy': return 'ancient forest with golden light filtering through canopy, roots forming mandalas';
    case 'warm':
    default: return 'flowing liquid color morphing through warm spectrum, gentle organic patterns';
  }
}

// ── System prompt (art direction only — no band history, no filter triggers) ──

const ART_DIRECTION_PROMPT = `You are a visual art director generating image prompts for AI image generators.

You will be given a song name, mood, visual intensity, and a theme description. Generate scenePrompts — each is a detailed image generation prompt for visionary concert poster art themed to the song.

STYLE: visionary concert poster art, flowing organic patterns, vivid saturated colors, Art Nouveau influences. Think classic rock poster art — bold, beautiful, mythic.

RULES:
1. Reference the song's themes, lyrics, characters, and story — NOT real people or venues.
2. Hero prompt (first one) should describe subjects with morphing potential: flowers blooming, fractals expanding, cosmic swirls, flames rising, waves crashing.
3. Each prompt MUST end with: "no text, no words, no letters, no writing, no signs, no logos"
4. NEVER name or depict specific real people.
5. NEVER describe text, tickets, posters, signage, or documents.
6. Each prompt should show a DIFFERENT angle, subject, or composition — vary the visual theme, zoom level, and composition.
7. Include "visionary concert poster art" or "visionary art" in each prompt.
8. Each image displays for ~5 seconds. Match prompt count to duration: 45s=9, 60s=12, 75s=15, 90s=18, 120s=24.

COLOR GUIDANCE:
- warm/earthy moods → ambers, deep reds, rich golds
- electric moods → teals, deep blues, vivid purples, neon accents
- dark moods → navy, charcoal, deep green, muted
- cosmic moods → deep purples, electric blues, magentas, nebula colors

Respond with ONLY a JSON array of prompt strings. No markdown, no explanation.`;

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const scriptPath = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');

  if (!scriptPath) {
    console.error('Usage: pnpm exec tsx scripts/transform-visual-prompts.ts <script.json> [--dry-run]');
    process.exit(1);
  }

  const fullPath = resolve(scriptPath);
  const script = JSON.parse(readFileSync(fullPath, 'utf-8'));

  const concertSegments = script.segments
    .map((seg: any, idx: number) => ({ seg, idx }))
    .filter(({ seg }: any) => seg.type === 'concert_audio');

  console.log(`Found ${concertSegments.length} concert_audio segments to transform.\n`);

  if (dryRun) {
    for (const { seg, idx } of concertSegments) {
      const theme = getTheme(seg.songName, seg.visual?.mood || 'warm');
      const promptCount = Math.ceil((seg.excerptDuration || 60) / 5);
      console.log(`[${idx}] ${seg.songName} — mood: ${seg.visual?.mood}, intensity: ${seg.visual?.visualIntensity}, duration: ${seg.excerptDuration}s → ${promptCount} prompts`);
      console.log(`     Theme: ${theme}`);
      console.log(`     Current prompt[0]: ${(seg.visual?.scenePrompts?.[0] || '(none)').slice(0, 100)}...`);
      console.log();
    }
    console.log('(dry run — no changes made)');
    return;
  }

  // Back up original
  const backupPath = fullPath.replace('.json', '.documentary-backup.json');
  copyFileSync(fullPath, backupPath);
  console.log(`Backup saved: ${backupPath}\n`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  let totalCost = 0;

  // Process segments in batches of 3 to reduce API calls
  const batchSize = 3;
  for (let i = 0; i < concertSegments.length; i += batchSize) {
    const batch = concertSegments.slice(i, i + batchSize);

    const batchRequest = batch.map(({ seg }: any) => ({
      songName: seg.songName,
      mood: seg.visual?.mood || 'warm',
      visualIntensity: seg.visual?.visualIntensity || 0.6,
      excerptDuration: seg.excerptDuration || 60,
      promptCount: Math.ceil((seg.excerptDuration || 60) / 5),
      themeHint: getTheme(seg.songName, seg.visual?.mood || 'warm'),
    }));

    const userMsg = `Generate visionary poster art prompts for these ${batch.length} songs. Return a JSON object with song names as keys and arrays of prompt strings as values.

${batchRequest.map(r =>
  `"${r.songName}": mood=${r.mood}, intensity=${r.visualIntensity}, duration=${r.excerptDuration}s, need ${r.promptCount} prompts
  Theme hint: ${r.themeHint}`
).join('\n\n')}

Return ONLY valid JSON: { "Song Name": ["prompt1", "prompt2", ...], ... }`;

    console.log(`Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(concertSegments.length / batchSize)}: ${batch.map(({ seg }: any) => seg.songName).join(', ')}`);

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8000,
        system: ART_DIRECTION_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';

      if (response.stop_reason === 'content_filter') {
        console.error(`  ⚠ Content filter on batch. Falling back to per-song calls...`);
        // Fall back to individual calls
        for (const { seg, idx } of batch) {
          await processSingleSong(client, seg, idx, script);
        }
        continue;
      }

      // Parse the JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`  ✗ No JSON found in response. Skipping batch.`);
        continue;
      }

      const prompts = JSON.parse(jsonMatch[0]);

      // Apply prompts to segments
      for (const { seg, idx } of batch) {
        const songPrompts = prompts[seg.songName];
        if (songPrompts && Array.isArray(songPrompts) && songPrompts.length > 0) {
          // Ensure each prompt ends with the no-text suffix
          const cleaned = songPrompts.map((p: string) => {
            if (!p.toLowerCase().includes('no text')) {
              return p + ', no text, no words, no letters, no writing, no signs, no logos';
            }
            return p;
          });
          script.segments[idx].visual.scenePrompts = cleaned;
          console.log(`  ✓ ${seg.songName}: ${cleaned.length} prompts`);
        } else {
          console.log(`  ⚠ ${seg.songName}: no prompts returned, keeping original`);
        }
      }

      // Track cost (Sonnet: $3/MTok in, $15/MTok out)
      const batchCost = (response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1_000_000;
      totalCost += batchCost;
      console.log(`  Cost: $${batchCost.toFixed(4)}\n`);

      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ✗ Batch failed: ${(err as Error).message}`);
      console.error('  Falling back to per-song calls...');
      for (const { seg, idx } of batch) {
        await processSingleSong(client, seg, idx, script);
      }
    }
  }

  // Write updated script
  writeFileSync(fullPath, JSON.stringify(script, null, 2));
  console.log(`\nUpdated script saved: ${fullPath}`);
  console.log(`Total API cost: $${totalCost.toFixed(4)}`);
}

async function processSingleSong(
  client: Anthropic,
  seg: any,
  idx: number,
  script: any,
): Promise<void> {
  const theme = getTheme(seg.songName, seg.visual?.mood || 'warm');
  const promptCount = Math.ceil((seg.excerptDuration || 60) / 5);

  const userMsg = `Generate ${promptCount} visionary poster art image prompts for the song "${seg.songName}".
Mood: ${seg.visual?.mood || 'warm'}, intensity: ${seg.visual?.visualIntensity || 0.6}, duration: ${seg.excerptDuration || 60}s.
Theme: ${theme}
Return ONLY a JSON array of ${promptCount} prompt strings.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      system: ART_DIRECTION_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    });

    if (response.stop_reason === 'content_filter') {
      console.log(`    ⚠ ${seg.songName}: content filter, using template fallback`);
      script.segments[idx].visual.scenePrompts = generateTemplateFallback(seg.songName, seg.visual?.mood || 'warm', seg.visual?.visualIntensity || 0.6, promptCount);
      return;
    }

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(`    ⚠ ${seg.songName}: no JSON, using template fallback`);
      script.segments[idx].visual.scenePrompts = generateTemplateFallback(seg.songName, seg.visual?.mood || 'warm', seg.visual?.visualIntensity || 0.6, promptCount);
      return;
    }

    const prompts = JSON.parse(jsonMatch[0]);
    const cleaned = prompts.map((p: string) => {
      if (!p.toLowerCase().includes('no text')) {
        return p + ', no text, no words, no letters, no writing, no signs, no logos';
      }
      return p;
    });
    script.segments[idx].visual.scenePrompts = cleaned;
    console.log(`    ✓ ${seg.songName}: ${cleaned.length} prompts`);

    await new Promise(r => setTimeout(r, 500));
  } catch (err) {
    console.log(`    ✗ ${seg.songName}: ${(err as Error).message}, using template fallback`);
    script.segments[idx].visual.scenePrompts = generateTemplateFallback(seg.songName, seg.visual?.mood || 'warm', seg.visual?.visualIntensity || 0.6, promptCount);
  }
}

/**
 * Deterministic fallback when all API calls fail.
 * Generates varied prompts from the song theme by combining perspectives.
 */
function generateTemplateFallback(
  songName: string,
  mood: string,
  intensity: number,
  count: number,
): string[] {
  const theme = getTheme(songName, mood);
  const suffix = ', no text, no words, no letters, no writing, no signs, no logos';

  const perspectives = [
    `Wide establishing shot of ${theme}, visionary concert poster art, vivid saturated colors, Art Nouveau influences${suffix}`,
    `Close-up detail of ${theme}, intricate organic patterns, visionary art, flowing forms${suffix}`,
    `Aerial view of ${theme}, cosmic scale, visionary concert poster art, deep rich colors${suffix}`,
    `${theme} transforming and morphing, dynamic energy, visionary art, bold saturated palette${suffix}`,
    `Intimate view within ${theme}, delicate details visible, visionary poster art, Art Nouveau${suffix}`,
    `${theme} expanding outward, concentric waves of color, visionary art, flowing organic patterns${suffix}`,
    `Dramatic angle on ${theme}, high contrast lighting, visionary concert poster art, vivid colors${suffix}`,
    `${theme} dissolving into abstract forms, pure color and energy, visionary art${suffix}`,
    `Symmetrical composition of ${theme}, mandala-like structure, visionary poster art, rich palette${suffix}`,
    `${theme} at peak intensity, explosive color, visionary concert poster art, maximum saturation${suffix}`,
    `Subtle variation on ${theme}, muted then blooming, visionary art, organic Art Nouveau flow${suffix}`,
    `${theme} reflected in cosmic mirror, dual reality, visionary poster art, deep colors${suffix}`,
    `Spiraling view of ${theme}, fibonacci patterns, visionary concert art, flowing organic forms${suffix}`,
    `${theme} emerging from darkness, gradual revelation, visionary art, warm glow building${suffix}`,
    `Fragmented ${theme}, prismatic shards reassembling, visionary poster art, vivid spectrum${suffix}`,
    `${theme} in full bloom, maximum visual richness, visionary concert poster art, Art Nouveau${suffix}`,
    `Macro detail within ${theme}, textures and patterns, visionary art, intense color depth${suffix}`,
    `${theme} merging with cosmic backdrop, galaxies visible, visionary poster art, deep space palette${suffix}`,
    `Pulsing energy within ${theme}, rhythmic visual waves, visionary concert art, flowing patterns${suffix}`,
    `${theme} at twilight transition, warm to cool spectrum, visionary art, organic morphing${suffix}`,
    `${theme} radiating outward in all directions, mandala explosion, visionary poster art${suffix}`,
    `Close abstract of ${theme}, pure pattern and color, visionary concert poster art${suffix}`,
    `${theme} breathing and flowing, gentle organic motion, visionary art, Art Nouveau${suffix}`,
    `Final vision of ${theme}, all elements unified, visionary concert poster art, cosmic harmony${suffix}`,
  ];

  return perspectives.slice(0, count);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
