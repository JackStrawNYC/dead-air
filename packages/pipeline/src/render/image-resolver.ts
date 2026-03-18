/**
 * Image resolution utilities for composition segments.
 * Extracted from composition-builder.ts.
 */

import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import type { EpisodeSegment } from '@dead-air/core';

const FPS = 30;

/**
 * Resolve images for a segment, preferring .png over .mp4.
 * Static images avoid the OffthreadVideo compositor which leaks memory
 * and causes OOM crashes (SIGKILL) on long renders.
 */
export function resolveImages(
  segment: EpisodeSegment,
  episodeId: string,
  segIndex: number,
  dataDir: string,
): string[] {
  const images: string[] = [];
  const sceneCount = segment.visual?.scenePrompts?.length ?? 0;
  for (let pi = 0; pi < sceneCount; pi++) {
    const baseName = `seg-${String(segIndex).padStart(2, '0')}-${pi}`;
    const imageRelPath = `assets/${episodeId}/images/${baseName}.png`;
    const videoRelPath = `assets/${episodeId}/images/${baseName}.mp4`;

    // Prefer static image — video backgrounds cause compositor OOM on long segments
    if (existsSync(resolve(dataDir, imageRelPath))) {
      images.push(imageRelPath);
    } else if (existsSync(resolve(dataDir, videoRelPath))) {
      images.push(videoRelPath);
    }
  }
  return images;
}

/**
 * Scan archival directory and return relative paths to found images.
 */
export function resolveArchivalImages(episodeId: string, dataDir: string): string[] {
  const archivalDir = resolve(dataDir, 'assets', episodeId, 'archival');
  if (!existsSync(archivalDir)) return [];

  const images: string[] = [];

  // Scan all archival subdirectories (flickr, wikimedia, loc, ucsc, top-level)
  const scanDir = (dir: string, relPrefix: string): void => {
    if (!existsSync(dir)) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          scanDir(resolve(dir, entry.name), `${relPrefix}/${entry.name}`);
        } else if (/\.(jpg|jpeg|png|gif)$/i.test(entry.name)) {
          images.push(`assets/${episodeId}/archival${relPrefix}/${entry.name}`);
        }
      }
    } catch {
      // ignore
    }
  };

  scanDir(archivalDir, '');

  return images;
}

/**
 * Interleave archival images into an image array every Nth position.
 */
export function interleaveArchival(images: string[], archival: string[], every = 3): string[] {
  if (archival.length === 0) return images;
  const result: string[] = [];
  let archIdx = 0;

  for (let i = 0; i < images.length; i++) {
    result.push(images[i]);
    if ((i + 1) % every === 0 && archIdx < archival.length) {
      result.push(archival[archIdx]);
      archIdx++;
    }
  }

  return result;
}

/**
 * Pad an image array by cycling so there's roughly one image per 5 seconds.
 * Prevents long segments from showing the same 1-2 images on repeat.
 */
export function padImages(images: string[], durationInFrames: number): string[] {
  if (images.length === 0) return images;
  const framesPerImage = 5 * FPS; // 150 frames = 5s per image
  const targetCount = Math.ceil(durationInFrames / framesPerImage);
  if (images.length >= targetCount) return images;

  const padded: string[] = [];
  for (let i = 0; i < targetCount; i++) {
    if (i < images.length) {
      padded.push(images[i]);
    } else {
      // Alternate between cycling real images and procedural slots
      const cycleIndex = i - images.length;
      if (cycleIndex % 2 === 1) {
        padded.push('__procedural__');
      } else {
        padded.push(images[cycleIndex % images.length]);
      }
    }
  }
  return padded;
}
