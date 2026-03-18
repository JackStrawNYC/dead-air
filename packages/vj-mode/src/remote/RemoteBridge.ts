/**
 * RemoteBridge — browser-side WebSocket client for VJ remote control.
 * Connects to the vj-remote-server, broadcasts state changes, and
 * receives commands from remote control pages.
 */

import { useVJStore } from "../state/VJStore";
import type { VisualMode } from "@visualizer/data/types";
import {
  DEFAULT_WS_PORT,
  serializeMessage,
  deserializeMessage,
  type WSMessage,
  type RemoteCommand,
  type StateSyncPayload,
} from "./protocol";

export class RemoteBridge {
  private _ws: WebSocket | null = null;
  private _unsubscribe: (() => void) | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _port: number;

  constructor(port = DEFAULT_WS_PORT) {
    this._port = port;
  }

  /** Connect to the WebSocket server */
  connect(): void {
    if (this._ws) this.disconnect();

    try {
      this._ws = new WebSocket(`ws://localhost:${this._port}`);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      const store = useVJStore.getState();
      store.setRemoteConnected(true);

      // Send full state sync on connect
      this._sendStateSync();

      // Subscribe to store changes
      this._unsubscribe = useVJStore.subscribe((state, prevState) => {
        const delta: Record<string, unknown> = {};
        let changed = false;

        const keys: (keyof typeof state)[] = [
          "currentScene", "palettePrimary", "paletteSecondary",
          "paletteSaturation", "jamDensity", "transitionSpeed",
          "autoTransition", "blackout", "freeze", "lockedScene",
          "isRecording", "isPlaying",
        ];

        for (const key of keys) {
          if (state[key] !== prevState[key]) {
            delta[key] = state[key];
            changed = true;
          }
        }

        if (changed) {
          this._send({ type: "state_delta", payload: delta });
        }
      });
    };

    this._ws.onmessage = (event) => {
      try {
        const msg = deserializeMessage(event.data as string);
        this._handleMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    this._ws.onclose = () => {
      const store = useVJStore.getState();
      store.setRemoteConnected(false);
      store.setRemoteClientCount(0);
      this._cleanup();
      this._scheduleReconnect();
    };

    this._ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  /** Disconnect from the WebSocket server */
  disconnect(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._cleanup();
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    const store = useVJStore.getState();
    store.setRemoteConnected(false);
    store.setRemoteClientCount(0);
  }

  /** Whether currently connected */
  get connected(): boolean {
    return this._ws?.readyState === WebSocket.OPEN;
  }

  private _cleanup(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  private _scheduleReconnect(): void {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private _send(msg: WSMessage): void {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(serializeMessage(msg));
    }
  }

  private _sendStateSync(): void {
    const s = useVJStore.getState();
    const payload: StateSyncPayload = {
      currentScene: s.currentScene,
      palettePrimary: s.palettePrimary,
      paletteSecondary: s.paletteSecondary,
      paletteSaturation: s.paletteSaturation,
      jamDensity: s.jamDensity,
      transitionSpeed: s.transitionSpeed,
      autoTransition: s.autoTransition,
      blackout: s.blackout,
      freeze: s.freeze,
      lockedScene: s.lockedScene,
      isRecording: s.isRecording,
      isPlaying: s.isPlaying,
    };
    this._send({ type: "state_sync", payload: payload as unknown as Record<string, unknown> });
  }

  private _handleMessage(msg: WSMessage): void {
    switch (msg.type) {
      case "ping":
        this._send({ type: "pong" });
        break;

      case "command":
        if (msg.payload) {
          this._handleCommand(msg.payload as unknown as RemoteCommand);
        }
        break;

      case "state_sync":
        // Server requests a full state sync
        this._sendStateSync();
        break;
    }
  }

  private _handleCommand(cmd: RemoteCommand): void {
    const store = useVJStore.getState();

    switch (cmd.action) {
      case "setScene":
        store.setCurrentScene(cmd.scene as VisualMode);
        break;
      case "setPalette":
        store.setPalettePrimary(cmd.primary);
        store.setPaletteSecondary(cmd.secondary);
        break;
      case "setSaturation":
        store.setPaletteSaturation(cmd.value);
        break;
      case "toggleBlackout":
        store.setBlackout(!store.blackout);
        break;
      case "toggleFreeze":
        store.setFreeze(!store.freeze);
        break;
      case "toggleAutoTransition":
        store.setAutoTransition(!store.autoTransition);
        break;
      case "recallPreset":
        store.recallPreset(cmd.slot);
        break;
      case "savePreset":
        store.savePreset(cmd.slot);
        break;
      case "cyclePresetPalette":
        store.cyclePresetPalette();
        break;
      case "nudgeHue":
        store.nudgePrimaryHue(cmd.delta);
        break;
      case "nudgeSaturation":
        store.nudgeSaturation(cmd.delta);
        break;
    }
  }
}
