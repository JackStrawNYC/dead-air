/**
 * Europe72Jester — The Ice Cream Kid / Jester from the Europe '72 album cover.
 *
 * A+++ richly detailed SVG figure with:
 *   - Round mischievous head: exaggerated grin, wide sparkle-highlight eyes, prominent nose
 *   - 3-pointed jester cap with jingle bells, alternating red/yellow/blue panels
 *   - Medieval tunic with collar, belt, and buckle
 *   - One hand gripping a waffle-pattern cone topped with 3 stacked scoops
 *     (strawberry pink / vanilla cream / chocolate brown), sprinkles, and a drip
 *   - Other hand extended in a greeting gesture
 *   - Striped tights (vertical alternating colors)
 *   - Pointed curl-tip medieval shoes
 *
 * Atmospheric: warm chromaHue-tinted glow, gentle bobbing/dancing synced
 *              to musicalTime, slight body sway, bell jingle motion lines.
 *
 * Audio reactivity: useAudioSnapshot + useTempoFactor.
 *   energy        → master opacity envelope
 *   beatDecay     → bounce / cap bell flick
 *   musicalTime   → dance phase
 *   chromaHue     → warm glow tint
 *   onsetEnvelope → bell jingle particles + sparkle pulses
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

// ── Timing ──────────────────────────────────────────────────────────
const CYCLE = 2700; // 90s at 30fps
const DURATION = 420; // 14s presence
const FADE_IN = 60;
const FADE_OUT = 75;

// ── Palettes ────────────────────────────────────────────────────────
// Classic jester pattern colors
const CAP_RED = "#E63946";
const CAP_YELLOW = "#FFD23F";
const CAP_BLUE = "#1D4E89";
const TUNIC = "#7B2D26";
const TUNIC_TRIM = "#F4D35E";
const BELT = "#3D2817";
const BELT_BUCKLE = "#D4A017";
const SKIN = "#F4C9A0";
const SKIN_SHADE = "#D9A57E";
const TIGHTS_A = "#B5179E";
const TIGHTS_B = "#FFD23F";
const SHOE = "#3D2817";
const ICE_STRAWBERRY = "#FF8FA3";
const ICE_VANILLA = "#FFF3D6";
const ICE_CHOCOLATE = "#5C3A21";
const CONE = "#C68642";
const CONE_DARK = "#8B5E34";
const DRIP = "#FFF3D6";

// ═══════════════════════════════════════════════════════════════════
//  JesterFigure — fully detailed SVG
// ═══════════════════════════════════════════════════════════════════

const JesterFigure: React.FC<{
  size: number;
  bounceY: number;
  swayDeg: number;
  capWag: number;
  eyeSparkle: number;
  bellFlick: number;
  jinglePulse: number;
}> = ({
  size,
  bounceY,
  swayDeg,
  capWag,
  eyeSparkle,
  bellFlick,
  jinglePulse,
}) => {
  return (
    <svg
      width={size}
      height={size * 1.7}
      viewBox="0 0 200 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ═══ ATMOSPHERIC BACK-GLOW HALO ═══ */}
      <ellipse
        cx="100"
        cy="170"
        rx="92"
        ry="155"
        fill="url(#jesterHalo)"
        opacity="0.18"
      />
      <defs>
        <radialGradient id="jesterHalo" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor={TUNIC_TRIM} stopOpacity="0.7" />
          <stop offset="60%" stopColor={CAP_RED} stopOpacity="0.25" />
          <stop offset="100%" stopColor="black" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="vanillaScoop" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor={ICE_VANILLA} />
        </radialGradient>
        <radialGradient id="strawScoop" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0%" stopColor="#FFC4CC" />
          <stop offset="100%" stopColor={ICE_STRAWBERRY} />
        </radialGradient>
        <radialGradient id="chocScoop" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0%" stopColor="#7A4B25" />
          <stop offset="100%" stopColor={ICE_CHOCOLATE} />
        </radialGradient>
      </defs>

      {/* All body parts share a transform group for sway/bounce */}
      <g
        transform={`translate(0 ${bounceY}) rotate(${swayDeg} 100 200)`}
      >
        {/* ═══ JESTER CAP — 3 points with bells ═══ */}
        {/* Cap base band */}
        <path
          d="M 60 78 Q 100 64 140 78 L 138 92 Q 100 84 62 92 Z"
          fill={TUNIC_TRIM}
          stroke={BELT}
          strokeWidth="1.4"
        />
        {/* Cap dome — three colored panels rising */}
        <path
          d="M 62 86 Q 70 50 78 82"
          fill={CAP_RED}
          stroke={BELT}
          strokeWidth="1"
        />
        <path
          d="M 78 82 Q 90 44 100 84"
          fill={CAP_YELLOW}
          stroke={BELT}
          strokeWidth="1"
        />
        <path
          d="M 100 84 Q 110 44 122 82"
          fill={CAP_BLUE}
          stroke={BELT}
          strokeWidth="1"
        />
        <path
          d="M 122 82 Q 130 50 138 86"
          fill={CAP_RED}
          stroke={BELT}
          strokeWidth="1"
        />

        {/* ── 3 bell-tip points (left, center, right) ── */}
        {/* Left tip */}
        <g transform={`rotate(${-8 - capWag * 4} 70 50)`}>
          <path
            d="M 70 50 Q 64 56 60 70 L 70 66 Q 76 56 70 50 Z"
            fill={CAP_BLUE}
            stroke={BELT}
            strokeWidth="0.8"
          />
          <ellipse cx="62" cy="71" rx="4.5" ry="4" fill={BELT_BUCKLE} stroke={BELT} strokeWidth="0.8" />
          <ellipse cx="61" cy="69.5" rx="1.5" ry="1.2" fill="#FFF3D6" opacity="0.7" />
          {/* Bell jingle arc */}
          {jinglePulse > 0.05 && (
            <path
              d={`M 56 70 Q ${50 - jinglePulse * 4} 73 ${48 - jinglePulse * 6} 78`}
              stroke={CAP_YELLOW}
              strokeWidth="1"
              fill="none"
              opacity={jinglePulse * 0.7}
              strokeLinecap="round"
            />
          )}
        </g>

        {/* Center tip */}
        <g transform={`rotate(${capWag * 3} 100 42)`}>
          <path
            d="M 100 42 Q 96 50 96 64 L 104 64 Q 104 50 100 42 Z"
            fill={CAP_RED}
            stroke={BELT}
            strokeWidth="0.8"
          />
          <ellipse cx="100" cy="65" rx="5" ry="4.5" fill={BELT_BUCKLE} stroke={BELT} strokeWidth="0.8" />
          <ellipse cx="98.5" cy="63" rx="1.6" ry="1.3" fill="#FFF3D6" opacity="0.75" />
          {/* Bell slot line */}
          <line x1="96" y1="65.5" x2="104" y2="65.5" stroke={BELT} strokeWidth="0.6" />
          {jinglePulse > 0.05 && (
            <>
              <path
                d={`M 100 56 L 100 ${50 - jinglePulse * 5}`}
                stroke={CAP_YELLOW}
                strokeWidth="1.1"
                opacity={jinglePulse * 0.65}
                strokeLinecap="round"
              />
              <circle cx="100" cy={50 - jinglePulse * 6} r="0.9" fill={CAP_YELLOW} opacity={jinglePulse * 0.7} />
            </>
          )}
        </g>

        {/* Right tip */}
        <g transform={`rotate(${8 + capWag * 4} 130 50)`}>
          <path
            d="M 130 50 Q 136 56 140 70 L 130 66 Q 124 56 130 50 Z"
            fill={CAP_YELLOW}
            stroke={BELT}
            strokeWidth="0.8"
          />
          <ellipse cx="138" cy="71" rx="4.5" ry="4" fill={BELT_BUCKLE} stroke={BELT} strokeWidth="0.8" />
          <ellipse cx="139" cy="69.5" rx="1.5" ry="1.2" fill="#FFF3D6" opacity="0.7" />
          {jinglePulse > 0.05 && (
            <path
              d={`M 144 70 Q ${150 + jinglePulse * 4} 73 ${152 + jinglePulse * 6} 78`}
              stroke={CAP_YELLOW}
              strokeWidth="1"
              fill="none"
              opacity={jinglePulse * 0.7}
              strokeLinecap="round"
            />
          )}
        </g>

        {/* Cap band stitching dots */}
        {[68, 80, 92, 104, 116, 128].map((cx) => (
          <circle key={`stitch-${cx}`} cx={cx} cy="86" r="0.8" fill={BELT} opacity="0.5" />
        ))}

        {/* ═══ HEAD ═══ */}
        {/* Round friendly face */}
        <ellipse cx="100" cy="108" rx="28" ry="30" fill={SKIN} stroke={SKIN_SHADE} strokeWidth="1.2" />
        {/* Cheek shading */}
        <ellipse cx="76" cy="116" rx="6" ry="4" fill={ICE_STRAWBERRY} opacity="0.35" />
        <ellipse cx="124" cy="116" rx="6" ry="4" fill={ICE_STRAWBERRY} opacity="0.35" />
        {/* Forehead highlight */}
        <ellipse cx="100" cy="92" rx="14" ry="5" fill="white" opacity="0.18" />

        {/* ── Wide eyes with sparkle highlights ── */}
        {/* Left eye */}
        <ellipse cx="89" cy="104" rx="5.8" ry="6.2" fill="white" stroke={BELT} strokeWidth="1" />
        <circle cx="90" cy="105" r="3.4" fill="#3A4FB5" />
        <circle cx="90" cy="105" r="1.8" fill={BELT} />
        {/* Sparkle */}
        <circle cx="91.5" cy="103.5" r={1.1 + eyeSparkle * 0.6} fill="white" opacity={0.85 + eyeSparkle * 0.15} />
        <circle cx="88.5" cy="106.2" r="0.6" fill="white" opacity="0.65" />

        {/* Right eye */}
        <ellipse cx="111" cy="104" rx="5.8" ry="6.2" fill="white" stroke={BELT} strokeWidth="1" />
        <circle cx="112" cy="105" r="3.4" fill="#3A4FB5" />
        <circle cx="112" cy="105" r="1.8" fill={BELT} />
        <circle cx="113.5" cy="103.5" r={1.1 + eyeSparkle * 0.6} fill="white" opacity={0.85 + eyeSparkle * 0.15} />
        <circle cx="110.5" cy="106.2" r="0.6" fill="white" opacity="0.65" />

        {/* ── Eyebrows: arched mischievous ── */}
        <path d="M 82 96 Q 89 91 96 96" stroke={BELT} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M 104 96 Q 111 91 118 96" stroke={BELT} strokeWidth="1.6" fill="none" strokeLinecap="round" />

        {/* ── Prominent nose ── */}
        <path
          d="M 100 108 Q 96 116 99 122 Q 102 124 103 122 Q 106 116 100 108 Z"
          fill={SKIN_SHADE}
          stroke={BELT}
          strokeWidth="0.9"
        />
        <ellipse cx="98.5" cy="121" rx="0.9" ry="0.7" fill={BELT} opacity="0.6" />
        <ellipse cx="101.5" cy="121" rx="0.9" ry="0.7" fill={BELT} opacity="0.6" />

        {/* ── Exaggerated grin ── */}
        <path
          d="M 84 124 Q 100 138 116 124"
          stroke={BELT}
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
        {/* Mouth interior — smiling open mouth */}
        <path
          d="M 86 125 Q 100 137 114 125 Q 110 132 100 133 Q 90 132 86 125 Z"
          fill="#7B1D1D"
          opacity="0.85"
        />
        {/* Upper teeth row */}
        <rect x="91" y="125" width="18" height="2.4" rx="0.8" fill="white" opacity="0.92" />
        <line x1="95" y1="125" x2="95" y2="127.4" stroke={BELT} strokeWidth="0.4" />
        <line x1="100" y1="125" x2="100" y2="127.4" stroke={BELT} strokeWidth="0.4" />
        <line x1="105" y1="125" x2="105" y2="127.4" stroke={BELT} strokeWidth="0.4" />
        {/* Tongue hint */}
        <ellipse cx="100" cy="131" rx="3" ry="1" fill={ICE_STRAWBERRY} opacity="0.7" />

        {/* Chin shadow */}
        <ellipse cx="100" cy="138" rx="6" ry="2" fill={SKIN_SHADE} opacity="0.4" />

        {/* ═══ NECK ═══ */}
        <rect x="93" y="138" width="14" height="9" fill={SKIN} />
        <line x1="94" y1="146" x2="106" y2="146" stroke={SKIN_SHADE} strokeWidth="0.6" />

        {/* ═══ JESTER COLLAR — scalloped trim ═══ */}
        <path
          d="M 64 150 Q 70 142 78 148 Q 86 142 94 148 Q 100 142 106 148 Q 114 142 122 148 Q 130 142 136 150 L 132 158 Q 100 154 68 158 Z"
          fill={TUNIC_TRIM}
          stroke={BELT}
          strokeWidth="1"
        />
        {/* Collar bells */}
        {[72, 90, 100, 110, 128].map((bx, i) => (
          <ellipse
            key={`collarbell-${i}`}
            cx={bx}
            cy="156"
            rx="2.2"
            ry="2"
            fill={BELT_BUCKLE}
            stroke={BELT}
            strokeWidth="0.5"
          />
        ))}

        {/* ═══ TUNIC BODY ═══ */}
        <path
          d="M 68 158 Q 64 200 70 218 L 130 218 Q 136 200 132 158 Q 100 162 68 158 Z"
          fill={TUNIC}
          stroke={BELT}
          strokeWidth="1.2"
        />
        {/* Tunic vertical highlight stripe */}
        <line x1="100" y1="160" x2="100" y2="216" stroke={TUNIC_TRIM} strokeWidth="1.4" opacity="0.7" />
        {/* Diamond patches */}
        <path d="M 82 178 L 86 184 L 82 190 L 78 184 Z" fill={CAP_YELLOW} opacity="0.85" stroke={BELT} strokeWidth="0.5" />
        <path d="M 118 178 L 122 184 L 118 190 L 114 184 Z" fill={CAP_BLUE} opacity="0.85" stroke={BELT} strokeWidth="0.5" />
        <path d="M 100 200 L 105 208 L 100 216 L 95 208 Z" fill={CAP_YELLOW} opacity="0.7" stroke={BELT} strokeWidth="0.5" />

        {/* ═══ BELT ═══ */}
        <rect x="66" y="218" width="68" height="8" fill={BELT} stroke="black" strokeWidth="0.6" />
        {/* Belt buckle */}
        <rect x="94" y="219" width="12" height="6" fill={BELT_BUCKLE} stroke={BELT} strokeWidth="0.6" />
        <rect x="97" y="221" width="6" height="2" fill={BELT} />
        {/* Belt rivets */}
        {[72, 80, 88, 112, 120, 128].map((rx) => (
          <circle key={`rivet-${rx}`} cx={rx} cy="222" r="0.8" fill={BELT_BUCKLE} />
        ))}

        {/* ═══ LEFT ARM — extended in greeting (viewer's right) ═══ */}
        {/* Upper arm */}
        <path
          d="M 132 162 Q 148 172 156 188"
          stroke={TUNIC}
          strokeWidth="11"
          strokeLinecap="round"
          fill="none"
        />
        {/* Striped sleeve detail */}
        <path
          d="M 132 162 Q 148 172 156 188"
          stroke={TUNIC_TRIM}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="3 4"
        />
        {/* Forearm */}
        <path
          d="M 156 188 Q 162 196 160 210"
          stroke={TUNIC}
          strokeWidth="9"
          strokeLinecap="round"
          fill="none"
        />
        {/* Cuff */}
        <ellipse cx="160" cy="210" rx="6" ry="2.5" fill={TUNIC_TRIM} stroke={BELT} strokeWidth="0.8" />
        {/* Greeting hand — open palm waving */}
        <ellipse cx="160" cy="216" rx="5.5" ry="6" fill={SKIN} stroke={SKIN_SHADE} strokeWidth="0.8" />
        {/* Fingers */}
        <line x1="156" y1="220" x2="154" y2="226" stroke={SKIN_SHADE} strokeWidth="2" strokeLinecap="round" />
        <line x1="159" y1="221" x2="158" y2="228" stroke={SKIN_SHADE} strokeWidth="2" strokeLinecap="round" />
        <line x1="162" y1="221" x2="163" y2="228" stroke={SKIN_SHADE} strokeWidth="2" strokeLinecap="round" />
        <line x1="165" y1="220" x2="167" y2="226" stroke={SKIN_SHADE} strokeWidth="2" strokeLinecap="round" />
        <line x1="155" y1="216" x2="151" y2="218" stroke={SKIN_SHADE} strokeWidth="1.8" strokeLinecap="round" />
        {/* Palm crease */}
        <path d="M 156 215 Q 160 217 164 215" stroke={SKIN_SHADE} strokeWidth="0.6" fill="none" opacity="0.6" />

        {/* ═══ RIGHT ARM — gripping ice cream cone (viewer's left) ═══ */}
        {/* Upper arm */}
        <path
          d="M 68 162 Q 54 172 50 188"
          stroke={TUNIC}
          strokeWidth="11"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 68 162 Q 54 172 50 188"
          stroke={TUNIC_TRIM}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="3 4"
        />
        {/* Forearm raised holding cone */}
        <path
          d="M 50 188 Q 46 174 44 158"
          stroke={TUNIC}
          strokeWidth="9"
          strokeLinecap="round"
          fill="none"
        />
        {/* Cuff */}
        <ellipse cx="44" cy="158" rx="6" ry="2.5" fill={TUNIC_TRIM} stroke={BELT} strokeWidth="0.8" />
        {/* Hand gripping cone */}
        <ellipse cx="44" cy="152" rx="5.5" ry="5.5" fill={SKIN} stroke={SKIN_SHADE} strokeWidth="0.8" />
        {/* Curled fingers wrapping around cone */}
        <path d="M 40 148 Q 36 152 38 156" stroke={SKIN_SHADE} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M 49 148 Q 53 152 51 156" stroke={SKIN_SHADE} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M 47 145 Q 51 145 50 149" stroke={SKIN_SHADE} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* Thumb */}
        <ellipse cx="40" cy="148" rx="1.8" ry="2.4" fill={SKIN} stroke={SKIN_SHADE} strokeWidth="0.6" />

        {/* ═══ ICE CREAM CONE — held above hand ═══ */}
        {/* Cone (waffle pattern) */}
        <path
          d="M 36 152 L 52 152 L 44 110 Z"
          fill={CONE}
          stroke={BELT}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {/* Cone shading */}
        <path
          d="M 44 110 L 52 152 L 47 152 Z"
          fill={CONE_DARK}
          opacity="0.45"
        />
        {/* Waffle cross-hatch */}
        {[114, 122, 130, 138, 146].map((wy) => (
          <line
            key={`waffleH-${wy}`}
            x1={37 + (152 - wy) * 0.05}
            y1={wy}
            x2={51 - (152 - wy) * 0.05}
            y2={wy}
            stroke={CONE_DARK}
            strokeWidth="0.7"
            opacity="0.7"
          />
        ))}
        {[40, 44, 48].map((wx, i) => (
          <line
            key={`waffleV-${i}`}
            x1={wx + (i - 1) * 0.4}
            y1="114"
            x2={wx + (i - 1) * 1.6}
            y2="150"
            stroke={CONE_DARK}
            strokeWidth="0.7"
            opacity="0.7"
          />
        ))}

        {/* Cone rim ring */}
        <ellipse cx="44" cy="112" rx="9" ry="2" fill={CONE} stroke={BELT} strokeWidth="0.9" />
        <ellipse cx="44" cy="111.6" rx="8.4" ry="1.4" fill={CONE_DARK} opacity="0.4" />

        {/* ── Drip running down cone ── */}
        <path
          d="M 38 113 Q 36 122 37 132 Q 38 134 39 132 Q 40 122 38 113 Z"
          fill={DRIP}
          stroke={SKIN_SHADE}
          strokeWidth="0.5"
          opacity="0.92"
        />

        {/* ── 3 stacked scoops ── */}
        {/* Bottom: Strawberry */}
        <ellipse cx="44" cy="106" rx="11" ry="9" fill="url(#strawScoop)" stroke={BELT} strokeWidth="1" />
        {/* Strawberry texture bumps */}
        <ellipse cx="38" cy="103" rx="2.5" ry="2" fill="#FFA8B6" opacity="0.7" />
        <ellipse cx="49" cy="104" rx="2" ry="1.6" fill="#FFA8B6" opacity="0.7" />
        <ellipse cx="44" cy="110" rx="3" ry="1.8" fill="#E66F88" opacity="0.6" />
        {/* Sprinkles on strawberry */}
        <line x1="36" y1="100" x2="37.5" y2="101" stroke={CAP_YELLOW} strokeWidth="1" strokeLinecap="round" />
        <line x1="42" y1="98" x2="43.5" y2="99.5" stroke={CAP_BLUE} strokeWidth="1" strokeLinecap="round" />
        <line x1="48" y1="100" x2="49.5" y2="101.5" stroke="#76FF03" strokeWidth="1" strokeLinecap="round" />
        <line x1="40" y1="105" x2="41" y2="106.5" stroke={CAP_RED} strokeWidth="1" strokeLinecap="round" />
        <line x1="46" y1="106" x2="47" y2="107.5" stroke="#FF8A00" strokeWidth="1" strokeLinecap="round" />

        {/* Middle: Vanilla */}
        <ellipse cx="44" cy="92" rx="10" ry="8.5" fill="url(#vanillaScoop)" stroke={BELT} strokeWidth="1" />
        <ellipse cx="40" cy="90" rx="2.4" ry="1.8" fill="#FFFFFF" opacity="0.85" />
        <ellipse cx="48" cy="91" rx="2" ry="1.5" fill="#FFFFFF" opacity="0.7" />
        <path d="M 36 92 Q 44 96 52 92" stroke="#E8D6A8" strokeWidth="0.6" fill="none" opacity="0.6" />
        {/* Sprinkles on vanilla */}
        <line x1="38" y1="86" x2="39.2" y2="87.4" stroke={CAP_RED} strokeWidth="1" strokeLinecap="round" />
        <line x1="44" y1="84.5" x2="45.2" y2="86" stroke="#76FF03" strokeWidth="1" strokeLinecap="round" />
        <line x1="49" y1="87" x2="50" y2="88.5" stroke={CAP_BLUE} strokeWidth="1" strokeLinecap="round" />

        {/* Top: Chocolate */}
        <ellipse cx="44" cy="79" rx="9" ry="7.8" fill="url(#chocScoop)" stroke={BELT} strokeWidth="1" />
        <ellipse cx="40" cy="77" rx="2.2" ry="1.6" fill="#7A4B25" opacity="0.85" />
        <ellipse cx="47" cy="78" rx="1.8" ry="1.4" fill="#7A4B25" opacity="0.7" />
        <path d="M 37 80 Q 44 82 51 80" stroke="#3A1F0E" strokeWidth="0.6" fill="none" opacity="0.6" />
        {/* Sprinkles on chocolate */}
        <line x1="40" y1="74" x2="41" y2="75.3" stroke={CAP_YELLOW} strokeWidth="1" strokeLinecap="round" />
        <line x1="44" y1="72.5" x2="45" y2="74" stroke="#FFC4CC" strokeWidth="1" strokeLinecap="round" />
        <line x1="48" y1="75" x2="49" y2="76.4" stroke="#76FF03" strokeWidth="1" strokeLinecap="round" />
        {/* Chocolate sheen highlight */}
        <ellipse cx="42" cy="76" rx="2.5" ry="0.9" fill="white" opacity="0.35" />

        {/* Cherry on top */}
        <circle cx="44" cy="69" r="2.4" fill={CAP_RED} stroke={BELT} strokeWidth="0.6" />
        <ellipse cx="43" cy="68" rx="0.8" ry="0.6" fill="white" opacity="0.7" />
        <path d="M 44 67 Q 46 64 48 64" stroke="#5A8C2A" strokeWidth="1" fill="none" strokeLinecap="round" />

        {/* ═══ LEGS — striped tights ═══ */}
        {/* Left leg (viewer's left) */}
        <path
          d="M 78 226 Q 76 260 80 290 L 92 290 Q 94 260 90 226 Z"
          fill={TIGHTS_A}
          stroke={BELT}
          strokeWidth="1"
        />
        {/* Vertical stripes on left leg */}
        <path d="M 80 228 Q 79 258 82 288" stroke={TIGHTS_B} strokeWidth="2.4" fill="none" />
        <path d="M 84 228 Q 84 258 86 288" stroke={TIGHTS_B} strokeWidth="2.4" fill="none" />
        <path d="M 88 228 Q 89 258 90 288" stroke={TIGHTS_B} strokeWidth="2.4" fill="none" />

        {/* Right leg (viewer's right) */}
        <path
          d="M 110 226 Q 106 260 108 290 L 120 290 Q 124 260 122 226 Z"
          fill={TIGHTS_B}
          stroke={BELT}
          strokeWidth="1"
        />
        {/* Vertical stripes on right leg */}
        <path d="M 112 228 Q 110 258 110 288" stroke={TIGHTS_A} strokeWidth="2.4" fill="none" />
        <path d="M 116 228 Q 115 258 114 288" stroke={TIGHTS_A} strokeWidth="2.4" fill="none" />
        <path d="M 120 228 Q 120 258 118 288" stroke={TIGHTS_A} strokeWidth="2.4" fill="none" />

        {/* Knee accent rings */}
        <ellipse cx="85" cy="252" rx="6" ry="1.2" fill={BELT} opacity="0.35" />
        <ellipse cx="115" cy="252" rx="6" ry="1.2" fill={BELT} opacity="0.35" />

        {/* ═══ POINTED CURL-TIP SHOES ═══ */}
        {/* Left shoe */}
        <path
          d="M 78 290 L 92 290 Q 96 296 88 300 Q 78 302 70 298 Q 64 300 60 296 Q 60 292 64 288 Q 70 286 78 290 Z"
          fill={SHOE}
          stroke="black"
          strokeWidth="0.9"
        />
        {/* Curl tip */}
        <path
          d="M 62 296 Q 56 290 58 284 Q 60 282 60 286 Q 60 290 62 290"
          stroke={SHOE}
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
        {/* Bell on tip */}
        <ellipse cx="58" cy="284" rx="1.8" ry="1.6" fill={BELT_BUCKLE} stroke="black" strokeWidth="0.5" />
        {/* Shoe highlight */}
        <ellipse cx="80" cy="294" rx="6" ry="1.4" fill="white" opacity="0.25" />

        {/* Right shoe */}
        <path
          d="M 108 290 L 122 290 Q 130 286 136 288 Q 140 292 140 296 Q 136 300 130 298 Q 122 302 112 300 Q 104 296 108 290 Z"
          fill={SHOE}
          stroke="black"
          strokeWidth="0.9"
        />
        {/* Curl tip */}
        <path
          d="M 138 296 Q 144 290 142 284 Q 140 282 140 286 Q 140 290 138 290"
          stroke={SHOE}
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx="142" cy="284" rx="1.8" ry="1.6" fill={BELT_BUCKLE} stroke="black" strokeWidth="0.5" />
        <ellipse cx="120" cy="294" rx="6" ry="1.4" fill="white" opacity="0.25" />

        {/* Ground contact shadow */}
        <ellipse cx="100" cy="304" rx="48" ry="3" fill="black" opacity="0.25" />

        {/* ── Floating jingle particles emitted on onset bursts ── */}
        {jinglePulse > 0.15 &&
          [-1, 0, 1].map((px, i) => {
            const angle = (i - 1) * 0.6;
            const dist = 14 + jinglePulse * 22;
            return (
              <g key={`particle-${px}`}>
                <circle
                  cx={100 + Math.sin(angle) * dist}
                  cy={48 - Math.cos(angle) * dist}
                  r={1.4 + jinglePulse * 1.2}
                  fill={CAP_YELLOW}
                  opacity={jinglePulse * 0.8}
                />
                <circle
                  cx={100 + Math.sin(angle) * dist}
                  cy={48 - Math.cos(angle) * dist}
                  r={0.6}
                  fill="white"
                  opacity={jinglePulse}
                />
              </g>
            );
          })}

        {/* Bell flick highlight ring on cap (beat-driven) */}
        {bellFlick > 0.1 && (
          <circle
            cx="100"
            cy="65"
            r={6 + bellFlick * 4}
            fill="none"
            stroke={CAP_YELLOW}
            strokeWidth="1"
            opacity={bellFlick * 0.5}
          />
        )}
      </g>
    </svg>
  );
};

