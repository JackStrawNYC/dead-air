#!/usr/bin/env node
/**
 * transform-visual-prompts.mjs
 *
 * Post-processes an existing script.json to replace documentary-style
 * scenePrompts in concert_audio segments with visionary poster art prompts
 * themed to each song's lyrics and story.
 *
 * Zero external dependencies — uses native fetch for Anthropic API.
 *
 * Usage:
 *   node scripts/transform-visual-prompts.mjs data/scripts/1977-05-08/script.json --dry-run
 *   node scripts/transform-visual-prompts.mjs data/scripts/1977-05-08/script.json
 */

import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve } from 'path';

// ── Song themes ──

const SONG_VISUAL_THEMES = {
  'Jack Straw': 'two outlaws under a fractal desert sky, neon cacti, swirling starfield',
  'Scarlet Begonias': 'scarlet flowers blooming through cosmic nebula, stardust trails cascading like rain',
  'Morning Dew': 'post-apocalyptic sunrise over crystalline wasteland, ethereal light beams through prismatic clouds',
  'Dark Star': 'infinite cosmic void with spiraling galaxies, aurora borealis fractals pulsing with rhythm',
  'Fire on the Mountain': 'blazing mountain peak with rivers of molten light, ember spirals ascending into aurora sky',
  'Fire On The Mountain': 'blazing mountain peak with rivers of molten light, ember spirals ascending into aurora sky',
  'Eyes of the World': 'giant luminous eye reflecting a fractal Earth, prismatic light rays, cosmic awareness',
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
  'Wharf Rat': 'rain-soaked waterfront at twilight, neon reflections in puddles, solitary figure silhouetted against harbor light',
  'Stella Blue': 'deep blue void with a single fading star, melancholy light cascading like slow rain',
  'Not Fade Away': 'pulsing heartbeat ripple expanding outward through layers of warm light, eternal rhythm',
  'Drums': 'tribal rhythmic patterns radiating from center, concentric percussion waves in deep earth tones',
  'Space': 'formless cosmic void, nebula clouds shifting between dimensions, pure abstract energy',
  'Sugaree': 'bittersweet golden sunset over rolling fields, honey-colored light dissolving into twilight',
  'Deal': 'playing cards exploding into geometric patterns, aces and jokers spiraling through neon light',
  'Casey Jones': 'locomotive bursting through a wall of steam and prismatic light, railroad tracks bending into infinity',
  'Bertha': 'wild woman dancing in a storm of electric petals, lightning and laughter in equal measure',
  'The Wheel': 'enormous cosmic wheel turning slowly through starfields, spokes of pure light connecting all things',
  'Althea': 'woman made of flowing water and wildflowers standing at a crossroads, gentle warmth',
  'Loser': 'lone gambler at a cosmic card table, chips dissolving into stardust, twilight desert saloon',
  'El Paso': 'desert canyon at sunset, silhouettes of riders against blazing fractal sky, Western mythic energy',
  'They Love Each Other': 'two luminous figures merging in a field of wildflowers, golden light spiraling between them',
  'Lazy Lightning': 'crackling slow-motion lightning bolts arcing across prismatic sky, electric lavender clouds',
  'Supplication': 'kneeling figure in a cathedral of light beams, stained glass fracturing into living color',
  'Brown Eyed Women': 'sepia-toned woman with eyes of amber fire, vintage Americana dissolving into warm fractals',
  'Mama Tried': 'dusty highway stretching through golden heartland, fence posts morphing into guitar necks',
  'Row Jimmy': 'gentle river flowing through bioluminescent landscape, moonlight on water, contemplative stillness',
  "Dancin' In The Streets": 'city streets exploding with color and movement, buildings morphing into dancing forms',
  'Minglewood Blues': 'crossroads at midnight, devil silhouette against crimson sky, blues flame rising from the earth',
  'One More Saturday Night': 'cosmic jukebox erupting with prismatic light, dance floor spiraling into starfield',
};

function getTheme(songName, mood) {
  if (SONG_VISUAL_THEMES[songName]) return SONG_VISUAL_THEMES[songName];
  for (const [key, theme] of Object.entries(SONG_VISUAL_THEMES)) {
    if (songName.includes(key) || key.includes(songName)) return theme;
  }
  switch (mood) {
    case 'cosmic': return 'swirling cosmic nebula, deep space colors shifting, ethereal light';
    case 'electric': return 'crackling electric energy arcs, neon lightning, high-voltage color bursts';
    case 'dark': return 'deep shadows with faint bioluminescent glow, mysterious organic forms';
    case 'earthy': return 'ancient forest with golden light filtering through canopy, roots forming mandalas';
    case 'warm':
    default: return 'flowing liquid color morphing through warm spectrum, gentle organic patterns';
  }
}

