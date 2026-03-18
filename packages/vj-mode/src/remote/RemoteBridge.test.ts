import { describe, it, expect } from "vitest";
import {
  serializeMessage,
  deserializeMessage,
  DEFAULT_WS_PORT,
  type WSMessage,
  type RemoteCommand,
} from "./protocol";

describe("Remote Protocol", () => {
  it("serializes and deserializes messages", () => {
    const msg: WSMessage = {
      type: "command",
      payload: { action: "setScene", scene: "inferno" },
    };

    const serialized = serializeMessage(msg);
    expect(typeof serialized).toBe("string");

    const deserialized = deserializeMessage(serialized);
    expect(deserialized.type).toBe("command");
    expect(deserialized.payload).toEqual({ action: "setScene", scene: "inferno" });
  });

  it("handles state_sync messages", () => {
    const msg: WSMessage = {
      type: "state_sync",
      payload: {
        currentScene: "aurora",
        palettePrimary: 210,
        paletteSecondary: 270,
        paletteSaturation: 0.8,
        jamDensity: 0.5,
        transitionSpeed: 2,
        autoTransition: true,
        blackout: false,
        freeze: false,
        lockedScene: false,
        isRecording: false,
        isPlaying: false,
      },
    };

    const json = serializeMessage(msg);
    const parsed = deserializeMessage(json);
    expect(parsed.type).toBe("state_sync");
    expect((parsed.payload as Record<string, unknown>).currentScene).toBe("aurora");
  });

  it("handles state_delta messages", () => {
    const msg: WSMessage = {
      type: "state_delta",
      payload: { currentScene: "inferno", blackout: true },
    };

    const json = serializeMessage(msg);
    const parsed = deserializeMessage(json);
    expect(parsed.type).toBe("state_delta");
    expect((parsed.payload as Record<string, unknown>).blackout).toBe(true);
  });

  it("handles ping/pong messages", () => {
    const ping: WSMessage = { type: "ping" };
    const pong: WSMessage = { type: "pong" };

    expect(deserializeMessage(serializeMessage(ping)).type).toBe("ping");
    expect(deserializeMessage(serializeMessage(pong)).type).toBe("pong");
  });

  it("handles all command types", () => {
    const commands: RemoteCommand[] = [
      { action: "setScene", scene: "aurora" },
      { action: "setPalette", primary: 120, secondary: 240 },
      { action: "setSaturation", value: 0.7 },
      { action: "toggleBlackout" },
      { action: "toggleFreeze" },
      { action: "toggleAutoTransition" },
      { action: "recallPreset", slot: 3 },
      { action: "savePreset", slot: 5 },
      { action: "cyclePresetPalette" },
      { action: "nudgeHue", delta: 10 },
      { action: "nudgeSaturation", delta: -0.05 },
    ];

    for (const cmd of commands) {
      const msg: WSMessage = { type: "command", payload: cmd as unknown as Record<string, unknown> };
      const json = serializeMessage(msg);
      const parsed = deserializeMessage(json);
      expect(parsed.type).toBe("command");
      expect((parsed.payload as Record<string, unknown>).action).toBe(cmd.action);
    }
  });

  it("exports default port", () => {
    expect(DEFAULT_WS_PORT).toBe(9876);
  });
});
