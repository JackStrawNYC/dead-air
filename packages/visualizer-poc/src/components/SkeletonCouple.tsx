/**
 * SkeletonCouple -- two skeletons waltzing together with rich anatomical detail.
 * Lead skeleton is taller; follow skeleton is shorter with different proportions.
 * They slowly rotate around a center point (waltz spin).
 * Appear in the center-right area of screen.
 * Spin speed tied to energy -- slow waltz during quiet, faster during loud.
 * Complementary neon colors. Rose between clasped hands. Neon glow.
 *
 * A+++ anatomy: cranium dome, eye sockets with inner glow, nose cavity, jaw with
 * individual teeth, cervical vertebrae, sternum + 4 rib pairs, segmented spine,
 * pelvis, humerus/radius/ulna, finger metacarpals, femur/tibia, metatarsal feet.
 * Rose with layered petals, thorned stem, leaf.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

// Color rotation period -- change colors every ~20 seconds
const COLOR_PERIOD = 600;

const COLOR_PAIRS = [
  { lead: "#FF1493", follow: "#00FFFF", rose: "#FF4500" },
  { lead: "#DA70D6", follow: "#76FF03", rose: "#FF1744" },
  { lead: "#FFD700", follow: "#FF00FF", rose: "#FF6347" },
  { lead: "#00FF7F", follow: "#FF69B4", rose: "#FF1493" },
];

/* ================================================================ */
/*  Lead Skeleton -- taller, left side                              */
/* ================================================================ */
const LeadSkeleton: React.FC<{
  color: string;
  sway: number;
  armShift: number;
}> = ({ color, sway, armShift }) => {
  const so = sway * 3; // sway offset
  const aShift = armShift * 2; // arm position shift from sway

  return (
    <g transform={`translate(${55 + so}, 0)`}>
      {/* -- SKULL -- */}
      <g>
        {/* Cranium dome */}
        <ellipse cx="0" cy="13" rx="14" ry="15" fill={color} opacity="0.15" />
        <path
          d="M -13 18 Q -14 8 -10 2 Q -5 -4 0 -5 Q 5 -4 10 2 Q 14 8 13 18"
          stroke={color}
          strokeWidth="2"
          fill="none"
          opacity="0.85"
        />
        {/* Skull outline lower */}
        <path
          d="M -13 18 Q -12 24 -8 27 L 8 27 Q 12 24 13 18"
          stroke={color}
          strokeWidth="2"
          fill="none"
          opacity="0.85"
        />
        {/* Eye sockets */}
        <ellipse cx="-5" cy="14" rx="4" ry="4.5" stroke={color} strokeWidth="1.2" fill="none" opacity="0.7" />
        <ellipse cx="5" cy="14" rx="4" ry="4.5" stroke={color} strokeWidth="1.2" fill="none" opacity="0.7" />
        {/* Eye inner glow */}
        <ellipse cx="-5" cy="14" rx="2" ry="2.5" fill={color} opacity="0.3" />
        <ellipse cx="5" cy="14" rx="2" ry="2.5" fill={color} opacity="0.3" />
        {/* Eye dot pupils */}
        <circle cx="-5" cy="14.5" r="1" fill={color} opacity="0.6" />
        <circle cx="5" cy="14.5" r="1" fill={color} opacity="0.6" />
        {/* Nose cavity */}
        <path
          d="M -1.5 19 L 0 22 L 1.5 19"
          stroke={color}
          strokeWidth="1"
          fill="none"
          opacity="0.5"
        />
        {/* Jaw bone */}
        <path
          d="M -9 27 Q -10 30 -8 33 L -6 34 Q 0 35.5 6 34 L 8 33 Q 10 30 9 27"
          stroke={color}
          strokeWidth="1.5"
          fill="none"
          opacity="0.7"
        />
        {/* Individual teeth -- upper row (8) */}
        {[-6, -4.3, -2.6, -0.9, 0.9, 2.6, 4.3, 6].map((tx, i) => (
          <rect
            key={`ut${i}`}
            x={tx - 0.7}
            y="27"
            width="1.4"
            height="2.2"
            rx="0.3"
            fill={color}
            opacity="0.5"
          />
        ))}
        {/* Individual teeth -- lower row (8) */}
        {[-5.5, -3.9, -2.3, -0.7, 0.7, 2.3, 3.9, 5.5].map((tx, i) => (
          <rect
            key={`lt${i}`}
            x={tx - 0.6}
            y="31.5"
            width="1.2"
            height="2"
            rx="0.3"
            fill={color}
            opacity="0.45"
          />
        ))}
      </g>

      {/* -- NECK: 3 cervical vertebrae -- */}
      {[37, 39.5, 42].map((ny, i) => (
        <g key={`cv${i}`}>
          <rect
            x={-2.5 + so * 0.05 * i}
            y={ny}
            width="5"
            height="2"
            rx="1"
            fill={color}
            opacity="0.45"
          />
          <circle cx={so * 0.05 * i} cy={ny + 1} r="1.5" stroke={color} strokeWidth="0.8" fill="none" opacity="0.3" />
        </g>
      ))}

      {/* -- SPINE: segmented vertebrae -- */}
      {[46, 50, 54, 58, 62, 66, 70, 74].map((sy, i) => {
        const drift = so * 0.06 * (i + 3);
        return (
          <g key={`sv${i}`}>
            <rect
              x={-2.2 + drift}
              y={sy}
              width="4.4"
              height="3"
              rx="1.2"
              fill={color}
              opacity="0.4"
            />
            {/* Vertebral process nubs */}
            <line
              x1={-3.5 + drift}
              y1={sy + 1.5}
              x2={-2.2 + drift}
              y2={sy + 1.5}
              stroke={color}
              strokeWidth="0.8"
              opacity="0.3"
            />
            <line
              x1={2.2 + drift}
              y1={sy + 1.5}
              x2={3.5 + drift}
              y2={sy + 1.5}
              stroke={color}
              strokeWidth="0.8"
              opacity="0.3"
            />
          </g>
        );
      })}

      {/* -- STERNUM -- */}
      <line
        x1={so * 0.15}
        y1="47"
        x2={so * 0.25}
        y2="62"
        stroke={color}
        strokeWidth="2.2"
        opacity="0.55"
      />

      {/* -- RIB CAGE: 4 pairs -- */}
      {[48, 52, 56, 60].map((ry, i) => {
        const d = so * 0.08 * (i + 2);
        const spread = 12 + i * 0.8;
        return (
          <g key={`rib${i}`}>
            {/* Left rib */}
            <path
              d={`M ${d} ${ry} Q ${-spread * 0.6 + d} ${ry + 1} ${-spread + d} ${ry + 3 + i * 0.5}`}
              stroke={color}
              strokeWidth="1.8"
              fill="none"
              opacity="0.5"
            />
            {/* Right rib */}
            <path
              d={`M ${d} ${ry} Q ${spread * 0.6 + d} ${ry + 1} ${spread + d} ${ry + 3 + i * 0.5}`}
              stroke={color}
              strokeWidth="1.8"
              fill="none"
              opacity="0.5"
            />
          </g>
        );
      })}

      {/* -- PELVIS: hip bone -- */}
      <path
        d={`M ${-12 + so * 0.3} 76 Q ${-14 + so * 0.3} 80 ${-8 + so * 0.4} 84 L ${so * 0.5} 82 L ${8 + so * 0.4} 84 Q ${14 + so * 0.3} 80 ${12 + so * 0.3} 76 Z`}
        stroke={color}
        strokeWidth="1.8"
        fill={color}
        fillOpacity="0.15"
        opacity="0.6"
      />
      {/* Sacrum */}
      <path
        d={`M ${-3 + so * 0.4} 76 L ${so * 0.5} 82 L ${3 + so * 0.4} 76`}
        stroke={color}
        strokeWidth="1.2"
        fill="none"
        opacity="0.4"
      />

      {/* -- LEFT ARM: humerus + elbow + radius/ulna (leading arm raised) -- */}
      <g>
        {/* Shoulder joint */}
        <circle cx="-10" cy="47" r="2.5" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.2" opacity="0.5" />
        {/* Humerus */}
        <line x1="-10" y1="47" x2={-28 - aShift} y2={50 + aShift * 0.5} stroke={color} strokeWidth="3.2" strokeLinecap="round" />
        {/* Elbow joint */}
        <circle cx={-28 - aShift} cy={50 + aShift * 0.5} r="2" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.3" opacity="0.5" />
        {/* Radius */}
        <line x1={-28 - aShift} y1={50 + aShift * 0.5} x2={-38 - aShift * 0.5} y2={42 + aShift * 0.3} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        {/* Ulna (parallel, slightly offset) */}
        <line x1={-28 - aShift} y1={51.5 + aShift * 0.5} x2={-37 - aShift * 0.5} y2={43.5 + aShift * 0.3} stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
        {/* Hand -- metacarpals spread */}
        {[-40, -42, -41, -39.5, -38].map((fx, i) => (
          <line
            key={`lf${i}`}
            x1={-38 - aShift * 0.5}
            y1={42 + aShift * 0.3}
            x2={fx - aShift * 0.4}
            y2={38 + i * 1.2 + aShift * 0.2}
            stroke={color}
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.5"
          />
        ))}
      </g>

      {/* -- RIGHT ARM: extended forward to hold partner -- */}
      <g>
        {/* Shoulder joint */}
        <circle cx="10" cy="47" r="2.5" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.2" opacity="0.5" />
        {/* Humerus */}
        <line x1="10" y1="47" x2={33 + aShift * 0.5} y2={48 - aShift * 0.3} stroke={color} strokeWidth="3.2" strokeLinecap="round" />
        {/* Elbow joint */}
        <circle cx={33 + aShift * 0.5} cy={48 - aShift * 0.3} r="2" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.3" opacity="0.5" />
        {/* Radius */}
        <line x1={33 + aShift * 0.5} y1={48 - aShift * 0.3} x2={50 + aShift * 0.3} y2={38 - aShift * 0.4} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        {/* Ulna */}
        <line x1={33 + aShift * 0.5} y1={49.5 - aShift * 0.3} x2={49 + aShift * 0.3} y2={39.5 - aShift * 0.4} stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
        {/* Hand -- metacarpals reaching toward partner */}
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={`rf${i}`}
            x1={50 + aShift * 0.3}
            y1={38 - aShift * 0.4}
            x2={52 + aShift * 0.2 + i * 0.5}
            y2={35 - aShift * 0.3 + i * 1.3}
            stroke={color}
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.5"
          />
        ))}
      </g>

      {/* -- LEFT LEG: femur + knee + tibia -- */}
      <g>
        {/* Hip joint */}
        <circle cx={-8 + so * 0.3} cy="83" r="2.2" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.2" opacity="0.4" />
        {/* Femur */}
        <line x1={-8 + so * 0.3} y1="83" x2={-13 + sway * 5} y2="105" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
        {/* Knee joint */}
        <circle cx={-13 + sway * 5} cy="105" r="2.5" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.25" opacity="0.5" />
        {/* Tibia */}
        <line x1={-13 + sway * 5} y1="105" x2={-15 + sway * 4} y2="125" stroke={color} strokeWidth="3" strokeLinecap="round" />
        {/* Foot -- metatarsals */}
        <ellipse cx={-15 + sway * 4} cy="128" rx="8" ry="3" fill={color} opacity="0.5" />
        {[-19, -17, -15, -13, -11].map((bx, i) => (
          <line
            key={`lmt${i}`}
            x1={bx + sway * 4}
            y1="126"
            x2={bx - 0.5 + sway * 4}
            y2="130"
            stroke={color}
            strokeWidth="0.8"
            opacity="0.35"
          />
        ))}
      </g>

      {/* -- RIGHT LEG: femur + knee + tibia -- */}
      <g>
        {/* Hip joint */}
        <circle cx={8 + so * 0.3} cy="83" r="2.2" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.2" opacity="0.4" />
        {/* Femur */}
        <line x1={8 + so * 0.3} y1="83" x2={13 - sway * 4} y2="105" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
        {/* Knee joint */}
        <circle cx={13 - sway * 4} cy="105" r="2.5" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.25" opacity="0.5" />
        {/* Tibia */}
        <line x1={13 - sway * 4} y1="105" x2={15 - sway * 3} y2="125" stroke={color} strokeWidth="3" strokeLinecap="round" />
        {/* Foot -- metatarsals */}
        <ellipse cx={15 - sway * 3} cy="128" rx="8" ry="3" fill={color} opacity="0.5" />
        {[11, 13, 15, 17, 19].map((bx, i) => (
          <line
            key={`rmt${i}`}
            x1={bx - sway * 3}
            y1="126"
            x2={bx + 0.5 - sway * 3}
            y2="130"
            stroke={color}
            strokeWidth="0.8"
            opacity="0.35"
          />
        ))}
      </g>
    </g>
  );
};

