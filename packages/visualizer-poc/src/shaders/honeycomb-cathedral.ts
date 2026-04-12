/**
 * Honeycomb Cathedral — raymarched hexagonal honeycomb lattice cathedral.
 * Golden light filters through hex cells. Cells drip and flow like honey
 * during jams, resolidify during verses. For "Sugaree" — sweet, languid,
 * melancholic guitar work made visible as a living hive of amber light.
 *
 * Audio reactivity:
 *   uBass             → hex cell breathing (scale pulsing)
 *   uEnergy           → honey drip rate, golden glow intensity
 *   uDrumOnset        → droplet release
 *   uVocalPresence    → subsurface glow warmth
 *   uHarmonicTension  → cell deformation (perfect hex → organic blob)
 *   uMelodicPitch     → cell scale variation
 *   uSectionType      → jam=melting, space=vast empty, chorus=golden burst
 *   uClimaxPhase      → cells shatter into droplets
 *   uSlowEnergy       → camera drift speed
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const honeycombCathedralVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.05,
  halationEnabled: true,
  caEnabled: true,
  lightLeakEnabled: true,
  grainStrength: "light",
  eraGradingEnabled: true,
  lensDistortionEnabled: true,
});

const hcNormalGLSL = buildRaymarchNormal("hcMap($P, energy, bass, hcTime, tension, melPitch, sJam, sSpace, climB, drumOn)", { eps: 0.002, name: "hcNormal" });
const hcDepthAlpha = buildDepthAlphaOutput("totalDist", "15.0");

export const honeycombCathedralFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${lightingGLSL}
${postProcess}
varying vec2 vUv;

#define HC_TAU 6.28318530
#define HC_PI 3.14159265
#define HC_SQRT3 1.7320508

// ─── Hex grid: returns (dist to nearest hex center, cell ID.xy) ───
// Pointy-top hex tiling with proper nearest-center distance
vec3 hcHex(vec2 p, float scale) {
  p *= scale;
  // Axial coords for hex grid
  vec2 s = vec2(1.0, HC_SQRT3);
  vec2 h = s * 0.5;
  // Two candidate cells
  vec2 a = mod(p, s) - h;
  vec2 b = mod(p - h, s) - h;
  // Pick nearest center
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = p - gv;
  // Hex distance: max of three axes
  float hd = max(abs(gv.x), abs(gv.y * 2.0 / HC_SQRT3 + gv.x) * 0.5);
  hd = max(hd, abs(gv.y * 2.0 / HC_SQRT3 - gv.x) * 0.5);
  // Normalized hex distance (0 at center, ~0.5 at edge)
  float hexDist = length(gv);
  return vec3(hexDist, id);
}

// ─── Hash for per-cell variation ───
float hcHash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 hcHash2(vec2 p) {
  return vec2(hcHash(p), hcHash(p + 37.0));
}

// ─── Honey drip: elongated sphere falling from cell ───
float hcDrip(vec3 pos, float cellHash, float hcTime, float dripRate, float drumTrig) {
  // Each cell has its own drip phase
  float phase = fract(cellHash * 7.13 + hcTime * dripRate * 0.3);
  // Drum onset triggers a drip release
  phase = fract(phase + drumTrig * 0.3);
  // Drip falls along Y
  float dripY = mix(0.3, -1.2, phase * phase); // accelerating fall
  // Elongation: stretches as it falls
  float stretch = 1.0 + phase * 2.5;
  vec3 dripPos = pos - vec3(0.0, dripY, 0.0);
  dripPos.y *= stretch;
  // Sphere with slight taper (teardrop)
  float radius = mix(0.06, 0.02, phase); // shrinks as it falls
  return length(dripPos) - radius;
}

// ─── Hexagonal prism SDF (extruded hexagon) ───
float hcHexPrism(vec2 p, float h, float r) {
  // Exact hexagonal cross-section distance
  vec2 q = abs(p);
  float hexD = max(q.x - r, max(q.x * 0.5 + q.y * (HC_SQRT3 * 0.5) - r, q.y * HC_SQRT3 * 0.5 + q.x * 0.5 - r));
  return max(hexD, abs(h) - 0.5);
}

// ─── Main SDF: honeycomb lattice tunnel/cathedral ───
float hcMap(vec3 pos, float energy, float bass, float hcTime, float tension,
            float melPitch, float sJam, float sSpace, float climB, float drumOn) {
  // Camera-relative position for repeating lattice
  float cellScale = 2.5 + melPitch * 0.5; // melodic pitch varies cell density

  // Breathing: bass pulses the overall scale
  cellScale *= 1.0 + bass * 0.20;

  // Repeating cell along Z (tunnel)
  float cellDepth = 1.8;
  float cz = floor(pos.z / cellDepth);
  vec3 rp = pos;
  rp.z = mod(pos.z + cellDepth * 0.5, cellDepth) - cellDepth * 0.5;

  // Hex grid on XY plane
  vec3 hx = hcHex(pos.xy, cellScale);
  float hexDist = hx.x;
  vec2 cellId = hx.yz;
  float ch = hcHash(cellId + cz * 17.3);
  float ch2 = hcHash(cellId * 3.7 + cz * 31.1);

  // Tunnel radius: varies along Z for cathedral pillars/arches
  float tunnelR = 1.5 + 0.3 * sin(pos.z * 0.4 + hcTime * 0.05);
  tunnelR += sSpace * 1.5; // space sections: vast cathedral
  tunnelR -= sJam * 0.3; // jam sections: tighter, more intense

  // Tunnel shell: negative space (inside is traversable)
  float tunnel = -(length(pos.xy) - tunnelR);

  // Honeycomb wall: hex cells with depth
  // Wall thickness varies with tension (perfect hex → organic blob)
  float wallThick = mix(0.08, 0.03, tension * 0.8);
  // Noise deformation during jams: cells melt
  float meltNoise = snoise(pos * 1.5 + hcTime * 0.2) * sJam * 0.12;
  float meltNoise2 = fbm3(pos * 2.0 + hcTime * 0.15) * tension * 0.06;

  // Hex cell wall distance: annular hex shape
  float hexWallScale = cellScale;
  vec2 localHex = (pos.xy - cellId / cellScale);
  // Distance to hex edge (approximate with length - radius approach)
  float cellR = 0.5 / cellScale;
  float hexWall = abs(hexDist / cellScale - cellR) - wallThick;
  hexWall += meltNoise + meltNoise2;

  // Extrude along Z to make 3D lattice
  float zWall = abs(rp.z) - (cellDepth * 0.5 - wallThick * 2.0);
  float lattice = max(hexWall, zWall);

  // Combine: tunnel intersected with lattice
  float scene = max(tunnel, lattice);

  // Cathedral ribs: structural arches every N cells along Z
  float ribZ = abs(rp.z) - (cellDepth * 0.5 - 0.06);
  float ribR = length(pos.xy) - (tunnelR - 0.15);
  float ribs = max(ribZ, -ribR);
  scene = min(scene, ribs);

  // Honey drips: falling droplets from cell centers
  float dripRate = 0.3 + energy * 0.7;
  vec3 dripOrigin = vec3(cellId / cellScale, pos.z);
  float drip = hcDrip(pos - vec3(cellId / cellScale, cz * cellDepth), ch, hcTime, dripRate, drumOn);
  // Only show drips that are inside the tunnel
  drip = max(drip, -tunnel + 0.1);
  scene = min(scene, drip);

  // Climax: cells shatter — add fracture noise
  if (climB > 0.1) {
    float fracture = ridged4(pos * 4.0 + hcTime * 2.0) * climB * 0.15;
    scene += fracture;
    // Shattered droplets scatter
    vec3 shatterP = pos + snoise(pos * 3.0 + hcTime) * climB * 0.2;
    float shatterDrop = length(fract(shatterP * 2.0) - 0.5) - 0.04 * climB;
    scene = min(scene, max(shatterDrop, -tunnel + 0.05));
  }

  return scene;
}

// ─── Normal (shared raymarching utility) ───
${hcNormalGLSL}

// ─── Subsurface scattering approximation for amber/honey ───
vec3 hcSubsurface(vec3 pos, vec3 norm, vec3 lightDir, vec3 viewDir,
                  float thick, vec3 sssColor, float vocalWarm) {
  // Back-scattering: light passing through thin walls
  float sss = max(0.0, dot(viewDir, -(lightDir + norm * 0.4)));
  sss = pow(sss, 3.0) * thick;
  // Warmth modulated by vocal presence
  float warmth = 0.6 + vocalWarm * 0.4;
  return sssColor * sss * warmth;
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  // ─── Clamp all uniforms ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float tender = clamp(uSemanticTender, 0.0, 1.0);

  // Section type parsing
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sChorus = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float sSolo = smoothstep(3.5, 4.5, uSectionType) * (1.0 - step(4.5, uSectionType));

  // Climax
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);

  // Dynamic time: languid drift speed modulated by section type
  float hcTime = uDynamicTime * (0.04 + slowE * 0.03) * (1.0 + sJam * 0.5 - sSpace * 0.4);

  // ─── Palette: warm amber / golden honey / deep brown ───
  // Use palette uniforms but bias heavily toward honey/amber
  float h1 = uPalettePrimary;
  vec3 palPrimary = paletteHueColor(h1, 0.85, 0.95);
  float h2 = uPaletteSecondary;
  vec3 palSecondary = paletteHueColor(h2, 0.85, 0.95);

  // Amber/honey bias: blend palette toward golden tones
  vec3 honeyGold = vec3(1.0, 0.78, 0.3);
  vec3 deepAmber = vec3(0.8, 0.5, 0.15);
  vec3 darkBrown = vec3(0.15, 0.08, 0.03);
  vec3 warmWhite = vec3(1.0, 0.92, 0.75);

  // Mix palette with honey colors (60% honey, 40% palette for identity)
  vec3 colWall = mix(palPrimary * 0.3, deepAmber, 0.6);
  vec3 colLight = mix(palSecondary, honeyGold, 0.5);
  vec3 colGlow = mix(warmWhite, honeyGold, 0.4 + vocalP * 0.3);
  vec3 sssColor = mix(vec3(1.0, 0.6, 0.15), honeyGold, 0.5);

  // Chorus: golden burst intensifies all warm tones
  colLight *= 1.0 + sChorus * 0.4;
  colGlow *= 1.0 + sChorus * 0.3;

  // ─── Camera: drifting through the honeycomb tunnel ───
  float fwd = hcTime * 2.5;
  float swayX = sin(hcTime * 0.12) * 0.25 * (1.0 - sSpace * 0.5);
  float swayY = cos(hcTime * 0.09) * 0.15;
  vec3 ro = vec3(swayX, swayY, fwd + drumOn * 0.2);
  vec3 lookTarget = ro + vec3(sin(hcTime * 0.06) * 0.12, cos(hcTime * 0.05) * 0.08, 3.0);

  // Solo: camera tilts upward to "look up at cathedral ceiling"
  lookTarget.y += sSolo * 0.4;

  vec3 fw = normalize(lookTarget - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 hcUp = cross(fw, ri);
  float fov = 0.8 + energy * 0.12 + climB * 0.2;
  vec3 rd = normalize(p.x * ri + p.y * hcUp + fov * fw);

  // ─── Raymarch ───
  float totalDist = 0.0;
  float hitSurfaceDist = 0.0;
  vec3 hitPos = ro;
  bool wasHit = false;
  int maxSteps = int(mix(32.0, 96.0, energy));

  for (int i = 0; i < 96; i++) {
    if (i >= maxSteps) break;
    vec3 marchPos = ro + rd * totalDist;
    float dist = hcMap(marchPos, energy, bass, hcTime, tension, melPitch, sJam, sSpace, climB, drumOn);

    // Climax perturbation: jitter distances for broken/shattered feel
    dist += climB * 0.4 * (0.5 + 0.5 * snoise(marchPos * 2.0 + hcTime * 3.0)) * 0.1;

    if (dist < 0.002) {
      hitPos = marchPos;
      hitSurfaceDist = dist;
      wasHit = true;
      break;
    }
    if (totalDist > 15.0) break;
    totalDist += dist * 0.7;
  }

  vec3 col = vec3(0.0);

  if (wasHit) {
    // ─── Normal (shared raymarching utility) ───
    vec3 norm = hcNormal(hitPos);

    // ─── Lighting ───
    // Primary light: golden light source ahead in tunnel
    vec3 lightPos = ro + vec3(sin(hcTime * 0.1) * 0.5, 0.6 + bass * 0.3, 4.0);
    vec3 lightDir = normalize(lightPos - hitPos);
    float diffuse = max(dot(norm, lightDir), 0.0);

    // Secondary fill light: cooler, from below
    vec3 fillDir = normalize(vec3(-0.3, -0.8, 0.2));
    float fillDiff = max(dot(norm, fillDir), 0.0) * 0.15;

    // Specular: sharp honey-like reflections
    float specPow = 32.0 + energy * 48.0;
    float spec = pow(max(dot(reflect(-lightDir, norm), -rd), 0.0), specPow);

    // Fresnel: rim glow on honey walls
    float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 3.5);

    // ─── Ambient Occlusion ───
    float hcAO = 1.0;
    for (int j = 1; j < 5; j++) {
      float aoDist = 0.1 * float(j);
      float aoSample = hcMap(hitPos + norm * aoDist, energy, bass, hcTime, tension, melPitch, sJam, sSpace, climB, drumOn);
      hcAO -= (aoDist - aoSample) * (0.35 / float(j));
    }
    hcAO = clamp(hcAO, 0.15, 1.0);

    // ─── Subsurface scattering (honey translucency) ───
    // Thinner walls → more light passes through
    float thickness = clamp(hitSurfaceDist * 10.0, 0.0, 1.0);
    vec3 sss = hcSubsurface(hitPos, norm, lightDir, rd, 1.0 - thickness, sssColor, vocalP);

    // ─── Depth fog ───
    float depthFade = clamp(totalDist / 12.0, 0.0, 1.0);

    // ─── Compose surface color ───
    // Base wall color: deep amber with per-cell variation
    vec3 hx = hcHex(hitPos.xy, 2.5);
    float cellVar = hcHash(hx.yz + floor(hitPos.z / 1.8) * 17.3);
    vec3 wallColor = mix(colWall, deepAmber * 0.5, cellVar * 0.4);
    wallColor = mix(wallColor, darkBrown, depthFade * 0.6);

    // Jam: walls shift to molten honey orange
    wallColor = mix(wallColor, honeyGold * 0.4, sJam * 0.4);

    // Assemble lighting — was 0.04 base ambient which made walls render
    // near-black. Lifted ambient and diffuse multipliers significantly so
    // the cathedral interior actually reads as illuminated honey-gold.
    col = wallColor * (0.25 + diffuse * 0.85 + fillDiff * 1.5) * hcAO;
    col += colLight * spec * 0.55 * (1.0 + energy * 0.4);
    col += colGlow * fresnel * 0.35 * (1.0 + vocalP * 0.5);
    col += sss * 0.65 * (0.7 + energy * 0.6);
    col *= 0.7 + energy * 0.60;

    // Space sections: add ethereal ambient to vast empty areas
    col += mix(vec3(0.0), warmWhite * 0.02, sSpace);

  } else {
    // ─── Background: deep amber void with distant honey glow ───
    col = mix(darkBrown * 0.15, deepAmber * 0.4, smoothstep(-0.3, 0.6, rd.y));
    // Distant glow in the tunnel direction
    float tunnelGlow = exp(-length(p) * 1.4) * 0.45;
    col += honeyGold * tunnelGlow * (0.7 + energy * 0.5);

    // Climax: golden sparks in the void
    if (climB > 0.1) {
      vec3 sparkCell = floor(rd * 25.0);
      float sparkHash = fract(sin(dot(sparkCell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      float sparkBright = step(0.92, sparkHash) * smoothstep(0.04, 0.01, length(fract(rd * 25.0) - 0.5));
      col += honeyGold * sparkBright * climB * 0.6;
    }
  }

  // ─── God rays: volumetric light through hex cells ───
  {
    vec3 godRayLightPos = vec3(sin(hcTime * 0.07) * 0.3, 0.5, ro.z + 5.0);
    float rayAccum = 0.0;
    for (int g = 0; g < 12; g++) {
      float stepDist = 0.3 + float(g) * 0.6;
      if (stepDist > totalDist && wasHit) break;
      vec3 samplePos = ro + rd * stepDist;
      vec3 toLight = normalize(godRayLightPos - samplePos);
      // Check if this point is in open space (inside tunnel, between hex walls)
      float occDist = hcMap(samplePos + toLight * 0.3, energy, bass, hcTime, tension, melPitch, sJam, sSpace, climB, drumOn);
      // Volumetric fog density: heavier near surfaces, lighter in open air
      float fogDensity = fbm3(samplePos * 0.4 + hcTime * 0.03) * (0.08 + bass * 0.1);
      // Accumulate light where there's open space
      rayAccum += smoothstep(-0.05, 0.3, occDist) * 0.015 * (0.4 + fogDensity);
    }
    // Golden god ray color, modulated by vocal warmth
    vec3 godRayColor = mix(honeyGold, warmWhite, vocalP * 0.3);
    col += godRayColor * rayAccum * (0.4 + vocalP * 0.4 + climB * 0.3 + sChorus * 0.2);
  }

  // ─── Honey shimmer: iridescent sheen on close surfaces ───
  if (wasHit && totalDist < 3.0) {
    float shimmer = sin(hitPos.x * 20.0 + hitPos.y * 15.0 + hcTime * 0.5) * 0.5 + 0.5;
    shimmer *= (1.0 - totalDist / 3.0) * 0.04 * energy;
    col += vec3(shimmer * 1.2, shimmer * 0.9, shimmer * 0.3);
  }

  // ─── Ambient honey glow: minimum brightness floor ───
  col += darkBrown * 0.015;

  // ─── Beat snap brightness kick ───
  col *= 1.0 + uBeatSnap * 0.12;

  // ─── Tender semantic: warmer, softer — suit Sugaree's melancholy ───
  col = mix(col, col * vec3(1.05, 0.95, 0.85), tender * 0.2);

  // ─── Vignette: warm amber edges ───
  float vigDist = 1.0 - dot(p * 0.3, p * 0.3);
  float vig = smoothstep(0.0, 1.0, vigDist);
  col = mix(darkBrown * 0.02, col, vig * mix(0.7, 1.0, vig));

  // ─── Icon emergence ───
  float noiseField = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, bass, colLight, colGlow, noiseField, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, bass, colLight, colGlow, noiseField, uSectionIndex);

  // ─── Floor: never fully black ───
  col = max(col, vec3(0.02, 0.015, 0.005));

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);

  // ─── Post-process ───
  col = applyPostProcess(col, uv, p);
  gl_FragColor = vec4(col, 1.0);
  ${hcDepthAlpha}
}
`;
