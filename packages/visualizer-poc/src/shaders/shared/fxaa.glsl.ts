/**
 * FXAA 3.11 Quality — Fast Approximate Anti-Aliasing.
 *
 * Runs as a final PostPass after all color grading to catch edges
 * in the finished image. Reads uInputTexture, outputs anti-aliased color.
 *
 * Based on Timothy Lottes' FXAA 3.11 (public domain).
 */

/** Passthrough vertex shader for FXAA post-pass */
export const fxaaVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/** FXAA 3.11 fragment shader */
export const fxaaFrag = /* glsl */ `
precision highp float;
uniform sampler2D uInputTexture;
uniform vec2 uResolution;
varying vec2 vUv;

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 texel = 1.0 / uResolution;
  vec3 rgbM = texture2D(uInputTexture, vUv).rgb;
  float lumaM = luma(rgbM);

  // Sample 4 neighbors
  float lumaN = luma(texture2D(uInputTexture, vUv + vec2(0.0, texel.y)).rgb);
  float lumaS = luma(texture2D(uInputTexture, vUv - vec2(0.0, texel.y)).rgb);
  float lumaE = luma(texture2D(uInputTexture, vUv + vec2(texel.x, 0.0)).rgb);
  float lumaW = luma(texture2D(uInputTexture, vUv - vec2(texel.x, 0.0)).rgb);

  // Edge detection
  float lumaMin = min(lumaM, min(min(lumaN, lumaS), min(lumaE, lumaW)));
  float lumaMax = max(lumaM, max(max(lumaN, lumaS), max(lumaE, lumaW)));
  float lumaRange = lumaMax - lumaMin;

  // Skip anti-aliasing if contrast is below threshold
  if (lumaRange < max(0.0312, lumaMax * 0.125)) {
    gl_FragColor = vec4(rgbM, 1.0);
    return;
  }

  // Sample 4 diagonal neighbors
  float lumaNW = luma(texture2D(uInputTexture, vUv + vec2(-texel.x, texel.y)).rgb);
  float lumaNE = luma(texture2D(uInputTexture, vUv + vec2(texel.x, texel.y)).rgb);
  float lumaSW = luma(texture2D(uInputTexture, vUv + vec2(-texel.x, -texel.y)).rgb);
  float lumaSE = luma(texture2D(uInputTexture, vUv + vec2(texel.x, -texel.y)).rgb);

  // Determine edge direction
  float edgeH = abs(-2.0 * lumaW + lumaNW + lumaSW) +
                abs(-2.0 * lumaM + lumaN + lumaS) * 2.0 +
                abs(-2.0 * lumaE + lumaNE + lumaSE);
  float edgeV = abs(-2.0 * lumaN + lumaNW + lumaNE) +
                abs(-2.0 * lumaM + lumaW + lumaE) * 2.0 +
                abs(-2.0 * lumaS + lumaSW + lumaSE);
  bool isHorizontal = edgeH >= edgeV;

  // Choose step direction
  float stepLength = isHorizontal ? texel.y : texel.x;
  float lumaPos = isHorizontal ? lumaN : lumaE;
  float lumaNeg = isHorizontal ? lumaS : lumaW;
  float gradientPos = abs(lumaPos - lumaM);
  float gradientNeg = abs(lumaNeg - lumaM);

  if (gradientNeg > gradientPos) {
    stepLength = -stepLength;
  }

  // Sub-pixel anti-aliasing
  float lumaAvg = (lumaN + lumaS + lumaE + lumaW) * 0.25;
  float subPixelOffset = clamp(abs(lumaAvg - lumaM) / lumaRange, 0.0, 1.0);
  subPixelOffset = (-2.0 * subPixelOffset + 3.0) * subPixelOffset * subPixelOffset;
  float finalOffset = subPixelOffset * subPixelOffset * 0.75;

  // Apply offset along edge normal
  vec2 posM = vUv;
  if (isHorizontal) {
    posM.y += stepLength * finalOffset;
  } else {
    posM.x += stepLength * finalOffset;
  }

  // Edge search along the edge direction (4 steps)
  vec2 edgeDir = isHorizontal ? vec2(texel.x, 0.0) : vec2(0.0, texel.y);
  vec2 posP = posM + edgeDir;
  vec2 posN = posM - edgeDir;
  float lumaEndP = luma(texture2D(uInputTexture, posP).rgb) - lumaM;
  float lumaEndN = luma(texture2D(uInputTexture, posN).rgb) - lumaM;
  bool doneP = abs(lumaEndP) >= gradientPos * 0.5;
  bool doneN = abs(lumaEndN) >= gradientNeg * 0.5;

  // Extend search
  for (int i = 0; i < 3; i++) {
    if (!doneP) {
      posP += edgeDir;
      lumaEndP = luma(texture2D(uInputTexture, posP).rgb) - lumaM;
      doneP = abs(lumaEndP) >= gradientPos * 0.5;
    }
    if (!doneN) {
      posN -= edgeDir;
      lumaEndN = luma(texture2D(uInputTexture, posN).rgb) - lumaM;
      doneN = abs(lumaEndN) >= gradientNeg * 0.5;
    }
  }

  // Compute final blend
  float distP = isHorizontal ? (posP.x - vUv.x) : (posP.y - vUv.y);
  float distN = isHorizontal ? (vUv.x - posN.x) : (vUv.y - posN.y);
  float dist = min(distP, distN);
  float spanLength = distP + distN;
  float pixelOffset = -dist / spanLength + 0.5;

  // Use the larger of sub-pixel and edge-based offset
  float blendOffset = max(finalOffset, pixelOffset * step(0.0, (distP < distN ? lumaEndP : lumaEndN)));

  vec2 finalPos = vUv;
  if (isHorizontal) {
    finalPos.y += stepLength * blendOffset;
  } else {
    finalPos.x += stepLength * blendOffset;
  }

  gl_FragColor = vec4(texture2D(uInputTexture, finalPos).rgb, 1.0);
}
`;
