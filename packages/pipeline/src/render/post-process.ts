import { resolve, dirname } from 'path';
import { existsSync, renameSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@dead-air/core';

const execFileAsync = promisify(execFile);
const log = createLogger('render:post-process');

export interface PostProcessOptions {
  inputPath: string;
  outputPath: string;
  targetLufs?: number;
}

export async function postProcess(options: PostProcessOptions): Promise<string> {
  const { inputPath, outputPath, targetLufs = -14 } = options;

  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Loudness normalization to target LUFS using FFmpeg loudnorm filter (two-pass)
  log.info(`Normalizing loudness to ${targetLufs} LUFS...`);

  // Pass 1: measure
  const { stderr: measureOutput } = await execFileAsync(
    'ffmpeg',
    [
      '-i', inputPath,
      '-af', `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:print_format=json`,
      '-f', 'null',
      '-',
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );

  // Extract measured values from JSON output
  const jsonMatch = measureOutput.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  if (!jsonMatch) {
    log.warn('Could not parse loudnorm measurement, copying without normalization');
    renameSync(inputPath, outputPath);
    return outputPath;
  }

  const measured = JSON.parse(jsonMatch[0]) as {
    input_i: string;
    input_tp: string;
    input_lra: string;
    input_thresh: string;
    target_offset: string;
  };

  // Pass 2: apply
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i', inputPath,
      '-af',
      `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      outputPath,
    ],
    { maxBuffer: 10 * 1024 * 1024, timeout: 600_000 },
  );

  log.info(`Post-processed: ${outputPath}`);
  return outputPath;
}
