/**
 * Steal Your Face — hand-traced SVG paths from reference artwork.
 *
 * ViewBox: 200x200, centered at (100,100).
 * Render order: outer circle → red/blue halves → white ring → bolt → skull → eye sockets → teeth
 */
import type { TracedIconData } from "../../components/TracedIconOverlay";

export const STEALIE_ICON: TracedIconData = {
  name: "stealie",
  viewBox: { width: 200, height: 200 },
  paths: [
    // 1. Outer black circle border
    {
      d: "M 100,2 A 98,98 0 1 1 99.99,2 Z",
      fill: "OUTLINE",
    },
    // 2. Red half (viewer's left) — semicircle
    {
      d: "M 100,8 A 92,92 0 0 0 100,192 L 100,8 Z",
      fill: "#e02020",
      stroke: "OUTLINE",
      strokeWidth: 1,
    },
    // 3. Blue half (viewer's right) — semicircle
    {
      d: "M 100,8 A 92,92 0 0 1 100,192 L 100,8 Z",
      fill: "#1835b5",
      stroke: "OUTLINE",
      strokeWidth: 1,
    },
    // 4. White ring — outer edge (thick white band with black borders)
    {
      d: `M 100,18 A 82,82 0 1 1 99.99,18 Z
          M 100,32 A 68,68 0 1 0 100.01,32 Z`,
      fill: "#f0ece0",
      fillRule: "evenodd",
      stroke: "OUTLINE",
      strokeWidth: 2,
    },
    // 5. Lightning bolt — the MASSIVE white zigzag filling most of the circle
    // Traced from reference: wide, fills ~60% of circle width, jagged 13-point shape
    {
      d: `M 108,18
          L 78,72
          L 96,72
          L 68,118
          L 88,118
          L 52,180
          L 130,108
          L 108,108
          L 140,60
          L 118,60
          L 142,18
          Z`,
      fill: "#f0ece0",
      stroke: "OUTLINE",
      strokeWidth: 3,
    },
    // 6. Skull — white, at bottom of circle, visible below the ring
    // Cranium dome
    {
      d: `M 62,130
          C 62,105 75,92 100,90
          C 125,92 138,105 138,130
          C 138,140 135,148 130,155
          L 128,155
          C 126,162 122,168 116,170
          L 116,175
          L 108,175 L 108,170
          L 100,170
          L 92,170 L 92,175
          L 84,175
          L 84,170
          C 78,168 74,162 72,155
          L 70,155
          C 65,148 62,140 62,130 Z`,
      fill: "#f0ece0",
      stroke: "OUTLINE",
      strokeWidth: 2,
    },
    // 7. Left eye socket — angular, dark
    {
      d: `M 78,120
          C 80,112 88,108 94,112
          C 96,115 96,122 94,128
          C 90,132 82,130 78,126
          Z`,
      fill: "OUTLINE",
    },
    // 8. Right eye socket — angular, dark (mirrored)
    {
      d: `M 122,120
          C 120,112 112,108 106,112
          C 104,115 104,122 106,128
          C 110,132 118,130 122,126
          Z`,
      fill: "OUTLINE",
    },
    // 9. Nose cavity — inverted triangle
    {
      d: `M 95,136 L 100,145 L 105,136 Z`,
      fill: "OUTLINE",
    },
    // 10. Teeth — individual teeth separated by gaps
    {
      d: `M 80,155 L 82,155 L 82,165 L 80,165 Z
          M 85,155 L 87,155 L 87,167 L 85,167 Z
          M 90,155 L 93,155 L 93,168 L 90,168 Z
          M 96,155 L 99,155 L 99,168 L 96,168 Z
          M 101,155 L 104,155 L 104,168 L 101,168 Z
          M 107,155 L 110,155 L 110,168 L 107,168 Z
          M 113,155 L 115,155 L 115,167 L 113,167 Z
          M 118,155 L 120,155 L 120,165 L 118,165 Z`,
      fill: "OUTLINE",
    },
  ],
  colors: {
    PRIMARY: "#e02020",
    SECONDARY: "#1835b5",
    ACCENT: "#f0ece0",
    OUTLINE: "#111111",
  },
  scale: 0.40,
};
