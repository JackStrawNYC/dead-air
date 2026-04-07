/**
 * Oil Projector Dome — raymarched planetarium-style dome interior.
 * Multiple projector lamps below cast colored liquid oil patterns
 * upward onto a curved dome ceiling. Camera looks up from center.
 *
 * Audio reactivity:
 *   uBass            → oil blob merge radius (blobs fuse at bass peaks)
 *   uEnergy          → projector brightness, blob animation speed
 *   uDrumOnset       → blob split (fission events on hit)
 *   uVocalPresence   → dome interior glow (warm ambient light)
 *   uHarmonicTension → oil viscosity (higher = more turbulent boundaries)
 *   uSectionType     → jam=all projectors max, space=single dim, chorus=full color
 *   uClimaxPhase     → dome cracks open revealing sky
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const oilProjectorVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: 'normal',
  halationEnabled: true,
  bloomEnabled: true,
  bloomThresholdOffset: -0.05,
  caEnabled: true,
  lightLeakEnabled: true,
  eraGradingEnabled: true,
});

export const oilProjectorFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ─── Rotation matrix around Y axis ───
mat3 opRotY(float a) {
  float ca = cos(a), sa = sin(a);
  return mat3(ca,0.0,sa, 0.0,1.0,0.0, -sa,0.0,ca);
}

// ─── Hash helpers ───
float opHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float opHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// ─── Smooth min for blob merging (polynomial) ───
float opSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── SDF: hemisphere dome (interior) ───
// Negative inside the dome. Camera is inside looking up.
float opDomeSDF(vec3 p, float radius) {
  // Upper hemisphere: sphere cut at y=0
  float sphere = length(p) - radius;
  // Floor plane at y = -0.1
  float floor2 = -(p.y + 0.1);
  return max(sphere, floor2);
}

// ─── SDF: projector housing (truncated cone on the floor) ───
float opProjectorSDF(vec3 p, vec3 pos) {
  vec3 lp = p - pos;
  // Tapered cylinder: wider at base, narrow at top
  float baseR = 0.12;
  float topR = 0.06;
  float h = 0.25;
  float r = mix(baseR, topR, clamp((lp.y + 0.1) / h, 0.0, 1.0));
  float cyl = length(lp.xz) - r;
  float capBot = -(lp.y + 0.1);
  float capTop = lp.y - (pos.y + h - 0.1);
  return max(max(cyl, capBot), capTop);
}

// ─── Oil blob field: FBM-sculpted metaballs projected onto dome ───
// Returns density of oil at a dome surface point for a given projector
float opOilField(vec3 surfPos, vec3 projPos, float projIdx,
                 float bass, float tension, float drumSplit, float flowTime) {
  // Direction from projector to surface point
  vec3 projDir = normalize(surfPos - projPos);

  // Project into 2D disc of projector's view (angular coords)
  float ang = atan(projDir.x, projDir.z);
  float elev = acos(clamp(projDir.y, -1.0, 1.0));
  vec2 discUV = vec2(ang / PI, elev / PI);

  // Viscosity from harmonic tension: low tension = smooth, high = turbulent
  float viscosity = mix(1.0, 2.8, tension);

  // Oil blobs: FBM domain-warped metaballs
  float seed = projIdx * 7.3;
  vec3 fbmCoord = vec3(discUV * 2.5, flowTime * 0.3 + seed);

  // Domain warp for organic motion
  float wx = fbm3(fbmCoord + vec3(3.1, 7.2, seed));
  float wy = fbm3(fbmCoord + vec3(8.4, 1.9, seed + 5.0));
  vec3 warped = vec3(discUV + vec2(wx, wy) * (0.4 + bass * 0.3), flowTime * 0.2 + seed);

  // Primary blob
  float blob1 = fbm6(warped * viscosity);
  blob1 = smoothstep(0.05 - bass * 0.08, 0.15, blob1);

  // Secondary smaller blob (counter-rotating)
  vec3 warped2 = vec3(discUV * 1.5 + vec2(-wy, wx) * 0.3, flowTime * 0.25 + seed + 20.0);
  float blob2 = fbm6(warped2 * viscosity * 1.2);
  blob2 = smoothstep(0.08, 0.2, blob2);

  // Bass merges blobs together
  float mergeK = 0.15 + bass * 0.35;
  float merged = opSmin(1.0 - blob1, 1.0 - blob2, mergeK);
  merged = 1.0 - merged;

  // Drum onset splits blobs: creates high-frequency fission
  if (drumSplit > 0.3) {
    float splitNoise = snoise(vec3(discUV * 8.0, flowTime * 2.0 + seed));
    merged *= 1.0 - drumSplit * 0.4 * step(0.3, splitNoise);
    // Add small scattered blobs from the split
    float fission = fbm3(vec3(discUV * 6.0, flowTime * 1.5 + seed + 40.0));
    fission = smoothstep(0.35, 0.5, fission) * drumSplit * 0.5;
    merged = max(merged, fission);
  }

  // Cone falloff: projector has finite angle
  float coneFalloff = smoothstep(1.2, 0.3, elev);
  return merged * coneFalloff;
}

// ─── Scene SDF: dome + projector housings ───
float opMap(vec3 p, float energy, float bass, float flowTime,
            float sJam, float sSpace, float climaxOpen) {
  // Dome radius breathes with energy
  float domeR = 3.5 + energy * 0.2;

  // Interior of dome (negate so we're inside)
  float dome = -opDomeSDF(p, domeR);

  // Dome surface texture: subtle ridged ribs
  float ribAngle = atan(p.x, p.z);
  float ribs = sin(ribAngle * 16.0) * 0.015 * (1.0 + energy * 0.5);
  float ribVert = sin(p.y * 12.0 + flowTime * 0.1) * 0.008;
  dome -= ribs + ribVert;

  // Climax: cracks in the dome
  if (climaxOpen > 0.01) {
    float crackNoise = ridged4(p * 2.0 + flowTime * 0.5);
    float crackWidth = climaxOpen * 0.4;
    float cracks = smoothstep(0.5 - crackWidth, 0.5, crackNoise);
    dome = mix(dome, max(dome, -0.02), cracks);
  }

  // Projector housings on the floor
  float projD = 1e10;
  int projCount = sSpace > 0.5 ? 1 : (sJam > 0.5 ? 5 : 3);
  for (int i = 0; i < 5; i++) {
    if (i >= projCount) break;
    float angle = float(i) * TAU / 5.0 + flowTime * 0.02;
    float radius = 1.2 + float(i) * 0.15;
    vec3 projPos = vec3(cos(angle) * radius, -0.1, sin(angle) * radius);
    projD = min(projD, opProjectorSDF(p, projPos));
  }

  return min(dome, projD);
}

// ─── Scene normal via central differences ───
vec3 opNormal(vec3 p, float energy, float bass, float flowTime,
              float sJam, float sSpace, float climaxOpen) {
  vec2 d = vec2(0.002, 0.0);
  float b0 = opMap(p, energy, bass, flowTime, sJam, sSpace, climaxOpen);
  return normalize(vec3(
    opMap(p + d.xyy, energy, bass, flowTime, sJam, sSpace, climaxOpen) - b0,
    opMap(p + d.yxy, energy, bass, flowTime, sJam, sSpace, climaxOpen) - b0,
    opMap(p + d.yyx, energy, bass, flowTime, sJam, sSpace, climaxOpen) - b0
  ));
}

// ─── Ambient occlusion (4-tap) ───
float opAmbientOcc(vec3 p, vec3 n, float energy, float bass, float flowTime,
                   float sJam, float sSpace, float climaxOpen) {
  float occ = 1.0;
  for (int j = 1; j <= 4; j++) {
    float dist = 0.12 * float(j);
    float sampled = opMap(p + n * dist, energy, bass, flowTime, sJam, sSpace, climaxOpen);
    occ -= (dist - sampled) * (0.35 / float(j));
  }
  return clamp(occ, 0.1, 1.0);
}

// ─── Volumetric light beam from projector to dome ───
vec3 opVolumetricBeam(vec3 ro, vec3 rd, float totalDist,
                      vec3 projPos, vec3 beamColor, float brightness,
                      float flowTime, float projIdx) {
  vec3 accum = vec3(0.0);
  int steps = 12;
  float stepLen = min(totalDist, 6.0) / float(steps);

  for (int i = 0; i < 12; i++) {
    float t2 = (float(i) + 0.5) * stepLen;
    vec3 samplePos = ro + rd * t2;

    // Distance to beam axis
    vec3 toProj = samplePos - projPos;
    vec3 beamDir = normalize(vec3(0.0, 1.0, 0.0)); // projectors aim up
    float alongBeam = dot(toProj, beamDir);
    float perpDist = length(toProj - beamDir * alongBeam);

    // Cone shape: wider as it goes up
    float coneRadius = 0.1 + alongBeam * 0.5;
    float inCone = smoothstep(coneRadius, coneRadius * 0.3, perpDist);

    // Only above projector
    float aboveProj = smoothstep(-0.1, 0.2, alongBeam);

    // Atmospheric scattering with noise
    float scatter = fbm3(vec3(samplePos.xz * 2.0, flowTime * 0.1 + projIdx * 5.0));
    scatter = 0.3 + scatter * 0.7;

    accum += beamColor * inCone * aboveProj * scatter * brightness * stepLen * 0.15;
  }
  return accum;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // ─── Audio reads ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tempoScale = uLocalTempo / 120.0;
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float dynamicRng = clamp(uDynamicRange, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float improvScore = clamp(uImprovisationScore, 0.0, 1.0);

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Climax
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxIntensity = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float buildIntensity = isBuild * clamp(uClimaxIntensity, 0.0, 1.0);

  // Speed modulation
  float speedMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.35, sSpace) * mix(1.0, 1.1, sChorus);
  speedMod *= 1.0 + uPeakApproaching * 0.3;
  float flowTime = uDynamicTime * 0.08 * tempoScale * speedMod;

  // Climax dome opening
  float climaxOpen = climaxIntensity * smoothstep(0.0, 0.5, climaxIntensity);

  // ─── Projector configuration ───
  // Number of active projectors based on section type
  float projCountF = mix(3.0, 5.0, sJam) * mix(1.0, 0.35, sSpace);
  projCountF = max(1.0, projCountF);
  projCountF += climaxIntensity * 2.0; // climax adds projectors
  int projCount = int(min(projCountF, 5.0));

  // ─── Camera: looking up from center of dome ───
  vec3 camPos = vec3(
    sin(flowTime * 0.06) * 0.15,
    -0.05 + vocalP * 0.1,
    cos(flowTime * 0.05) * 0.15
  );

  // Gentle sway from beat
  camPos.x += sin(uMusicalTime * PI) * 0.02 * beatStab;
  camPos.z += cos(uMusicalTime * PI * 0.5) * 0.015 * beatStab;

  // Looking mostly up, slight wander
  vec3 lookAt = vec3(
    sin(flowTime * 0.03) * 0.3,
    3.0,
    cos(flowTime * 0.04) * 0.3
  );

  // Camera basis
  vec3 fw = normalize(lookAt - camPos);
  vec3 worldUp = vec3(0.0, 0.0, -1.0); // use Z as "up" reference to avoid degenerate cross
  vec3 camRight = normalize(cross(fw, worldUp));
  vec3 camUp = cross(camRight, fw);

  float fov = 0.7 + energy * 0.15 + climaxOpen * 0.3;
  vec3 rd = normalize(p.x * camRight + p.y * camUp + fov * fw);

  // ─── Raymarch ───
  float totalDist = 0.0;
  vec3 marchPos = camPos;
  bool marchHit = false;
  int maxSteps = int(mix(48.0, 72.0, energy));

  for (int i = 0; i < 72; i++) {
    if (i >= maxSteps) break;
    vec3 ps = camPos + rd * totalDist;
    float d = opMap(ps, energy, bass, flowTime, sJam, sSpace, climaxOpen);
    if (d < 0.003) {
      marchPos = ps;
      marchHit = true;
      break;
    }
    if (totalDist > 10.0) break;
    totalDist += d * 0.7;
  }

  vec3 col = vec3(0.0);

  // ─── Palette ───
  float h1 = uPalettePrimary;
  float h2 = uPaletteSecondary;
  vec3 palPrimary = paletteHueColor(h1, 0.85, 0.95);
  vec3 palSecondary = paletteHueColor(h2, 0.85, 0.95);

  // Per-projector colors: cycle through palette + complements
  vec3 projColors[5];
  projColors[0] = palPrimary;
  projColors[1] = palSecondary;
  float h3 = h1 + 0.5; // complement
  projColors[2] = paletteHueColor(h3, 0.85, 0.95);
  float h4 = h2 + 0.33;
  projColors[3] = paletteHueColor(h4, 0.85, 0.95);
  float h5 = h1 + 0.17 + uChromaHue * 0.2;
  projColors[4] = paletteHueColor(h5, 0.85, 0.95);

  // Chord-driven hue shift on all projector colors
  float chordShift = float(int(uChordIndex)) / 24.0 * 0.1;

  // Projector positions
  vec3 projPositions[5];
  for (int i = 0; i < 5; i++) {
    float angle = float(i) * TAU / 5.0 + flowTime * 0.02;
    float radius = 1.2 + float(i) * 0.15;
    projPositions[i] = vec3(cos(angle) * radius, -0.1, sin(angle) * radius);
  }

  if (marchHit) {
    vec3 n = opNormal(marchPos, energy, bass, flowTime, sJam, sSpace, climaxOpen);
    float occ = opAmbientOcc(marchPos, n, energy, bass, flowTime, sJam, sSpace, climaxOpen);

    // Is this the dome ceiling or the floor/projector?
    bool isDome = marchPos.y > 0.0 && length(marchPos) > 2.5;

    if (isDome) {
      // ─── Dome surface: oil projections ───
      vec3 domeBase = vec3(0.015, 0.012, 0.02); // dark dome surface
      col = domeBase;

      // Vocal presence dome glow: warm ambient wash
      vec3 domeGlow = mix(palPrimary, vec3(1.0, 0.9, 0.75), 0.6) * vocalP * 0.06;
      col += domeGlow;

      // Timbral brightness adds subtle shimmer to dome surface
      float shimmer = snoise(vec3(marchPos.xz * 4.0, flowTime * 0.5)) * timbralBright * 0.02;
      col += vec3(shimmer);

      // ─── Project oil blobs from each active projector ───
      for (int i = 0; i < 5; i++) {
        if (i >= projCount) break;

        vec3 projPos = projPositions[i];
        float projIdx = float(i);

        // Projector brightness based on section
        float projBright = mix(0.3, 0.95, energy);
        projBright *= mix(1.0, 1.3, sJam); // jam: all max
        projBright *= mix(1.0, 0.25, sSpace * step(0.5, projIdx)); // space: only first projector
        projBright *= mix(1.0, 1.15, sChorus); // chorus: full color
        projBright *= 1.0 + climaxIntensity * 0.4;
        projBright *= 1.0 + buildIntensity * 0.15;

        // Space score dims all but primary
        projBright *= mix(1.0, 0.2, spaceScore * step(0.5, projIdx));

        // Oil density on dome from this projector
        float oilDensity = opOilField(marchPos, projPos, projIdx,
                                      bass, tension, drumOnset, flowTime);

        // Color with chord shift + improv variation
        vec3 oilColor = projColors[i];
        float hueShift = chordShift + improvScore * 0.05 * sin(flowTime + projIdx * 2.0);
        oilColor = paletteHueColor(uPalettePrimary + float(i) * 0.2 + hueShift, 0.85, 0.95);

        // Chorus: push toward full vivid saturation
        float chorSat = mix(1.0, 1.3, sChorus);
        float oilLuma = dot(oilColor, vec3(0.299, 0.587, 0.114));
        oilColor = mix(vec3(oilLuma), oilColor, chorSat);

        // Surface tension meniscus: bright edge at blob boundaries
        float edgeDist = abs(oilDensity - 0.5);
        float meniscus = smoothstep(0.08, 0.01, edgeDist) * 0.12;

        // Kelvin-Helmholtz instability at blob edges
        float khWave = ridged4(vec3(marchPos.xz * 6.0, flowTime * 0.4 + projIdx * 3.0));
        float khMix = smoothstep(0.3, 0.0, edgeDist) * khWave * 0.08 * tension;

        // Projected light: additive (like real oil projector lamp)
        vec3 projected = oilColor * oilDensity * projBright;
        projected += vec3(1.0, 0.95, 0.85) * meniscus * projBright;
        projected += oilColor * khMix;

        // Dynamic range modulates contrast of oil field
        projected *= mix(0.8, 1.2, dynamicRng);

        col += projected * 0.5;
      }

      // ─── Caustic patterns from light through oil (on dome surface) ───
      {
        float caustAngle = atan(marchPos.x, marchPos.z);
        float caustElev = marchPos.y / 3.5;
        vec2 caustUV = vec2(caustAngle / PI, caustElev);
        float c1 = snoise(vec3(caustUV * 6.0 + flowTime * 0.15, flowTime * 0.1));
        float c2 = snoise(vec3(caustUV * 12.0 - flowTime * 0.1, flowTime * 0.08 + 5.0));
        float caustic = abs(c1 + c2 * 0.5);
        caustic = pow(caustic, 3.0) * 0.15 * energy;
        col += mix(palPrimary, palSecondary, c1 * 0.5 + 0.5) * caustic;
      }

      // Apply dome AO
      col *= occ;

      // Fresnel rim on dome interior: subtle catch-light at grazing angles
      float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
      col += mix(palPrimary, vec3(1.0), 0.5) * fresnel * 0.04 * energy;

    } else {
      // ─── Floor / projector housings ───
      vec3 floorBase = vec3(0.01, 0.008, 0.012);

      // Directional light from projectors (pointing up, so floor gets splash)
      float floorLight = 0.0;
      vec3 floorColor = vec3(0.0);
      for (int i = 0; i < 5; i++) {
        if (i >= projCount) break;
        vec3 projPos = projPositions[i];
        float dist = length(marchPos.xz - projPos.xz);
        float falloff = smoothstep(0.8, 0.1, dist);
        float projBright = mix(0.2, 0.7, energy) * mix(1.0, 1.3, sJam) * mix(1.0, 0.25, sSpace * step(0.5, float(i)));
        floorLight += falloff * projBright;
        floorColor += projColors[i] * falloff * projBright;
      }

      col = floorBase + floorColor * 0.15;

      // Specular highlight on projector housing (metallic)
      vec3 L = normalize(vec3(0.0, 1.0, 0.0));
      float spec = pow(max(dot(reflect(-L, n), -rd), 0.0), 32.0);
      col += vec3(0.8, 0.75, 0.7) * spec * 0.1 * energy;

      col *= occ;
    }
  } else {
    // ─── Sky visible through dome cracks during climax ───
    if (climaxOpen > 0.01 && rd.y > 0.3) {
      // Starfield
      vec3 starDir = floor(rd * 40.0);
      float starHash = opHash2(starDir.xz + starDir.y * 7.0);
      float starBright = step(0.92, starHash) * smoothstep(0.06, 0.01, length(fract(rd * 40.0) - 0.5));

      // Nebula glow
      float nebula = fbm3(rd * 3.0 + flowTime * 0.02);
      nebula = smoothstep(0.1, 0.6, nebula);

      vec3 skyCol = vec3(0.01, 0.005, 0.02);
      skyCol += palSecondary * nebula * 0.15 * climaxOpen;
      skyCol += mix(vec3(0.9, 0.85, 1.0), palPrimary, 0.3) * starBright * 0.6 * climaxOpen;

      // Cosmic glow at crack edges
      float crackEdge = smoothstep(0.4, 0.6, rd.y) * climaxOpen;
      skyCol += palPrimary * crackEdge * 0.08;

      col = skyCol;
    } else {
      // Ambient dome miss (shouldn't happen often)
      col = vec3(0.005, 0.003, 0.008);
    }
  }

  // ─── Volumetric light beams from projectors ───
  {
    vec3 beamAccum = vec3(0.0);
    for (int i = 0; i < 5; i++) {
      if (i >= projCount) break;
      vec3 projPos = projPositions[i];
      float projBright = mix(0.15, 0.6, energy);
      projBright *= mix(1.0, 1.3, sJam);
      projBright *= mix(1.0, 0.2, sSpace * step(0.5, float(i)));
      projBright *= 1.0 + climaxIntensity * 0.3;

      beamAccum += opVolumetricBeam(camPos, rd, totalDist, projPos,
                                     projColors[i], projBright, flowTime, float(i));
    }
    col += beamAccum;
  }

  // ─── Beat snap: brightness pulse ───
  col *= 1.0 + uBeatSnap * 0.15 * (1.0 + climaxIntensity * 0.3);

  // ─── Onset saturation pulse ───
  {
    float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
    float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse * 0.6);
    col *= 1.0 + onsetPulse * 0.08;
  }

  // ─── Palette saturation ───
  {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float satMod = mix(1.0, 1.15, sJam) * mix(1.0, 0.65, sSpace) * mix(1.0, 1.25, sChorus);
    col = mix(vec3(lum), col, mix(0.4, 1.0, energy) * uPaletteSaturation * satMod);
  }

  // ─── Dead Iconography ───
  {
    float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
    col += iconEmergence(p, uTime, energy, uBass, palPrimary, palSecondary, _nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, uBass, palPrimary, palSecondary, _nf, uSectionIndex);
  }

  // ─── Lifted blacks (build-phase-aware) ───
  {
    float liftMult = mix(1.0, 0.15, buildIntensity);
    col = max(col, vec3(0.02, 0.015, 0.025) * liftMult);
  }

  // ─── Post-process chain ───
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
