/**
 * Dance Floor Prism — raymarched disco/prism geometry with light beam refractions.
 * Central rotating triangular prism splits incoming light into rainbow beams.
 * Mirror ball with faceted normals, volumetric colored spotlights, dance floor
 * reflection grid, crowd silhouettes bobbing on beat, venue haze.
 *
 * Song: "One More Saturday Night" — Bob Weir's party rocker. Pure fun, energy, dancing.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass              → floor pulse amplitude, crowd bob depth
 *   uEnergy            → prism spin speed, beam count, crowd density
 *   uDrumOnset         → strobe flash, crowd jump
 *   uBeatSnap          → mirror ball facet flash, floor tile pulse
 *   uVocalPresence     → spotlight intensity, warm uplighting
 *   uHarmonicTension   → prism rotation axis tilt, color instability
 *   uSectionType       → jam=prism fractures many, space=single slow beam, chorus=FULL PARTY
 *   uClimaxPhase       → prism shatters into rainbow explosion
 *   uTempo             → crowd bob rate
 *   uSemanticRhythmic  → groove intensity, floor pulse sync
 *   uMelodicPitch      → spotlight sweep height
 *   uHighs             → sparkle intensity on mirror ball
 *   uSlowEnergy        → haze density
 *   uBeatStability     → mirror ball rotation smoothness
 *   uClimaxIntensity   → explosion strength
 *   uPalettePrimary    → primary beam / floor color
 *   uPaletteSecondary  → accent / spotlight color
 *   uChordIndex        → hue rotation per chord
 *   uMusicalTime       → beat-locked animation
 *   uDynamicTime       → continuous animation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const danceFloorPrismVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.14,
  caEnabled: false,
  halationEnabled: true,
  lightLeakEnabled: true,
  eraGradingEnabled: true,
  grainStrength: "normal",
  stageFloodEnabled: true,
  beatPulseEnabled: true,
  lensDistortionEnabled: true,
  paletteCycleEnabled: true,
});

const dfNormalGLSL = buildRaymarchNormal("dfMap($P, energy, bass, tension, climaxPhase, climaxIntensity, prismAngle, sJam, sSpace, sChorus, crowdCount).x", { eps: 0.002, name: "dfNormal" });
const dfDepthAlpha = buildDepthAlphaOutput("marchT", "DF_MAX_DIST");

export const danceFloorPrismFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${lightingGLSL}
${postProcess}
varying vec2 vUv;

#define DF_PI  3.14159265
#define DF_TAU 6.28318530
#define DF_MAX_STEPS 80
#define DF_MAX_DIST 40.0
#define DF_SURF_DIST 0.003

// ─── Rotation helper ───
mat2 dfRot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// ─── Rainbow: map t (0-1) to spectral RGB ───
vec3 dfRainbow(float t) {
  return 0.5 + 0.5 * cos(DF_TAU * (t + vec3(0.0, 0.33, 0.67)));
}

// ─── SDF: Triangular prism (equilateral cross-section along Z) ───
float dfPrism(vec3 p, float radius, float halfLen) {
  // Equilateral triangle in XY plane
  float k = sqrt(3.0);
  vec2 q = abs(p.xy);
  q.x -= radius;
  q.y += radius / k;
  if (q.x + k * q.y > 0.0) q = vec2(q.x - k * q.y, -k * q.x - q.y) * 0.5;
  q.x -= clamp(q.x, -2.0 * radius, 0.0);
  float d2d = -length(q) * sign(q.y);
  // Extrude along Z
  float dz = abs(p.z) - halfLen;
  return max(d2d, dz);
}

// ─── SDF: Mirror ball (sphere + faceted normal quantization) ───
float dfMirrorBall(vec3 p, float radius) {
  return length(p) - radius;
}

// Faceted normal: quantize direction into mirror facets
vec3 dfFacetNormal(vec3 pos, float facetSize) {
  // Quantize the normal direction into discrete faces
  vec3 n = normalize(pos);
  // Spherical to grid quantization
  float theta = atan(n.z, n.x);
  float phi = acos(clamp(n.y, -1.0, 1.0));
  float qTheta = floor(theta / facetSize + 0.5) * facetSize;
  float qPhi = floor(phi / facetSize + 0.5) * facetSize;
  return normalize(vec3(
    sin(qPhi) * cos(qTheta),
    cos(qPhi),
    sin(qPhi) * sin(qTheta)
  ));
}

// ─── SDF: Dance floor (reflective plane with grid) ───
float dfFloor(vec3 p, float floorY) {
  return p.y - floorY;
}

// ─── SDF: Crowd silhouette (capsule person) ───
float dfCapsule(vec3 p, float halfH, float radius) {
  p.y -= clamp(p.y, -halfH, halfH);
  return length(p) - radius;
}

// ─── SDF: Single crowd member (head sphere + body capsule) ───
float dfCrowdPerson(vec3 p, float bobAmount) {
  p.y -= bobAmount;
  // Body capsule
  float body = dfCapsule(p - vec3(0.0, 0.35, 0.0), 0.35, 0.15);
  // Head sphere
  float head = length(p - vec3(0.0, 0.9, 0.0)) - 0.12;
  return min(body, head);
}

// ─── SDF: Crowd rows ───
float dfCrowd(vec3 p, float bass, float tempo, float drumOnset, float crowdCount) {
  float nearest = DF_MAX_DIST;
  float floorY = -2.0;
  for (int i = 0; i < 12; i++) {
    if (float(i) >= crowdCount) break;
    float fi = float(i);
    float seed = fi * 7.31;
    // Position in a semicircle around the dance floor
    float angle = (fi / max(crowdCount, 1.0) - 0.5) * DF_PI * 0.8;
    float rowDist = 3.5 + mod(fi * 3.17, 2.0);
    vec3 crowdPos = vec3(
      sin(angle) * rowDist,
      floorY + 0.5,
      cos(angle) * rowDist + 2.0
    );
    // Beat bob: synced to tempo with per-person phase offset
    float bobPhase = fract(seed * 0.37);
    float bobFreq = tempo / 60.0;
    float bobAmt = (0.05 + bass * 0.30) * sin(DF_TAU * bobFreq * uDynamicTime + bobPhase * DF_TAU);
    // Drum onset: crowd jumps
    bobAmt += drumOnset * 0.2;
    float person = dfCrowdPerson(p - crowdPos, bobAmt);
    nearest = min(nearest, person);
  }
  return nearest;
}

// ─── SDF: Light beam (cone along direction) ───
float dfBeam(vec3 p, vec3 origin, vec3 direction, float coneAngle) {
  vec3 delta = p - origin;
  float along = dot(delta, direction);
  if (along < 0.0) return DF_MAX_DIST;
  vec3 perp = delta - direction * along;
  float perpDist = length(perp);
  float coneRadius = along * tan(coneAngle);
  return perpDist - coneRadius;
}

// ─── Scene map: union of all SDFs ───
vec2 dfMap(vec3 p, float energy, float bass, float tension, float climaxPhase,
           float climaxIntensity, float prismAngle, float sJam, float sSpace,
           float sChorus, float crowdCount) {
  // Material IDs: 1.0=prism, 2.0=mirrorball, 3.0=floor, 4.0=crowd
  float nearest = DF_MAX_DIST;
  float matId = 0.0;

  // ─── Central prism ───
  {
    vec3 pp = p;
    pp.y -= 1.0; // Raise prism
    // Rotation: energy drives spin speed, tension tilts axis
    pp.xz *= dfRot2(prismAngle);
    pp.xy *= dfRot2(tension * 0.3);

    float prismSize = 0.6 + bass * 0.1;
    float prismLen = 0.4 + energy * 0.2;

    // Climax: shatter into multiple smaller prisms
    float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
    float shatterAmt = isClimax * climaxIntensity;

    if (shatterAmt > 0.1) {
      // Multiple small prisms radiating outward
      float smallSize = prismSize * mix(1.0, 0.3, shatterAmt);
      float smallLen = prismLen * mix(1.0, 0.25, shatterAmt);
      for (int si = 0; si < 6; si++) {
        float sAngle = float(si) / 6.0 * DF_TAU + prismAngle * 0.5;
        float sRadius = shatterAmt * 1.5;
        vec3 sp = pp - vec3(cos(sAngle) * sRadius, sin(float(si) * 1.7) * sRadius * 0.5, sin(sAngle) * sRadius);
        sp.xz *= dfRot2(sAngle + uDynamicTime);
        float sd = dfPrism(sp, smallSize, smallLen);
        if (sd < nearest) { nearest = sd; matId = 1.0; }
      }
    } else {
      // Jam: slightly duplicated prisms
      if (sJam > 0.1) {
        for (int ji = 0; ji < 3; ji++) {
          float jAngle = float(ji) / 3.0 * DF_TAU + prismAngle * 0.3;
          vec3 jp = pp - vec3(cos(jAngle) * sJam * 0.6, 0.0, sin(jAngle) * sJam * 0.6);
          jp.xz *= dfRot2(jAngle);
          float jd = dfPrism(jp, prismSize * 0.7, prismLen * 0.7);
          if (jd < nearest) { nearest = jd; matId = 1.0; }
        }
      }
      float d = dfPrism(pp, prismSize, prismLen);
      if (d < nearest) { nearest = d; matId = 1.0; }
    }
  }

  // ─── Mirror ball ───
  {
    vec3 mp = p - vec3(0.0, 3.5, 0.0);
    float ballRadius = 0.5 + bass * 0.14;
    float d = dfMirrorBall(mp, ballRadius);
    if (d < nearest) { nearest = d; matId = 2.0; }
  }

  // ─── Dance floor ───
  {
    float floorY = -2.0 + bass * 0.03 * sin(uMusicalTime * DF_TAU);
    float d = dfFloor(p, floorY);
    if (d < nearest) { nearest = d; matId = 3.0; }
  }

  // ─── Crowd ───
  {
    float d = dfCrowd(p, bass, uTempo, uDrumOnset, crowdCount);
    if (d < nearest) { nearest = d; matId = 4.0; }
  }

  return vec2(nearest, matId);
}

// ─── Normal (shared raymarching utility) ───
${dfNormalGLSL}

// ─── Volumetric light beam accumulator ───
vec3 dfBeamVolume(vec3 ro, vec3 rd, float energy, float bass, float beamCount,
                  float sSpace, float sChorus, float hue1, float hue2,
                  float vocalP, float beatSnap) {
  vec3 beamCol = vec3(0.0);
  float stepDist = 0.4;
  int steps = 30;

  for (int s = 0; s < 30; s++) {
    float marchT = float(s) * stepDist + 0.5;
    vec3 sp = ro + rd * marchT;

    // Multiple beams sweeping from above
    for (int bi = 0; bi < 7; bi++) {
      if (float(bi) >= beamCount) break;
      float bfi = float(bi);
      float beamAngle = (bfi / max(beamCount, 1.0)) * DF_TAU + uDynamicTime * (0.2 + energy * 0.3);
      // Space mode: single slow beam
      if (sSpace > 0.5) {
        beamAngle = uDynamicTime * 0.1;
        if (bi > 0) break; // Only one beam in space mode
      }

      vec3 beamOrigin = vec3(0.0, 5.0, 0.0);
      vec3 beamDir = normalize(vec3(
        sin(beamAngle) * 0.7,
        -1.0,
        cos(beamAngle) * 0.7
      ));

      float beamDist = dfBeam(sp, beamOrigin, beamDir, 0.06 + energy * 0.12);
      float beamGlow = smoothstep(0.3, 0.0, beamDist);
      beamGlow *= exp(-marchT * 0.08); // Distance falloff
      beamGlow *= 0.015;

      // Rainbow color per beam
      float beamHue = bfi / max(beamCount, 1.0);
      vec3 bColor = dfRainbow(beamHue + hue1 * 0.5);
      // Vocal presence intensifies spotlights
      bColor *= (0.6 + vocalP * 0.6);
      // Chorus: extra saturation and brightness
      bColor *= (1.0 + sChorus * 0.5);
      // Beat flash
      bColor *= (1.0 + beatSnap * 0.3);

      beamCol += bColor * beamGlow;
    }
  }
  return beamCol;
}

// ─── Floor grid pattern ───
vec3 dfFloorPattern(vec3 p, float energy, float bass, float beatSnap, float groove,
                    vec3 palCol1, vec3 palCol2) {
  // Checkerboard tiles
  vec2 tile = floor(p.xz * 1.5);
  float checker = mod(tile.x + tile.y, 2.0);

  // Base tile colors from palette
  vec3 dark = palCol1 * 0.08;
  vec3 bright = palCol2 * 0.15;
  vec3 tileCol = mix(dark, bright, checker);

  // Beat-reactive tile glow: tiles near beat pulse
  float pulseTile = sin(tile.x * 2.1 + tile.y * 1.7 + uMusicalTime * DF_TAU) * 0.5 + 0.5;
  float pulseGate = pulseTile * beatSnap;
  vec3 pulseCol = dfRainbow(fract(tile.x * 0.13 + tile.y * 0.17 + uDynamicTime * 0.05));
  tileCol += pulseCol * pulseGate * (0.2 + groove * 0.3);

  // Bass pulse: whole floor brightness throb
  tileCol *= 1.0 + bass * 0.3;

  // Floor reflectivity: energy drives shine
  tileCol *= 0.6 + energy * 0.4;

  return tileCol;
}

// ─── Haze: volumetric atmospheric fog ───
vec3 dfHaze(vec3 ro, vec3 rd, float slowEnergy, float energy, vec3 palCol1) {
  vec3 hazeCol = vec3(0.0);
  float hazeStep = 0.5;
  for (int hi = 0; hi < 20; hi++) {
    float ht = float(hi) * hazeStep + 1.0;
    vec3 hp = ro + rd * ht;
    float density = fbm3(hp * 0.3 + uDynamicTime * 0.02) * 0.5 + 0.5;
    density *= slowEnergy * 0.08;
    density *= exp(-ht * 0.06); // Distance falloff
    // Height fade: haze thickest near floor, thins out above
    float heightFade = smoothstep(4.0, -2.0, hp.y);
    density *= heightFade;
    vec3 hColor = mix(palCol1 * 0.3, vec3(0.4, 0.35, 0.5), 0.5);
    hColor *= (0.5 + energy * 0.5);
    hazeCol += hColor * density;
  }
  return hazeCol;
}

// ─── Mirror ball reflections: scattered sparkle points ───
vec3 dfMirrorSparkle(vec3 p, vec3 normal, float energy, float highs,
                     float beatSnap, float beatStab, float hue1) {
  // Faceted normal for mirror reflections
  float facetSize = mix(0.25, 0.12, beatStab); // Stable beat = more facets
  vec3 facetN = dfFacetNormal(normal, facetSize);

  // Reflect a virtual light toward viewer
  vec3 lightDir = normalize(vec3(sin(uDynamicTime * 0.5), 1.0, cos(uDynamicTime * 0.3)));
  float spec = pow(max(dot(facetN, lightDir), 0.0), 64.0);

  // Rainbow sparkle per facet
  float facetId = dot(facetN, vec3(12.9898, 78.233, 45.164));
  facetId = fract(sin(facetId) * 43758.5453);
  vec3 sparkleCol = dfRainbow(facetId + hue1);

  // Highs drive sparkle intensity
  float sparkle = spec * (0.3 + highs * 0.7);
  // Beat flash: all facets flash on beat
  sparkle += beatSnap * 0.5 * step(0.8, spec);

  return sparkleCol * sparkle * energy;
}

void main() {
  vec2 uvCoord = vUv;
  uvCoord = applyCameraCut(uvCoord, uOnsetSnap, uBeatSnap, uEnergy, uCoherence,
                            uClimaxPhase, uMusicalTime, uSectionIndex);
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uvCoord - 0.5) * aspect;

  // ─── Clamp audio uniforms ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float groove = clamp(uSemanticRhythmic, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float climaxPhase = uClimaxPhase;
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float tempoVal = max(uTempo, 60.0);
  float effectiveBeat = beatSnap * smoothstep(0.3, 0.7, uBeatConfidence);

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Palette (chord-shifted) ───
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float hue1 = uPalettePrimary + chordHue;
  float hue2 = uPaletteSecondary + chordHue;
  vec3 palCol1 = paletteHueColor(hue1, 0.85, 0.95);
  vec3 palCol2 = paletteHueColor(hue2, 0.85, 0.95);

  // ─── Derived quantities ───
  float prismAngle = uDynamicTime * (0.3 + energy * 0.7) * mix(1.0, 1.5, sJam) * mix(1.0, 0.2, sSpace);
  float beamCount = mix(3.0, 7.0, energy) * mix(1.0, 1.3, sChorus);
  beamCount = mix(beamCount, 1.0, sSpace); // Space: single beam
  float crowdCount = mix(4.0, 12.0, energy) * mix(1.0, 0.3, sSpace) * (1.0 + sChorus * 0.3);
  crowdCount = clamp(crowdCount, 2.0, 12.0);

  // ─── Camera setup ───
  // Slightly elevated, looking at the prism from the dance floor edge
  float camSway = sin(uDynamicTime * 0.15) * 0.5 * (1.0 + groove * 0.5);
  float camHeight = 0.5 + melodicPitch * 0.5 + bass * 0.2;
  vec3 ro = vec3(camSway, camHeight, -4.0 + slowE * 0.5);
  vec3 lookAt = vec3(0.0, 1.0 + sin(uDynamicTime * 0.08) * 0.3, 0.0);

  // Build camera matrix
  vec3 camFwd = normalize(lookAt - ro);
  vec3 camWorldUp = vec3(0.0, 1.0, 0.0);
  vec3 camSide = normalize(cross(camFwd, camWorldUp));
  vec3 camUp = cross(camSide, camFwd);
  float fov = 1.2 + energy * 0.3;
  vec3 rd = normalize(camSide * p.x + camUp * p.y + camFwd * fov);

  // ─── Raymarching ───
  float marchT = 0.0;
  float marchMat = 0.0;
  bool marchHit = false;
  for (int si = 0; si < DF_MAX_STEPS; si++) {
    vec3 marchPos = ro + rd * marchT;
    vec2 result = dfMap(marchPos, energy, bass, tension, climaxPhase, climaxIntensity,
                        prismAngle, sJam, sSpace, sChorus, crowdCount);
    if (result.x < DF_SURF_DIST) {
      marchMat = result.y;
      marchHit = true;
      break;
    }
    marchT += result.x;
    if (marchT > DF_MAX_DIST) break;
  }

  vec3 col = vec3(0.0);

  // ─── Shading ───
  if (marchHit) {
    vec3 marchPos = ro + rd * marchT;
    vec3 norm = dfNormal(marchPos);
    vec3 lightDir = normalize(vec3(0.3, 1.0, -0.5));

    // Basic diffuse + specular
    float diff = max(dot(norm, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, norm), -rd), 0.0), 32.0);

    if (marchMat < 1.5) {
      // ─── PRISM: prismatic refraction colors ───
      // Simulate spectral dispersion: split into rainbow based on view angle
      float viewAngle = dot(norm, rd);
      float dispersion = abs(viewAngle);
      vec3 prismCol = dfRainbow(dispersion + uDynamicTime * 0.1 + hue1);

      // Internal refraction glow
      float internalGlow = pow(1.0 - abs(dot(norm, rd)), 3.0);
      vec3 refractionCol = dfRainbow(internalGlow + hue2) * internalGlow;

      col = prismCol * (diff * 0.6 + 0.2) + refractionCol * 0.8;
      col += spec * vec3(1.0, 0.95, 0.9) * 0.5;

      // Energy brightens prism
      col *= 0.7 + energy * 0.6;
      // Bass pulses prism glow
      col *= 1.0 + bass * 0.2;
      // Climax: bright white-rainbow flash
      float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
      col += vec3(1.0, 0.95, 0.9) * isClimax * climaxIntensity * 0.4;

    } else if (marchMat < 2.5) {
      // ─── MIRROR BALL: faceted reflections ───
      vec3 mirrorNorm = normalize(marchPos - vec3(0.0, 3.5, 0.0));
      vec3 sparkle = dfMirrorSparkle(marchPos, mirrorNorm, energy, highs,
                                      effectiveBeat, beatStab, hue1);
      // Base mirror surface: dark chrome
      col = vec3(0.03, 0.03, 0.04) + sparkle;
      // Fresnel: brighter at grazing angles
      float fresnel = pow(1.0 - abs(dot(mirrorNorm, rd)), 3.0);
      col += palCol1 * fresnel * 0.15;
      col *= 0.8 + energy * 0.4;

    } else if (marchMat < 3.5) {
      // ─── DANCE FLOOR: reflective grid ───
      col = dfFloorPattern(marchPos, energy, bass, effectiveBeat, groove, palCol1, palCol2);

      // Floor reflection of beams: simple fake by sampling beam colors at floor position
      float reflStrength = 0.3 + energy * 0.3;
      vec3 floorRefl = vec3(0.0);
      for (int ri = 0; ri < 5; ri++) {
        float rfi = float(ri);
        float rAngle = (rfi / 5.0) * DF_TAU + uDynamicTime * 0.2;
        vec2 beamXZ = vec2(sin(rAngle), cos(rAngle)) * 2.0;
        float distToBeam = length(marchPos.xz - beamXZ);
        float beamGlow = smoothstep(1.5, 0.0, distToBeam);
        vec3 bCol = dfRainbow(rfi / 5.0 + hue1);
        floorRefl += bCol * beamGlow * 0.1;
      }
      col += floorRefl * reflStrength;

      // Groove: floor becomes more alive
      col *= 1.0 + groove * 0.2;

    } else {
      // ─── CROWD: dark silhouettes with rim light ───
      float rimLight = pow(1.0 - max(dot(norm, -rd), 0.0), 2.0);
      col = vec3(0.02, 0.015, 0.025); // Dark silhouette base
      // Rim lighting from beams above
      vec3 rimCol = mix(palCol1, palCol2, sin(marchPos.x * 2.0) * 0.5 + 0.5);
      col += rimCol * rimLight * (0.15 + energy * 0.2);
      // Drum onset: brief flash on crowd
      col += vec3(0.15, 0.12, 0.1) * drumOnset * 0.3;
    }

    // Distance fog
    float fog = exp(-marchT * 0.06);
    vec3 fogCol = mix(palCol1, palCol2, 0.5) * 0.03;
    col = mix(fogCol, col, fog);
  }

  // ─── Volumetric light beams (always, even on miss) ───
  col += dfBeamVolume(ro, rd, energy, bass, beamCount, sSpace, sChorus,
                       hue1, hue2, vocalP, effectiveBeat);

  // ─── Atmospheric haze ───
  col += dfHaze(ro, rd, slowE, energy, palCol1);

  // ─── Mirror ball scattered light dots (screen-space) ───
  // Project sparkle dots from mirror ball across the scene
  {
    float dotCount = 8.0 + energy * 12.0;
    for (int di = 0; di < 20; di++) {
      if (float(di) >= dotCount) break;
      float dfi = float(di);
      float seed = dfi * 13.37;
      // Rotating sparkle positions (screen space)
      float dotAngle = seed + uDynamicTime * (0.3 + beatStab * 0.2);
      float dotRadius = 0.3 + fract(seed * 0.73) * 0.6;
      vec2 dotPos = vec2(cos(dotAngle), sin(dotAngle)) * dotRadius;
      float dist = length(p - dotPos);
      float dotGlow = smoothstep(0.04, 0.0, dist);
      vec3 dotCol = dfRainbow(fract(seed * 0.17 + hue1));
      // Highs make sparkles brighter and crisper
      col += dotCol * dotGlow * (0.03 + highs * 0.06) * energy;
    }
  }

  // ─── Drum onset strobe ───
  col += vec3(0.8, 0.75, 0.9) * drumOnset * 0.12;

  // ─── Climax: rainbow explosion overlay ───
  {
    float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
    if (isClimax > 0.5) {
      float explodeT = climaxIntensity;
      // Radial rainbow burst from center
      float dist = length(p);
      float ring = smoothstep(0.02, 0.0, abs(dist - explodeT * 2.0));
      ring += smoothstep(0.03, 0.0, abs(dist - explodeT * 1.3));
      vec3 explodeCol = dfRainbow(dist * 0.5 + uDynamicTime * 0.5);
      col += explodeCol * ring * 0.4;
      // Overall rainbow wash
      float washAngle = atan(p.y, p.x);
      vec3 wash = dfRainbow(washAngle / DF_TAU + uDynamicTime * 0.2);
      col += wash * explodeT * 0.08;
    }
  }

  // ─── Solo: spotlight focus ───
  {
    float soloSpot = sSolo * vocalP;
    float spotDist = length(p - vec2(0.0, -0.2));
    float spotGlow = smoothstep(0.6, 0.0, spotDist) * soloSpot;
    col += palCol2 * spotGlow * 0.15;
  }

  // ─── Semantic: rhythmic groove → floor pulse sync ───
  col *= 1.0 + groove * 0.1;

  // ─── Vignette ───
  {
    float vigScale = mix(0.38, 0.28, energy);
    float vig = 1.0 - dot(p * vigScale, p * vigScale);
    vig = smoothstep(0.0, 1.0, vig);
    vec3 vigTint = mix(palCol1, palCol2, 0.5) * 0.02;
    col = mix(vigTint, col, mix(1.0, vig, 0.35));
  }

  // ─── Minimum brightness (no dead black) ───
  col = max(col, vec3(0.01, 0.008, 0.015));

  // ─── Icon emergence ───
  {
    float nf = snoise(vec3(p * 2.0, uTime * 0.1));
    col += iconEmergence(p, uTime, energy, bass, palCol1, palCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, bass, palCol1, palCol2, nf, uSectionIndex);
  }

  // ─── Post-processing (shared chain) ───
  col = applyTemperature(col);
  col = applyPostProcess(col, uvCoord, p);

  gl_FragColor = vec4(col, 1.0);
  ${dfDepthAlpha}
}
`;
