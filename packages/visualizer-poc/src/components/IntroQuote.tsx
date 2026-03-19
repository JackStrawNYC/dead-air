/**
 * IntroQuote — shows a random band quote during the intro hold period.
 *
 * Between-song breathing room: instead of dead black during the first 20s,
 * display a meditative quote that feels like being in the venue during
 * tuning or banter. Typewriter reveal, then gentle fade out.
 *
 * Suppressed for:
 *  - Segue-in songs (no intro hold)
 *  - First song in show (ShowIntro handles that)
 */

import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
import { seeded } from "../utils/seededRandom";
import { BAND_CONFIG } from "../data/band-config";
import { responsiveFontSize, responsiveSize } from "../utils/responsive-text";
import { useVideoConfig } from "remotion";

interface Props {
  showSeed: number;
  trackNumber: number;
  segueIn?: boolean;
  isFirstSong?: boolean;
}

const APPEAR_FRAME = 120;    // 4 seconds in
const FADE_IN_FRAMES = 60;   // 2s fade in
const HOLD_END_FRAME = 480;  // Hold until 16 seconds
const FADE_OUT_FRAMES = 60;  // 2s fade out
const CHARS_PER_FRAME = 0.8; // Faster than GarciaQuotes

export const IntroQuote: React.FC<Props> = ({
  showSeed,
  trackNumber,
  segueIn,
  isFirstSong,
}) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  // Don't show during segues or first song
  if (segueIn || isFirstSong) return null;

  // Only active during intro hold window
  if (frame < APPEAR_FRAME || frame > HOLD_END_FRAME + FADE_OUT_FRAMES) return null;

  // Select quote deterministically from showSeed + trackNumber
  const rng = seeded(showSeed * 31 + trackNumber * 17);
  const quoteIdx = Math.floor(rng() * BAND_CONFIG.quotes.length);
  const quote = BAND_CONFIG.quotes[quoteIdx];

  // Fade envelope
  const fadeIn = interpolate(
    frame,
    [APPEAR_FRAME, APPEAR_FRAME + FADE_IN_FRAMES],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );
  const fadeOut = interpolate(
    frame,
    [HOLD_END_FRAME, HOLD_END_FRAME + FADE_OUT_FRAMES],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) },
  );
  const opacity = Math.min(fadeIn, fadeOut) * 0.4;

  if (opacity < 0.01) return null;

  // Typewriter reveal
  const typingFrame = frame - APPEAR_FRAME;
  const charsRevealed = Math.floor(typingFrame * CHARS_PER_FRAME);
  const visibleText = quote.text.slice(0, Math.min(charsRevealed, quote.text.length));
  const textComplete = charsRevealed >= quote.text.length;

  // Attribution appears 30 frames after text is complete
  const attributionOpacity = textComplete
    ? interpolate(
        frame - APPEAR_FRAME - Math.ceil(quote.text.length / CHARS_PER_FRAME),
        [0, 30],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      ) * Math.min(fadeIn, fadeOut)
    : 0;

  const fontSize = responsiveFontSize(20, height);
  const attrSize = responsiveFontSize(13, height);
  const bottomPad = responsiveSize(18, height);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: `${bottomPad}%`,
        zIndex: 98,
      }}
    >
      <div style={{ maxWidth: "65%", textAlign: "center" }}>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize,
            fontStyle: "italic",
            fontWeight: 400,
            color: `rgba(255, 245, 230, ${opacity.toFixed(3)})`,
            textShadow: "0 0 24px rgba(180, 140, 80, 0.12)",
            lineHeight: 1.7,
            letterSpacing: "0.02em",
          }}
        >
          {visibleText}
        </div>
        {attributionOpacity > 0.01 && (
          <div
            style={{
              marginTop: 10,
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: attrSize,
              fontStyle: "italic",
              fontWeight: 300,
              color: `rgba(255, 245, 230, ${(attributionOpacity * 0.3).toFixed(3)})`,
              letterSpacing: "0.08em",
            }}
          >
            — {quote.attribution}
          </div>
        )}
      </div>
    </div>
  );
};
