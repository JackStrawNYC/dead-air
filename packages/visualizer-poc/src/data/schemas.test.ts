import { describe, it, expect } from "vitest";
import {
  ShowSetlistSchema,
  TrackAnalysisSchema,
  ShowTimelineSchema,
  NarrationSchema,
  MilestoneDataSchema,
  SongStatsSchema,
  SetlistEntrySchema,
  OverlayScheduleSchema,
  FlexibleTrackAnalysisSchema,
  safeParse,
} from "./schemas";

describe("SetlistEntrySchema", () => {
  const validEntry = {
    trackId: "s1t02",
    title: "Minglewood Blues",
    set: 1,
    trackNumber: 1,
    defaultMode: "liquid_light",
    audioFile: "gd770508-s1t02.mp3",
  };

  it("accepts valid entry", () => {
    expect(() => SetlistEntrySchema.parse(validEntry)).not.toThrow();
  });

  it("rejects invalid trackId format", () => {
    expect(() => SetlistEntrySchema.parse({ ...validEntry, trackId: "bad" })).toThrow();
  });

  it("rejects empty title", () => {
    expect(() => SetlistEntrySchema.parse({ ...validEntry, title: "" })).toThrow();
  });

  it("rejects invalid set number", () => {
    expect(() => SetlistEntrySchema.parse({ ...validEntry, set: 0 })).toThrow();
    expect(() => SetlistEntrySchema.parse({ ...validEntry, set: 4 })).toThrow();
  });

  it("rejects invalid visual mode", () => {
    expect(() => SetlistEntrySchema.parse({ ...validEntry, defaultMode: "invalid" })).toThrow();
  });

  it("accepts optional fields", () => {
    const entry = {
      ...validEntry,
      segueInto: true,
      artVariantCount: 3,
      palette: { primary: 180, secondary: 90 },
    };
    expect(() => SetlistEntrySchema.parse(entry)).not.toThrow();
  });
});

describe("ShowSetlistSchema", () => {
  const validSetlist = {
    date: "1977-05-08",
    venue: "Barton Hall, Cornell University",
    songs: [{
      trackId: "s1t01",
      title: "Test Song",
      set: 1,
      trackNumber: 1,
      defaultMode: "liquid_light",
      audioFile: "test.mp3",
    }],
  };

  it("accepts valid setlist", () => {
    expect(() => ShowSetlistSchema.parse(validSetlist)).not.toThrow();
  });

  it("rejects invalid date format", () => {
    expect(() => ShowSetlistSchema.parse({ ...validSetlist, date: "May 8, 1977" })).toThrow();
  });

  it("rejects empty songs array", () => {
    expect(() => ShowSetlistSchema.parse({ ...validSetlist, songs: [] })).toThrow();
  });

  it("accepts optional era and venueType", () => {
    const setlist = { ...validSetlist, era: "classic", venueType: "arena" };
    expect(() => ShowSetlistSchema.parse(setlist)).not.toThrow();
  });
});

describe("NarrationSchema", () => {
  it("accepts minimal narration", () => {
    expect(() => NarrationSchema.parse({})).not.toThrow();
  });

  it("accepts full narration", () => {
    const narration = {
      showDate: "1977-05-08",
      tourContext: "Spring 1977 tour",
      songs: {
        s1t02: {
          listenFor: ["Garcia's tone", "Weir's rhythm"],
          context: "Classic opener",
        },
      },
      fanReviews: [
        { text: "Best show ever", reviewer: "deadhead77", stars: 5 },
      ],
    };
    expect(() => NarrationSchema.parse(narration)).not.toThrow();
  });
});

describe("MilestoneDataSchema", () => {
  it("accepts valid milestones", () => {
    const data = {
      showDate: "1977-05-08",
      milestones: [
        { trackId: "s2t03", type: "debut", headline: "FIRST TIME", subtext: "Never before played" },
      ],
    };
    expect(() => MilestoneDataSchema.parse(data)).not.toThrow();
  });

  it("rejects invalid milestone type", () => {
    const data = {
      showDate: "1977-05-08",
      milestones: [
        { trackId: "s2t03", type: "invalid", headline: "TEST", subtext: "test" },
      ],
    };
    expect(() => MilestoneDataSchema.parse(data)).toThrow();
  });
});

describe("safeParse", () => {
  it("returns parsed data on success", () => {
    const result = safeParse(NarrationSchema, { showDate: "1977-05-08" });
    expect(result).not.toBeNull();
    expect(result?.showDate).toBe("1977-05-08");
  });

  it("returns null on failure (no throw)", () => {
    // ShowSetlistSchema requires songs array
    const result = safeParse(ShowSetlistSchema, { date: "bad" });
    expect(result).toBeNull();
  });
});

describe("schema integration — safeParse with real schemas", () => {
  it("validates a minimal overlay schedule", () => {
    const schedule = {
      generatedAt: "2026-03-05",
      songs: {
        s1t01: {
          title: "Test Song",
          activeOverlays: ["CosmicStarfield"],
          totalCount: 1,
        },
      },
    };
    const result = safeParse(OverlayScheduleSchema, schedule);
    expect(result).not.toBeNull();
  });

  it("rejects overlay schedule with invalid structure", () => {
    const result = safeParse(OverlayScheduleSchema, { songs: "invalid" });
    expect(result).toBeNull();
  });

  it("validates flexible track analysis with enhanced frames", () => {
    const analysis = {
      meta: {
        source: "test.mp3",
        duration: 300,
        fps: 30,
        sr: 22050,
        hopLength: 512,
        totalFrames: 1,
        tempo: 120,
        sections: [],
      },
      frames: [{
        rms: 0.1, centroid: 0.5, onset: 0, beat: false,
        sub: 0, low: 0, mid: 0, high: 0,
        chroma: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        contrast: [0, 0, 0, 0, 0, 0, 0],
        flatness: 0.2,
      }],
    };
    const result = safeParse(FlexibleTrackAnalysisSchema, analysis);
    expect(result).not.toBeNull();
  });
});
