/**
 * WebSocket Remote Control Protocol — message types for VJ remote control.
 * Used by both the browser-side RemoteBridge and the Node.js server.
 */

export type WSMessageType = "state_sync" | "state_delta" | "command" | "ping" | "pong";

export type RemoteCommand =
  | { action: "setScene"; scene: string }
  | { action: "setPalette"; primary: number; secondary: number }
  | { action: "setSaturation"; value: number }
  | { action: "toggleBlackout" }
  | { action: "toggleFreeze" }
  | { action: "toggleAutoTransition" }
  | { action: "recallPreset"; slot: number }
  | { action: "savePreset"; slot: number }
  | { action: "cyclePresetPalette" }
  | { action: "nudgeHue"; delta: number }
  | { action: "nudgeSaturation"; delta: number };

export interface WSMessage {
  type: WSMessageType;
  payload?: Record<string, unknown>;
}

export interface StateSyncPayload {
  currentScene: string;
  palettePrimary: number;
  paletteSecondary: number;
  paletteSaturation: number;
  jamDensity: number;
  transitionSpeed: number;
  autoTransition: boolean;
  blackout: boolean;
  freeze: boolean;
  lockedScene: boolean;
  isRecording: boolean;
  isPlaying: boolean;
}

export interface StateDeltaPayload {
  [key: string]: unknown;
}

/** Default WebSocket port for VJ remote control */
export const DEFAULT_WS_PORT = 9876;

/** Serialize a message for WebSocket transport */
export function serializeMessage(msg: WSMessage): string {
  return JSON.stringify(msg);
}

/** Deserialize a WebSocket message */
export function deserializeMessage(data: string): WSMessage {
  return JSON.parse(data) as WSMessage;
}
