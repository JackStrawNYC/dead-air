/**
 * VJApp — top-level component for VJ mode.
 * Initializes audio, keyboard shortcuts, and renders the scene system.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AudioAnalyzer, type AudioAnalyzerOptions } from "./audio/AudioAnalyzer";
import { resetExtractor } from "./audio/FeatureExtractor";
import { VJSceneCrossfade } from "./engine/VJSceneCrossfade";
import { VJControlPanel } from "./ui/VJControlPanel";
import { PerformanceMonitor } from "./ui/PerformanceMonitor";
import { VJHeadsUpDisplay } from "./ui/VJHeadsUpDisplay";
import { initKeyboardShortcuts } from "./ui/KeyboardShortcuts";
import { RemoteBridge } from "./remote/RemoteBridge";
import { useVJStore } from "./state/VJStore";
import type { SmoothedAudioState } from "./audio/types";

interface VJAppProps {
  /** Audio analyzer options (e.g. fftSize: 1024 for low latency) */
  audioOptions?: AudioAnalyzerOptions;
}

export const VJApp: React.FC<VJAppProps> = ({ audioOptions }) => {
  const analyzerRef = useRef<AudioAnalyzer | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const remoteBridgeRef = useRef<RemoteBridge | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioState, setAudioState] = useState<SmoothedAudioState | undefined>();
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleAudioState = useCallback((state: SmoothedAudioState) => {
    setAudioState(state);
  }, []);

  const handleTransitionState = useCallback((progress: number, transitioning: boolean) => {
    setTransitionProgress(progress);
    setIsTransitioning(transitioning);
  }, []);

  // Initialize analyzer
  useEffect(() => {
    analyzerRef.current = new AudioAnalyzer(audioOptions);
    return () => {
      analyzerRef.current?.dispose();
      analyzerRef.current = null;
    };
  }, []);

  // Initialize keyboard shortcuts
  useEffect(() => {
    return initKeyboardShortcuts();
  }, []);

  // Remote bridge — listen for C key to toggle, cleanup on unmount
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === "c" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        if (remoteBridgeRef.current) {
          remoteBridgeRef.current.disconnect();
          remoteBridgeRef.current = null;
        } else {
          remoteBridgeRef.current = new RemoteBridge();
          remoteBridgeRef.current.connect();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      remoteBridgeRef.current?.disconnect();
    };
  }, []);

  const handleMicConnect = useCallback(async () => {
    try {
      setError(null);
      resetExtractor();
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }
      await analyzerRef.current?.connectMicrophone();
      setIsReady(true);
    } catch (e) {
      setError("Microphone access denied. Please allow microphone access and try again.");
    }
  }, []);

  const handleFileSelect = useCallback((url: string) => {
    try {
      setError(null);
      resetExtractor();
      const el = analyzerRef.current?.connectFile(url);
      if (el) {
        audioElementRef.current = el;
        el.play();
        setIsReady(true);
      }
    } catch (e) {
      setError("Failed to load audio file.");
    }
  }, []);

  // Landing screen before audio is connected
  if (!isReady) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#000",
          color: "#fff",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: 4, marginBottom: 8 }}>
          DEAD AIR
        </div>
        <div style={{ fontSize: 14, color: "#666", marginBottom: 40 }}>
          VJ MODE
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          <button
            onClick={handleMicConnect}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 8,
              color: "#fff",
              padding: "16px 32px",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Use Microphone
          </button>
          <label
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 8,
              color: "#fff",
              padding: "16px 32px",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
            }}
          >
            Load Audio File
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(URL.createObjectURL(file));
              }}
              style={{ display: "none" }}
            />
          </label>
        </div>

        {error && (
          <div style={{ color: "#f44", fontSize: 13, marginTop: 20 }}>{error}</div>
        )}

        <div style={{ fontSize: 11, color: "#444", marginTop: 60, textAlign: "center", lineHeight: 1.8 }}>
          <div>Press Esc to toggle controls during performance</div>
          <div>Press F for fullscreen</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {analyzerRef.current && (
        <VJSceneCrossfade
          analyzer={analyzerRef.current}
          onAudioState={handleAudioState}
          onTransitionState={handleTransitionState}
        />
      )}
      <VJControlPanel onMicConnect={handleMicConnect} onFileSelect={handleFileSelect} />
      <VJHeadsUpDisplay
        audioState={audioState}
        transitionProgress={transitionProgress}
        isTransitioning={isTransitioning}
      />
      <PerformanceMonitor />
    </div>
  );
};
