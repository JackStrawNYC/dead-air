import { z } from 'zod';

export const envSchema = z.object({
  // Archive.org
  ARCHIVE_ORG_EMAIL: z.string().optional(),
  ARCHIVE_ORG_PASSWORD: z.string().optional(),

  // AI Services
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional(),

  // ElevenLabs
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),

  // YouTube
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN: z.string().optional(),

  // Setlist.fm
  SETLISTFM_API_KEY: z.string().optional(),

  // Database
  DATABASE_PATH: z.string().default('./data/dead-air.db'),

  // Paths
  DATA_DIR: z.string().default('./data'),
  ASSETS_DIR: z.string().default('./data/assets'),
  RENDER_OUTPUT_DIR: z.string().default('./data/renders'),

  // Remotion
  REMOTION_CONCURRENCY: z.coerce.number().int().min(1).default(1),

  // General
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type EnvVars = z.infer<typeof envSchema>;
