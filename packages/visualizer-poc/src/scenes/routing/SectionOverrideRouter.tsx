/**
 * SectionOverrideRouter — extracted from SceneRouter.tsx
 *
 * Handles explicit section override routing with crossfade IN/OUT logic.
 * Returns React.ReactNode if an override applies, or null to fall through
 * to subsequent routing stages.
 */

import React from "react";
import { SceneCrossfade } from "../SceneCrossfade";
import type {
  EnhancedFrameData,
  SectionBoundary,
  SetlistEntry,
  ColorPalette,
} from "../../data/types";
import { renderMode } from "./scene-utils";

/**
 * Evaluate explicit section overrides for the current frame.
 *
 * EXPLICIT SECTION OVERRIDE: highest authority — represents user-curated choice.
 * Honored BEFORE reactive triggers, IT lock, drums/space, semantic router, etc.
 * If a song explicitly sets sectionOverrides for a section, that mode is used,
 * and no other routing path can override it. This is the safety net that ensures
 * a song's curated visual identity can't be silently replaced by a reactive
 * shader pool that doesn't fit the song's palette or character.
 *
 * CROSSFADE: when adjacent sections have DIFFERENT overrides, smoothly blend
 * between them across a 90-frame (3s) window centered on the boundary instead
 * of doing a 1-frame snap cut. Without this, sectionOverride boundaries look
 * like jarring jump cuts.
 */
export function renderSectionOverride(
  song: SetlistEntry,
  sections: SectionBoundary[],
  currentSectionIdx: number,
  frame: number,
  frames: EnhancedFrameData[],
  palette: ColorPalette | undefined,
  tempo: number | undefined,
  jamDensity: number | undefined,
  _renderMode: typeof renderMode,
): React.ReactNode | null {
  const explicitOverride = song.sectionOverrides?.find((o) => o.sectionIndex === currentSectionIdx);
  if (!explicitOverride) return null;

  const SECTION_OVERRIDE_CROSSFADE = 180; // 6 seconds at 30fps — CALM MODE: doubled from 3s
  const halfCF = Math.floor(SECTION_OVERRIDE_CROSSFADE / 2);
  const currentSection = sections[currentSectionIdx];

  // Look back: are we early in the current section, with a previous section
  // that had a different override? If so, crossfade IN.
  if (currentSection && currentSectionIdx > 0 && frame - currentSection.frameStart < halfCF) {
    const prevOverride = song.sectionOverrides?.find((o) => o.sectionIndex === currentSectionIdx - 1);
    if (prevOverride && prevOverride.mode !== explicitOverride.mode) {
      const cfStart = currentSection.frameStart - halfCF;
      const progress = Math.max(0, Math.min(1, (frame - cfStart) / SECTION_OVERRIDE_CROSSFADE));
      return (
        <SceneCrossfade
          progress={progress}
          outgoing={_renderMode(prevOverride.mode, frames, sections, palette, tempo, undefined, jamDensity)}
          incoming={_renderMode(explicitOverride.mode, frames, sections, palette, tempo, undefined, jamDensity)}
          style="morph"
        />
      );
    }
  }

  // Look forward: are we late in the current section, with a NEXT section
  // that has a different override? If so, crossfade OUT (start the blend
  // before the boundary so the visual is already morphing into the new shader
  // when the section actually starts).
  if (currentSection && currentSectionIdx < sections.length - 1 && currentSection.frameEnd - frame < halfCF) {
    const nextOverride = song.sectionOverrides?.find((o) => o.sectionIndex === currentSectionIdx + 1);
    if (nextOverride && nextOverride.mode !== explicitOverride.mode) {
      const cfStart = currentSection.frameEnd - halfCF;
      const progress = Math.max(0, Math.min(1, (frame - cfStart) / SECTION_OVERRIDE_CROSSFADE));
      return (
        <SceneCrossfade
          progress={progress}
          outgoing={_renderMode(explicitOverride.mode, frames, sections, palette, tempo, undefined, jamDensity)}
          incoming={_renderMode(nextOverride.mode, frames, sections, palette, tempo, undefined, jamDensity)}
          style="morph"
        />
      );
    }
  }

  return <>{_renderMode(explicitOverride.mode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
}
