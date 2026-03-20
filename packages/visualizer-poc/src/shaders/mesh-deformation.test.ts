import { describe, it, expect } from "vitest";
import { meshDeformationVert, meshDeformationFrag } from "./mesh-deformation";

describe("mesh-deformation shader", () => {
  it("exports non-empty vertex shader string", () => {
    expect(meshDeformationVert.length).toBeGreaterThan(100);
  });

  it("exports non-empty fragment shader string", () => {
    expect(meshDeformationFrag.length).toBeGreaterThan(100);
  });

  it("vertex shader references expected audio uniforms", () => {
    expect(meshDeformationVert).toContain("uBass");
    expect(meshDeformationVert).toContain("uHighs");
    expect(meshDeformationVert).toContain("uDynamicTime");
    expect(meshDeformationVert).toContain("uEnergy");
    expect(meshDeformationVert).toContain("uBeatSnap");
    expect(meshDeformationVert).toContain("uSectionType");
  });

  it("fragment shader references palette uniforms", () => {
    expect(meshDeformationFrag).toContain("uPalettePrimary");
    expect(meshDeformationFrag).toContain("uPaletteSaturation");
    expect(meshDeformationFrag).toContain("uEnergy");
  });

  it("vertex shader outputs vDisplacement varying", () => {
    expect(meshDeformationVert).toContain("varying float vDisplacement");
    expect(meshDeformationFrag).toContain("varying float vDisplacement");
  });
});
