/**
 * One-shot script: diversify song identity shader pools to break big-4 dominance.
 * Run with: npx tsx scripts/diversify-identities.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.resolve(__dirname, "../src/data/song-identities.json");
const data: Record<string, any> = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

// Count shader usage
function countUsage(d: Record<string, any>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const song of Object.values(d)) {
    for (const mode of (song as any).preferredModes) {
      counts[mode] = (counts[mode] || 0) + 1;
    }
  }
  return counts;
}

const total = Object.keys(data).length;
const before = countUsage(data);
const big4 = ["liquid_light", "concert_lighting", "tie_dye", "oil_projector"];

console.log("--- BEFORE ---");
for (const s of big4) {
  console.log(`  ${s}: ${before[s] || 0}/${total} (${(((before[s] || 0) / total) * 100).toFixed(0)}%)`);
}

// Replacement candidates by energy class
const highReplacements: Record<string, string[]> = {
  liquid_light: ["databend", "solar_flare", "neural_web", "climax_surge"],
  concert_lighting: ["databend", "solar_flare", "spectral_analyzer", "neural_web"],
  tie_dye: ["kaleidoscope", "plasma_field", "mandala_engine", "reaction_diffusion"],
};
const midReplacements: Record<string, string[]> = {
  oil_projector: ["warp_field", "mycelium_network", "truchet_tiling", "morphogenesis", "fluid_2d"],
};

// Simple seeded RNG
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

let replacementsMade = 0;
let songIdx = 0;

for (const [name, song] of Object.entries(data)) {
  const modes: string[] = song.preferredModes;
  const big4InSong = modes.filter((m: string) => big4.includes(m));
  const rand = makeRng(songIdx * 7919 + 42);

  if (big4InSong.length >= 2) {
    // Replace 1-2 of the big 4 (more aggressive: trigger at 2+, not 3+)
    const toReplace = big4InSong.length >= 3 ? 2 : 1;
    let replaced = 0;

    // Shuffle to randomize which get replaced
    const shuffled = [...big4InSong].sort(() => rand() - 0.5);

    for (const target of shuffled) {
      if (replaced >= toReplace) break;
      const allReplacements = { ...highReplacements, ...midReplacements };
      const candidates = allReplacements[target];
      if (!candidates) continue;

      // Pick one not already in this song
      const available = candidates.filter((c: string) => !modes.includes(c));
      if (available.length === 0) continue;

      const pick = available[Math.floor(rand() * available.length)];
      const idx = modes.indexOf(target);
      if (idx >= 0) {
        modes[idx] = pick;
        replaced++;
        replacementsMade++;
      }
    }
  }

  // Inject volumetric shaders into ~40% of songs (every ~2.5 songs)
  const hasVolumetric = modes.some((m: string) => m.startsWith("volumetric_"));
  if (!hasVolumetric && modes.length >= 7 && rand() < 0.40) {
    // Rotate through 3 volumetric shaders evenly
    const volOptions = ["volumetric_clouds", "volumetric_smoke", "volumetric_nebula"];
    const inject = volOptions[songIdx % 3];

    if (!modes.includes(inject)) {
      modes[modes.length - 1] = inject;
      replacementsMade++;
    }
  }

  songIdx++;
}

// Second pass: targeted liquid_light reduction to ~35%
const target35pct = Math.floor(total * 0.35);
const midCheck = countUsage(data);
const llCount = midCheck["liquid_light"] || 0;
if (llCount > target35pct) {
  const excess = llCount - target35pct;
  let removed = 0;
  const llReplacements = ["databend", "solar_flare", "neural_web", "climax_surge",
    "fractal_zoom", "feedback_recursion", "electric_arc"];
  let passIdx = 0;
  for (const [name, song] of Object.entries(data)) {
    if (removed >= excess) break;
    const modes: string[] = song.preferredModes;
    const llIdx = modes.indexOf("liquid_light");
    if (llIdx < 0) { passIdx++; continue; }

    const rand2 = makeRng(passIdx * 6271 + 99);
    const available = llReplacements.filter((c: string) => !modes.includes(c));
    if (available.length > 0) {
      modes[llIdx] = available[Math.floor(rand2() * available.length)];
      removed++;
      replacementsMade++;
    }
    passIdx++;
  }
  console.log(`\nSecond pass: removed ${removed} more liquid_light entries`);
}

// Recount
const after = countUsage(data);

console.log("\n--- AFTER ---");
for (const s of big4) {
  console.log(`  ${s}: ${after[s] || 0}/${total} (${(((after[s] || 0) / total) * 100).toFixed(0)}%)`);
}

console.log(`\nReplacements made: ${replacementsMade}`);

// Show newly added shaders
const newShaders = ["volumetric_clouds", "volumetric_smoke", "volumetric_nebula",
  "databend", "solar_flare", "neural_web", "spectral_analyzer",
  "warp_field", "mycelium_network", "truchet_tiling", "morphogenesis",
  "kaleidoscope", "plasma_field", "mandala_engine", "reaction_diffusion",
  "climax_surge", "fluid_2d"];
console.log("\nKey shader counts after:");
for (const s of newShaders) {
  if (after[s]) console.log(`  ${s}: ${after[s]}`);
}

// Write
fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n");
console.log("\nJSON updated.");
