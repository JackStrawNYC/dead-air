/**
 * PerformanceMonitor — FPS counter and audio latency indicator.
 */

import React, { useEffect, useRef, useState } from "react";
import { useVJStore } from "../state/VJStore";

export const PerformanceMonitor: React.FC = () => {
  const showFPS = useVJStore((s) => s.showFPS);
  const [fps, setFps] = useState(60);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  useEffect(() => {
    if (!showFPS) return;

    let rafId: number;
    const tick = () => {
      frameCount.current++;
      const now = performance.now();
      const elapsed = now - lastTime.current;

      if (elapsed >= 1000) {
        setFps(Math.round((frameCount.current * 1000) / elapsed));
        frameCount.current = 0;
        lastTime.current = now;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [showFPS]);

  if (!showFPS) return null;

  const color = fps >= 55 ? "#0f0" : fps >= 30 ? "#ff0" : "#f00";

  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        color,
        fontFamily: "monospace",
        fontSize: 14,
        background: "rgba(0,0,0,0.6)",
        padding: "2px 8px",
        borderRadius: 4,
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      {fps} FPS
    </div>
  );
};
