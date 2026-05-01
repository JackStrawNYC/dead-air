import { describe, it, expect } from "vitest";
import { hashString } from "./hash";

describe("hashString (djb2)", () => {
  it("produces deterministic output", () => {
    const a = hashString("hello");
    const b = hashString("hello");
    expect(a).toBe(b);
  });

  it("produces different output for different inputs", () => {
    const a = hashString("hello");
    const b = hashString("world");
    expect(a).not.toBe(b);
  });

  it("returns a positive integer", () => {
    const result = hashString("test");
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  it("handles empty string", () => {
    const result = hashString("");
    expect(result).toBe(5381); // djb2 seed value
  });

  it("handles long strings", () => {
    const result = hashString("a".repeat(10000));
    expect(result).toBeGreaterThan(0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("handles special characters", () => {
    const result = hashString("1977-05-08::Barton Hall");
    expect(result).toBeGreaterThan(0);
  });
});
