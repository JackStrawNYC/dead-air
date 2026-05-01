import { describe, it, expect } from "vitest";
import { packUniforms, UNIFORM_BUFFER_SIZE, UNIFORM_FIELDS, UniformValues } from "./uniform-packer";

describe("generated uniform packer", () => {
  it("UNIFORM_BUFFER_SIZE is 656 (std140 from uniforms.rs)", () => {
    expect(UNIFORM_BUFFER_SIZE).toBe(656);
  });

  it("packs an empty input as zeros", () => {
    const buf = packUniforms({});
    expect(buf.length).toBe(656);
    for (const b of buf) expect(b).toBe(0);
  });

  it("writes a float at the schema-declared offset", () => {
    const v: UniformValues = { uTime: 12.5 };
    const buf = packUniforms(v);
    const view = new DataView(buf.buffer);
    expect(view.getFloat32(0, true)).toBeCloseTo(12.5, 5);
  });

  it("writes vec4 components consecutively", () => {
    const v: UniformValues = { uContrast0: [0.1, 0.2, 0.3, 0.4] };
    const buf = packUniforms(v);
    const view = new DataView(buf.buffer);
    // uContrast0 sits at offset 160 per the schema
    expect(view.getFloat32(160, true)).toBeCloseTo(0.1, 5);
    expect(view.getFloat32(164, true)).toBeCloseTo(0.2, 5);
    expect(view.getFloat32(168, true)).toBeCloseTo(0.3, 5);
    expect(view.getFloat32(172, true)).toBeCloseTo(0.4, 5);
  });

  it("UNIFORM_FIELDS lists 116 uniforms in offset order", () => {
    expect(UNIFORM_FIELDS.length).toBe(116);
    for (let i = 1; i < UNIFORM_FIELDS.length; i++) {
      expect(UNIFORM_FIELDS[i].offset).toBeGreaterThan(UNIFORM_FIELDS[i - 1].offset);
    }
  });

  it("rejects an undersized target buffer", () => {
    const small = new Uint8Array(100);
    expect(() => packUniforms({ uTime: 1.0 }, small)).toThrow(/656/);
  });
});
