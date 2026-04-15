#!/usr/bin/env npx tsx
/**
 * Pre-render overlays — renders React overlay components to transparent PNGs.
 *
 * Renders ALL A-tier and B-tier overlays at multiple energy states.
 * Uses real audio analysis data when available, falls back to synthetic frames.
 *
 * Mocks Remotion's React context providers (useCurrentFrame, useVideoConfig)
 * to enable headless server-side rendering without Chrome/Puppeteer.
 *
 * Usage (run from packages/visualizer-poc):
 *   npx tsx ../renderer/pre-render-overlays.ts \
 *     --output-dir ../renderer/overlay-pngs \
 *     --width 3840 --height 2160 \
 *     --data-dir ./data
 */

// Mock browser APIs before Remotion loads
(globalThis as any).localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
};

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import * as remotion from "remotion";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const I = (remotion as any).Internals;
const __dirname = new URL(".", import.meta.url).pathname;
const VISUALIZER_ROOT = resolve(__dirname, "..");

// ─── Remotion Context Factory ───

function buildRemotionContexts(width: number, height: number, frame: number, fps: number) {
  const compId = "overlay-prerender";
  return {
    canUseRemotionHooksContext: true,
    nonceContext: { nonce: 0, fastRefreshes: 0 },
    preloadContext: { free: () => {}, preloads: {} },
    compositionManagerCtx: {
      ...I.CompositionManager._currentValue,
      canvasContent: { type: "composition", compositionId: compId },
      compositions: [{
        id: compId, durationInFrames: 1800, fps, height, width,
        defaultProps: {}, component: { current: null }, nonce: 0,
        parentFolderName: null, schema: null, calculateMetadata: null,
      }],
      currentCompositionMetadata: {
        durationInFrames: 1800, fps, height, width, defaultProps: {}, id: compId, defaultCodec: "h264",
      },
    },
    sequenceManagerContext: { sequences: [] },
    renderAssetManagerContext: { renderAssets: [], addRenderAsset: () => {} },
    resolveCompositionContext: {
      compositions: new Map([[compId, { type: "success", result: {
        durationInFrames: 1800, fps, height, width, props: {}, defaultCodec: "h264",
      }}]]),
      setCompositions: () => {},
    },
    timelineContext: {
      ...I.Timeline.TimelineContext._currentValue,
      frame: { [compId]: frame },
      playing: false,
      rootId: compId,
    },
    setTimelineContext: { setFrame: () => {}, setPlaying: () => {} },
    sequenceContext: {
      cumulatedFrom: 0, relativeFrom: 0, parentFrom: 0,
      durationInFrames: 1800, id: "seq-0", width, height,
    },
    bufferManagerContext: { bufferState: { current: {} } },
  };
}

// ─── Audio frame sets ───

function buildAudioFrames(dataDir: string): { quiet: any[]; mid: any[]; loud: any[] } {
  const tracksDir = join(dataDir, "tracks");
  let realFrames: any[] | null = null;

  if (existsSync(tracksDir)) {
    const files = readdirSync(tracksDir).filter(f => f.endsWith("-analysis.json"));
    if (files.length > 0) {
      try {
        const analysis = JSON.parse(readFileSync(join(tracksDir, files[0]), "utf-8"));
        realFrames = analysis.frames;
        console.log(`  Using real audio from ${files[0]} (${realFrames!.length} frames)`);
      } catch {}
    }
  }

  if (realFrames && realFrames.length > 100) {
    const sorted = [...realFrames].sort((a, b) => (a.rms ?? 0) - (b.rms ?? 0));
    return {
      quiet: realFrames.slice(Math.max(0, Math.floor(sorted.length * 0.15) - 50), Math.floor(sorted.length * 0.15) + 50),
      mid: realFrames.slice(Math.max(0, Math.floor(sorted.length * 0.50) - 50), Math.floor(sorted.length * 0.50) + 50),
      loud: realFrames.slice(Math.max(0, Math.floor(sorted.length * 0.85) - 50), Math.floor(sorted.length * 0.85) + 50),
    };
  }

  const makeFrames = (rms: number, onset: number) =>
    Array.from({ length: 100 }, (_, i) => ({
      rms, centroid: 0.3 + rms * 0.3, onset: i % 15 === 0 ? onset : 0,
      beat: i % 15 === 0, sub: rms * 0.5, low: rms * 0.3,
      mid: rms * 0.4, high: rms * 0.2, chroma: Array(12).fill(0.08),
      contrast: Array(7).fill(rms), flatness: 0.3 + rms * 0.2,
      beatConfidence: 0.6, stemVocalPresence: rms > 0.3,
      stemVocalRms: rms * 0.3, stemDrumOnset: i % 15 === 0 ? 0.8 : 0,
    }));

  console.log("  Using synthetic audio frames (no analysis data found)");
  return { quiet: makeFrames(0.08, 0.0), mid: makeFrames(0.30, 0.3), loud: makeFrames(0.60, 0.8) };
}

// ─── SVG extraction from React render ───

