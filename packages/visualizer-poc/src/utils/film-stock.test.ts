import { describe, it, expect } from "vitest";
import { getFilmStock, getAllFilmStocks } from "./film-stock";

describe("getFilmStock", () => {
  it("returns Kodachrome for primal era", () => {
    const stock = getFilmStock("primal");
    expect(stock).not.toBeNull();
    expect(stock!.name).toBe("Kodachrome 16mm");
    expect(stock!.grainMult).toBeGreaterThan(1.5);
    expect(stock!.blackPointLift).toBeGreaterThan(0);
  });

  it("returns Ektachrome for classic era", () => {
    const stock = getFilmStock("classic");
    expect(stock).not.toBeNull();
    expect(stock!.name).toBe("Ektachrome E-6");
    expect(stock!.cssFilter).toContain("saturate");
  });

  it("returns Betacam for brent era", () => {
    const stock = getFilmStock("brent_era");
    expect(stock).not.toBeNull();
    expect(stock!.name).toBe("Betacam SP");
    expect(stock!.grainMult).toBeLessThan(1);
  });

  it("returns punchy profile for touch_of_grey", () => {
    const stock = getFilmStock("touch_of_grey");
    expect(stock).not.toBeNull();
    expect(stock!.cssFilter).toContain("contrast(1.1");
  });

  it("returns DV for revival era", () => {
    const stock = getFilmStock("revival");
    expect(stock).not.toBeNull();
    expect(stock!.name).toContain("DV");
  });

  it("returns null for unknown era", () => {
    expect(getFilmStock("cyberpunk")).toBeNull();
  });

  it("each era has distinct grain levels", () => {
    const primal = getFilmStock("primal")!;
    const classic = getFilmStock("classic")!;
    const brent = getFilmStock("brent_era")!;
    const tog = getFilmStock("touch_of_grey")!;
    // Primal > classic > revival > brent > touch_of_grey grain
    expect(primal.grainMult).toBeGreaterThan(classic.grainMult);
    expect(classic.grainMult).toBeGreaterThan(brent.grainMult);
    expect(brent.grainMult).toBeGreaterThan(tog.grainMult);
  });
});

describe("getAllFilmStocks", () => {
  it("returns all era film stock names", () => {
    const all = getAllFilmStocks();
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(5);
    expect(all.primal).toBe("Kodachrome 16mm");
    expect(all.classic).toBe("Ektachrome E-6");
  });
});
