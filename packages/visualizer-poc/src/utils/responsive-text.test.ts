import { describe, it, expect } from "vitest";
import { responsiveFontSize, responsiveSize } from "./responsive-text";

describe("responsiveFontSize", () => {
  it("returns basePx unchanged at 1080p", () => {
    expect(responsiveFontSize(24, 1080)).toBe(24);
    expect(responsiveFontSize(16, 1080)).toBe(16);
  });

  it("doubles basePx at 4K (2160p)", () => {
    expect(responsiveFontSize(24, 2160)).toBe(48);
    expect(responsiveFontSize(16, 2160)).toBe(32);
  });

  it("scales down at 720p", () => {
    const result = responsiveFontSize(24, 720);
    expect(result).toBeCloseTo(24 * (720 / 1080));
    expect(result).toBeCloseTo(16, 0);
  });

  it("handles zero render height", () => {
    expect(responsiveFontSize(24, 0)).toBe(0);
  });
});

describe("responsiveSize", () => {
  it("returns basePx unchanged at 1080p", () => {
    expect(responsiveSize(10, 1080)).toBe(10);
  });

  it("doubles basePx at 4K (2160p)", () => {
    expect(responsiveSize(10, 2160)).toBe(20);
  });

  it("scales down at 720p", () => {
    const result = responsiveSize(30, 720);
    expect(result).toBeCloseTo(30 * (720 / 1080));
    expect(result).toBeCloseTo(20, 0);
  });

  it("scales proportionally for arbitrary heights", () => {
    const base = 12;
    const height = 540; // half of 1080
    expect(responsiveSize(base, height)).toBeCloseTo(6);
  });
});