/* ================================================================ */
/*  Follow Skeleton -- shorter, right side                          */
/* ================================================================ */
const FollowSkeleton: React.FC<{
  color: string;
  sway: number;
  armShift: number;
}> = ({ color, sway, armShift }) => {
  const so = -sway * 3; // mirror sway
  const aShift = -armShift * 2;

  return (
    <g transform={`translate(${118 + so}, 8)`}>
      {/* -- SKULL (slightly smaller) -- */}
      <g>
        {/* Cranium dome */}
        <ellipse cx="0" cy="11" rx="12" ry="13" fill={color} opacity="0.15" />
        <path
          d="M -11 16 Q -12 7 -8.5 2 Q -4 -3 0 -3.5 Q 4 -3 8.5 2 Q 12 7 11 16"
          stroke={color}
          strokeWidth="1.8"
          fill="none"
          opacity="0.85"
        />
        {/* Skull outline lower */}
        <path
          d="M -11 16 Q -10 21 -7 24 L 7 24 Q 10 21 11 16"
          stroke={color}
          strokeWidth="1.8"
          fill="none"
          opacity="0.85"
        />
        {/* Eye sockets */}
        <ellipse cx="-4.5" cy="12" rx="3.5" ry="4" stroke={color} strokeWidth="1" fill="none" opacity="0.7" />
        <ellipse cx="4.5" cy="12" rx="3.5" ry="4" stroke={color} strokeWidth="1" fill="none" opacity="0.7" />
        {/* Eye inner glow */}
        <ellipse cx="-4.5" cy="12" rx="1.8" ry="2.2" fill={color} opacity="0.3" />
        <ellipse cx="4.5" cy="12" rx="1.8" ry="2.2" fill={color} opacity="0.3" />
        {/* Eye dot pupils */}
        <circle cx="-4.5" cy="12.5" r="0.9" fill={color} opacity="0.6" />
        <circle cx="4.5" cy="12.5" r="0.9" fill={color} opacity="0.6" />
        {/* Nose cavity */}
        <path d="M -1.2 17 L 0 19.5 L 1.2 17" stroke={color} strokeWidth="0.9" fill="none" opacity="0.5" />
        {/* Jaw bone */}
        <path
          d="M -7.5 24 Q -8.5 26.5 -6.5 29 L -5 30 Q 0 31 5 30 L 6.5 29 Q 8.5 26.5 7.5 24"
          stroke={color}
          strokeWidth="1.3"
          fill="none"
          opacity="0.7"
        />
        {/* Individual teeth -- upper row (6) */}
        {[-5, -3, -1, 1, 3, 5].map((tx, i) => (
          <rect
            key={`fut${i}`}
            x={tx - 0.6}
            y="24"
            width="1.2"
            height="1.9"
            rx="0.3"
            fill={color}
            opacity="0.5"
          />
        ))}
        {/* Individual teeth -- lower row (6) */}
        {[-4.5, -2.7, -0.9, 0.9, 2.7, 4.5].map((tx, i) => (
          <rect
            key={`flt${i}`}
            x={tx - 0.5}
            y="27.8"
            width="1"
            height="1.7"
            rx="0.3"
            fill={color}
            opacity="0.45"
          />
        ))}
      </g>

      {/* -- NECK: 3 cervical vertebrae -- */}
      {[33, 35.2, 37.4].map((ny, i) => (
        <g key={`fcv${i}`}>
          <rect
            x={-2 + so * 0.04 * i}
            y={ny}
            width="4"
            height="1.7"
            rx="0.8"
            fill={color}
            opacity="0.45"
          />
          <circle cx={so * 0.04 * i} cy={ny + 0.85} r="1.2" stroke={color} strokeWidth="0.7" fill="none" opacity="0.3" />
        </g>
      ))}

      {/* -- SPINE: segmented vertebrae -- */}
      {[41, 44.5, 48, 51.5, 55, 58.5, 62, 65.5].map((sy, i) => {
        const drift = so * 0.05 * (i + 3);
        return (
          <g key={`fsv${i}`}>
            <rect
              x={-1.8 + drift}
              y={sy}
              width="3.6"
              height="2.6"
              rx="1"
              fill={color}
              opacity="0.4"
            />
            {/* Vertebral process nubs */}
            <line x1={-3 + drift} y1={sy + 1.3} x2={-1.8 + drift} y2={sy + 1.3} stroke={color} strokeWidth="0.7" opacity="0.3" />
            <line x1={1.8 + drift} y1={sy + 1.3} x2={3 + drift} y2={sy + 1.3} stroke={color} strokeWidth="0.7" opacity="0.3" />
          </g>
        );
      })}

      {/* -- STERNUM -- */}
      <line
        x1={so * 0.12}
        y1="42"
        x2={so * 0.2}
        y2="55"
        stroke={color}
        strokeWidth="1.8"
        opacity="0.55"
      />

      {/* -- RIB CAGE: 4 pairs -- */}
      {[43, 46.5, 50, 53.5].map((ry, i) => {
        const d = so * 0.06 * (i + 2);
        const spread = 10 + i * 0.7;
        return (
          <g key={`frib${i}`}>
            <path
              d={`M ${d} ${ry} Q ${-spread * 0.6 + d} ${ry + 0.8} ${-spread + d} ${ry + 2.5 + i * 0.4}`}
              stroke={color}
              strokeWidth="1.5"
              fill="none"
              opacity="0.5"
            />
            <path
              d={`M ${d} ${ry} Q ${spread * 0.6 + d} ${ry + 0.8} ${spread + d} ${ry + 2.5 + i * 0.4}`}
              stroke={color}
              strokeWidth="1.5"
              fill="none"
              opacity="0.5"
            />
          </g>
        );
      })}

      {/* -- PELVIS: hip bone -- */}
      <path
        d={`M ${-10 + so * 0.25} 69 Q ${-12 + so * 0.25} 72.5 ${-7 + so * 0.3} 76 L ${so * 0.4} 74.5 L ${7 + so * 0.3} 76 Q ${12 + so * 0.25} 72.5 ${10 + so * 0.25} 69 Z`}
        stroke={color}
        strokeWidth="1.5"
        fill={color}
        fillOpacity="0.15"
        opacity="0.6"
      />
      {/* Sacrum */}
      <path
        d={`M ${-2.5 + so * 0.35} 69 L ${so * 0.4} 74.5 L ${2.5 + so * 0.35} 69`}
        stroke={color}
        strokeWidth="1"
        fill="none"
        opacity="0.4"
      />

      {/* -- LEFT ARM: extended to hold partner's hand -- */}
      <g>
        <circle cx="-8.5" cy="42" r="2" stroke={color} strokeWidth="0.9" fill={color} fillOpacity="0.2" opacity="0.5" />
        {/* Humerus */}
        <line x1="-8.5" y1="42" x2={-28 + aShift * 0.5} y2={38 + aShift * 0.3} stroke={color} strokeWidth="2.8" strokeLinecap="round" />
        {/* Elbow joint */}
        <circle cx={-28 + aShift * 0.5} cy={38 + aShift * 0.3} r="1.8" stroke={color} strokeWidth="0.9" fill={color} fillOpacity="0.3" opacity="0.5" />
        {/* Radius */}
        <line x1={-28 + aShift * 0.5} y1={38 + aShift * 0.3} x2={-42 + aShift * 0.3} y2={31 + aShift * 0.2} stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        {/* Ulna */}
        <line x1={-28 + aShift * 0.5} y1={39.3 + aShift * 0.3} x2={-41 + aShift * 0.3} y2={32.3 + aShift * 0.2} stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity="0.4" />
        {/* Hand -- metacarpals reaching toward partner */}
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={`flf${i}`}
            x1={-42 + aShift * 0.3}
            y1={31 + aShift * 0.2}
            x2={-44 + aShift * 0.2 - i * 0.4}
            y2={28 + aShift * 0.15 + i * 1.1}
            stroke={color}
            strokeWidth="0.9"
            strokeLinecap="round"
            opacity="0.5"
          />
        ))}
      </g>

      {/* -- RIGHT ARM: resting on partner's shoulder -- */}
      <g>
        <circle cx="8.5" cy="42" r="2" stroke={color} strokeWidth="0.9" fill={color} fillOpacity="0.2" opacity="0.5" />
        {/* Humerus */}
        <line x1="8.5" y1="42" x2={22 - aShift * 0.3} y2={46 - aShift * 0.2} stroke={color} strokeWidth="2.8" strokeLinecap="round" />
        {/* Elbow joint */}
        <circle cx={22 - aShift * 0.3} cy={46 - aShift * 0.2} r="1.8" stroke={color} strokeWidth="0.9" fill={color} fillOpacity="0.3" opacity="0.5" />
        {/* Radius */}
        <line x1={22 - aShift * 0.3} y1={46 - aShift * 0.2} x2={30 - aShift * 0.2} y2={40 - aShift * 0.15} stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        {/* Ulna */}
        <line x1={22 - aShift * 0.3} y1={47.3 - aShift * 0.2} x2={29 - aShift * 0.2} y2={41.3 - aShift * 0.15} stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity="0.4" />
        {/* Fingers on shoulder */}
        {[0, 1, 2, 3].map((i) => (
          <line
            key={`frf${i}`}
            x1={30 - aShift * 0.2}
            y1={40 - aShift * 0.15}
            x2={31.5 - aShift * 0.15 + i * 0.3}
            y2={38 - aShift * 0.1 + i * 1}
            stroke={color}
            strokeWidth="0.9"
            strokeLinecap="round"
            opacity="0.5"
          />
        ))}
      </g>

      {/* -- LEFT LEG -- */}
      <g>
        <circle cx={-6 + so * 0.25} cy="75" r="1.8" stroke={color} strokeWidth="0.9" fill={color} fillOpacity="0.2" opacity="0.4" />
        {/* Femur */}
        <line x1={-6 + so * 0.25} y1="75" x2={-10 - sway * 4} y2="95" stroke={color} strokeWidth="3" strokeLinecap="round" />
        {/* Knee joint */}
        <circle cx={-10 - sway * 4} cy="95" r="2.2" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.25" opacity="0.5" />
        {/* Tibia */}
        <line x1={-10 - sway * 4} y1="95" x2={-12 - sway * 3} y2="113" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
        {/* Foot -- metatarsals */}
        <ellipse cx={-12 - sway * 3} cy="116" rx="7" ry="2.5" fill={color} opacity="0.5" />
        {[-16, -14, -12, -10, -8].map((bx, i) => (
          <line
            key={`flmt${i}`}
            x1={bx - sway * 3}
            y1="114.5"
            x2={bx - 0.4 - sway * 3}
            y2="118"
            stroke={color}
            strokeWidth="0.7"
            opacity="0.35"
          />
        ))}
      </g>

      {/* -- RIGHT LEG -- */}
      <g>
        <circle cx={6 + so * 0.25} cy="75" r="1.8" stroke={color} strokeWidth="0.9" fill={color} fillOpacity="0.2" opacity="0.4" />
        {/* Femur */}
        <line x1={6 + so * 0.25} y1="75" x2={10 + sway * 3} y2="95" stroke={color} strokeWidth="3" strokeLinecap="round" />
        {/* Knee joint */}
        <circle cx={10 + sway * 3} cy="95" r="2.2" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.25" opacity="0.5" />
        {/* Tibia */}
        <line x1={10 + sway * 3} y1="95" x2={12 + sway * 2.5} y2="113" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
        {/* Foot -- metatarsals */}
        <ellipse cx={12 + sway * 2.5} cy="116" rx="7" ry="2.5" fill={color} opacity="0.5" />
        {[8, 10, 12, 14, 16].map((bx, i) => (
          <line
            key={`frmt${i}`}
            x1={bx + sway * 2.5}
            y1="114.5"
            x2={bx + 0.4 + sway * 2.5}
            y2="118"
            stroke={color}
            strokeWidth="0.7"
            opacity="0.35"
          />
        ))}
      </g>
    </g>
  );
};

