import React from "react";
import type { EnhancedFrameData } from "../data/types";
import { TracedIconOverlay } from "./TracedIconOverlay";
import { BEAR_ICON } from "../data/traced-icons/bear";

interface Props { frames: EnhancedFrameData[]; }

export const BearTracedOverlay: React.FC<Props> = ({ frames }) => (
  <TracedIconOverlay frames={frames} icon={BEAR_ICON} scale={0.45} />
);
