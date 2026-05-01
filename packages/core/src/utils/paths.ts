/**
 * Workspace-aware path resolution.
 *
 * Replaces fragile `../../..` chains scattered across packages with a single
 * workspace-root anchor. Works whether scripts run via tsx, compiled JS, or
 * inside Docker — falls back to env var DEAD_AIR_ROOT when filesystem walks
 * can't find a marker (e.g., bundled binaries, CI containers without git).
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT_MARKERS = ['pnpm-workspace.yaml', 'turbo.json'];

let cachedRoot: string | null = null;

/**
 * Find the dead-air monorepo root. Walks up from `start` until it finds a
 * directory containing one of ROOT_MARKERS. Caches the answer for the
 * process lifetime — the workspace doesn't move at runtime.
 */
export function findWorkspaceRoot(start?: string): string {
  if (cachedRoot) return cachedRoot;

  if (process.env.DEAD_AIR_ROOT) {
    cachedRoot = resolve(process.env.DEAD_AIR_ROOT);
    return cachedRoot;
  }

  let dir = start ?? process.cwd();
  // Resolve the start directory in case caller passed a file URL.
  if (dir.startsWith('file://')) dir = fileURLToPath(dir);
  dir = resolve(dir);

  for (let i = 0; i < 12; i++) {
    if (ROOT_MARKERS.some((m) => existsSync(join(dir, m)))) {
      cachedRoot = dir;
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    `findWorkspaceRoot: no marker (${ROOT_MARKERS.join('|')}) found walking up from ${start ?? process.cwd()}. ` +
      `Set DEAD_AIR_ROOT env var to override.`,
  );
}

/**
 * Find a workspace package by its pnpm `name` (e.g. "@dead-air/visualizer-poc").
 * Throws if not present so callers fail loudly instead of silently using "".
 */
export function packageRoot(packageName: string): string {
  const root = findWorkspaceRoot();
  // pnpm workspaces follow packages/<name> convention here; rather than
  // hardcoding, scan packages/* for matching package.json name field.
  const fs = require('fs') as typeof import('fs');
  const pkgsDir = join(root, 'packages');
  if (!existsSync(pkgsDir)) {
    throw new Error(`packageRoot: ${pkgsDir} not found`);
  }
  for (const entry of fs.readdirSync(pkgsDir)) {
    const pkgJson = join(pkgsDir, entry, 'package.json');
    if (!existsSync(pkgJson)) continue;
    try {
      const meta = JSON.parse(readFileSync(pkgJson, 'utf-8')) as { name?: string };
      if (meta.name === packageName) return join(pkgsDir, entry);
    } catch {
      // skip unreadable
    }
  }
  throw new Error(`packageRoot: package "${packageName}" not found under ${pkgsDir}`);
}

/** Convenience: shortcut for the renderer package. (No package.json — uses path convention.) */
export function rendererRoot(): string {
  return join(findWorkspaceRoot(), 'packages', 'renderer');
}

/** Convenience: shortcut for the visualizer-poc package. */
export function visualizerPocRoot(): string {
  return packageRoot('@dead-air/visualizer-poc');
}

/** Workspace-relative path. Joins from monorepo root. */
export function fromRoot(...parts: string[]): string {
  return join(findWorkspaceRoot(), ...parts);
}

/** For tests: clear the cached root so callers see fresh resolution. */
export function _resetWorkspaceRootCache(): void {
  cachedRoot = null;
}