function renderOverlayToSVG(
  Component: React.ComponentType<any>,
  frames: any[],
  frame: number,
  width: number,
  height: number,
): string | null {
  try {
    const contexts = buildRemotionContexts(width, height, frame, 60);
    const wrapped = React.createElement(
      I.RemotionContextProvider,
      { contexts },
      React.createElement(Component, { frames }),
    );
    const html = renderToStaticMarkup(wrapped);
    // Extract SVG element, or use full HTML if it contains visual content
    const svgMatch = html.match(/<svg[^]*<\/svg>/);
    if (svgMatch) {
      let svg = svgMatch[0];
      // Add xmlns if missing (React SSR omits it, resvg requires it)
      if (!svg.includes('xmlns=')) {
        svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      }
      return svg;
    }
    // If no SVG but has div content with styles, wrap in SVG for rasterization
    if (html.length > 50 && html.includes("style")) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">${html}</foreignObject>
      </svg>`;
    }
    return null;
  } catch (e: any) {
    console.warn(`    render error: ${e.message?.slice(0, 120)}`);
    return null;
  }
}

// ─── PNG conversion ───

import { execSync } from "child_process";

async function svgToPng(svg: string, outputPath: string, width: number): Promise<boolean> {
  // Save SVG first (fast)
  const svgPath = outputPath.replace(".png", ".svg");
  writeFileSync(svgPath, svg);

  // Convert to PNG via ImageMagick (handles complex SVGs well)
  try {
    execSync(
      `convert -background none -resize ${width}x "${svgPath}" "${outputPath}"`,
      { timeout: 30000, stdio: "pipe" },
    );
    return true;
  } catch {
    // SVG saved as fallback
    return false;
  }
}

// ─── Discover overlays from registry ───

async function discoverOverlays(): Promise<{ id: string; componentName: string; tier: string }[]> {
  const registryPath = join(VISUALIZER_ROOT, "src/data/overlay-registry.ts");
  if (!existsSync(registryPath)) return [];

  try {
    const mod = await import(registryPath);
    const registry = mod.OVERLAY_REGISTRY ?? mod.default ?? [];
    return registry
      .filter((e: any) => (e.tier === "A" || e.tier === "B") && !e.alwaysActive)
      .map((e: any) => ({ id: e.name, componentName: e.name, tier: e.tier }));
  } catch (e: any) {
    console.warn(`  Registry import failed: ${e.message?.slice(0, 80)}`);
    return [];
  }
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : def;
  };

  const outputDir = getArg("output-dir", "./overlay-pngs");
  const width = parseInt(getArg("width", "3840"));
  const height = parseInt(getArg("height", "2160"));
  const dataDir = getArg("data-dir", join(VISUALIZER_ROOT, "data"));

  mkdirSync(outputDir, { recursive: true });
  console.log(`Pre-rendering overlays at ${width}x${height} → ${outputDir}`);

  const audioFrames = buildAudioFrames(dataDir);
  let overlays = await discoverOverlays();

  if (overlays.length === 0) {
    console.error("No overlays found in registry");
    process.exit(1);
  }

  console.log(`  ${overlays.length} overlays to render (A + B tier)`);

  let rendered = 0;
  let failed = 0;
  const failedNames: string[] = [];

  const energyLevels = [
    { name: "quiet", frames: audioFrames.quiet, frameIdx: 30 },
    { name: "mid", frames: audioFrames.mid, frameIdx: 50 },
    { name: "loud", frames: audioFrames.loud, frameIdx: 70 },
  ];

  for (const overlay of overlays) {
    const componentName = overlay.componentName;

    const paths = [
      join(VISUALIZER_ROOT, "src/components", `${componentName}.tsx`),
      join(VISUALIZER_ROOT, "src/overlays", `${componentName}.tsx`),
      join(VISUALIZER_ROOT, "src/components/overlays", `${componentName}.tsx`),
    ];
    const modPath = paths.find(p => existsSync(p));

    if (!modPath) {
      failedNames.push(`${componentName} (no file)`);
      failed++;
      continue;
    }

    try {
      const mod = await import(modPath);
      const Component = mod[componentName] || mod.default;
      if (!Component) {
        failedNames.push(`${componentName} (no export)`);
        failed++;
        continue;
      }

      let anyRendered = false;
      for (const { name: levelName, frames, frameIdx } of energyLevels) {
        const svg = renderOverlayToSVG(Component, frames, frameIdx, width, height);
        if (!svg) continue;

        const suffix = levelName === "mid" ? "" : `_${levelName}`;
        const outputPath = join(outputDir, `${overlay.id}${suffix}.png`);
        const ok = await svgToPng(svg, outputPath, width);
        anyRendered = true;
      }

      if (anyRendered) {
        rendered++;
        if (rendered % 10 === 0) console.log(`  [${rendered}/${overlays.length}] rendered...`);
      } else {
        failedNames.push(`${componentName} (render null)`);
        failed++;
      }
    } catch (e: any) {
      failedNames.push(`${componentName} (${e.message?.slice(0, 40)})`);
      failed++;
    }
  }

  console.log(`\nPre-rendered: ${rendered} overlays (${rendered * 3} images), ${failed} failed`);
  if (failedNames.length > 0 && failedNames.length <= 20) {
    console.log("Failed:", failedNames.join(", "));
  } else if (failedNames.length > 20) {
    console.log(`Failed (first 20): ${failedNames.slice(0, 20).join(", ")}`);
  }
  console.log(`Output: ${outputDir}`);
}

main().catch(e => { console.error(e); process.exit(1); });
