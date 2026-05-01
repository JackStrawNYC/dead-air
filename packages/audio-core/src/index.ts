/**
 * @dead-air/audio-core — pure-math audio analysis primitives.
 *
 * No browser globals, no Node-specific APIs. Safe to import from:
 *   - visualizer-poc (Remotion / browser)
 *   - vj-mode       (live WebAudio)
 *   - manifest-generator (Node + tsx)
 *   - any future package
 *
 * Subpath imports are preferred (`@dead-air/audio-core/math`) so consumers
 * pull only what they need; the root export is a convenience for small users.
 */

export * from "./math.js";
export * from "./hash.js";
export * from "./seeded-random.js";
export * from "./ring-buffer.js";
export * from "./gaussian-smoother.js";
