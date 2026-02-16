import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { envSchema } from './env.js';
import type { DeadAirConfig } from '../types/index.js';

let _config: DeadAirConfig | null = null;

/**
 * Find the monorepo root by walking up from this file to find pnpm-workspace.yaml.
 */
function findMonorepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  let dir = dirname(__filename);
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Load and validate configuration from .env file.
 * Returns a cached singleton after first call.
 */
export function loadConfig(envPath?: string): DeadAirConfig {
  if (_config) return _config;

  const root = findMonorepoRoot();

  dotenvConfig({ path: envPath ?? resolve(root, '.env') });

  const parsed = envSchema.parse(process.env);

  _config = {
    env: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL,
    paths: {
      data: resolve(root, parsed.DATA_DIR),
      assets: resolve(root, parsed.ASSETS_DIR),
      renders: resolve(root, parsed.RENDER_OUTPUT_DIR),
      database: resolve(root, parsed.DATABASE_PATH),
    },
    api: {
      archiveOrgEmail: parsed.ARCHIVE_ORG_EMAIL,
      archiveOrgPassword: parsed.ARCHIVE_ORG_PASSWORD,
      openaiKey: parsed.OPENAI_API_KEY,
      anthropicKey: parsed.ANTHROPIC_API_KEY,
      replicateToken: parsed.REPLICATE_API_TOKEN,
      xaiApiKey: parsed.XAI_API_KEY,
      elevenlabsKey: parsed.ELEVENLABS_API_KEY,
      elevenlabsVoiceId: parsed.ELEVENLABS_VOICE_ID,
      setlistfmKey: parsed.SETLISTFM_API_KEY,
    },
    youtube: {
      clientId: parsed.YOUTUBE_CLIENT_ID,
      clientSecret: parsed.YOUTUBE_CLIENT_SECRET,
      refreshToken: parsed.YOUTUBE_REFRESH_TOKEN,
    },
    remotion: {
      concurrency: parsed.REMOTION_CONCURRENCY,
    },
  };

  return _config;
}

/**
 * Get current config (throws if loadConfig() hasn't been called).
 */
export function getConfig(): DeadAirConfig {
  if (!_config) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return _config;
}

/**
 * Reset config (useful for testing).
 */
export function resetConfig(): void {
  _config = null;
}
