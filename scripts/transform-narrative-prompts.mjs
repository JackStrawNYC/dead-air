#!/usr/bin/env node
/**
 * transform-narrative-prompts.mjs
 *
 * Transforms narration + context_text segments from documentary photography
 * to visionary abstract art. These segments bridge the concert songs.
 *
 * Usage:
 *   node scripts/transform-narrative-prompts.mjs data/scripts/1977-05-08/script.json --dry-run
 *   node scripts/transform-narrative-prompts.mjs data/scripts/1977-05-08/script.json
 */

import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve } from 'path';

const SUFFIX = ', no text, no words, no letters, no writing, no signs, no logos';

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
      max_tokens: 4000,
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

const SYSTEM_PROMPT = `You are a visual art director for a Grateful Dead concert documentary film.

You generate image prompts for AI image generators. The film uses VISIONARY ABSTRACT ART throughout — no realistic photography.

For narrative/transitional segments between songs, generate abstract visionary art that captures the ENERGY and MOOD of the moment rather than depicting literal scenes.

STYLE: visionary abstract art, flowing organic patterns, vivid saturated colors, Art Nouveau influences, cosmic energy, sacred geometry. Think Alex Grey meets concert poster art.

RULES:
1. NEVER depict real people, realistic venues, crowds, or stage equipment.
2. Focus on abstract energy, color fields, organic patterns, cosmic imagery.
3. Each prompt MUST end with: "no text, no words, no letters, no writing, no signs, no logos"
4. Include "visionary art" or "visionary abstract art" in each prompt.
5. Match the mood: warm=golden/amber tones, electric=neon/teal, cosmic=purple/blue, dark=deep shadows.
6. For transitions between songs, capture the shifting energy — one mood dissolving into another.
7. For intro/outro: capture the cosmic significance of the event, not the literal venue.

Respond with ONLY valid JSON. No markdown fences, no explanation.`;

