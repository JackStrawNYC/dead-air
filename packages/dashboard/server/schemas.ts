import { z } from 'zod';

// ─── Date Helpers ───

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const dateString = z.string().regex(dateRegex, 'Expected YYYY-MM-DD format');

// ─── Pipeline ───

export const PipelineRunBody = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  force: z.boolean().optional(),
});

// ─── Shows ───

export const ShowIngestBody = z.object({
  date: dateString,
});

// ─── Archive ───

export const ArchiveIngestBody = z.object({
  date: dateString,
  identifier: z.string().optional(),
});

// ─── Visualizer ───

export const VisualizerRenderBody = z.object({
  track: z.string().optional(),
  resume: z.boolean().optional(),
  preset: z.string().optional(),
  preview: z.boolean().optional(),
  gl: z.enum(['angle', 'egl', 'swiftshader', 'swangle', 'vulkan']).optional(),
  concurrency: z.number().int().min(1).max(16).optional(),
  seed: z.number().int().optional(),
});

export const SetlistBody = z.object({
  songs: z.array(z.unknown()),
});

export const ChaptersBody = z.object({
  chapters: z.array(z.unknown()),
});

export const OverlayScheduleBody = z.object({
  songs: z.record(z.string(), z.unknown()),
});

const SongIdentity = z.object({
  palette: z.object({
    primary: z.number().optional(),
    secondary: z.number().optional(),
    accent: z.number().optional(),
  }).optional(),
  modes: z.array(z.string()).optional(),
  overlayTags: z.array(z.string()).optional(),
  energy: z.enum(['low', 'medium', 'high']).optional(),
  mood: z.string().optional(),
}).passthrough();

export const SongIdentitiesBody = z.record(z.string(), SongIdentity);

// ─── Preflight ───

export const PreflightParams = z.object({
  date: dateString,
});

// ─── Asset Review ───

export const RegenerateAssetBody = z.object({
  assetId: z.string().optional(),
  segmentIndex: z.number().int().min(0).optional(),
  type: z.enum(['image', 'narration']).optional(),
});

export const ApproveAssetsBody = z.object({
  episodeId: z.string(),
});

// ─── Batch ───

export const BatchCreateBody = z.object({
  dates: z.array(dateString).min(1).max(100),
  preset: z.string().optional(),
  force: z.boolean().optional(),
});

export const BatchRetryBody = z.object({
  failedOnly: z.boolean().optional(),
});

// ─── Re-render ───

export const RerenderBody = z.object({
  preset: z.string().optional(),
  seed: z.number().int().optional(),
  force: z.boolean().optional(),
});

// ─── Validate Helper ───

export function validateBody<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const messages = result.error.issues.map(
    (i) => `${i.path.join('.')}: ${i.message}`,
  );
  return { success: false, error: messages.join('; ') };
}
