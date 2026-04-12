/**
 * Render overlay components to transparent PNGs using Remotion's renderStill API.
 * Each overlay gets rendered at 1920x1080 with a transparent background.
 */
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";

const OUTPUT_DIR = "/tmp/dead-air-overlays";
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const OVERLAYS = [
  "BreathingStealie", "ThirteenPointBolt", "GodRays", "Fireflies",
  "TieDyeWash", "BearParade", "SkeletonBand", "MarchingTerrapins",
  "CosmicStarfield", "LavaLamp", "SkullKaleidoscope", "DarkStarPortal",
  "RoseOverlay", "LightningBoltOverlay", "StealYourFaceOff",
  "SacredGeometry", "VoronoiFlow", "FractalZoom", "MandalaGenerator",
  "StainedGlass",
];

async function main() {
  console.log("Bundling Remotion project...");
  const bundled = await bundle({
    entryPoint: path.resolve("src/index.ts"),
    webpackOverride: (config) => config,
  });

  // Use the existing OverlayPreview composition if it exists,
  // otherwise we'll need to add one
  for (const name of OVERLAYS) {
    const outPath = path.join(OUTPUT_DIR, `${name}.png`);
    if (fs.existsSync(outPath)) {
      console.log(`  SKIP ${name} (already exists)`);
      continue;
    }

    try {
      // Try rendering using the OverlayPreview composition with inputProps
      const composition = await selectComposition({
        serveUrl: bundled,
        id: "OverlayPreview",
        inputProps: { overlayName: name },
      });

      await renderStill({
        composition,
        serveUrl: bundled,
        output: outPath,
        frame: 30,
        imageFormat: "png",
        inputProps: { overlayName: name },
      });

      console.log(`  OK ${name}`);
    } catch (e: any) {
      console.log(`  FAIL ${name}: ${e.message?.slice(0, 80)}`);
    }
  }

  console.log(`\nDone! Check ${OUTPUT_DIR}/`);
}

main().catch(console.error);
