# Traced Icon SVG Paths

Each file exports a `TracedIconData` object for use with `TracedIconOverlay`.

## How to trace a new icon

1. Open reference image in **Inkscape** (free) or **Illustrator**
2. Use the Pen tool or auto-trace to create vector outlines
3. Each distinct colored region should be a separate path
4. Set the document viewBox to something reasonable (e.g., 200x200)
5. Export the SVG, open it in a text editor
6. Copy each `<path d="...">` attribute into a `TracedIconData` object

## Example (stealie.ts)

```typescript
import type { TracedIconData } from "../../components/TracedIconOverlay";

export const STEALIE_ICON: TracedIconData = {
  name: "stealie",
  viewBox: { width: 200, height: 200 },
  paths: [
    // Outer circle black border
    { d: "M 100,5 A 95,95 0 1 1 100,195 A 95,95 0 1 1 100,5 Z", fill: "OUTLINE" },
    // Red half (left side)
    { d: "M 100,10 A 90,90 0 0 0 100,190 L 100,10 Z", fill: "PRIMARY" },
    // Blue half (right side)
    { d: "M 100,10 A 90,90 0 0 1 100,190 L 100,10 Z", fill: "SECONDARY" },
    // White ring
    { d: "...", fill: "#f5f0e0", stroke: "OUTLINE", strokeWidth: 3 },
    // Lightning bolt
    { d: "...", fill: "ACCENT", stroke: "OUTLINE", strokeWidth: 2.5 },
    // Skull
    { d: "...", fill: "#f5f0e0", stroke: "OUTLINE", strokeWidth: 2 },
    // Eye sockets
    { d: "...", fill: "OUTLINE" },
    // Teeth
    { d: "...", fill: "#f5f0e0", stroke: "OUTLINE", strokeWidth: 1 },
  ],
  colors: {
    PRIMARY: "#e8222a",   // Stealie red
    SECONDARY: "#1a3dba", // Stealie blue
    ACCENT: "#f5f0e0",    // Bolt/skull cream white
    OUTLINE: "#111111",   // Black outlines
  },
  scale: 0.40,
};
```

## Icons to trace

- [ ] **Stealie** (Steal Your Face) — circle, red/blue halves, white ring, bolt, skull
- [ ] **Marching Bear** (single bear, 5 color variants) — upright dancing pose
- [ ] **13-Point Lightning Bolt** — standalone bolt
- [ ] **Terrapin** — turtle with spiral shell
- [ ] **Skeleton (Bertha)** — skeleton figure
- [ ] **Roses** — American Beauty roses
- [ ] **Skull & Roses** — skeleton/roses combo
