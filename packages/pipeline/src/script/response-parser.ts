import { z } from 'zod';
import { createLogger } from '@dead-air/core';
import type { EpisodeScript } from '@dead-air/core';

const log = createLogger('script:parser');

// ── Zod Schema ──

const textLineSchema = z.object({
  text: z.string().min(1),
  displayDuration: z.number().min(1).max(30),
  style: z.enum(['fact', 'quote', 'analysis', 'transition']),
});

const visualSchema = z.object({
  scenePrompts: z.array(z.string().min(1)).min(1),
  colorPalette: z.array(z.string()).min(1),
  mood: z.enum(['warm', 'cosmic', 'electric', 'dark', 'earthy', 'psychedelic']),
  visualIntensity: z.number().min(0).max(1),
});

const segmentSchema = z.object({
  type: z.enum(['narration', 'concert_audio', 'context_text']),
  narrationKey: z.enum(['intro', 'set_break', 'outro']).optional(),
  songName: z.string().optional(),
  startTimeInSong: z.number().min(0).optional(),
  excerptDuration: z.number().min(5).max(300).optional(),
  textLines: z.array(textLineSchema).optional(),
  visual: visualSchema,
});

const chapterSchema = z.object({
  time: z.string(),
  label: z.string(),
});

const youtubeSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1),
  tags: z.array(z.string()).min(1),
  chapters: z.array(chapterSchema).min(1),
});

const shortsMomentSchema = z.object({
  timestamp: z.string(),
  duration: z.number().min(15).max(60),
  hookText: z.string().min(1),
});

const episodeScriptSchema = z.object({
  episodeTitle: z.string().min(1),
  episodeType: z.enum(['gateway', 'deep_dive']),
  introNarration: z.string().min(1),
  setBreakNarration: z.string().min(1),
  outroNarration: z.string().min(1),
  segments: z.array(segmentSchema).min(3),
  youtube: youtubeSchema,
  thumbnailPrompt: z.string().min(1),
  shortsMoments: z.array(shortsMomentSchema),
});

// ── JSON Extraction ──

function extractJSON(text: string): string {
  const trimmed = text.trim();

  // Direct JSON
  if (trimmed.startsWith('{')) return trimmed;

  // Code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // First { to last }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error('No JSON object found in response');
}

// ── Semantic Validation ──

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateSemantics(
  script: EpisodeScript,
  songNames: Set<string>,
  songDurations: Map<string, number>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check song names in concert_audio segments
  for (const seg of script.segments) {
    if (seg.type === 'concert_audio' && seg.songName) {
      if (!songNames.has(seg.songName)) {
        warnings.push(
          `Song "${seg.songName}" not found in setlist. Available: ${[...songNames].join(', ')}`,
        );
      }
      const dur = songDurations.get(seg.songName);
      if (dur && seg.startTimeInSong !== undefined && seg.excerptDuration !== undefined) {
        if (seg.startTimeInSong + seg.excerptDuration > dur + 5) {
          warnings.push(
            `Excerpt for "${seg.songName}" exceeds song duration (${seg.startTimeInSong}+${seg.excerptDuration} > ${Math.round(dur)}s)`,
          );
        }
      }
    }
  }

  // Check narration keys
  const narrationKeys = script.segments
    .filter((s) => s.type === 'narration' && s.narrationKey)
    .map((s) => s.narrationKey);

  if (!narrationKeys.includes('intro')) {
    errors.push('Missing narration segment with narrationKey "intro"');
  }
  if (!narrationKeys.includes('outro')) {
    warnings.push('Missing narration segment with narrationKey "outro"');
  }

  // Check minimum concert segments
  const concertSegments = script.segments.filter(
    (s) => s.type === 'concert_audio',
  );
  if (concertSegments.length < 2) {
    errors.push(
      `Only ${concertSegments.length} concert_audio segments (expected at least 3)`,
    );
  }

  // Check image prompt counts vs segment duration
  for (const seg of script.segments) {
    const promptCount = seg.visual?.scenePrompts?.length ?? 0;
    let segDurationSec = 0;
    if (seg.type === 'concert_audio' && seg.excerptDuration) {
      segDurationSec = seg.excerptDuration;
    } else if (seg.type === 'context_text' && seg.textLines) {
      segDurationSec = seg.textLines.reduce((sum, l) => sum + l.displayDuration, 0);
    }
    // Only validate segments with known duration > 30s
    if (segDurationSec > 30) {
      // ~8s per image → minimum prompts = duration / 8, halved for error threshold
      const minPrompts = Math.ceil(segDurationSec / 8 / 2);
      if (promptCount < minPrompts) {
        errors.push(
          `Segment "${seg.songName ?? seg.type}" is ${segDurationSec}s but has only ${promptCount} scenePrompts (need at least ${minPrompts})`,
        );
      } else {
        const idealMin = Math.ceil(segDurationSec / 10);
        if (promptCount < idealMin) {
          warnings.push(
            `Segment "${seg.songName ?? seg.type}" is ${segDurationSec}s with ${promptCount} scenePrompts (recommend ${idealMin}+)`,
          );
        }
      }
    }
  }

  // Check chapters start at 0:00
  if (
    script.youtube.chapters.length > 0 &&
    script.youtube.chapters[0].time !== '0:00'
  ) {
    warnings.push('YouTube chapters should start at "0:00"');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Main Parser ──

export interface ParseResult {
  script: EpisodeScript;
  warnings: string[];
}

export function parseScriptResponse(
  responseText: string,
  songNames: Set<string>,
  songDurations: Map<string, number>,
): ParseResult {
  // Layer 1: Extract JSON
  const jsonStr = extractJSON(responseText);

  // Layer 2: Parse + Zod validation
  const parsed = JSON.parse(jsonStr);
  const result = episodeScriptSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Schema validation failed: ${issues}`);
  }

  const script = result.data as EpisodeScript;

  // Layer 3: Semantic validation
  const semantics = validateSemantics(script, songNames, songDurations);

  if (!semantics.valid) {
    throw new Error(`Semantic validation failed: ${semantics.errors.join('; ')}`);
  }

  for (const w of semantics.warnings) {
    log.warn(`Validation warning: ${w}`);
  }

  return { script, warnings: semantics.warnings };
}

/**
 * Format validation errors for a retry prompt to Claude.
 */
export function formatValidationErrors(error: Error): string {
  return `The previous response had validation errors:\n${error.message}\n\nPlease fix these issues and respond with the corrected JSON only.`;
}
