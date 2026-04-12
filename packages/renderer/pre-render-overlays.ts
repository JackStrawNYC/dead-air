#!/usr/bin/env npx tsx
/**
 * Pre-render overlays — renders React overlay components to transparent PNGs.
 *
 * Renders ALL A-tier and B-tier overlays (selectable pool) at multiple
 * energy states for animation keyframes. Uses real audio analysis data
 * when available, falls back to representative synthetic frames.
 *
 * Uses react-dom/server to render without Remotion/Chrome.
 *
 * Usage:
 *   npx tsx pre-render-overlays.ts \
 *     --output-dir ./overlay-pngs \
 *     --width 3840 --height 2160 \
 *     --data-dir ../visualizer-poc/data
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const __dirname = new URL(".", import.meta.url).pathname;
const VISUALIZER_ROOT = resolve(__dirname, "../visualizer-poc");

// ─── Audio frame sets for rendering at different energy levels ───

function buildAudioFrames(dataDir: string): { quiet: any[]; mid: any[]; loud: any[] } {
  // Try to load real audio data from the first available track
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
    // Extract representative frames at different energy levels
    const sorted = [...realFrames].sort((a, b) => (a.rms ?? 0) - (b.rms ?? 0));
    const quietIdx = Math.floor(sorted.length * 0.15);
    const midIdx = Math.floor(sorted.length * 0.50);
    const loudIdx = Math.floor(sorted.length * 0.85);

    return {
      quiet: realFrames.slice(Math.max(0, quietIdx - 50), quietIdx + 50),
      mid: realFrames.slice(Math.max(0, midIdx - 50), midIdx + 50),
      loud: realFrames.slice(Math.max(0, loudIdx - 50), loudIdx + 50),
    };
  }

  // Synthetic fallback at three energy levels
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
  return {
    quiet: makeFrames(0.08, 0.0),
    mid: makeFrames(0.30, 0.3),
    loud: makeFrames(0.60, 0.8),
  };
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
    const element = React.createElement(Component, { frames });
    const html = renderToStaticMarkup(element);
    const svgMatch = html.match(/<svg[^]*<\/svg>/);
    return svgMatch ? svgMatch[0] : html;
  } catch (e: any) {
    return null;
  }
}

// ─── PNG conversion ───

async function svgToPng(
  svg: string,
  outputPath: string,
  width: number,
): Promise<boolean> {
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const resvg = new Resvg(svg, { fitTo: { mode: "width" as any, value: width } });
    writeFileSync(outputPath, resvg.render().asPng());
    return true;
  } catch {
    writeFileSync(outputPath.replace(".png", ".svg"), svg);
    return false;
  }
}

// ─── Discover overlays from registry ───

async function discoverOverlays(): Promise<{ id: string; componentName: string; tier: string }[]> {
  const registryPath = join(VISUALIZER_ROOT, "src/data/overlay-registry.ts");
  if (!existsSync(registryPath)) {
    console.warn("  overlay-registry.ts not found — using hardcoded list");
    return [];
  }

  try {
    const mod = await import(registryPath);
    const registry = mod.OVERLAY_REGISTRY ?? mod.default ?? [];
    return registry
      .filter((e: any) => e.tier === "A" || e.tier === "B")
      .map((e: any) => ({
        id: e.id,
        componentName: e.componentName ?? e.id,
        tier: e.tier,
      }));
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

  // Build audio frames at three energy levels
  const audioFrames = buildAudioFrames(dataDir);

  // Discover overlays from registry (A + B tier)
  let overlays = await discoverOverlays();

  // Fallback: hardcoded list if registry import fails
  if (overlays.length === 0) {
    overlays = [
      "BreathingStealie", "ThirteenPointBolt", "SunflowerStealie", "SkeletonRoses",
      "StealYourFaceOff", "StealieFade", "DarkStarPortal", "AmericanBeauty",
      "SkeletonBand", "BearParade", "MarchingTerrapins", "DancingTerrapinOverlay",
      "GratefulDeadLogo", "SkullRosesOverlay", "RoseOverlay", "LightningBoltOverlay",
      "Europe72Jester", "WolfGuitar", "BobCowboyHat", "VWBusParade",
      "MeteorShower", "GratefulMandala", "CosmicStarfield", "PsychedelicEye",
      "SpinningYinYang", "Fireflies", "LighterWave", "CrowdDance",
      "GlowSticks", "GodRays", "ParticleExplosion", "LaserShow",
      "EmberRise", "ChinaCatSunflower", "SugarMagnolia", "CosmicEagle",
    ].map(name => ({
      id: name.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, ""),
      componentName: name,
      tier: "A",
    }));
  }

  console.log(`  ${overlays.length} overlays to render (A + B tier)`);

  let rendered = 0;
  let failed = 0;

  // Render each overlay at three energy levels (quiet, mid, loud)
  const energyLevels = [
    { name: "quiet", frames: audioFrames.quiet, frameIdx: 50 },
    { name: "mid", frames: audioFrames.mid, frameIdx: 50 },
    { name: "loud", frames: audioFrames.loud, frameIdx: 50 },
  ];

  for (const overlay of overlays) {
    const componentName = overlay.componentName;

    // Try multiple paths for the component
    const paths = [
      join(VISUALIZER_ROOT, "src/components", `${componentName}.tsx`),
      join(VISUALIZER_ROOT, "src/overlays", `${componentName}.tsx`),
      join(VISUALIZER_ROOT, "src/components/overlays", `${componentName}.tsx`),
    ];
    const modPath = paths.find(p => existsSync(p));

    if (!modPath) {
      failed++;
      continue;
    }

    try {
      const mod = await import(modPath);
      const Component = mod[componentName] || mod.default;
      if (!Component) { failed++; continue; }

      let anyRendered = false;
      for (const { name: levelName, frames, frameIdx } of energyLevels) {
        const svg = renderOverlayToSVG(Component, frames, frameIdx, width, height);
        if (!svg) continue;

        // Use overlay_id for main (mid-energy), suffixed for variants
        const suffix = levelName === "mid" ? "" : `_${levelName}`;
        const outputPath = join(outputDir, `${overlay.id}${suffix}.png`);
        await svgToPng(svg, outputPath, width);
        anyRendered = true;
      }

      if (anyRendered) {
        console.log(`  ${overlay.id} (${overlay.tier}): rendered`);
        rendered++;
      } else {
        failed++;
      }
    } catch (e: any) {
      console.warn(`  FAIL: ${componentName} — ${e.message?.slice(0, 60)}`);
      failed++;
    }
  }

  console.log(`\nPre-rendered: ${rendered} overlays (${rendered * 3} images), ${failed} failed`);
  console.log(`Output: ${outputDir}`);
}

main().catch(e => { console.error(e); process.exit(1); });