async function main() {
  const args = process.argv.slice(2);
  const scriptPath = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');

  if (!scriptPath) {
    console.error('Usage: node scripts/transform-narrative-prompts.mjs <script.json> [--dry-run]');
    process.exit(1);
  }

  const fullPath = resolve(scriptPath);
  const script = JSON.parse(readFileSync(fullPath, 'utf-8'));

  // Find non-concert segments
  const targets = script.segments
    .map((seg, idx) => ({ seg, idx }))
    .filter(({ seg }) => seg.type !== 'concert_audio');

  console.log(`Found ${targets.length} narration/context segments to transform.\n`);

  // Build context: what songs surround each segment
  const segmentContexts = targets.map(({ seg, idx }) => {
    const prevSong = idx > 0 ? script.segments.slice(0, idx).reverse().find(s => s.type === 'concert_audio') : null;
    const nextSong = script.segments.slice(idx + 1).find(s => s.type === 'concert_audio');
    const promptCount = seg.visual?.scenePrompts?.length || 1;
    const narrationKey = seg.narrationKey || null;

    return {
      segIndex: idx,
      type: seg.type,
      narrationKey,
      mood: seg.visual?.mood || 'warm',
      promptCount,
      prevSong: prevSong?.songName || null,
      nextSong: nextSong?.songName || null,
      context: narrationKey === 'intro' ? 'Opening of the show — cosmic anticipation, energy gathering'
        : narrationKey === 'set_break' ? 'Intermission between sets — collective pause, anticipation building for second set'
        : narrationKey === 'outro' ? 'After the final note — legendary afterglow, cosmic significance of what just happened'
        : `Transition between "${prevSong?.songName || '?'}" and "${nextSong?.songName || '?'}"`,
    };
  });

  if (dryRun) {
    for (const ctx of segmentContexts) {
      console.log(`seg-${String(ctx.segIndex).padStart(2, '0')} [${ctx.type}] ${ctx.narrationKey || ''}`);
      console.log(`  mood: ${ctx.mood}, prompts needed: ${ctx.promptCount}`);
      console.log(`  context: ${ctx.context}`);
      console.log(`  prev: ${ctx.prevSong || 'none'} → next: ${ctx.nextSong || 'none'}`);
      console.log();
    }
    console.log('(dry run — no changes)');
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY not set.');
    process.exit(1);
  }

  // Back up
  const backupPath = fullPath.replace('.json', '.pre-narrative-transform.json');
  copyFileSync(fullPath, backupPath);
  console.log(`Backup: ${backupPath}\n`);

  // Single API call — only ~26 prompts needed
  const userMsg = `Generate visionary abstract art prompts for these ${segmentContexts.length} segments of a Grateful Dead concert documentary.

For each segment, generate EXACTLY the specified number of prompts.

${segmentContexts.map(ctx =>
    `"seg-${String(ctx.segIndex).padStart(2, '0')}": ${ctx.promptCount} prompt(s), mood=${ctx.mood}
  Context: ${ctx.context}
  Previous song: ${ctx.prevSong || 'none'} | Next song: ${ctx.nextSong || 'none'}`
  ).join('\n\n')}

Return JSON: { "seg-00": ["prompt1", ...], "seg-01": ["prompt1", ...], ... }`;

  console.log('Calling Claude...');
  const result = await callClaude(apiKey, SYSTEM_PROMPT, userMsg);

  if (result.stopReason === 'content_filter') {
    console.error('Content filter triggered. Generating fallback prompts.');
    for (const ctx of segmentContexts) {
      const prompts = [];
      for (let i = 0; i < ctx.promptCount; i++) {
        if (ctx.narrationKey === 'intro') {
          prompts.push(`visionary abstract art, cosmic energy gathering and coalescing, warm golden light spiraling into form, sacred geometry emerging from void, Art Nouveau organic patterns${SUFFIX}`);
        } else if (ctx.narrationKey === 'set_break') {
          prompts.push(`visionary abstract art, collective consciousness at rest, warm amber energy field slowly pulsing, organic patterns breathing, contemplative sacred geometry${SUFFIX}`);
        } else if (ctx.narrationKey === 'outro') {
          prompts.push(`visionary abstract art, radiant afterglow expanding outward, golden cosmic energy dissipating into legend, sacred geometry dissolving into warm light${SUFFIX}`);
        } else {
          prompts.push(`visionary abstract art, flowing energy transition, warm color field shifting between moods, organic patterns morphing, Art Nouveau cosmic flow${SUFFIX}`);
        }
      }
      script.segments[ctx.segIndex].visual.scenePrompts = prompts;
    }
  } else {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON in response. Raw:', result.text.slice(0, 500));
      process.exit(1);
    }

    const prompts = JSON.parse(jsonMatch[0]);
    let updated = 0;

    for (const ctx of segmentContexts) {
      const key = `seg-${String(ctx.segIndex).padStart(2, '0')}`;
      const segPrompts = prompts[key];

      if (segPrompts && Array.isArray(segPrompts) && segPrompts.length > 0) {
        const cleaned = segPrompts.map(p => {
          if (!p.toLowerCase().includes('no text')) {
            return p + SUFFIX;
          }
          return p;
        });
        script.segments[ctx.segIndex].visual.scenePrompts = cleaned;
        console.log(`  ok ${key}: ${cleaned.length} prompts`);
        updated++;
      } else {
        console.log(`  ! ${key}: missing from response, keeping original`);
      }
    }

    const cost = (result.inputTokens * 3 + result.outputTokens * 15) / 1_000_000;
    console.log(`\nUpdated: ${updated}/${segmentContexts.length}`);
    console.log(`Cost: $${cost.toFixed(4)}`);
  }

  writeFileSync(fullPath, JSON.stringify(script, null, 2));
  console.log(`\nSaved: ${fullPath}`);
  console.log(`\nTo update DB:\npython3 -c "import sqlite3;c=sqlite3.connect('data/dead-air.db');s=open('${scriptPath}').read();c.execute('UPDATE episodes SET script=? WHERE id=?',(s,'ep-1977-05-08'));c.commit();print('DB updated')"`);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