/* ================================================================ */
/*  Rose with layered petals, thorned stem, leaf                    */
/* ================================================================ */
const Rose: React.FC<{ color: string; bloom: number }> = ({ color, bloom }) => {
  // bloom: 0-1, drives petal openness
  const petalSpread = 2.5 + bloom * 1.5;

  return (
    <g transform="translate(88, 35)">
      {/* Outer petals -- 5 petals in a ring */}
      {[0, 72, 144, 216, 288].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const px = Math.cos(rad) * petalSpread;
        const py = Math.sin(rad) * petalSpread;
        return (
          <ellipse
            key={`op${i}`}
            cx={px}
            cy={py}
            rx={3.5 + bloom * 0.5}
            ry={2.2 + bloom * 0.3}
            fill={color}
            opacity={0.6 + bloom * 0.15}
            transform={`rotate(${angle + 30} ${px} ${py})`}
          />
        );
      })}
      {/* Inner petals -- smaller, tighter ring */}
      {[36, 108, 180, 252, 324].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const px = Math.cos(rad) * (petalSpread * 0.5);
        const py = Math.sin(rad) * (petalSpread * 0.5);
        return (
          <ellipse
            key={`ip${i}`}
            cx={px}
            cy={py}
            rx={2.5 + bloom * 0.3}
            ry={1.6 + bloom * 0.2}
            fill={color}
            opacity={0.75 + bloom * 0.1}
            transform={`rotate(${angle + 60} ${px} ${py})`}
          />
        );
      })}
      {/* Center bud */}
      <circle cx="0" cy="0" r={1.8 - bloom * 0.3} fill={color} opacity="0.95" />
      {/* Center spiral hint */}
      <path
        d="M -0.5 -0.5 Q 0.5 -1 1 0 Q 0.5 1 -0.5 0.5"
        stroke="black"
        strokeWidth="0.4"
        fill="none"
        opacity="0.25"
      />

      {/* Stem */}
      <path
        d="M 0 5 Q 0.5 9 0 14 Q -0.3 18 0.2 22"
        stroke="#00FF7F"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Thorns */}
      <line x1="0.3" y1="8" x2="2.5" y2="7" stroke="#00FF7F" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
      <line x1="-0.1" y1="12" x2="-2.3" y2="11.2" stroke="#00FF7F" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
      <line x1="0.2" y1="16" x2="2" y2="15.3" stroke="#00FF7F" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />

      {/* Leaf */}
      <g transform="translate(3, 13) rotate(-35)">
        <path
          d="M 0 0 Q 4 -2 6.5 0 Q 4 2 0 0"
          fill="#00FF7F"
          opacity="0.65"
        />
        {/* Leaf vein */}
        <line x1="0.5" y1="0" x2="5.5" y2="0" stroke="#00FF7F" strokeWidth="0.5" opacity="0.4" />
        <line x1="2.5" y1="0" x2="3.5" y2="-0.8" stroke="#00FF7F" strokeWidth="0.3" opacity="0.3" />
        <line x1="4" y1="0" x2="4.8" y2="-0.6" stroke="#00FF7F" strokeWidth="0.3" opacity="0.3" />
      </g>

      {/* Second leaf (other side, lower) */}
      <g transform="translate(-2.5, 17) rotate(30)">
        <path
          d="M 0 0 Q -4 -1.5 -5.5 0 Q -4 1.5 0 0"
          fill="#00FF7F"
          opacity="0.55"
        />
        <line x1="-0.5" y1="0" x2="-4.5" y2="0" stroke="#00FF7F" strokeWidth="0.4" opacity="0.35" />
      </g>
    </g>
  );
};

