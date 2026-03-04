import { loadAnalysis, getSections } from "./src/data/analysis-loader";
import { resolveMediaForSong } from "./src/data/media-resolver";
import { computeMediaWindows } from "./src/components/SceneVideoLayer";
import catalog from "./data/image-library.json";

const trackId = "s2t03";
const songTitle = "Fire on the Mountain";
const showSeed = 42;

const analysis = loadAnalysis(trackId);
const sections = getSections(analysis);
const resolved = resolveMediaForSong(songTitle, catalog as any, showSeed, trackId);

console.log("Song art:", resolved.songArt);
console.log("Media items:", resolved.media.length);
for (const m of resolved.media.slice(0, 5)) {
  console.log(`  p${m.priority} ${m.mediaType}: ${m.src}`);
}

const windows = computeMediaWindows(undefined, resolved.media, sections, analysis.frames, trackId, showSeed);
console.log("\nMedia windows:", windows.length);
for (const w of windows) {
  console.log(`  frames ${w.frameStart}-${w.frameEnd} (${(w.frameStart/30).toFixed(1)}s - ${(w.frameEnd/30).toFixed(1)}s) priority=${w.media.priority} ${w.media.mediaType}: ${w.media.src.split('/').pop()}`);
}