// ═══════════════════════════════════════════════════════════════════
//  Europe72Jester — orchestrator component
// ═══════════════════════════════════════════════════════════════════

interface Props {
  frames: EnhancedFrameData[];
}

export const Europe72Jester: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, beatDecay, chromaHue, musicalTime, onsetEnvelope } = snap;

  // ── Cycle gating ──
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  // ── Fade envelope ──
  const fadeIn = interpolate(cycleFrame, [0, FADE_IN], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    cycleFrame,
    [DURATION - FADE_OUT, DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const presence = Math.min(fadeIn, fadeOut);

  // Energy-modulated opacity
  // Widened opacity: ghostly at quiet → vivid at loud
  const energyOpacity = interpolate(energy, [0.04, 0.18, 0.4], [0.20, 0.65, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = presence * energyOpacity;
  if (opacity < 0.02) return null;

  // ── Dance / bobbing motion synced to musicalTime ──
  // Widened: barely moving at quiet → energetic dance at loud
  const dancePhase = musicalTime * Math.PI * 2;
  const bounceY = Math.sin(dancePhase) * (4 + energy * 12) + beatDecay * 8;
  const swayDeg = Math.cos(dancePhase * 0.5) * (2 + energy * 6) + Math.sin(frame * 0.02 * tempoFactor) * 2;
  // Widened cap wag: 0.6° → 5° range (was invisible)
  const capWag = Math.sin(dancePhase + Math.PI / 4) * (0.5 + energy * 4) + beatDecay * 2;

  // Eye sparkle pulses on onsets and gentle ambient breathing
  const eyeSparkle = Math.min(
    1,
    onsetEnvelope * 0.7 + (Math.sin(frame * 0.06) * 0.5 + 0.5) * 0.3,
  );

  // Bell flick on beat
  const bellFlick = beatDecay;

  // Bell jingle particle burst tied to onsets
  const jinglePulse = Math.min(1, onsetEnvelope * 1.1);

  // ── Position: lower-center so the figure stands on lower third ──
  const centerX = width * 0.5;
  const centerY = height * 0.55;

  // Slight horizontal drift across the cycle (jester wandering on stage)
  const driftX = Math.sin((cycleFrame / DURATION) * Math.PI) * width * 0.04;

  // ── Warm glow tint driven by chromaHue ──
  // Anchor near warm gold (~40°), shift +/- with chromaHue
  const warmHue = (40 + chromaHue * 0.4) % 360;
  const warmGlow = `hsl(${warmHue}, 78%, 62%)`;
  const innerGlow = `hsl(${(warmHue + 18) % 360}, 95%, 70%)`;
  const outerGlow = `hsl(${(warmHue + 340) % 360}, 70%, 55%)`;

  const glowRadius = 14 + energy * 22 + onsetEnvelope * 12;

  // Figure size — relative to viewport height
  const figureSize = Math.min(width, height) * 0.22;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: centerX + driftX,
          top: centerY,
          transform: `translate(-50%, -50%)`,
          opacity,
          filter: [
            `drop-shadow(0 0 ${glowRadius * 0.5}px ${warmGlow})`,
            `drop-shadow(0 0 ${glowRadius}px ${innerGlow})`,
            `drop-shadow(0 0 ${glowRadius * 1.7}px ${outerGlow})`,
          ].join(" "),
          willChange: "transform, opacity, filter",
          mixBlendMode: "normal",
        }}
      >
        <JesterFigure
          size={figureSize}
          bounceY={bounceY}
          swayDeg={swayDeg}
          capWag={capWag}
          eyeSparkle={eyeSparkle}
          bellFlick={bellFlick}
          jinglePulse={jinglePulse}
        />
      </div>
    </div>
  );
};
