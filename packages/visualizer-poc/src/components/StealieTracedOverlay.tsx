/**
 * Stealie overlay using hand-traced SVG paths.
 */
import React from "react";
import type { EnhancedFrameData } from "../data/types";
import { TracedIconOverlay } from "./TracedIconOverlay";
import { STEALIE_ICON } from "../data/traced-icons/stealie";

interface Props { frames: EnhancedFrameData[]; }

export const StealieTracedOverlay: React.FC<Props> = ({ frames }) => (
  <TracedIconOverlay frames={frames} icon={STEALIE_ICON} scale={0.45} />
);
