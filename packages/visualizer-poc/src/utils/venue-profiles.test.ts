import { describe, it, expect } from "vitest";
import { getVenueProfile, VenueProfile } from "./venue-profiles";

const VENUE_TYPES = ["arena", "amphitheater", "theater", "ballroom", "club", "festival"];

describe("getVenueProfile", () => {
  it("returns a valid profile for all 6 venue types", () => {
    for (const type of VENUE_TYPES) {
      const p = getVenueProfile(type);
      expect(p.vignette).toBeGreaterThanOrEqual(0);
      expect(p.vignette).toBeLessThanOrEqual(1);
      expect(p.bloomMult).toBeGreaterThanOrEqual(0.6);
      expect(p.bloomMult).toBeLessThanOrEqual(1.4);
      expect(p.warmth).toBeGreaterThanOrEqual(-0.1);
      expect(p.warmth).toBeLessThanOrEqual(0.1);
      expect(p.overlayDensityMult).toBeGreaterThanOrEqual(0.5);
      expect(p.overlayDensityMult).toBeLessThanOrEqual(1.5);
      expect(p.grainMult).toBeGreaterThanOrEqual(0.6);
      expect(p.grainMult).toBeLessThanOrEqual(1.4);
    }
  });

  it("returns default neutral profile for unknown venue type", () => {
    const p = getVenueProfile("unknown_venue");
    expect(p.vignette).toBe(0.5);
    expect(p.bloomMult).toBe(1.0);
    expect(p.warmth).toBe(0);
    expect(p.overlayDensityMult).toBe(1.0);
    expect(p.grainMult).toBe(1.0);
  });

  it("returns default neutral profile for empty string", () => {
    const p = getVenueProfile("");
    expect(p).toEqual(getVenueProfile("unknown_venue"));
  });

  it("produces distinct profiles for each venue type", () => {
    const profiles = VENUE_TYPES.map((t) => getVenueProfile(t));
    // Every pair should differ
    for (let i = 0; i < profiles.length; i++) {
      for (let j = i + 1; j < profiles.length; j++) {
        expect(profiles[i]).not.toEqual(profiles[j]);
      }
    }
  });

  it("clubs are grittier than festivals", () => {
    const club = getVenueProfile("club");
    const festival = getVenueProfile("festival");
    expect(club.grainMult).toBeGreaterThan(festival.grainMult);
    expect(club.vignette).toBeGreaterThan(festival.vignette);
    expect(club.bloomMult).toBeLessThan(festival.bloomMult);
  });

  it("arenas are brighter with more bloom than theaters", () => {
    const arena = getVenueProfile("arena");
    const theater = getVenueProfile("theater");
    expect(arena.bloomMult).toBeGreaterThan(theater.bloomMult);
    expect(arena.vignette).toBeLessThan(theater.vignette);
  });
});
