#!/usr/bin/env npx tsx
/**
 * Generate high-quality Grateful Dead overlay icons via Grok Aurora.
 *
 * Produces PNG images with black backgrounds optimized for screen/additive
 * blending over shader scenes. Each icon gets 3 variants for visual variety.
 *
 * Usage:
 *   npx tsx scripts/generate-dead-icons.ts
 *   npx tsx scripts/generate-dead-icons.ts --dry-run
 *   npx tsx scripts/generate-dead-icons.ts --only stealie
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const XAI_API_KEY = process.env.XAI_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE_FLUX = process.argv.includes("--flux");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1]
  ?? (process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : undefined);

const OUT_DIR = path.resolve(__dirname, "../public/assets/dead-icons");

if (!XAI_API_KEY && !REPLICATE_API_TOKEN && !DRY_RUN) {
  console.error("Neither XAI_API_KEY nor REPLICATE_API_TOKEN set. Use --dry-run to preview prompts.");
  process.exit(1);
}

// ── Style constants ──
// Black background is critical: screen blend makes black transparent over shaders.
// High contrast, vivid colors, no text. Centered composition for overlay scaling.

const STYLE = [
  "centered on pure black background",
  "psychedelic concert poster art style",
  "vivid saturated neon colors",
  "high contrast, sharp details",
  "Stanley Mouse and Alton Kelley inspired illustration",
  "no text, no words, no letters, no writing, no watermarks",
].join(", ");

const STYLE_COSMIC = [
  "centered on pure black background",
  "cosmic psychedelic art",
  "glowing ethereal neon colors with light trails",
  "deep space atmosphere",
  "high contrast, sharp details",
  "no text, no words, no letters, no writing, no watermarks",
].join(", ");

const STYLE_VINTAGE = [
  "centered on pure black background",
  "1970s rock poster illustration style",
  "warm rich colors, golden highlights",
  "vintage screen-print aesthetic with visible ink texture",
  "high contrast, sharp details",
  "no text, no words, no letters, no writing, no watermarks",
].join(", ");

// ── Icon definitions ──
// Each icon has a base prompt and 3 variant suffixes for show-to-show variety.

interface IconDef {
  id: string;
  variants: string[];
}

const ICONS: IconDef[] = [
  // ── Steal Your Face (5 variants) ──
  {
    id: "stealie",
    variants: [
      `Steal Your Face skull logo, circular emblem with lightning bolt through the skull, ${STYLE}`,
      `Steal Your Face skull, radiating psychedelic energy, fractal patterns emanating from the lightning bolt, ${STYLE_COSMIC}`,
      `Steal Your Face skull logo, roses and thorny vines growing around the circle, detailed botanical elements, ${STYLE_VINTAGE}`,
      `Steal Your Face skull with prismatic rainbow lightning bolt, crystalline edges, holographic iridescent glow, ${STYLE_COSMIC}`,
      `Steal Your Face skull emblem, worn weathered vintage concert poster style, faded edges, authentic patina, ${STYLE_VINTAGE}`,
    ],
  },

  // ── Dancing Bears (5 variants) ──
  {
    id: "bears",
    variants: [
      `row of five Grateful Dead dancing bears in classic rainbow colors marching in a line, each bear in a different dance pose, ${STYLE}`,
      `single large Grateful Dead dancing bear, orange, mid-dance with arms and legs extended joyfully, detailed fur texture, ${STYLE}`,
      `three Grateful Dead dancing bears in a circle holding hands, psychedelic tie-dye pattern fur, ${STYLE_COSMIC}`,
      `Grateful Dead dancing bear silhouette filled with cosmic starfield and nebula, galaxy inside the bear shape, ${STYLE_COSMIC}`,
      `Grateful Dead dancing bears parade, five bears in rainbow colors with neon glow outlines, celebratory poses, ${STYLE}`,
    ],
  },

  // ── Skeleton / Skull & Roses (5 variants) ──
  {
    id: "skeleton",
    variants: [
      `skeleton playing electric guitar surrounded by blooming roses, Grateful Dead Skull and Roses art style, detailed bone structure, ${STYLE_VINTAGE}`,
      `ornate human skull with crown of American Beauty roses, thorny vines weaving through eye sockets, ${STYLE}`,
      `full skeleton dancing with arms raised joyfully, surrounded by swirling rose petals and music notes, ${STYLE}`,
      `skeleton couple slow dancing together, one holding a single red rose, elegant and romantic, ${STYLE_VINTAGE}`,
      `skeleton band of four musicians playing bass drums guitar and singing, concert stage energy, ${STYLE}`,
    ],
  },

  // ── Roses (4 variants) ──
  {
    id: "roses",
    variants: [
      `single perfect American Beauty red rose in full bloom, detailed petals with dewdrops, dark thorny stem, ${STYLE}`,
      `bouquet of psychedelic roses in impossible colors — electric blue, neon pink, golden, each petal glowing, ${STYLE_COSMIC}`,
      `rose mandala pattern, symmetrical arrangement of roses forming a sacred geometry circle, ${STYLE}`,
      `climbing roses on old wooden fence, vintage Americana pastoral scene, warm golden light, ${STYLE_VINTAGE}`,
    ],
  },

  // ── Terrapin / Turtle (4 variants) ──
  {
    id: "terrapin",
    variants: [
      `ornate turtle carrying a Greek temple on its shell, Terrapin Station mythology, detailed columns and dome, ${STYLE}`,
      `sea turtle swimming through cosmic space, shell covered in sacred geometry patterns, bioluminescent glow, ${STYLE_COSMIC}`,
      `line of five psychedelic turtles marching, each with uniquely patterned shell in different colors, ${STYLE}`,
      `ancient wise turtle with crystal formations growing from its shell, mystical elder energy, ${STYLE_COSMIC}`,
    ],
  },

  // ── Lightning Bolt (3 variants) ──
  {
    id: "bolt",
    variants: [
      `thirteen point lightning bolt, iconic Grateful Dead style, crackling electric energy, branching plasma, ${STYLE}`,
      `massive lightning bolt striking from cosmic void, prismatic light splitting into rainbow, energy explosion, ${STYLE_COSMIC}`,
      `art deco lightning bolt with ornate geometric framing, vintage golden ratio proportions, ${STYLE_VINTAGE}`,
    ],
  },

  // ── Uncle Sam / Cosmic Characters (3 variants) ──
  {
    id: "cosmic-character",
    variants: [
      `Uncle Sam skeleton in star-spangled top hat pointing forward, Grateful Dead psychedelic patriotic, ${STYLE}`,
      `cosmic jester or fool figure juggling planets and stars, Grateful Dead whimsy, bells on hat, ${STYLE_COSMIC}`,
      `wizard figure with flowing robes made of tie-dye patterns, staff topped with a crystal Stealie, ${STYLE_COSMIC}`,
    ],
  },

  // ── Dark Star / Space (3 variants) ──
  {
    id: "darkstar",
    variants: [
      `dark star portal, swirling black hole with psychedelic accretion disk in Dead colors, cosmic gateway, ${STYLE_COSMIC}`,
      `exploding supernova star with Grateful Dead iconography emerging from the light, cosmic birth, ${STYLE_COSMIC}`,
      `field of stars forming a Steal Your Face constellation pattern, deep space photography feel, ${STYLE_COSMIC}`,
    ],
  },

  // ── Eyes of the World / Mystical (3 variants) ──
  {
    id: "mystical",
    variants: [
      `all-seeing eye radiating psychedelic light rays, Egyptian mystical style, iris is a galaxy, ${STYLE_COSMIC}`,
      `mandala made of Grateful Dead iconography — bears, roses, bolts, skulls — in sacred geometry pattern, ${STYLE}`,
      `psychedelic sun and moon face together, half day half night, cosmic duality, Art Nouveau border, ${STYLE_VINTAGE}`,
    ],
  },

  // ── Bertha / Iconic Scenes (3 variants) ──
  {
    id: "bertha",
    variants: [
      `ornate skeleton queen Bertha with crown of roses and flowing robes, Grateful Dead royalty, full figure, ${STYLE}`,
      `skeleton emerging from a bed of roses reaching toward a beam of light, transcendent moment, ${STYLE_COSMIC}`,
      `two skeletons shaking hands across a rainbow bridge, unity and connection, ${STYLE}`,
    ],
  },
];

// ── Grok Aurora API ──

async function generateWithGrok(prompt: string): Promise<Buffer> {
  const response = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-2-image-1212",
      prompt,
      n: 1,
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as {
    data: Array<{ b64_json?: string; url?: string }>;
  };

  const imageData = data.data[0];
  if (imageData.b64_json) {
    return Buffer.from(imageData.b64_json, "base64");
  } else if (imageData.url) {
    const imgResponse = await fetch(imageData.url);
    if (!imgResponse.ok) throw new Error(`Failed to download: ${imgResponse.status}`);
    return Buffer.from(await imgResponse.arrayBuffer());
  }
  throw new Error("No image data in response");
}

// ── Replicate API (Grok or Flux) ──

async function generateViaReplicate(prompt: string, model: string): Promise<Buffer> {
  const input: Record<string, unknown> = model.includes("grok")
    ? { prompt, aspect_ratio: "1:1" }
    : { prompt, width: 1024, height: 1024, num_inference_steps: 28, guidance: 3.5 };

  const response = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Replicate API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as {
    output?: string | string[];
    urls?: { get: string };
    status?: string;
  };

  let imageUrl: string | undefined;
  if (data.output) {
    imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
  } else if (data.status === "processing" && data.urls?.get) {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(data.urls!.get, {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
      });
      const pollData = (await poll.json()) as { output?: string | string[]; status: string };
      if (pollData.status === "succeeded" && pollData.output) {
        imageUrl = Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
        break;
      }
      if (pollData.status === "failed") throw new Error(`${model} prediction failed`);
    }
  }

  if (!imageUrl) throw new Error(`No image URL from ${model}`);

  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) throw new Error(`Failed to download image: ${imgResponse.status}`);
  return Buffer.from(await imgResponse.arrayBuffer());
}

// ── Unified generator ──

async function generateImage(prompt: string): Promise<{ buffer: Buffer; provider: string }> {
  if (!REPLICATE_API_TOKEN) throw new Error("REPLICATE_API_TOKEN required");

  if (FORCE_FLUX) {
    return { buffer: await generateViaReplicate(prompt, "black-forest-labs/flux-dev"), provider: "flux-dev" };
  }

  // Default: Grok via Replicate (highest quality)
  try {
    return { buffer: await generateViaReplicate(prompt, "xai/grok-imagine-image"), provider: "grok" };
  } catch (err) {
    console.log(`    Grok failed: ${(err as Error).message.slice(0, 80)}, falling back to Flux Dev...`);
    return { buffer: await generateViaReplicate(prompt, "black-forest-labs/flux-dev"), provider: "flux-dev" };
  }
}

// ── Main ──

async function main() {
  // Filter if --only specified
  const icons = ONLY
    ? ICONS.filter((i) => i.id.includes(ONLY))
    : ICONS;

  if (icons.length === 0) {
    console.error(`No icons matching "${ONLY}". Available: ${ICONS.map((i) => i.id).join(", ")}`);
    process.exit(1);
  }

  const totalImages = icons.reduce((sum, i) => sum + i.variants.length, 0);
  const provider = (FORCE_FLUX || !XAI_API_KEY) ? "Flux Dev (Replicate)" : "Grok Aurora → Flux Dev fallback";
  const costPerImage = (FORCE_FLUX || !XAI_API_KEY) ? 0.012 : 0.07;
  console.log(`\n🎨 Generating ${totalImages} Dead icons across ${icons.length} categories`);
  console.log(`   Output: ${OUT_DIR}`);
  console.log(`   Model: ${provider}`);
  console.log(`   Est. cost: ~$${(totalImages * costPerImage).toFixed(2)}\n`);

  if (DRY_RUN) {
    console.log("── DRY RUN: Prompts only ──\n");
    for (const icon of icons) {
      for (let v = 0; v < icon.variants.length; v++) {
        console.log(`${icon.id}-v${v + 1}:`);
        console.log(`  ${icon.variants[v]}\n`);
      }
    }
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let completed = 0;
  let failures = 0;
  const RATE_LIMIT_MS = 1500; // 1.5s between requests to avoid rate limiting

  for (const icon of icons) {
    for (let v = 0; v < icon.variants.length; v++) {
      const filename = `${icon.id}-v${v + 1}.png`;
      const destPath = path.join(OUT_DIR, filename);

      // Skip if already generated
      if (fs.existsSync(destPath)) {
        completed++;
        console.log(`[${completed}/${totalImages}] Skip (exists): ${filename}`);
        continue;
      }

      try {
        console.log(`[${completed + 1}/${totalImages}] Generating: ${filename}...`);
        const result = await generateImage(icon.variants[v]);
        fs.writeFileSync(destPath, result.buffer);
        completed++;
        console.log(`  ✓ ${(result.buffer.length / 1024).toFixed(0)} KB (${result.provider})`);

        // Rate limit
        if (completed < totalImages) {
          await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
        }
      } catch (err) {
        failures++;
        completed++;
        console.error(`  ✗ FAILED: ${(err as Error).message}`);
      }
    }
  }

  console.log(`\nDone: ${completed - failures} generated, ${failures} failed`);
  console.log(`Cost: ~$${((completed - failures) * 0.07).toFixed(2)}`);
  console.log(`Files: ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
