import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShowRecorder, type ShowEvent, type ShowRecording } from "./ShowRecorder";

describe("ShowRecorder", () => {
  let recorder: ShowRecorder;

  beforeEach(() => {
    recorder = new ShowRecorder();
    vi.useFakeTimers();
  });

  afterEach(() => {
    recorder.stopPlayback();
    vi.useRealTimers();
  });

  describe("recording", () => {
    it("starts and stops recording", () => {
      expect(recorder.isRecording).toBe(false);
      recorder.startRecording();
      expect(recorder.isRecording).toBe(true);

      const recording = recorder.stopRecording();
      expect(recorder.isRecording).toBe(false);
      expect(recording.version).toBe(1);
      expect(recording.startedAt).toBeTruthy();
      expect(recording.events).toEqual([]);
    });

    it("records events with timestamps", () => {
      recorder.startRecording();

      vi.advanceTimersByTime(100);
      recorder.recordEvent("scene_change", { scene: "inferno" });

      vi.advanceTimersByTime(200);
      recorder.recordEvent("blackout", { on: true });

      const recording = recorder.stopRecording();
      expect(recording.events.length).toBe(2);
      expect(recording.events[0].type).toBe("scene_change");
      expect(recording.events[0].payload).toEqual({ scene: "inferno" });
      expect(recording.events[0].timestamp).toBeGreaterThan(0);
      expect(recording.events[1].type).toBe("blackout");
      expect(recording.events[1].timestamp).toBeGreaterThan(recording.events[0].timestamp);
    });

    it("ignores events when not recording", () => {
      recorder.recordEvent("scene_change", { scene: "aurora" });
      expect(recorder.eventCount).toBe(0);
    });

    it("tracks event count", () => {
      recorder.startRecording();
      recorder.recordEvent("scene_change", { scene: "a" });
      recorder.recordEvent("scene_change", { scene: "b" });
      recorder.recordEvent("blackout", { on: true });
      expect(recorder.eventCount).toBe(3);
    });
  });

  describe("playback", () => {
    it("dispatches events at correct timing", () => {
      const events: ShowEvent[] = [];
      const dispatch = (e: ShowEvent) => events.push(e);

      const recording: ShowRecording = {
        version: 1,
        startedAt: new Date().toISOString(),
        duration: 500,
        events: [
          { timestamp: 100, type: "scene_change", payload: { scene: "inferno" } },
          { timestamp: 300, type: "blackout", payload: { on: true } },
        ],
      };

      recorder.startPlayback(recording, dispatch);
      expect(recorder.isPlaying).toBe(true);

      vi.advanceTimersByTime(150);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe("scene_change");

      vi.advanceTimersByTime(200);
      expect(events.length).toBe(2);
      expect(events[1].type).toBe("blackout");

      // Auto-stop after duration
      vi.advanceTimersByTime(200);
      expect(recorder.isPlaying).toBe(false);
    });

    it("stops playback on demand", () => {
      const events: ShowEvent[] = [];
      const dispatch = (e: ShowEvent) => events.push(e);

      const recording: ShowRecording = {
        version: 1,
        startedAt: new Date().toISOString(),
        duration: 1000,
        events: [
          { timestamp: 500, type: "scene_change", payload: { scene: "aurora" } },
        ],
      };

      recorder.startPlayback(recording, dispatch);
      recorder.stopPlayback();
      expect(recorder.isPlaying).toBe(false);

      vi.advanceTimersByTime(600);
      expect(events.length).toBe(0); // event should not have fired
    });
  });

  describe("export/import", () => {
    it("exports and imports JSON correctly", () => {
      recorder.startRecording();
      recorder.recordEvent("scene_change", { scene: "inferno" });
      recorder.recordEvent("palette_change", { primary: 210 });
      const recording = recorder.stopRecording();

      const json = recorder.exportJSON(recording);
      expect(typeof json).toBe("string");

      const imported = recorder.importJSON(json);
      expect(imported.version).toBe(1);
      expect(imported.events.length).toBe(2);
      expect(imported.events[0].type).toBe("scene_change");
    });

    it("rejects unknown version", () => {
      const badJson = JSON.stringify({ version: 99, events: [] });
      expect(() => recorder.importJSON(badJson)).toThrow("Unsupported recording version");
    });
  });
});
