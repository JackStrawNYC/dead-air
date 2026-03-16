/**
 * AudioSourceSelector — mic/file toggle with file picker.
 */

import React, { useRef } from "react";
import { useVJStore } from "../state/VJStore";

interface Props {
  onMicConnect: () => void;
  onFileSelect: (url: string) => void;
}

export const AudioSourceSelector: React.FC<Props> = ({ onMicConnect, onFileSelect }) => {
  const audioSource = useVJStore((s) => s.audioSource);
  const setAudioSource = useVJStore((s) => s.setAudioSource);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSourceToggle = (source: "mic" | "file") => {
    setAudioSource(source);
    if (source === "mic") {
      onMicConnect();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      onFileSelect(url);
      setAudioSource("file");
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
        Audio Source
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        <button
          onClick={() => handleSourceToggle("mic")}
          style={{
            flex: 1,
            background: audioSource === "mic" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
            border: audioSource === "mic" ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4,
            color: "#fff",
            padding: "6px",
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          Mic (M)
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            flex: 1,
            background: audioSource === "file" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
            border: audioSource === "file" ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4,
            color: "#fff",
            padding: "6px",
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          File
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
    </div>
  );
};
