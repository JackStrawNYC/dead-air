/**
 * Particle Burst GPU Shader — closed-form particle physics in vertex shader.
 *
 * Each particle is a point sprite with per-instance attributes:
 * - aVx, aVy: initial velocity
 * - aSize: particle radius
 * - aColorIdx: palette index (0-6)
 * - aLifetime: frames to live
 * - aDrag: velocity damping per frame
 *
 * Uniforms:
 * - uAge: frames since burst started
 * - uOriginX, uOriginY: burst center in NDC (-1 to 1)
 * - uGravity: downward acceleration
 * - uWindX: bass-driven horizontal wind
 * - uTurbulence: energy-driven turbulence
 *
 * Physics: closed-form position from (age, initialVelocity, gravity, drag)
 * using geometric series for drag accumulation. No per-frame loop on GPU.
 */

export const particleBurstVert = /* glsl */ `
attribute float aVx;
attribute float aVy;
attribute float aSize;
attribute float aColorIdx;
attribute float aLifetime;
attribute float aDrag;

uniform float uAge;
uniform float uOriginX;
uniform float uOriginY;
uniform float uGravity;
uniform float uWindX;
uniform float uTurbulence;

varying float vAlpha;
varying float vColorIdx;

void main() {
  float age = uAge;

  // Past lifetime → cull off-screen
  if (age >= aLifetime) {
    gl_Position = vec4(99.0, 99.0, 0.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    vColorIdx = 0.0;
    return;
  }

  // Closed-form drag accumulation: sum of geometric series
  // total displacement = v0 * (1 - drag^age) / (1 - drag)
  float dragPow = pow(aDrag, age);
  float dragSum = (1.0 - dragPow) / max(0.001, 1.0 - aDrag);

  // Position from initial velocity with drag
  float px = uOriginX + aVx * dragSum;
  float py = uOriginY + aVy * dragSum;

  // Gravity: applied each frame but also dragged
  // Cumulative gravity displacement: sum of t * drag^(age-t) for t=0..age
  // Approximation: gravity * age * age * 0.5 * average_drag
  float avgDrag = (1.0 + dragPow) * 0.5;
  py += uGravity * age * age * 0.5 * avgDrag;

  // Wind (bass-driven horizontal push)
  px += uWindX * age * 0.02;

  // Turbulence (energy-driven jitter using simple hash)
  float turbSeed = aVx * 127.1 + aVy * 311.7 + age * 0.1;
  float turbX = fract(sin(turbSeed) * 43758.5453) - 0.5;
  float turbY = fract(sin(turbSeed * 1.3 + 7.1) * 23421.6312) - 0.5;
  px += turbX * uTurbulence * 0.05;
  py += turbY * uTurbulence * 0.05;

  gl_Position = vec4(px, py, 0.0, 1.0);

  // Size shrinks over lifetime
  float lifeProgress = age / aLifetime;
  gl_PointSize = aSize * (1.0 - lifeProgress * 0.5);

  // Alpha fadeout: full for first 30%, then linear fade
  vAlpha = lifeProgress < 0.3 ? 0.9 : 0.9 * (1.0 - (lifeProgress - 0.3) / 0.7);
  vColorIdx = aColorIdx;
}
`;

export const particleBurstFrag = /* glsl */ `
precision highp float;

varying float vAlpha;
varying float vColorIdx;

void main() {
  // Circular point sprite with soft glow falloff
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  if (dist > 0.5) discard;

  // Soft glow: exponential falloff from center
  float glow = exp(-dist * 4.0);

  // 7 neon colors (same palette as SVG version)
  vec3 color;
  float ci = floor(vColorIdx + 0.5);
  if (ci < 0.5) color = vec3(1.0, 0.2, 0.6);       // hot pink
  else if (ci < 1.5) color = vec3(0.1, 1.0, 0.4);   // neon green
  else if (ci < 2.5) color = vec3(1.0, 0.85, 0.2);  // neon gold
  else if (ci < 3.5) color = vec3(0.2, 0.9, 1.0);   // cyan
  else if (ci < 4.5) color = vec3(0.7, 0.2, 1.0);   // violet
  else if (ci < 5.5) color = vec3(1.0, 0.3, 0.2);   // neon red
  else color = vec3(0.3, 0.5, 1.0);                  // electric blue

  gl_FragColor = vec4(color * glow, vAlpha * glow);
}
`;
