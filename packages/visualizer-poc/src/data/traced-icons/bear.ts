/**
 * Grateful Dead Marching Bear — hand-traced SVG paths.
 *
 * ViewBox: 100x130. Upright dancing bear, facing forward, one arm raised.
 * Based on Bob Thomas's design: BIG round head (30% of height), thick chunky
 * limbs, wide open grin, jagged collar, boot-shaped feet.
 */
import type { TracedIconData } from "../../components/TracedIconOverlay";

export const BEAR_ICON: TracedIconData = {
  name: "bear",
  viewBox: { width: 100, height: 130 },
  paths: [
    // 1. Left leg — THICK, boot-shaped foot
    {
      d: `M 26,78 C 24,86 20,96 18,106 C 16,112 14,116 12,120
          L 8,120 L 8,128 L 40,128 L 40,120 L 36,120
          C 34,114 34,106 36,96 C 37,90 38,84 40,78 Z`,
      fill: "PRIMARY",
      stroke: "OUTLINE",
      strokeWidth: 3.5,
    },
    // 2. Right leg — THICK, boot-shaped foot
    {
      d: `M 60,78 C 62,86 66,96 68,106 C 70,112 72,116 74,120
          L 78,120 L 78,128 L 46,128 L 46,120 L 50,120
          C 52,114 52,106 50,96 C 49,90 48,84 46,78 Z`,
      fill: "PRIMARY",
      stroke: "OUTLINE",
      strokeWidth: 3.5,
    },
    // 3. Left arm — reaching back/down, THICK sausage shape
    {
      d: `M 20,48
          C 14,52 6,60 2,70
          C 0,76 0,80 4,82
          C 8,84 12,80 16,74
          C 20,66 24,58 28,52
          Z`,
      fill: "PRIMARY",
      stroke: "OUTLINE",
      strokeWidth: 3.5,
    },
    // 4. Body — chunky pear shape, wide hips
    {
      d: `M 28,38
          C 20,44 16,54 16,64
          C 16,72 20,78 26,82
          L 60,82
          C 66,78 70,72 70,64
          C 70,54 66,44 58,38
          Z`,
      fill: "PRIMARY",
      stroke: "OUTLINE",
      strokeWidth: 3.5,
    },
    // 5. Collar — jagged zigzag, contrasting color
    {
      d: `M 24,40 L 28,50 L 34,38 L 40,48 L 46,36 L 52,48 L 58,38 L 62,50 L 66,40
          C 64,36 58,30 52,28 L 34,28 C 28,30 24,36 24,40 Z`,
      fill: "SECONDARY",
      stroke: "OUTLINE",
      strokeWidth: 2.5,
    },
    // 6. Right arm — RAISED UP dancing, thick
    {
      d: `M 66,48
          C 72,42 80,32 86,22
          C 88,16 90,12 86,10
          C 82,8 78,14 74,22
          C 70,30 66,40 62,48
          Z`,
      fill: "PRIMARY",
      stroke: "OUTLINE",
      strokeWidth: 3.5,
    },
    // 7. Head — BIG round, 30% of total height
    {
      d: `M 46,2
          C 28,2 14,12 14,26
          C 14,38 24,44 36,44
          L 50,44
          C 62,44 72,38 72,26
          C 72,12 58,2 46,2 Z`,
      fill: "PRIMARY",
      stroke: "OUTLINE",
      strokeWidth: 3.5,
    },
    // 8. Left ear — round bump
    {
      d: `M 20,10 C 14,2 8,2 8,8 C 8,14 14,16 20,14 Z`,
      fill: "PRIMARY",
      stroke: "OUTLINE",
      strokeWidth: 3,
    },
    // 9. Left inner ear
    {
      d: `M 16,8 C 13,6 11,8 12,10 C 13,12 16,12 16,10 Z`,
      fill: "OUTLINE",
    },
    // 10. Right ear — round bump
    {
      d: `M 66,10 C 72,2 78,2 78,8 C 78,14 72,16 66,14 Z`,
      fill: "PRIMARY",
      stroke: "OUTLINE",
      strokeWidth: 3,
    },
    // 11. Right inner ear
    {
      d: `M 70,8 C 73,6 75,8 74,10 C 73,12 70,12 70,10 Z`,
      fill: "OUTLINE",
    },
    // 12. Left eye — oval dot
    {
      d: `M 30,20 C 30,16 38,16 38,20 C 38,24 30,24 30,20 Z`,
      fill: "OUTLINE",
    },
    // 13. Right eye — oval dot
    {
      d: `M 48,20 C 48,16 56,16 56,20 C 56,24 48,24 48,20 Z`,
      fill: "OUTLINE",
    },
    // 14. Nose — small oval
    {
      d: `M 40,26 C 40,24 46,24 46,26 C 46,28 40,28 40,26 Z`,
      fill: "OUTLINE",
    },
    // 15. Mouth — THE WIDE OPEN GRIN, the most iconic feature
    {
      d: `M 26,30
          Q 34,26 43,28
          Q 52,26 60,30
          Q 56,42 43,44
          Q 30,42 26,30 Z`,
      fill: "OUTLINE",
    },
  ],
  colors: {
    PRIMARY: "#f28c28",
    SECONDARY: "#3355cc",
    ACCENT: "#f0ece0",
    OUTLINE: "#111111",
  },
  scale: 0.35,
};
