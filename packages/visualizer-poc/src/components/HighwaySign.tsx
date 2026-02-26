/**
 * HighwaySign — Green highway signs passing by as if driving.
 * Signs slide from right to left. Each sign is a green rectangle with white
 * border and white text (venue city, venue name, band name, Dead references).
 * Show-specific text from ShowContext. Signs appear at intervals, pass through,
 * and exit. Speed driven by energy. Reflective sign aesthetic. Cycle: 50s, 16s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VISIBLE_DURATION = 480; // 16s at 30fps
const CYCLE_GAP = 1020; // 34s gap (50s total - 16s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;

interface SignText {
  lines: string[];
  width: number;
  height: number;
}

function buildSignTexts(ctx: ReturnType<typeof useShowContext>): SignText[] {
  const city = ctx?.venueLocation?.split(",")[0]?.trim()?.toUpperCase() ?? "ITHACA";
  const venue = ctx?.venueShort?.toUpperCase() ?? "BARTON HALL";
  const band = ctx?.bandName?.toUpperCase() ?? "GRATEFUL DEAD";
  const year = ctx?.dateRaw?.slice(2, 4) ?? "77";

  return [
    { lines: [city, "5 MI"], width: 200, height: 100 },
    { lines: [venue, "NEXT EXIT"], width: 260, height: 100 },
    { lines: ["DEAD", "AHEAD"], width: 180, height: 100 },
    { lines: ["TRUCKIN'"], width: 180, height: 80 },
    { lines: [city, "1 MI"], width: 220, height: 100 },
    { lines: [band, "LIVE TONIGHT"], width: 280, height: 100 },
    { lines: ["SPEED LIMIT", year], width: 160, height: 110 },
    { lines: ["SHAKEDOWN", "STREET"], width: 220, height: 100 },
  ];
}

interface SignInstance {
  textIdx: number;
  yPos: number; // 0-1 within upper 60% of screen
  enterDelay: number; // 0-1 fraction of visible duration before this sign enters
  scale: number;
  postHeight: number; // length of post below sign
}

function generateSigns(seed: number, signCount: number): SignInstance[] {
  const rng = seeded(seed);
  const count = 4; // 4 signs per cycle
  return Array.from({ length: count }, (_, i) => ({
    textIdx: Math.floor(rng() * signCount),
    yPos: 0.12 + rng() * 0.35,
    enterDelay: i * 0.2 + rng() * 0.05,
    scale: 0.8 + rng() * 0.4,
    postHeight: 40 + rng() * 60,
  }));
}

/** Single highway sign SVG */
const HighwaySignSVG: React.FC<{
  sign: SignText;
  signScale: number;
  postHeight: number;
  reflectIntensity: number;
}> = ({ sign, signScale, postHeight, reflectIntensity }) => {
  const w = sign.width * signScale;
  const h = sign.height * signScale;
  const totalH = h + postHeight;

  return (
    <svg width={w + 10} height={totalH + 10} viewBox={`-5 -5 ${w + 10} ${totalH + 10}`} fill="none">
      {/* Post */}
      <rect
        x={w / 2 - 4}
        y={h}
        width={8}
        height={postHeight}
        fill="#666"
        rx={1}
      />

      {/* Sign background - highway green */}
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={4}
        fill="#006B3F"
      />

      {/* White border */}
      <rect
        x={4}
        y={4}
        width={w - 8}
        height={h - 8}
        rx={2}
        fill="none"
        stroke="white"
        strokeWidth={2}
      />

      {/* Reflective sheen */}
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={4}
        fill={`rgba(255,255,255,${0.03 + reflectIntensity * 0.08})`}
      />
      <rect
        x={4}
        y={4}
        width={w - 8}
        height={h * 0.4}
        rx={2}
        fill={`rgba(255,255,255,${0.02 + reflectIntensity * 0.04})`}
      />

      {/* Text lines */}
      {sign.lines.map((line, li) => {
        const fontSize = line.length > 10 ? 14 * signScale : 18 * signScale;
        const lineHeight = h / (sign.lines.length + 1);
        return (
          <text
            key={li}
            x={w / 2}
            y={lineHeight * (li + 1) + fontSize * 0.35}
            textAnchor="middle"
            fill="white"
            fontSize={fontSize}
            fontFamily="'Highway Gothic', 'Arial Narrow', sans-serif"
            fontWeight="bold"
            letterSpacing={2}
          >
            {line}
          </text>
        );
      })}
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const HighwaySign: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const signTexts = React.useMemo(() => buildSignTexts(ctx), [ctx]);

  const cycleIndex = Math.floor(frame / CYCLE_TOTAL);
  const signs = React.useMemo(() => {
    // Generate different signs for different cycles using cycle seed
    const allSigns: SignInstance[][] = [];
    for (let c = 0; c < 200; c++) {
      allSigns.push(generateSigns((ctx?.showSeed ?? 19770508) + c * 7919, signTexts.length));
    }
    return allSigns;
  }, [ctx?.showSeed, signTexts.length]);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0, 0.2], [0.4, 0.75], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const currentSigns = signs[cycleIndex % signs.length];
  const speedMult = 1 + energy * 2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {currentSigns.map((signInst, si) => {
        const signData = signTexts[signInst.textIdx % signTexts.length];
        const signW = signData.width * signInst.scale;

        // Each sign enters at its staggered time
        const signProgress = (progress - signInst.enterDelay) * speedMult;
        if (signProgress < 0 || signProgress > 1) return null;

        // Slide from right to left
        const x = interpolate(signProgress, [0, 1], [width + 50, -signW - 50], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const y = signInst.yPos * height;

        // Scale up slightly as sign "passes" (parallax feel)
        const parallaxScale = interpolate(signProgress, [0, 0.5, 1], [0.85, 1.1, 0.85], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        // Reflective shimmer
        const reflectIntensity = Math.max(0, Math.sin(signProgress * Math.PI * 3)) * energy;

        // Individual fade
        const signFadeIn = interpolate(signProgress, [0, 0.05], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const signFadeOut = interpolate(signProgress, [0.9, 1], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <div
            key={si}
            style={{
              position: "absolute",
              left: x,
              top: y,
              transform: `scale(${parallaxScale})`,
              opacity: masterOpacity * Math.min(signFadeIn, signFadeOut),
              willChange: "transform, opacity",
            }}
          >
            <HighwaySignSVG
              sign={signData}
              signScale={signInst.scale}
              postHeight={signInst.postHeight}
              reflectIntensity={reflectIntensity}
            />
          </div>
        );
      })}
    </div>
  );
};