// ── Anthropic API via fetch ──

async function callClaude(apiKey, systemPrompt, userMessage) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();

  return {
    text: data.content?.[0]?.type === 'text' ? data.content[0].text : '',
    stopReason: data.stop_reason,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

// ── System prompt ──

const ART_DIRECTION_PROMPT = `You are a visual art director generating image prompts for AI image generators.

You will receive song names with mood and theme hints. Generate vivid, detailed image prompts for visionary concert poster art themed to each song's lyrics, characters, and story.

STYLE: visionary concert poster art, flowing organic patterns, vivid saturated colors, Art Nouveau influences. Think classic rock poster art — bold, beautiful, mythic.

RULES:
1. Reference the song's themes, lyrics, characters, and story — NOT real people or venues.
2. Hero prompt (first one per song) should describe subjects with morphing potential: flowers blooming, fractals expanding, cosmic swirls, flames rising, waves crashing.
3. Each prompt MUST end with: "no text, no words, no letters, no writing, no signs, no logos"
4. NEVER name or depict specific real people.
5. NEVER describe text, tickets, posters, signage, or documents.
6. Each prompt should show a DIFFERENT angle, subject, or composition.
7. Include "visionary concert poster art" or "visionary art" in each prompt.
8. Each image displays for ~5 seconds. Match prompt count exactly to the requested number.

COLOR GUIDANCE by mood:
- warm/earthy: ambers, deep reds, rich golds, burnished copper
- electric: teals, deep blues, vivid purples, neon accents
- dark: navy, charcoal, deep green, muted tones
- cosmic: deep purples, electric blues, hot magentas, nebula colors

Respond with ONLY a valid JSON object mapping song names to arrays of prompt strings. No markdown fences, no explanation, no preamble.`;

// ── Fallback ──

function generateTemplateFallback(songName, mood, count) {
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

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const scriptPath = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');

  if (!scriptPath) {
    console.error('Usage: node scripts/transform-visual-prompts.mjs <script.json> [--dry-run]');
    process.exit(1);
  }

  const fullPath = resolve(scriptPath);
  const script = JSON.parse(readFileSync(fullPath, 'utf-8'));

  const concertSegments = script.segments
    .map((seg, idx) => ({ seg, idx }))
    .filter(({ seg }) => seg.type === 'concert_audio');

  console.log(`Found ${concertSegments.length} concert_audio segments to transform.\n`);

  if (dryRun) {
    for (const { seg, idx } of concertSegments) {
      const theme = getTheme(seg.songName, seg.visual?.mood || 'warm');
      const promptCount = Math.ceil((seg.excerptDuration || 60) / 5);
      console.log(`[${idx}] ${seg.songName} -- mood: ${seg.visual?.mood}, intensity: ${seg.visual?.visualIntensity}, duration: ${seg.excerptDuration}s -> ${promptCount} prompts`);
      console.log(`     Theme: ${theme}`);
      console.log(`     Current prompt[0]: ${(seg.visual?.scenePrompts?.[0] || '(none)').slice(0, 120)}...`);
      console.log();
    }
    console.log('(dry run -- no changes made)');
    return;
  }

  // Back up original
  const backupPath = fullPath.replace('.json', '.documentary-backup.json');
  copyFileSync(fullPath, backupPath);
  console.log(`Backup saved: ${backupPath}\n`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY not set. Set it in your environment or .env file.');
    process.exit(1);
  }

  let totalCost = 0;
  let successCount = 0;
  let fallbackCount = 0;

  // Process in batches of 3 songs
  const batchSize = 3;
  for (let i = 0; i < concertSegments.length; i += batchSize) {
    const batch = concertSegments.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(concertSegments.length / batchSize);

    const batchRequest = batch.map(({ seg }) => ({
      songName: seg.songName,
      mood: seg.visual?.mood || 'warm',
      visualIntensity: seg.visual?.visualIntensity || 0.6,
      excerptDuration: seg.excerptDuration || 60,
      promptCount: Math.ceil((seg.excerptDuration || 60) / 5),
      themeHint: getTheme(seg.songName, seg.visual?.mood || 'warm'),
    }));

    const userMsg = `Generate visionary poster art prompts for these ${batch.length} songs. For each song, generate EXACTLY the number of prompts specified.

${batchRequest.map(r =>
  `"${r.songName}": mood=${r.mood}, intensity=${r.visualIntensity}, need exactly ${r.promptCount} prompts
  Theme inspiration: ${r.themeHint}`
).join('\n\n')}

Return ONLY valid JSON: { "Song Name": ["prompt1", "prompt2", ...], ... }`;

    console.log(`[${batchNum}/${totalBatches}] ${batch.map(({ seg }) => seg.songName).join(', ')}`);

    try {
      const result = await callClaude(apiKey, ART_DIRECTION_PROMPT, userMsg);

      if (result.stopReason === 'content_filter') {
        console.log(`  ! Content filter. Using template fallback for batch.`);
        for (const { seg, idx } of batch) {
          const promptCount = Math.ceil((seg.excerptDuration || 60) / 5);
          script.segments[idx].visual.scenePrompts = generateTemplateFallback(
            seg.songName, seg.visual?.mood || 'warm', promptCount);
          fallbackCount++;
        }
        continue;
      }

      // Parse JSON
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log(`  ! No JSON found. Using template fallback.`);
        for (const { seg, idx } of batch) {
          const promptCount = Math.ceil((seg.excerptDuration || 60) / 5);
          script.segments[idx].visual.scenePrompts = generateTemplateFallback(
            seg.songName, seg.visual?.mood || 'warm', promptCount);
          fallbackCount++;
        }
        continue;
      }

      const prompts = JSON.parse(jsonMatch[0]);

      for (const { seg, idx } of batch) {
        const songPrompts = prompts[seg.songName];
        if (songPrompts && Array.isArray(songPrompts) && songPrompts.length > 0) {
          const cleaned = songPrompts.map(p => {
            if (!p.toLowerCase().includes('no text')) {
              return p + ', no text, no words, no letters, no writing, no signs, no logos';
            }
            return p;
          });
          script.segments[idx].visual.scenePrompts = cleaned;
          console.log(`  ok ${seg.songName}: ${cleaned.length} prompts`);
          successCount++;
        } else {
          // Try to find with case-insensitive match
          const key = Object.keys(prompts).find(k =>
            k.toLowerCase() === seg.songName.toLowerCase() ||
            k.includes(seg.songName) ||
            seg.songName.includes(k)
          );
          if (key && Array.isArray(prompts[key])) {
            const cleaned = prompts[key].map(p => {
              if (!p.toLowerCase().includes('no text')) {
                return p + ', no text, no words, no letters, no writing, no signs, no logos';
              }
              return p;
            });
            script.segments[idx].visual.scenePrompts = cleaned;
            console.log(`  ok ${seg.songName} (matched as "${key}"): ${cleaned.length} prompts`);
            successCount++;
          } else {
            const promptCount = Math.ceil((seg.excerptDuration || 60) / 5);
            script.segments[idx].visual.scenePrompts = generateTemplateFallback(
              seg.songName, seg.visual?.mood || 'warm', promptCount);
            console.log(`  ! ${seg.songName}: not in response, using template fallback`);
            fallbackCount++;
          }
        }
      }

      const batchCost = (result.inputTokens * 3 + result.outputTokens * 15) / 1_000_000;
      totalCost += batchCost;
      console.log(`  Cost: $${batchCost.toFixed(4)}\n`);

      // Rate limit
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`  x Batch failed: ${err.message}`);
      console.log('  Using template fallback for batch.');
      for (const { seg, idx } of batch) {
        const promptCount = Math.ceil((seg.excerptDuration || 60) / 5);
        script.segments[idx].visual.scenePrompts = generateTemplateFallback(
          seg.songName, seg.visual?.mood || 'warm', promptCount);
        fallbackCount++;
      }
    }
  }

  // Write updated script
  writeFileSync(fullPath, JSON.stringify(script, null, 2));

  console.log(`\n--- Summary ---`);
  console.log(`Updated:  ${fullPath}`);
  console.log(`Backup:   ${backupPath}`);
  console.log(`API cost: $${totalCost.toFixed(4)}`);
  console.log(`Results:  ${successCount} AI-generated, ${fallbackCount} template fallback`);
  console.log(`\nTo update DB: python3 -c "import sqlite3,json;c=sqlite3.connect('data/dead-air.db');s=open('${scriptPath}').read();p=json.loads(s);c.execute('UPDATE episodes SET script=? WHERE id=?',(s,'ep-'+p.get('showDate','1977-05-08')));c.commit();print('DB updated')"`);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
