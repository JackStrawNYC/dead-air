import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createLogger } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';
import type { ArchiveFile } from './archive-client.js';
import { getDownloadUrl } from './archive-client.js';

const log = createLogger('downloader');
const rateLimit = createRateLimiter(500);

/**
 * Download a single file with retry logic.
 */
async function downloadFile(
  url: string,
  destPath: string,
  maxRetries = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await rateLimit();

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      if (!res.body) {
        throw new Error('No response body');
      }

      const nodeStream = Readable.fromWeb(
        res.body as import('stream/web').ReadableStream,
      );
      const fileStream = createWriteStream(destPath);
      await pipeline(nodeStream, fileStream);

      return;
    } catch (err) {
      if (attempt === maxRetries) {
        throw new Error(
          `Failed to download ${url} after ${maxRetries} attempts: ${(err as Error).message}`,
        );
      }
      log.warn(
        `Download attempt ${attempt}/${maxRetries} failed: ${(err as Error).message}. Retrying...`,
      );
      // Exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, attempt)),
      );
    }
  }
}

/**
 * Format bytes to human-readable size.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export interface DownloadResult {
  files: string[];
  totalBytes: number;
}

/**
 * Download all selected audio files for a recording.
 */
export async function downloadAudioFiles(
  identifier: string,
  files: ArchiveFile[],
  destDir: string,
): Promise<DownloadResult> {
  // Ensure destination directory exists
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const downloadedFiles: string[] = [];
  let totalBytes = 0;

  log.info(`Downloading ${files.length} files to ${destDir}...`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const url = getDownloadUrl(identifier, file.name);
    const destPath = `${destDir}/${file.name}`;
    const fileSize = parseInt(file.size, 10) || 0;

    log.info(
      `  ${i + 1}/${files.length} ${file.name} (${formatSize(fileSize)})`,
    );

    await downloadFile(url, destPath);

    downloadedFiles.push(destPath);
    totalBytes += fileSize;
  }

  log.info(`Download complete. Total: ${formatSize(totalBytes)}`);

  return { files: downloadedFiles, totalBytes };
}
