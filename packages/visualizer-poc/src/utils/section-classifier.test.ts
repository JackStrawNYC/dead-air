import { describe, it, expect } from "vitest";
import {
  classifySectionType,
  createHysteresisClassifier,
  classifyAllFrames,
  type SectionClassification,
  type SectionType,
} from "./section-classifier";

// ─── Pure Classification (no hysteresis) ───

describe("classifySectionType", () => {
  it("classifies pure space (low energy, high flatness, no beats)", () => {
    const result = classifySectionType(0.03, 0.7, 0.1, 0.0, 0.5);
    expect(result.sectionType).toBe("space");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("classifies loud chorus (high energy, vocals, strong beat)", () => {
    const result = classifySectionType(0.5, 0.2, 0.8, 0.9, 0.4);
    expect(result.sectionType).toBe("chorus");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("classifies quiet verse (moderate energy, vocals, moderate beat)", () => {
    const result = classifySectionType(0.12, 0.2, 0.5, 0.8, 0.3);
    expect(result.sectionType).toBe("verse");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("classifies jam section (high energy, no vocals, strong beat)", () => {
    const result = classifySectionType(0.35, 0.15, 0.7, 0.1, 0.5);
    expect(result.sectionType).toBe("jam");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("classifies intro (very low energy, start of song)", () => {
    const result = classifySectionType(0.02, 0.3, 0.1, 0.0, 0.03);
    expect(result.sectionType).toBe("intro");
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it("classifies outro (very low energy, end of song)", () => {
    const result = classifySectionType(0.01, 0.3, 0.1, 0.0, 0.95);
    expect(result.sectionType).toBe("outro");
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it("classifies solo (melodic energy, weak beat, no vocals)", () => {
    const result = classifySectionType(0.22, 0.25, 0.2, 0.1, 0.6);
    expect(result.sectionType).toBe("solo");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("classifies bridge (transitional mid-energy)", () => {
    const result = classifySectionType(0.17, 0.3, 0.45, 0.45, 0.5);
    expect(result.sectionType).toBe("bridge");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("defaults to jam when no rule matches clearly", () => {
    // Very high energy, no vocals, moderate beat — falls through to default
    const result = classifySectionType(0.6, 0.1, 0.4, 0.0, 0.5);
    // Could be jam via rule 5 or default — either way should be jam
    expect(result.sectionType).toBe("jam");
  });

  // ─── Confidence Tests ───

  it("gives higher confidence when features are far from thresholds", () => {
    // Extreme chorus: very high energy, very strong beat, very present vocals
    const extreme = classifySectionType(0.55, 0.1, 0.95, 0.95, 0.4);
    // Borderline chorus: just barely crosses thresholds
    const borderline = classifySectionType(0.26, 0.3, 0.61, 0.51, 0.4);

    expect(extreme.sectionType).toBe("chorus");
    expect(borderline.sectionType).toBe("chorus");
    expect(extreme.confidence).toBeGreaterThan(borderline.confidence);
  });

  it("confidence is always between 0.3 and 0.95", () => {
    const testCases = [
      [0.0, 0.0, 0.0, 0.0, 0.0],
      [1.0, 1.0, 1.0, 1.0, 1.0],
      [0.5, 0.5, 0.5, 0.5, 0.5],
      [0.01, 0.9, 0.01, 0.01, 0.5],
    ] as const;

    for (const [e, f, b, v, p] of testCases) {
      const result = classifySectionType(e, f, b, v, p);
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
      expect(result.confidence).toBeLessThanOrEqual(0.95);
    }
  });

  // ─── Boundary Conditions ───

  it("handles zero inputs gracefully", () => {
    const result = classifySectionType(0, 0, 0, 0, 0);
    expect(result.sectionType).toBe("intro"); // low energy + start of song
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it("handles maximum inputs gracefully", () => {
    const result = classifySectionType(1, 1, 1, 1, 1);
    // High energy + high beat + high vocals → chorus (rule 4)
    expect(result.sectionType).toBe("chorus");
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it("intro takes priority over space when at song start", () => {
    // Low energy + high flatness + low beat + start of song
    // Could be space or intro — intro should win (more specific)
    const result = classifySectionType(0.03, 0.6, 0.1, 0.0, 0.05);
    expect(result.sectionType).toBe("intro");
  });

  it("outro takes priority over space when at song end", () => {
    const result = classifySectionType(0.03, 0.6, 0.1, 0.0, 0.95);
    expect(result.sectionType).toBe("outro");
  });
});

// ─── Hysteresis ───

describe("createHysteresisClassifier", () => {
  it("holds classification for minimum hold period", () => {
    const classifier = createHysteresisClassifier(90);

    // Start with jam features
    for (let i = 0; i < 50; i++) {
      classifier(0.35, 0.15, 0.7, 0.1, 0.5);
    }
    expect(classifier(0.35, 0.15, 0.7, 0.1, 0.5).sectionType).toBe("jam");

    // Switch to chorus features — should stay jam during hold
    const duringHold = classifier(0.5, 0.2, 0.8, 0.9, 0.4);
    expect(duringHold.sectionType).toBe("jam"); // held
  });

  it("allows transition after hold period expires", () => {
    const classifier = createHysteresisClassifier(10); // short hold for testing

    // Establish jam
    for (let i = 0; i < 15; i++) {
      classifier(0.35, 0.15, 0.7, 0.1, 0.5);
    }
    expect(classifier(0.35, 0.15, 0.7, 0.1, 0.5).sectionType).toBe("jam");

    // Switch to chorus features — hold expires after 10 frames
    for (let i = 0; i < 11; i++) {
      classifier(0.5, 0.2, 0.8, 0.9, 0.4);
    }
    // After 11 frames of chorus features (> 10 holdFrames), should transition
    const afterHold = classifier(0.5, 0.2, 0.8, 0.9, 0.4);
    expect(afterHold.sectionType).toBe("chorus");
  });

  it("rapid energy changes do not cause rapid type changes", () => {
    const classifier = createHysteresisClassifier(90);

    // Establish verse
    for (let i = 0; i < 100; i++) {
      classifier(0.12, 0.2, 0.5, 0.8, 0.3);
    }

    // Rapidly alternate between verse and chorus features
    const types = new Set<SectionType>();
    for (let i = 0; i < 30; i++) {
      const isEven = i % 2 === 0;
      const result = isEven
        ? classifier(0.5, 0.2, 0.8, 0.9, 0.4) // chorus features
        : classifier(0.12, 0.2, 0.5, 0.8, 0.3); // verse features
      types.add(result.sectionType);
    }

    // Should not have oscillated — hysteresis keeps it stable
    expect(types.size).toBe(1);
  });

  it("resets state cleanly", () => {
    const classifier = createHysteresisClassifier(90);

    // Establish chorus
    for (let i = 0; i < 100; i++) {
      classifier(0.5, 0.2, 0.8, 0.9, 0.4);
    }
    expect(classifier(0.5, 0.2, 0.8, 0.9, 0.4).sectionType).toBe("chorus");

    // Reset
    classifier.reset();

    // After reset, first call accepts the raw classification (no hold needed)
    const afterReset = classifier(0.12, 0.2, 0.5, 0.8, 0.3);
    expect(afterReset.sectionType).toBe("verse"); // raw classification accepted immediately

    // But subsequent changes are subject to hysteresis again
    const held = classifier(0.5, 0.2, 0.8, 0.9, 0.4);
    expect(held.sectionType).toBe("verse"); // held — only 1 frame since last change
  });
});

// ─── Batch Classification ───

describe("classifyAllFrames", () => {
  it("classifies a full song's worth of frames", () => {
    const frames = Array.from({ length: 300 }, (_, i) => {
      const progress = i / 299;
      // Simulate: intro → verse → chorus → jam → outro
      if (progress < 0.1) return { energy: 0.02, flatness: 0.3, beatConfidence: 0.1, vocalPresence: 0 };
      if (progress < 0.3) return { energy: 0.15, flatness: 0.2, beatConfidence: 0.5, vocalPresence: 0.8 };
      if (progress < 0.5) return { energy: 0.4, flatness: 0.2, beatConfidence: 0.8, vocalPresence: 0.9 };
      if (progress < 0.85) return { energy: 0.35, flatness: 0.15, beatConfidence: 0.7, vocalPresence: 0.1 };
      return { energy: 0.01, flatness: 0.4, beatConfidence: 0.1, vocalPresence: 0 };
    });

    const results = classifyAllFrames(frames, 10); // short hold for testing
    expect(results).toHaveLength(300);

    // Check that we get some variety in section types
    const types = new Set(results.map((r) => r.sectionType));
    expect(types.size).toBeGreaterThan(1);

    // First frames should be intro
    expect(results[0].sectionType).toBe("intro");

    // Every result should have valid confidence
    for (const r of results) {
      expect(r.confidence).toBeGreaterThanOrEqual(0.3);
      expect(r.confidence).toBeLessThanOrEqual(0.95);
    }
  });

  it("produces stable output (not excessive oscillation)", () => {
    // All frames have the same features — should produce uniform output
    const frames = Array.from({ length: 200 }, () => ({
      energy: 0.35,
      flatness: 0.15,
      beatConfidence: 0.7,
      vocalPresence: 0.1,
    }));

    const results = classifyAllFrames(frames);
    const types = new Set(results.map((r) => r.sectionType));
    expect(types.size).toBe(1); // all same features → all same type
    expect(results[results.length - 1].sectionType).toBe("jam");
  });

  it("handles single-frame input", () => {
    const results = classifyAllFrames([
      { energy: 0.5, flatness: 0.2, beatConfidence: 0.8, vocalPresence: 0.9 },
    ]);
    expect(results).toHaveLength(1);
    // Single frame at progress 0.5 with these features → chorus or jam initially (default)
    expect(results[0].sectionType).toBeDefined();
  });

  it("handles empty input", () => {
    const results = classifyAllFrames([]);
    expect(results).toHaveLength(0);
  });
});
