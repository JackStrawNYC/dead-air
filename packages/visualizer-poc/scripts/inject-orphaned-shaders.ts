/**
 * One-shot script: inject orphaned elite shaders into song identities.
 * Every substitution is musically motivated — not random.
 * Run with: npx tsx scripts/inject-orphaned-shaders.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.resolve(__dirname, "../src/data/song-identities.json");
const data: Record<string, any> = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

// Targeted substitutions: [song, shaderToRemove, shaderToAdd, reason]
const subs: [string, string, string, string][] = [
  // === sacred_geometry (low energy, tonal) → spiritual/meditative songs ===
  ["darkstar", "morphogenesis", "sacred_geometry", "Dark Star's cosmic mysticism suits sacred geometry"],
  ["stellablue", "smoke_rings", "sacred_geometry", "Stella Blue's contemplative depth matches sacred patterns"],
  ["ripple", "smoke_rings", "sacred_geometry", "Ripple's gentle spirituality fits geometric meditation"],
  ["morningdew", "stained_glass", "sacred_geometry", "Morning Dew's apocalyptic beauty needs sacred weight"],
  ["wharfrat", "ink_wash", "sacred_geometry", "Wharf Rat's redemption arc suits sacred forms"],
  ["brokedownpalace", "smoke_rings", "sacred_geometry", "Broke Down Palace's elegiac tone needs sacred depth"],
  ["rowjimmy", "voronoi_flow", "sacred_geometry", "Row Jimmy's meditative drift suits geometric patterns"],
  ["comesametime", "stained_glass", "sacred_geometry", "Contemplative closer benefits from sacred geometry"],
  ["weatherreportsuite", "stained_glass", "sacred_geometry", "WRS's multi-part spiritual journey fits perfectly"],

  // === fractal_zoom (any energy, versatile) → jam vehicles ===
  ["playingintheband", "voronoi_flow", "fractal_zoom", "PITB's exploratory jams = infinite fractal zoom"],
  ["eyesoftheworld", "voronoi_flow", "fractal_zoom", "Eyes' expansive jams suit fractal exploration"],
  ["estimatedprophet", "neural_web", "fractal_zoom", "Estimated's building intensity matches fractal depth"],
  ["terrapinstation", "stained_glass", "fractal_zoom", "Terrapin's epic structure suits fractal voyaging"],
  ["birdsong", "voronoi_flow", "fractal_zoom", "Birdsong's soaring jams = zooming into fractals"],
  ["helpontheway", "stained_glass", "fractal_zoom", "Help's precision complexity matches fractal math"],
  ["scarletbegonias", "oil_projector", "fractal_zoom", "Scarlet's psychedelic energy needs fractal depth"],

  // === signal_decay (any energy, textural) → weird/experimental ===
  ["theotherone", "digital_rain", "signal_decay", "The Other One's chaos suits CRT decay (upgrade from digital rain)"],
  ["drumsspace", "void_light", "signal_decay", "Drums>Space's experimental nature = perfect for signal decay"],
  ["slipknot", "tie_dye", "signal_decay", "Slipknot's disorienting energy matches signal breakdown"],
  ["shakedownstreet", "electric_arc", "signal_decay", "Shakedown's funk grit suits textural decay"],
  ["jackstraw", "digital_rain", "signal_decay", "Jack Straw's intensity needs textural weight"],

  // === coral_reef (low energy, warm) → intimate/acoustic-leaning ===
  ["friendofthedevil", "stained_glass", "coral_reef", "FotD's pastoral warmth matches coral intimacy"],
  ["loser", "stained_glass", "coral_reef", "Loser's melancholy warmth suits coral depth"],
  ["elpaso", "stained_glass", "coral_reef", "El Paso's warmth matches coral's organic feel"],
  ["direwolf", "stained_glass", "coral_reef", "Dire Wolf's campfire intimacy = coral reef warmth"],
  ["browneyedwomen", "stained_glass", "coral_reef", "BEW's nostalgic warmth suits coral palette"],
  ["mississippihalfstep", "stained_glass", "coral_reef", "Miss Half-Step's organic flow matches coral"],
  ["mamatried", "stained_glass", "coral_reef", "Mama Tried's down-home feel = coral warmth"],

  // === fluid_light (high energy, versatile) → high-energy barnburners ===
  ["bertha", "oil_projector", "fluid_light", "Bertha's high energy matches fluid light's intensity"],
  ["deal", "volumetric_smoke", "fluid_light", "Deal's driving energy = fluid light viscosity"],
  ["fireonthemountain", "volumetric_smoke", "fluid_light", "FOTM's sustained heat suits fluid dynamics"],
  ["notfadeaway", "volumetric_clouds", "fluid_light", "NFA's relentless energy matches fluid churn"],
  ["caseyjones", "volumetric_clouds", "fluid_light", "Casey Jones' high energy = fluid light splash"],
  ["dancininthestreet", "lava_flow", "fluid_light", "Dancin's party energy suits fluid psychedelia"],
  ["sugarmagnolia", "warp_field", "fluid_light", "Sugar Mag's exuberance matches fluid vibrancy"],

  // === galaxy_spiral (any energy, cosmic) → cosmic explorations ===
  ["darkstar", "volumetric_clouds", "galaxy_spiral", "Dark Star IS the galaxy spiral"],
  ["stellablue", "aurora_curtains", "galaxy_spiral", "Stella's cosmic sadness matches galactic drift"],
  ["eyesoftheworld", "stained_glass", "galaxy_spiral", "Eyes' cosmic vision suits galaxy vistas"],
  ["drumsspace", "neural_web", "galaxy_spiral", "Space segment = literal galaxy exploration"],
  ["terrapinstation", "aurora_curtains", "galaxy_spiral", "Terrapin's mythic scope matches galactic scale"],

  // === cosmic_dust (low energy, cosmic) → deep space moments ===
  ["ripple", "diffraction_rings", "cosmic_dust", "Ripple's gentle cosmic drift = cosmic dust"],
  ["morningdew", "diffraction_rings", "cosmic_dust", "Morning Dew's silence before the storm = dust settling"],
  ["comesametime", "aurora_curtains", "cosmic_dust", "Gentle closer matches cosmic dust stillness"],
  ["blackpeter", "diffraction_rings", "cosmic_dust", "Black Peter's somber weight = dust to dust"],

  // === crystalline_growth (low energy, versatile) → contemplative builds ===
  ["wharfrat", "diffraction_rings", "crystalline_growth", "Wharf Rat's slow redemption = crystal formation"],
  ["brokedownpalace", "aurora_curtains", "crystalline_growth", "Palace's delicate beauty = crystal lattice"],
  ["rowjimmy", "diffraction_rings", "crystalline_growth", "Row Jimmy's patient pace = crystal growing"],
  ["blackpeter", "ink_wash", "crystalline_growth", "Black Peter's fragility suits crystal delicacy"],

  // === particle_nebula (low energy, cosmic) → cosmic contemplation ===
  ["stellablue", "diffraction_rings", "particle_nebula", "Stella's starlit sadness = nebular glow"],
  ["weatherreportsuite", "aurora_curtains", "particle_nebula", "WRS's cosmic sections need nebula depth"],
  ["birdsong", "stained_glass", "particle_nebula", "Birdsong's ethereal quality matches nebula haze"],

  // === particle_swarm (mid energy, versatile) → mid-energy groove ===
  ["truckin", "oil_projector", "particle_swarm", "Truckin's road-trip energy = swarm movement"],
  ["cumberlandblues", "morphogenesis", "particle_swarm", "Cumberland's driving groove matches swarm energy"],
  ["looselucy", "fluid_2d", "particle_swarm", "Loose Lucy's bouncy funk = particle chaos"],
  ["usblues", "lo_fi_grain", "particle_swarm", "US Blues' marching energy = swarm patterns"],
  ["theyloveeachother", "vintage_film", "particle_swarm", "TLEO's dancing energy suits swarm movement"],
];

let applied = 0;
let skipped = 0;
const errors: string[] = [];

for (const [song, remove, add, reason] of subs) {
  const entry = data[song];
  if (!entry) {
    errors.push(`Song '${song}' not found`);
    continue;
  }
  const modes: string[] = entry.preferredModes;
  const idx = modes.indexOf(remove);
  if (idx < 0) {
    errors.push(`'${remove}' not in ${song} (already replaced?)`);
    skipped++;
    continue;
  }
  if (modes.includes(add)) {
    errors.push(`'${add}' already in ${song}, skipping`);
    skipped++;
    continue;
  }
  modes[idx] = add;
  applied++;
}

// Count orphan usage after
function countUsage(d: Record<string, any>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const song of Object.values(d)) {
    for (const mode of (song as any).preferredModes) {
      counts[mode] = (counts[mode] || 0) + 1;
    }
  }
  return counts;
}

const after = countUsage(data);
const total = Object.keys(data).length;
const orphans = [
  "fractal_zoom", "sacred_geometry", "signal_decay", "coral_reef",
  "cosmic_dust", "crystalline_growth", "fluid_light", "galaxy_spiral",
  "particle_nebula", "particle_swarm"
];

console.log(`\nApplied: ${applied} substitutions`);
console.log(`Skipped: ${skipped}`);
if (errors.length > 0) {
  console.log(`\nNotes:`);
  for (const e of errors) console.log(`  - ${e}`);
}

console.log(`\n--- ORPHAN SHADER ADOPTION ---`);
for (const s of orphans) {
  console.log(`  ${s}: ${after[s] || 0}/${total} songs (${(((after[s] || 0) / total) * 100).toFixed(0)}%)`);
}

// Also show the big-4 to make sure we didn't accidentally increase them
const big4 = ["liquid_light", "concert_lighting", "tie_dye", "oil_projector"];
console.log(`\n--- BIG-4 CHECK ---`);
for (const s of big4) {
  console.log(`  ${s}: ${after[s] || 0}/${total} (${(((after[s] || 0) / total) * 100).toFixed(0)}%)`);
}

// Show what got displaced
const displaced = [
  "stained_glass", "smoke_rings", "voronoi_flow", "diffraction_rings",
  "aurora_curtains", "ink_wash", "digital_rain", "morphogenesis",
  "void_light", "volumetric_clouds", "volumetric_smoke", "warp_field",
  "lava_flow", "fluid_2d", "vintage_film", "lo_fi_grain",
  "neural_web", "electric_arc", "tie_dye", "oil_projector"
];
console.log(`\n--- DISPLACED SHADER CHECK (ensure none hit 0) ---`);
for (const s of displaced) {
  if ((after[s] || 0) === 0) {
    console.log(`  WARNING: ${s} dropped to 0!`);
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n");
console.log(`\nJSON updated.`);
