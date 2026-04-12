/**
 * Headless overlay renderer — renders each overlay component to a transparent PNG.
 * Uses Remotion's composition system to render one frame per overlay.
 *
 * Usage: npx remotion still --config remotion-overlay.config.ts OverlayRenderer --frame 0 --output /tmp/overlay.png
 * Or use the batch script below.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, Composition } from "remotion";

// Import overlay components
import { BreathingStealie } from "../visualizer-poc/src/components/BreathingStealie";
import { ThirteenPointBolt } from "../visualizer-poc/src/components/ThirteenPointBolt";
import { GodRays } from "../visualizer-poc/src/components/GodRays";
import { Fireflies } from "../visualizer-poc/src/components/Fireflies";
import { TieDyeWash } from "../visualizer-poc/src/components/TieDyeWash";
import { BearParade } from "../visualizer-poc/src/components/BearParade";
import { SkeletonBand } from "../visualizer-poc/src/components/SkeletonBand";
import { MarchingTerrapins } from "../visualizer-poc/src/components/MarchingTerrapins";
import { CosmicStarfield } from "../visualizer-poc/src/components/CosmicStarfield";
import { LavaLamp } from "../visualizer-poc/src/components/LavaLamp";
import { SkullKaleidoscope } from "../visualizer-poc/src/components/SkullKaleidoscope";
import { DarkStarPortal } from "../visualizer-poc/src/components/DarkStarPortal";
import { RoseOverlay } from "../visualizer-poc/src/components/RoseOverlay";
import { LightningBoltOverlay } from "../visualizer-poc/src/components/LightningBoltOverlay";
import { StealYourFaceOff } from "../visualizer-poc/src/components/StealYourFaceOff";
import { SacredGeometry } from "../visualizer-poc/src/components/SacredGeometry";
import { VoronoiFlow } from "../visualizer-poc/src/components/VoronoiFlow";
import { FractalZoom } from "../visualizer-poc/src/components/FractalZoom";
import { MandalaGenerator } from "../visualizer-poc/src/components/MandalaGenerator";
import { StainedGlass } from "../visualizer-poc/src/components/StainedGlass";

// Generate fake frames with moderate energy for overlay rendering
function generateFrames(count: number): any[] {
  return Array.from({ length: count }, (_, i) => ({
    rms: 0.35 + Math.sin(i * 0.05) * 0.15,
    sub: 0.2 + Math.sin(i * 0.03) * 0.1,
    low: 0.15,
    mid: 0.2,
    high: 0.15,
    onset: i % 30 === 0 ? 0.8 : 0,
    beat: i % 15 === 0,
    beatConfidence: 0.7,
    centroid: 0.5,
    chroma: [0.3, 0.1, 0.2, 0.1, 0.3, 0.2, 0.1, 0.3, 0.1, 0.2, 0.1, 0.2],
    localTempo: 120,
    downbeat: i % 60 === 0,
    sectionType: "jam",
    stemBassRms: 0.2,
    stemDrumOnset: i % 15 === 0 ? 0.6 : 0,
    stemDrumBeat: i % 15 === 0,
    stemVocalRms: 0.15,
    stemVocalPresence: 0.3,
    stemOtherRms: 0.1,
    stemOtherCentroid: 0.5,
    flatness: 0.4,
    dynamicRange: 0.5,
    timbralBrightness: 0.5,
    timbralFlux: 0.1,
    harmonicTension: 0.3,
    improvisationScore: 0.2,
    spaceScore: 0.1,
    melodicPitch: 0.5,
    melodicConfidence: 0.3,
    melodicDirection: 0,
    chordIndex: 0,
    chordConfidence: 0.5,
    spectralFlux: 0.1,
    contrast: [0.3, 0.2, 0.25, 0.3, 0.2, 0.15, 0.1],
    semantic_psychedelic: 0.3,
    semantic_cosmic: 0.2,
    semantic_aggressive: 0.1,
    semantic_tender: 0.2,
    semantic_rhythmic: 0.3,
    semantic_ambient: 0.2,
    semantic_chaotic: 0.1,
    semantic_triumphant: 0.1,
  }));
}

const OVERLAYS: Record<string, React.FC<{ frames: any[] }>> = {
  BreathingStealie,
  ThirteenPointBolt,
  GodRays,
  Fireflies,
  TieDyeWash,
  BearParade,
  SkeletonBand,
  MarchingTerrapins,
  CosmicStarfield,
  LavaLamp,
  SkullKaleidoscope,
  DarkStarPortal,
  RoseOverlay,
  LightningBoltOverlay,
  StealYourFaceOff,
  SacredGeometry,
  VoronoiFlow,
  FractalZoom,
  MandalaGenerator,
  StainedGlass,
};

// Single overlay renderer — reads overlay name from input props
const OverlayRenderer: React.FC<{ overlayName: string }> = ({ overlayName }) => {
  const frames = generateFrames(300);
  const Component = OVERLAYS[overlayName];
  if (!Component) return <div style={{ background: "black", width: "100%", height: "100%" }} />;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "transparent" }}>
      <Component frames={frames} />
    </div>
  );
};

// Export compositions for each overlay
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {Object.keys(OVERLAYS).map((name) => (
        <Composition
          key={name}
          id={`Overlay_${name}`}
          component={() => <OverlayRenderer overlayName={name} />}
          durationInFrames={60}
          fps={30}
          width={1920}
          height={1080}
        />
      ))}
    </>
  );
};
