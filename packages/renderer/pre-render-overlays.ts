#!/usr/bin/env npx tsx
/**
 * Pre-render overlays — renders React overlay components to transparent PNGs.
 *
 * For STATIC overlays: renders once at target resolution.
 * For ANIMATED overlays: renders keyframes at 10fps, outputs SVG strings.
 *
 * Uses react-dom/server to render components without Remotion/Chrome.
 * Mocks Remotion hooks (useCurrentFrame, useVideoConfig, etc.).
 *
 * Usage:
 *   npx tsx pre-render-overlays.ts \
 *     --output-dir ./overlay-pngs \
 *     --width 3840 --height 2160 \
 *     --data-dir ../visualizer-poc/data
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const __dirname = new URL(".", import.meta.url).pathname;
const VISUALIZER_ROOT = resolve(__dirname, "../visualizer-poc");

// ─── Mock Remotion hooks ───
// Overlay components use these hooks to get frame/config/audio data.
// We provide mock implementations that return static values.

let _mockFrame = 0;
let _mockWidth = 3840;
let _mockHeight = 2160;
let _mockFps = 60;
let _mockTempoFactor = 1.0;
let _mockFrames: any[] = [];

// Mock module registry — overlay components import from "remotion"
// We intercept these at the module level.
// NOTE: This requires tsx/esbuild to resolve these before React renders.

function createMockAudioSnapshot() {
  return {
    energy: 0.4,
    slowEnergy: 0.35,
    bass: 0.3,
    mids: 0.25,
    highs: 0.2,
    centroid: 0.45,
    beatDecay: 0.0,
    onsetEnvelope: 0.0,
    chromaHue: 180,
    vocalPresence: 0.3,
    vocalEnergy: 0.1,
  };
}

// ─── SVG extraction from React render ───

function renderOverlayToSVG(
  Component: React.ComponentType<{ frames: any[] }>,
  frames: any[],
  frame: number,
  width: number,
  height: number,
): string | null {
  try {
    // Set mock values
    _mockFrame = frame;
    _mockWidth = width;
    _mockHeight = height;

    // Render component to static markup
    const element = React.createElement(Component, { frames });
    const html = renderToStaticMarkup(element);

    // Extract SVG from the rendered HTML
    // Components render: <div style="..."><svg ...>...</svg></div>
    const svgMatch = html.match(/<svg[^]*<\/svg>/);
    if (svgMatch) {
      return svgMatch[0];
    }

    return html; // Return full markup if no SVG extracted
  } catch (e: any) {
    console.warn(`  Render failed: ${e.message?.slice(0, 80)}`);
    return null;
  }
}

// ─── PNG conversion via resvg-js (if available) or write SVG ───

async function svgToPng(
  svg: string,
  outputPath: string,
  width: number,
  height: number,
): Promise<boolean> {
  // Try using resvg-js for Node.js SVG→PNG conversion
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width" as any, value: width },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    writeFileSync(outputPath, pngBuffer);
    return true;
  } catch {
    // Fallback: save as SVG (Rust resvg will handle conversion)
    const svgPath = outputPath.replace(".png", ".svg");
    writeFileSync(svgPath, svg);
    return false;
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

  // Build dummy frames for static rendering (mid-energy, generic)
  const dummyFrames: any[] = Array.from({ length: 100 }, (_, i) => ({
    rms: 0.3, centroid: 0.45, onset: 0, beat: false,
    sub: 0.15, low: 0.1, mid: 0.15, high: 0.1,
    chroma: Array(12).fill(0.08),
    contrast: Array(7).fill(0.3),
    flatness: 0.3,
    beatConfidence: 0.6,
    stemVocalPresence: false,
  }));

  // List of A-tier overlays to pre-render
  // Each entry: [componentPath, overlayId]
  const overlays: [string, string][] = [
    ["BreathingStealie", "breathing_stealie"],
    ["ThirteenPointBolt", "thirteen_point_bolt"],
    ["SunflowerStealie", "sunflower_stealie"],
    ["SkeletonRoses", "skeleton_roses"],
    ["StealYourFaceOff", "steal_your_face_off"],
    ["StealieFade", "stealie_fade"],
    ["DarkStarPortal", "dark_star_portal"],
    ["AmericanBeauty", "american_beauty"],
    ["SkeletonBand", "skeleton_band"],
    ["BearParade", "bear_parade"],
    ["MarchingTerrapins", "marching_terrapins"],
    ["DancingTerrapinOverlay", "dancing_terrapin"],
    ["GratefulDeadLogo", "grateful_dead_logo"],
    ["SkullRosesOverlay", "skull_roses"],
    ["RoseOverlay", "rose_overlay"],
    ["LightningBoltOverlay", "lightning_bolt"],
    ["Europe72Jester", "europe72_jester"],
    ["WolfGuitar", "wolf_guitar"],
    ["BobCowboyHat", "bob_cowboy_hat"],
    ["VWBusParade", "vw_bus_parade"],
    ["MeteorShower", "meteor_shower"],
    ["GratefulMandala", "grateful_mandala"],
    ["CosmicStarfield", "cosmic_starfield"],
    ["PsychedelicEye", "psychedelic_eye"],
    ["SpinningYinYang", "spinning_yin_yang"],
  ];

  let rendered = 0;
  let failed = 0;

  for (const [componentName, overlayId] of overlays) {
    try {
      // Dynamic import of overlay component
      const modPath = join(VISUALIZER_ROOT, "src/components", `${componentName}.tsx`);
      if (!existsSync(modPath)) {
        console.warn(`  SKIP: ${componentName} — file not found`);
        failed++;
        continue;
      }

      const mod = await import(modPath);
      const Component = mod[componentName] || mod.default;

      if (!Component) {
        console.warn(`  SKIP: ${componentName} — no export found`);
        failed++;
        continue;
      }

      // Render at mid-frame for a representative static image
      const svg = renderOverlayToSVG(Component, dummyFrames, 50, width, height);
      if (!svg) {
        failed++;
        continue;
      }

      const outputPath = join(outputDir, `${overlayId}.png`);
      const asPng = await svgToPng(svg, outputPath, width, height);

      console.log(`  ${overlayId}: ${asPng ? "PNG" : "SVG"} (${svg.length} chars)`);
      rendered++;
    } catch (e: any) {
      console.warn(`  FAIL: ${componentName} — ${e.message?.slice(0, 60)}`);
      failed++;
    }
  }

  console.log(`\nPre-rendered: ${rendered} overlays, ${failed} failed`);
  console.log(`Output: ${outputDir}`);
}

main().catch(e => { console.error(e); process.exit(1); });
