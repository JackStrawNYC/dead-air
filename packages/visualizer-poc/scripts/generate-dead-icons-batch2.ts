#!/usr/bin/env npx tsx
/**
 * Batch 2: More Grateful Dead overlay icons via Grok on Replicate.
 * Focused on instantly-recognizable Dead iconography.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");
const OUT_DIR = path.resolve(__dirname, "../public/assets/dead-icons");

if (!REPLICATE_API_TOKEN && !DRY_RUN) {
  console.error("REPLICATE_API_TOKEN not set.");
  process.exit(1);
}

const STYLE = [
  "centered on pure black background",
  "psychedelic concert poster art style",
  "vivid saturated neon colors",
  "high contrast, sharp details",
  "no text, no words, no letters, no writing, no watermarks",
].join(", ");

const STYLE_COSMIC = [
  "centered on pure black background",
  "cosmic psychedelic art",
  "glowing ethereal neon colors with light trails",
  "deep space atmosphere, high contrast",
  "no text, no words, no letters, no writing, no watermarks",
].join(", ");

const STYLE_POSTER = [
  "centered on pure black background",
  "1960s San Francisco rock concert poster art",
  "Art Nouveau lettering style influences",
  "vivid saturated ink colors, detailed linework",
  "no text, no words, no letters, no writing, no watermarks",
].join(", ");

const STYLE_VINTAGE = [
  "centered on pure black background",
  "1970s rock poster illustration style",
  "warm rich colors, golden highlights",
  "vintage screen-print aesthetic",
  "no text, no words, no letters, no writing, no watermarks",
].join(", ");

interface IconDef {
  id: string;
  variants: string[];
}

const ICONS: IconDef[] = [
  // ── Jerry's Guitar (Tiger) ──
  {
    id: "jerry-guitar",
    variants: [
      `electric guitar with ornate tiger inlay artwork on the body, custom Doug Irwin Tiger guitar, psychedelic energy radiating from strings, ${STYLE}`,
      `silhouette of a bearded guitar player with round glasses mid-solo, cosmic energy flowing from the guitar neck, stars and galaxies emerging from the sound, ${STYLE_COSMIC}`,
      `close-up of hands playing electric guitar, fingers on fretboard, psychedelic light emanating from each fret, music made visible, ${STYLE}`,
    ],
  },

  // ── Wall of Sound ──
  {
    id: "wall-of-sound",
    variants: [
      `massive towering wall of speakers and amplifiers stacked stories high, the legendary Grateful Dead Wall of Sound PA system, concert stage, ${STYLE_VINTAGE}`,
      `enormous speaker stack wall radiating psychedelic sound waves, concentric circles of color emanating outward, concert energy, ${STYLE}`,
    ],
  },

  // ── Tie-Dye Patterns ──
  {
    id: "tiedye",
    variants: [
      `vibrant spiral tie-dye pattern in classic Grateful Dead rainbow colors, red orange yellow green blue purple, fabric texture visible, ${STYLE}`,
      `tie-dye spiral pattern with a Steal Your Face skull emerging from the center of the spiral, psychedelic colors bleeding outward, ${STYLE}`,
      `concentric rings of tie-dye color in warm sunset tones, orange red gold purple, organic fabric pattern, ${STYLE}`,
    ],
  },

  // ── VW Bus ──
  {
    id: "vw-bus",
    variants: [
      `vintage Volkswagen van painted with psychedelic Grateful Dead art, dancing bears on the side, flowers and peace symbols, parked at a concert, ${STYLE_VINTAGE}`,
      `VW microbus driving through a cosmic starfield, painted in tie-dye colors, trailing rainbow light, the bus itself is glowing, ${STYLE_COSMIC}`,
    ],
  },

  // ── Psychedelic Mushrooms ──
  {
    id: "mushrooms",
    variants: [
      `cluster of psychedelic mushrooms glowing with bioluminescent light, intricate patterns on the caps, Grateful Dead concert poster style, ${STYLE}`,
      `giant mystical mushroom forest with tiny dancing bears underneath, cosmic spores floating upward becoming stars, ${STYLE_COSMIC}`,
      `single ornate mushroom with a Steal Your Face skull pattern on the cap, psychedelic roots spreading below, ${STYLE}`,
    ],
  },

  // ── Skeleton Uncle Sam ──
  {
    id: "uncle-sam",
    variants: [
      `skeleton dressed as Uncle Sam in star-spangled red white and blue top hat, pointing directly at viewer, classic Grateful Dead imagery, full figure, ${STYLE}`,
      `skeleton Uncle Sam riding a bolt of lightning across the sky, American flag flowing behind, patriotic psychedelic energy, ${STYLE_COSMIC}`,
    ],
  },

  // ── Dancing Skeleton with Top Hat ──
  {
    id: "skeleton-tophat",
    variants: [
      `single skeleton wearing a top hat doing a joyful dance, one leg kicked up, arms spread wide, classic vaudeville pose, roses growing at feet, ${STYLE}`,
      `elegant skeleton in tuxedo and top hat tipping his hat with a bony hand, a single red rose in his lapel, spotlight from above, ${STYLE_VINTAGE}`,
      `skeleton with top hat playing a fiddle while dancing, musical notes swirling around in psychedelic colors, ${STYLE}`,
    ],
  },

  // ── Scarlet Begonias / Fire Imagery ──
  {
    id: "scarlet-fire",
    variants: [
      `intense red scarlet begonia flowers blooming with psychedelic flames, fire and flowers intertwined, Grateful Dead Scarlet Begonias into Fire on the Mountain, ${STYLE}`,
      `mountain peak engulfed in psychedelic fire, aurora of Dead colors in the sky above, cosmic energy rising from the flames, ${STYLE_COSMIC}`,
      `red begonia flower with each petal made of living flame, seeds of fire falling like embers, dark background, ${STYLE}`,
    ],
  },

  // ── Cosmic Eye ──
  {
    id: "cosmic-eye",
    variants: [
      `single all-seeing cosmic eye, the iris is a swirling galaxy, Egyptian influence, rays of psychedelic light emanating outward, Eyes of the World, ${STYLE_COSMIC}`,
      `ornate eye of providence with Steal Your Face skull reflected in the pupil, surrounded by sacred geometry and zodiac symbols, ${STYLE}`,
    ],
  },

  // ── Aoxomoxoa Style (Rick Griffin inspired) ──
  {
    id: "aoxomoxoa",
    variants: [
      `surreal psychedelic sun with a face melting into cosmic liquid, Rick Griffin inspired art style, organic flowing lines, ${STYLE_POSTER}`,
      `symmetrical psychedelic skull splitting open to reveal a cosmic landscape inside, mirror-image organic Art Nouveau linework, ${STYLE_POSTER}`,
      `winged eyeball flying through a psychedelic landscape, detailed feather textures, Rick Griffin underground comics style, ${STYLE_POSTER}`,
    ],
  },

  // ── Drums Circle ──
  {
    id: "drums",
    variants: [
      `two drum kits facing each other with psychedelic energy arcing between them, Mickey Hart and Bill Kreutzmann inspired, tribal rhythmic patterns radiating outward, ${STYLE}`,
      `massive bass drum with Steal Your Face logo on the drumhead, surrounded by congas bongos and percussion instruments, rhythm visualized as concentric waves, ${STYLE}`,
    ],
  },

  // ── Skeleton Band (full) ──
  {
    id: "skeleton-band-full",
    variants: [
      `five skeletons on a concert stage each playing a different instrument: lead guitar bass guitar rhythm guitar drums and keyboards, psychedelic light show behind them, full band, ${STYLE}`,
      `skeleton rock band silhouettes on stage with massive psychedelic light show projections behind, Wall of Sound speaker stack, audience silhouettes below, ${STYLE_VINTAGE}`,
    ],
  },

  // ── Jester / Court Fool ──
  {
    id: "jester",
    variants: [
      `psychedelic court jester skeleton with bells on his hat juggling skulls and roses, Diamond Joe character, flowing tie-dye robes, ${STYLE}`,
      `cosmic fool figure standing at the edge of a cliff about to step off, stars below instead of ground, classic tarot Fool card reimagined, ${STYLE_COSMIC}`,
    ],
  },

  // ── Owl (from Owsley) ──
  {
    id: "owl",
    variants: [
      `majestic psychedelic owl with eyes that are swirling galaxies, feathers made of tie-dye patterns, wisdom and cosmic knowledge, ${STYLE_COSMIC}`,
      `barn owl perched on a Steal Your Face skull, feathers detailed with sacred geometry patterns, nocturnal psychedelic energy, ${STYLE}`,
    ],
  },

  // ── Lightning Storm ──
  {
    id: "lightning-storm",
    variants: [
      `massive psychedelic lightning storm with thirteen-point bolts striking from a skull-shaped cloud formation, electric Dead energy, ${STYLE}`,
      `lightning bolts in Grateful Dead rainbow colors splitting the sky, each bolt a different color from the spectrum, cosmic electrical storm, ${STYLE_COSMIC}`,
    ],
  },

  // ── Sugaree / Broken Heart ──
  {
    id: "sugaree",
    variants: [
      `ornate broken heart with roses growing through the crack, one half alive and blooming the other half skeleton and bones, duality of life and death, ${STYLE}`,
      `heart-shaped Steal Your Face with roses and thorns wrapped around it, drops of psychedelic color dripping from the bottom, ${STYLE}`,
    ],
  },
];

async function generateWithGrok(prompt: string): Promise<Buffer> {
  const response = await fetch("https://api.replicate.com/v1/models/xai/grok-imagine-image/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      input: { prompt, aspect_ratio: "1:1" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error (${response.status}): ${error}`);
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
      if (pollData.status === "failed") throw new Error("Prediction failed");
    }
  }

  if (!imageUrl) throw new Error("No image URL");
  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) throw new Error(`Download failed: ${imgResponse.status}`);
  return Buffer.from(await imgResponse.arrayBuffer());
}

async function main() {
  const totalImages = ICONS.reduce((sum, i) => sum + i.variants.length, 0);
  console.log(`\n🎨 Batch 2: Generating ${totalImages} Dead icons across ${ICONS.length} categories`);
  console.log(`   Output: ${OUT_DIR}`);
  console.log(`   Model: xai/grok-imagine-image (Replicate)\n`);

  if (DRY_RUN) {
    for (const icon of ICONS) {
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
  const RATE_LIMIT_MS = 1500;

  for (const icon of ICONS) {
    for (let v = 0; v < icon.variants.length; v++) {
      const filename = `${icon.id}-v${v + 1}.png`;
      const destPath = path.join(OUT_DIR, filename);

      if (fs.existsSync(destPath)) {
        completed++;
        console.log(`[${completed}/${totalImages}] Skip (exists): ${filename}`);
        continue;
      }

      try {
        console.log(`[${completed + 1}/${totalImages}] Generating: ${filename}...`);
        const imageBuffer = await generateWithGrok(icon.variants[v]);
        fs.writeFileSync(destPath, imageBuffer);
        completed++;
        console.log(`  ✓ ${(imageBuffer.length / 1024).toFixed(0)} KB`);
        if (completed < totalImages) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      } catch (err) {
        failures++;
        completed++;
        console.error(`  ✗ FAILED: ${(err as Error).message}`);
      }
    }
  }

  console.log(`\nDone: ${completed - failures} generated, ${failures} failed`);
  console.log(`Files: ${OUT_DIR}/`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
