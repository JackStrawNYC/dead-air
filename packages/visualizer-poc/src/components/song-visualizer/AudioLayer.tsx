/**
 * AudioLayer — song audio playback + crowd ambience.
 *
 * Sits outside the main error boundary so a missing audio file
 * produces silence rather than crashing the entire render.
 */

import React from "react";
import { Audio, staticFile } from "remotion";
import { SilentErrorBoundary } from "../SilentErrorBoundary";
import { CrowdAmbience } from "../CrowdAmbience";
import type { AudioSnapshot } from "../../utils/audio-reactive";

interface Props {
  audioFile: string;
  snapshot: AudioSnapshot;
  isDrumsSpace: boolean;
}

export const AudioLayer: React.FC<Props> = ({ audioFile, snapshot, isDrumsSpace }) => {
  return (
    <>
      <SilentErrorBoundary name="SongAudio">
        <Audio
          src={staticFile(`audio/${audioFile}`)}
          volume={1}
        />
      </SilentErrorBoundary>
      <SilentErrorBoundary name="CrowdAmbience">
        <CrowdAmbience
          snapshot={snapshot}
          baseVolume={isDrumsSpace ? 0.005 : 0.02}
          peakVolume={isDrumsSpace ? 0.02 : 0.07}
        />
      </SilentErrorBoundary>
    </>
  );
};