/* ================================================================ */
/*  Main SVG composition                                            */
/* ================================================================ */
const WaltzingPair: React.FC<{
  size: number;
  leadColor: string;
  followColor: string;
  roseColor: string;
  sway: number;
  bloom: number;
}> = ({ size, leadColor, followColor, roseColor, sway, bloom }) => {
  const armShift = sway * 0.6;

  return (
    <svg width={size * 1.4} height={size} viewBox="0 0 190 140" fill="none">
      <LeadSkeleton color={leadColor} sway={sway} armShift={armShift} />
      <FollowSkeleton color={followColor} sway={sway} armShift={armShift} />
      <Rose color={roseColor} bloom={0.5 + bloom * 0.5} />
    </svg>
  );
};

/* ================================================================ */
/*  Component entry point                                           */
/* ================================================================ */
interface Props {
  frames: EnhancedFrameData[];
}

export const SkeletonCouple: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, beatDecay, musicalTime, chromaHue, onsetEnvelope } = snap;

  // Rotate color pairs every ~20 seconds for variety
  const colorIndex = Math.floor(frame / COLOR_PERIOD);
  const rng = seeded(colorIndex * 43 + 5081);
  const colorPair = COLOR_PAIRS[Math.floor(rng() * COLOR_PAIRS.length)];

  // ChromaHue-driven color shift -- tint the base colors toward current harmonic key
  const hueRad = (chromaHue * Math.PI) / 180;
  const hueShiftR = Math.cos(hueRad) * 20;
  const hueShiftG = Math.cos(hueRad + 2.094) * 20; // +120deg
  const hueShiftB = Math.cos(hueRad + 4.189) * 20; // +240deg
  const glowTint = `rgb(${128 + Math.round(hueShiftR)}, ${128 + Math.round(hueShiftG)}, ${128 + Math.round(hueShiftB)})`;

  // Energy-driven opacity
  const opacity = interpolate(energy, [0.03, 0.2], [0.5, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Waltz spin -- continuous, energy and tempo drive rotation speed
  const spinRate = interpolate(energy, [0.03, 0.25], [0.4 * tempoFactor, 2.5 * tempoFactor], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const spinAngle = frame * spinRate * 0.5;

  // Position: center-right area of screen, with gentle drift
  const driftPhase = frame * 0.002 * tempoFactor;
  const centerX = width * 0.62 + Math.sin(driftPhase) * width * 0.04;
  const centerY = height * 0.45 + Math.cos(driftPhase * 0.7) * height * 0.03;

  // Body sway for waltz motion -- synced to musicalTime (3/4 waltz feel)
  const beatPhase = (musicalTime % 3) / 3;
  const waltzBeat = Math.sin(beatPhase * Math.PI * 2) * 0.6 + beatDecay * 0.4;

  // Rose bloom pulsing with beat
  const rosePulse = 0.4 + beatDecay * 0.6;

  // Scale with energy (slightly larger when loud)
  const scale = interpolate(energy, [0.03, 0.2], [0.85, 1.1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Neon glow -- brighter during loud passages, onset flashes
  const glowIntensity =
    interpolate(energy, [0.05, 0.2], [8, 30], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) + onsetEnvelope * 15;

  const charSize = 180;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: centerX,
          top: centerY,
          transform: `translate(-50%, -50%) rotate(${spinAngle}deg) scale(${scale})`,
          opacity,
          filter: [
            `drop-shadow(0 0 ${glowIntensity}px ${colorPair.lead})`,
            `drop-shadow(0 0 ${glowIntensity * 1.5}px ${colorPair.follow})`,
            `drop-shadow(0 0 ${glowIntensity * 0.5}px ${glowTint})`,
          ].join(" "),
          willChange: "transform, opacity, filter",
        }}
      >
        <WaltzingPair
          size={charSize}
          leadColor={colorPair.lead}
          followColor={colorPair.follow}
          roseColor={colorPair.rose}
          sway={waltzBeat}
          bloom={rosePulse}
        />
      </div>
    </div>
  );
};
