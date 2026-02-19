import Anthropic from '@anthropic-ai/sdk';
import type Database from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createLogger, logCost } from '@dead-air/core';
import type { EpisodeScript } from '@dead-air/core';
import { DEAD_AIR_SYSTEM_PROMPT } from './system-prompt.js';
import { assembleContext } from './context-assembler.js';
import type { ShowContext } from './context-assembler.js';
import {
  parseScriptResponse,
  formatValidationErrors,
} from './response-parser.js';
import { withRetry } from '../utils/retry.js';

const log = createLogger('script:orchestrator');

// ── Types ──

export interface ScriptOptions {
  date: string;
  db: Database.Database;
  dataDir: string;
  apiKey: string;
  model?: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface ScriptResult {
  episodeId: string;
  title: string;
  segmentCount: number;
  concertExcerpts: number;
  estimatedDurationMin: number;
  cost: number;
  scriptPath: string;
  warnings: string[];
}

// ── Helpers ──

function generateEpisodeId(date: string): string {
  return `ep-${date}`;
}

function estimateDuration(script: EpisodeScript): number {
  let totalSec = 0;
  for (const seg of script.segments) {
    if (seg.type === 'concert_audio' && seg.excerptDuration) {
      totalSec += seg.excerptDuration;
    } else if (seg.type === 'narration') {
      // Estimate from word count at ~2.5 words/sec
      let text = '';
      if (seg.narrationKey === 'intro') text = script.introNarration;
      else if (seg.narrationKey === 'set_break') text = script.setBreakNarration;
      else if (seg.narrationKey === 'outro') text = script.outroNarration;
      totalSec += text.split(/\s+/).length / 2.5;
    } else if (seg.type === 'context_text' && seg.textLines) {
      totalSec += seg.textLines.reduce((s, l) => s + l.displayDuration, 0);
    }
  }
  return Math.round(totalSec / 60);
}

// ── Main ──

export async function orchestrateScript(
  options: ScriptOptions,
): Promise<ScriptResult> {
  const {
    date,
    db,
    dataDir,
    apiKey,
    model = 'claude-sonnet-4-5-20250929',
    dryRun = false,
    force = false,
  } = options;

  const episodeId = generateEpisodeId(date);

  // 1. Check for existing episode
  const existing = db
    .prepare('SELECT id, title, status FROM episodes WHERE id = ?')
    .get(episodeId) as Record<string, unknown> | undefined;

  if (existing && existing.status === 'scripted' && !force) {
    log.info(`Episode ${episodeId} already has a script. Use --force to overwrite.`);
    const scriptPath = resolve(dataDir, 'scripts', date, 'script.json');
    return {
      episodeId,
      title: (existing.title as string) ?? '',
      segmentCount: 0,
      concertExcerpts: 0,
      estimatedDurationMin: 0,
      cost: 0,
      scriptPath,
      warnings: ['Episode already scripted. Use --force to regenerate.'],
    };
  }

  // 2. Assemble context
  log.info(`Assembling context for ${date}...`);
  const context = assembleContext(db, date, dataDir);

  // 3. Dry run — print context and return
  if (dryRun) {
    console.log(JSON.stringify(context, null, 2));
    return {
      episodeId,
      title: '(dry run)',
      segmentCount: 0,
      concertExcerpts: 0,
      estimatedDurationMin: 0,
      cost: 0,
      scriptPath: '',
      warnings: [],
    };
  }

  // 4. Create/update episode row
  db.prepare(
    `INSERT OR REPLACE INTO episodes (id, show_id, status, current_stage, progress)
     VALUES (?, ?, 'scripting', 'scripting', 0)`,
  ).run(episodeId, date);

  // 5. Build song lookup for validation
  const songNames = new Set(context.setlist.map((s) => s.songName));
  const songDurations = new Map(
    context.setlist.map((s) => [s.songName, s.durationSec]),
  );

  // 6. Call Claude API
  log.info(`Calling ${model}...`);
  const client = new Anthropic({ apiKey, timeout: 15 * 60 * 1000 }); // 15 min
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: JSON.stringify(context) },
  ];

  let script: EpisodeScript;
  let warnings: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    const maxTokens = attempt === 0 ? 32000 : 48000;

    const response = await withRetry(
      () => client.messages.create({ model, max_tokens: maxTokens, system: DEAD_AIR_SYSTEM_PROMPT, messages }),
      { label: 'script:claude-api' },
    );

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    const responseText =
      response.content[0].type === 'text' ? response.content[0].text : '';

    log.info(
      `Response: ${response.usage.output_tokens} tokens, stop_reason: ${response.stop_reason}`,
    );

    // Handle truncated response
    if (response.stop_reason === 'max_tokens' && attempt === 0) {
      log.warn('Response truncated (max_tokens). Retrying with higher limit...');
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: 'Your response was truncated. Please provide the complete JSON.',
      });
      continue;
    }

    try {
      const result = parseScriptResponse(responseText, songNames, songDurations);
      script = result.script;
      warnings = result.warnings;
      break;
    } catch (err) {
      if (attempt === 0) {
        log.warn(
          `Validation failed: ${(err as Error).message}. Retrying with feedback...`,
        );
        messages.push({ role: 'assistant', content: response.content });
        messages.push({
          role: 'user',
          content: formatValidationErrors(err as Error),
        });
        continue;
      }
      // Second attempt also failed — store as failed
      db.prepare(
        'UPDATE episodes SET status = ?, current_stage = ? WHERE id = ?',
      ).run('failed', 'script_failed', episodeId);
      throw new Error(
        `Script generation failed after retry: ${(err as Error).message}`,
      );
    }
  }

  // 7. Log cost
  // Pricing: Sonnet 4.5 input $3/MTok, output $15/MTok
  //          Opus 4.5 input $15/MTok, output $75/MTok
  const isOpus = model.includes('opus');
  const inputRate = isOpus ? 15 / 1_000_000 : 3 / 1_000_000;
  const outputRate = isOpus ? 75 / 1_000_000 : 15 / 1_000_000;
  const cost =
    totalInputTokens * inputRate + totalOutputTokens * outputRate;

  logCost(db, {
    episodeId,
    operation: 'script-generation',
    service: 'anthropic',
    cost,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  });

  log.info(
    `Cost: $${cost.toFixed(4)} (${totalInputTokens} in, ${totalOutputTokens} out)`,
  );

  // 8. Store script in DB
  db.prepare(
    `UPDATE episodes SET
       title = ?,
       episode_type = ?,
       script = ?,
       status = 'scripted',
       current_stage = 'scripted',
       progress = 1.0
     WHERE id = ?`,
  ).run(
    script!.episodeTitle,
    script!.episodeType,
    JSON.stringify(script!),
    episodeId,
  );

  // 9. Write to disk
  const scriptDir = resolve(dataDir, 'scripts', date);
  if (!existsSync(scriptDir)) {
    mkdirSync(scriptDir, { recursive: true });
  }
  const scriptPath = resolve(scriptDir, 'script.json');
  writeFileSync(scriptPath, JSON.stringify(script!, null, 2));

  log.info(`Script saved: ${scriptPath}`);

  const concertExcerpts = script!.segments.filter(
    (s) => s.type === 'concert_audio',
  ).length;

  return {
    episodeId,
    title: script!.episodeTitle,
    segmentCount: script!.segments.length,
    concertExcerpts,
    estimatedDurationMin: estimateDuration(script!),
    cost,
    scriptPath,
    warnings,
  };
}
