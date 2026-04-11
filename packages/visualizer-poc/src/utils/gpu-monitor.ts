/**
 * gpu-monitor — lightweight GPU resource tracker for render targets.
 *
 * Tracks active WebGLRenderTargets so we can monitor VRAM usage
 * and dispose everything in an emergency (e.g., error boundary catch).
 *
 * Usage:
 *   gpuMonitor.track(target, "FullscreenQuad:main");
 *   gpuMonitor.untrack(target);
 *   gpuMonitor.disposeAll(); // emergency cleanup
 */

import type * as THREE from "three";

interface TrackedTarget {
  target: THREE.WebGLRenderTarget;
  label: string;
}

const tracked = new Map<THREE.WebGLRenderTarget, TrackedTarget>();

/** Register a render target for monitoring. */
function trackRenderTarget(
  target: THREE.WebGLRenderTarget,
  label = "unnamed",
): void {
  tracked.set(target, { target, label });
}

/** Unregister a render target. Safe to call multiple times for the same target. */
function untrackRenderTarget(target: THREE.WebGLRenderTarget): void {
  tracked.delete(target);
}

/** Return count of currently tracked render targets. */
function getActiveCount(): number {
  return tracked.size;
}

/** Dispose all tracked render targets and clear the registry. */
function disposeAll(): void {
  for (const { target, label } of tracked.values()) {
    try {
      target.dispose();
    } catch (e) {
      console.warn(`[gpu-monitor] Failed to dispose target "${label}":`, e);
    }
  }
  tracked.clear();
}

/** Log a summary of active render targets (debugging aid). */
function logStatus(): void {
  console.log(
    `[gpu-monitor] ${tracked.size} active render target(s)`,
  );
  for (const { label } of tracked.values()) {
    console.log(`  - ${label}`);
  }
}

export const gpuMonitor = {
  trackRenderTarget,
  untrackRenderTarget,
  getActiveCount,
  disposeAll,
  logStatus,
};
