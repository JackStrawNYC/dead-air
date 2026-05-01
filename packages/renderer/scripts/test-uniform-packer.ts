#!/usr/bin/env npx tsx
/**
 * Smoke test for the generated uniform packer (no vitest needed).
 * Run: npx tsx packages/renderer/scripts/test-uniform-packer.mts
 */

import { packUniforms, UNIFORM_BUFFER_SIZE, UNIFORM_FIELDS } from "../generated/uniform-packer";
import { strict as assert } from "node:assert";

assert.equal(UNIFORM_BUFFER_SIZE, 656, "buffer size 656");

// Empty pack → all zeros
let buf = packUniforms({});
assert.equal(buf.length, 656);
assert.ok(buf.every((b) => b === 0), "empty pack is all zeros");

// uTime at offset 0
buf = packUniforms({ uTime: 12.5 });
const view = new DataView(buf.buffer);
assert.ok(Math.abs(view.getFloat32(0, true) - 12.5) < 1e-5, "uTime at offset 0");

// uContrast0 at offset 160 (vec4)
buf = packUniforms({ uContrast0: [0.1, 0.2, 0.3, 0.4] });
const v2 = new DataView(buf.buffer);
assert.ok(Math.abs(v2.getFloat32(160, true) - 0.1) < 1e-5);
assert.ok(Math.abs(v2.getFloat32(164, true) - 0.2) < 1e-5);
assert.ok(Math.abs(v2.getFloat32(168, true) - 0.3) < 1e-5);
assert.ok(Math.abs(v2.getFloat32(172, true) - 0.4) < 1e-5);

// Field count + monotonic offsets
assert.equal(UNIFORM_FIELDS.length, 116, "116 fields");
for (let i = 1; i < UNIFORM_FIELDS.length; i++) {
  assert.ok(UNIFORM_FIELDS[i].offset > UNIFORM_FIELDS[i - 1].offset, `monotonic at ${i}`);
}

// Undersized target throws
try {
  packUniforms({ uTime: 1 }, new Uint8Array(100));
  assert.fail("should have thrown for undersized buffer");
} catch (e) {
  assert.match((e as Error).message, /656/);
}

console.log("[uniform-packer] all assertions pass");
