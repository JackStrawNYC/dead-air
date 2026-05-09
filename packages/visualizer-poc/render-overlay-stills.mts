/**
 * Render overlay components to transparent PNGs using Remotion's renderStill API.
 *
 * Each overlay is exported in 3 audio-state variants — low / mid / high
 * energy — sampled from a real Veneta jam track instead of synthetic sine
 * waves. The mid variant is written as `{name}.png` (preserves Rust pipeline
 * backward-compat) and the extremes as `{name}-low.png` / `{name}-high.png`
 * for future per-frame variant selection in the Rust compositor.
 *
 * Prior implementation rendered a single PNG per overlay using
 * OverlayPreview's synthetic fallback (sine-wave RMS, fixed beat grid, fixed
 * chroma) — every reactive overlay was frozen at "moderate fake audio,"
 * effectively dead in the Rust output regardless of song dynamics.
 */
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import { buildVariantWindows } from "./src/utils/overlay-frame-window";

const OUTPUT_DIR = "/tmp/dead-air-overlays";
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Coverage set: all A-tier overlays from overlay-registry.ts plus the
// previously-rendered seed list (some of which are B/C tier but actively
// scheduled). 50+ unique names → 150+ PNG triples. The Rust compositor's
// variant lookup falls back to bare PNG when a variant is missing, but
// shows benefit most when the full triple is on disk.
const OVERLAYS = [
  // ─── Existing seed list (B/C-tier active) ───
  "BreathingStealie", "ThirteenPointBolt", "GodRays", "Fireflies",
  "TieDyeWash", "BearParade", "SkeletonBand", "MarchingTerrapins",
  "CosmicStarfield", "LavaLamp", "SkullKaleidoscope", "DarkStarPortal",
  "RoseOverlay", "LightningBoltOverlay", "StealYourFaceOff",
  "SacredGeometry", "VoronoiFlow", "FractalZoom", "MandalaGenerator",
  "StainedGlass",
  // ─── A-tier expansion (from overlay-registry.ts tier: "A") ───
  "AmericanBeauty", "BearTraced", "BirdInFlight", "CandleGlow",
  "CelestialFaces", "GospelChurch", "GratefulDeadLogo", "HeadlightTrain",
  "HeatShimmer", "LiquidLightBorder", "LotusBloom", "MeteorShower",
  "MexicaliDesert", "MoonPhases", "MushroomCluster", "MushroomForest",
  "MusicalNotation", "NeonStreaks", "OregonSunBlaze", "OuroborosOverlay",
  "PlayingCards", "PrismRainbow", "RainbowArc", "RenaissanceFaireBanner",
  "SacredGeometryOverlay", "SmokeWisps", "SpeakerStack", "SpiralGalaxyOverlay",
  "StealieTraced", "SugareeRose", "SunshineDaydreamCamera", "TieDyeBorder",
  "VenetaSwimmers", "WallOfSound",
];

/** Source track for representative frames — d2t03 is a mid-set Veneta jam
 *  with a full energy distribution. Adjust if a different track better
 *  represents the show range. */
const SOURCE_ANALYSIS = path.resolve(
  "data/shows/1972-08-27/tracks/d2t03-analysis.json",
);

const WINDOW_FRAMES = 60;  // 2-second context window passed to the component
const STILL_FRAME = 30;    // composition-relative frame index to capture

async function main() {
  if (!fs.existsSync(SOURCE_ANALYSIS)) {
    console.error(`Source analysis not found: ${SOURCE_ANALYSIS}`);
    console.error(`Run the pipeline on Veneta first, or update SOURCE_ANALYSIS.`);
    process.exit(1);
  }
  console.log(`Loading source analysis: ${SOURCE_ANALYSIS}`);
  const raw = JSON.parse(fs.readFileSync(SOURCE_ANALYSIS, "utf-8"));
  const sourceFrames: any[] = raw.frames ?? [];
  if (sourceFrames.length < WINDOW_FRAMES * 2) {
    console.error(`Source has only ${sourceFrames.length} frames; need ≥ ${WINDOW_FRAMES * 2}`);
    process.exit(1);
  }

  // Pre-compute the 3 frame windows (low/mid/high energy) via the shared
  // overlay-frame-window util (tested in overlay-frame-window.test.ts).
  const windows = buildVariantWindows(sourceFrames as any, WINDOW_FRAMES);
  for (const { variant, window } of windows) {
    const rms = window[STILL_FRAME]?.rms ?? 0;
    console.log(`  variant ${variant.suffix || "(mid)"}: rms=${rms.toFixed(3)}`);
  }

  console.log("Bundling Remotion project...");
  const bundled = await bundle({
    entryPoint: path.resolve("src/overlay-entry.ts"),
    webpackOverride: (config) => config,
  });

  let okCount = 0;
  let failCount = 0;
  for (const name of OVERLAYS) {
    for (const { variant, window } of windows) {
      const outPath = path.join(OUTPUT_DIR, `${name}${variant.suffix}.png`);
      if (fs.existsSync(outPath)) {
        console.log(`  SKIP ${name}${variant.suffix} (already exists)`);
        okCount++;
        continue;
      }

      try {
        const inputProps = { overlayName: name, frames: window };
        const composition = await selectComposition({
          serveUrl: bundled,
          id: "OverlayPreview",
          inputProps,
        });

        await renderStill({
          composition,
          serveUrl: bundled,
          output: outPath,
          frame: STILL_FRAME,
          imageFormat: "png",
          inputProps,
        });

        console.log(`  OK ${name}${variant.suffix}`);
        okCount++;
      } catch (e: any) {
        console.log(`  FAIL ${name}${variant.suffix}: ${e.message?.slice(0, 80)}`);
        failCount++;
      }
    }
  }

  console.log(`\nDone! ${okCount} ok, ${failCount} failed. Output: ${OUTPUT_DIR}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
