/**
 * Boxcar Tunnel — raymarched train boxcar interior with god ray slat-light.
 * For "Jack Straw" — hobo/rail song. Two drifters, betrayal, the open road.
 *
 * Rectangular boxcar interior (inverted box SDF). Wooden plank walls with gaps
 * between planks casting dramatic god ray shafts. Wheat field scrolling past
 * through the slats. Hay bales in corners (rounded box SDFs). Dust motes
 * floating in the light beams. Warm amber light vs cool shadow.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass              -> boxcar rattle/vibration (UV shake + wall displacement)
 *   uEnergy            -> light beam intensity, dust density, step count
 *   uDrumOnset         -> track bump/jolt (camera kick + flash)
 *   uVocalPresence     -> warm fill light flooding the interior
 *   uHarmonicTension   -> shadow depth (darker corners, higher contrast)
 *   uSectionType       -> jam=light beams dance wildly, space=dark interior, chorus=golden hour flood
 *   uClimaxPhase       -> walls blow open to pure light
 *   uSlowEnergy        -> scroll speed of scenery through gaps
 *   uBeatSnap          -> rail click flash (brief white pulse)
 *   uMelodicPitch      -> dust mote vertical drift speed
 *   uTimbralBrightness -> exterior light color temperature
 *   uSpaceScore        -> darkness depth multiplier
 *   uDynamicRange      -> god ray falloff sharpness
 *   uBeatStability     -> rattle regularity (stable=rhythmic, unstable=chaotic)
 *   uSemanticRhythmic  -> driving rhythm emphasis (floor vibration amplitude)
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

export const boxcarTunnelVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  caEnabled: true,
  halationEnabled: true,
  lightLeakEnabled: true,
  beatPulseEnabled: true,
  lensDistortionEnabled: true,
  eraGradingEnabled: true,
  grainStrength: "heavy",
});

const btNormalGLSL = buildRaymarchNormal("btMap($P, bassShake, gapWidth, climaxOpen, flowTime)", { eps: 0.002, name: "btNormal" });
const btAOGLSL = buildRaymarchAO("btMap($P, bassShake, gapWidth, climaxOpen, flowTime)", { steps: 4, stepBase: 0.0, stepScale: 0.12, weightDecay: 0.7, finalMult: 3.0, name: "btAO" });

export const boxcarTunnelFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${postProcess}
varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ─── Hash helpers ───
float btHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float btHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// ─── Smooth min for organic blends ───
float btSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Box SDF (standard) ───
float btBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// ─── Rounded box SDF ───
float btRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// ─── Wood plank wall with slat gaps ───
// Returns negative inside boxcar (inverted box), with plank gaps carved out.
// bassShake: vibration displacement from uBass
// gapWidth: width of gaps between planks
float btWall(vec3 p, float bassShake, float gapWidth, float climaxOpen) {
  // Boxcar interior dimensions: width=2.4, height=2.0, infinite Z (repeating)
  vec3 boxSize = vec3(1.2, 1.0, 50.0);

  // Bass vibration displaces walls subtly
  float rattle = bassShake * 0.02 * sin(p.z * 3.0 + p.y * 5.0);
  vec3 rattled = p;
  rattled.x += rattle;
  rattled.y += rattle * 0.5;

  // Inverted box: negative inside
  float interior = -btBox(rattled, boxSize);

  // Climax: walls expand outward revealing light
  interior -= climaxOpen * 0.8;

  return interior;
}

// ─── Slat gap pattern: repeating vertical slits in the walls ───
// Returns 0-1 mask: 1 = gap (light passes through), 0 = solid plank
float btSlat(vec3 p, float gapWidth, float time) {
  // Planks repeat every 0.18 units along Z
  float plankRepeat = 0.18;
  float plankZ = mod(p.z + plankRepeat * 0.5, plankRepeat) - plankRepeat * 0.5;

  // Gap is narrow slit
  float gap = smoothstep(gapWidth, gapWidth * 0.3, abs(plankZ));

  // Only walls (not floor/ceiling) have slats
  float isWall = step(0.6, abs(p.x));
  float isCeiling = step(0.85, p.y);

  // Ceiling also gets some gaps (skylight effect)
  float ceilingGap = smoothstep(gapWidth * 1.5, gapWidth * 0.5, abs(plankZ)) * isCeiling;

  return gap * isWall + ceilingGap * 0.6;
}

// ─── Floor with wood grain texture ───
float btFloor(vec3 p, float time) {
  float floorY = -0.95;
  float floorDist = p.y - floorY;

  // Wood grain: directional noise along Z (plank direction)
  float grain = fbm3(vec3(p.x * 8.0, p.z * 1.5, 0.0)) * 0.02;
  floorDist += grain;

  // Plank seams running along Z
  float plankSeam = smoothstep(0.01, 0.0, abs(mod(p.x * 4.0 + 0.5, 1.0) - 0.5) - 0.48);
  floorDist -= plankSeam * 0.005;

  return floorDist;
}

// ─── Hay bale SDFs (rounded boxes in corners) ───
float btHayBale(vec3 p, float time) {
  // Two bales in opposite corners
  vec3 bale1Pos = vec3(-0.7, -0.65, 0.8);
  vec3 bale2Pos = vec3(0.8, -0.7, -0.5);

  // Slightly rotated bales
  float angle1 = 0.3;
  float c1 = cos(angle1); float s1 = sin(angle1);
  vec3 p1 = p - bale1Pos;
  p1.xz = mat2(c1, s1, -s1, c1) * p1.xz;

  float angle2 = -0.5;
  float c2 = cos(angle2); float s2 = sin(angle2);
  vec3 p2 = p - bale2Pos;
  p2.xz = mat2(c2, s2, -s2, c2) * p2.xz;

  float bale1 = btRoundBox(p1, vec3(0.3, 0.2, 0.25), 0.08);
  float bale2 = btRoundBox(p2, vec3(0.25, 0.18, 0.3), 0.06);

  // Small third bale stacked on first
  vec3 p3 = p - (bale1Pos + vec3(0.05, 0.35, -0.05));
  p3.xz = mat2(c1, -s1, s1, c1) * p3.xz;
  float bale3 = btRoundBox(p3, vec3(0.22, 0.15, 0.2), 0.06);

  return min(bale1, min(bale2, bale3));
}

// ─── Complete scene SDF ───
float btMap(vec3 p, float bassShake, float gapWidth, float climaxOpen, float time) {
  float walls = btWall(p, bassShake, gapWidth, climaxOpen);
  float floorD = btFloor(p, time);
  float hay = btHayBale(p, time);

  // Combine: smooth union of floor and hay, hard union with walls
  float scene = min(walls, floorD);
  scene = btSmin(scene, hay, 0.05);

  return scene;
}

// Normal & AO — generated by shared raymarching utilities
${btNormalGLSL}
${btAOGLSL}

// ─── God ray volumetric sampling through slats ───
// Traces light shafts from exterior through wall gaps
vec3 btGodRays(vec3 ro, vec3 rd, float maxDist, float energy, float bass,
               float gapWidth, float time, vec3 sunDir, vec3 sunColor,
               float vocalWarm, float dynamicRng, float sJam, float sSpace) {
  vec3 accumLight = vec3(0.0);
  int raySteps = int(mix(16.0, 32.0, energy));
  float stepLen = maxDist / float(raySteps);

  for (int i = 0; i < 32; i++) {
    if (i >= raySteps) break;
    float fi = float(i);
    float t = fi * stepLen + btHash(fi) * stepLen * 0.5; // jittered
    vec3 samplePos = ro + rd * t;

    // Check if this point receives light through a slat gap
    float gapMask = btSlat(samplePos, gapWidth, time);

    // Light direction alignment: how much does this ray face the sun?
    float sunAlign = max(dot(rd, sunDir), 0.0);

    // Distance from walls (light only enters near walls)
    float wallProximity = smoothstep(1.2, 0.4, abs(samplePos.x));
    float ceilProximity = smoothstep(1.0, 0.5, abs(samplePos.y - 0.7));
    float proximity = max(wallProximity, ceilProximity * 0.6);

    // Fog/dust density: noise-modulated atmosphere
    float dustNoise = fbm3(samplePos * 2.0 + vec3(0.0, time * 0.03, time * 0.08));
    float dustDensity = (0.15 + energy * 0.35 + bass * 0.15) * (0.5 + dustNoise * 0.5);

    // Jam: beams dance wildly (oscillate gap positions)
    float jamWobble = sJam * sin(fi * 0.7 + time * 3.0) * 0.3;
    gapMask = clamp(gapMask + jamWobble, 0.0, 1.0);

    // Space: much darker, minimal light
    dustDensity *= mix(1.0, 0.15, sSpace);

    // God ray falloff sharpness from dynamic range
    float falloffSharp = mix(1.5, 4.0, dynamicRng);
    float depthFade = exp(-fi * stepLen * falloffSharp * 0.3);

    // Accumulate light
    float scatter = gapMask * proximity * dustDensity * depthFade;
    scatter *= 0.04 + sunAlign * 0.06;

    // Warm fill from vocals
    vec3 rayColor = sunColor + vec3(0.15, 0.08, 0.0) * vocalWarm;
    accumLight += rayColor * scatter;
  }

  return accumLight;
}

// ─── Dust motes: floating particles in light beams ───
vec3 btDustMotes(vec3 ro, vec3 rd, float maxDist, float energy, float time,
                 float melodicPitch, float gapWidth, float bass) {
  vec3 dustCol = vec3(0.0);
  float moteCount = mix(6.0, 18.0, energy);
  int moteSteps = int(moteCount);

  for (int i = 0; i < 18; i++) {
    if (i >= moteSteps) break;
    float fi = float(i);

    // Procedural mote position (seeded, slowly drifting)
    float seed = fi * 7.31;
    vec3 motePos = vec3(
      btHash(seed) * 2.0 - 1.0,
      btHash(seed + 1.0) * 1.6 - 0.8,
      btHash(seed + 2.0) * 4.0 - 2.0
    );

    // Slow drift: vertical from melodic pitch, horizontal from time
    motePos.y += sin(time * 0.2 + fi * 0.8) * 0.15 * (0.5 + melodicPitch * 0.5);
    motePos.x += cos(time * 0.15 + fi * 1.2) * 0.08;
    motePos.z += sin(time * 0.1 + fi * 0.5) * 0.2;

    // Project mote to ray: find closest approach
    vec3 toMote = motePos - ro;
    float proj = dot(toMote, rd);
    if (proj < 0.0 || proj > maxDist) continue;

    vec3 closest = ro + rd * proj;
    float dist = length(closest - motePos);

    // Mote glow: tiny bright point
    float moteGlow = exp(-dist * dist * 800.0);

    // Only visible in light beams (check slat mask at mote position)
    float inLight = btSlat(motePos, gapWidth, time);
    float wallProx = smoothstep(1.2, 0.3, abs(motePos.x));

    // Warm golden mote color
    vec3 warmGold = vec3(1.0, 0.85, 0.5) * (0.6 + bass * 0.4);
    dustCol += warmGold * moteGlow * inLight * wallProx * 0.4;
  }

  return dustCol;
}

// ─── Wheat field visible through slats (parallax exterior) ───
vec3 btWheatField(vec3 rd, float time, float scrollSpeed, float timbralBright) {
  // Simple layered parallax wheat using noise
  // Only visible when looking toward walls (rd.x significant)
  float wallFace = smoothstep(0.1, 0.5, abs(rd.x));
  if (wallFace < 0.01) return vec3(0.0);

  // Wheat color: golden to green based on timbral brightness
  vec3 wheatGold = vec3(0.85, 0.7, 0.25);
  vec3 wheatGreen = vec3(0.35, 0.55, 0.15);
  vec3 wheatColor = mix(wheatGreen, wheatGold, 0.6 + timbralBright * 0.4);

  // Scrolling: scenery passes by (parallax from train movement)
  float scroll = time * scrollSpeed;

  // Multi-layer wheat stalks (noise-based)
  float y = rd.y * 2.0 + 0.5; // vertical position in "window"
  float wheatNoise1 = fbm3(vec3(rd.z * 8.0 + scroll, y * 4.0, 1.0));
  float wheatNoise2 = fbm3(vec3(rd.z * 12.0 + scroll * 1.3, y * 6.0, 3.0));

  // Wheat stalks: vertical lines modulated by noise
  float stalks = smoothstep(0.2, 0.6, wheatNoise1) * smoothstep(-0.3, 0.1, y);
  stalks += smoothstep(0.3, 0.7, wheatNoise2) * 0.5 * smoothstep(-0.2, 0.2, y);

  // Sky above wheat
  vec3 skyColor = mix(vec3(0.4, 0.6, 0.9), vec3(0.9, 0.75, 0.5), smoothstep(0.0, 0.5, y));
  vec3 exterior = mix(wheatColor * stalks, skyColor, smoothstep(0.3, 0.8, y));

  return exterior * wallFace * 0.4;
}

// ─── Material color for surfaces ───
vec3 btMaterial(vec3 p, vec3 norm, float tension) {
  // Base wood color: warm brown
  vec3 darkWood = vec3(0.12, 0.07, 0.03);
  vec3 lightWood = vec3(0.35, 0.22, 0.10);

  // Wood grain along Z (plank direction)
  float grain = fbm3(vec3(p.x * 3.0, p.y * 3.0, p.z * 0.8)) * 0.5 + 0.5;
  float fineGrain = snoise(vec3(p.x * 20.0, p.z * 2.0, p.y * 10.0)) * 0.15;
  grain += fineGrain;

  vec3 woodCol = mix(darkWood, lightWood, grain);

  // Floor is darker, more worn
  float isFloor = smoothstep(-0.9, -0.8, -p.y);
  woodCol = mix(woodCol, woodCol * 0.5, isFloor);

  // Hay bale color (straw yellow)
  vec3 strawCol = vec3(0.65, 0.55, 0.25);
  float hayMask = 1.0 - smoothstep(0.0, 0.1, btHayBale(p, 0.0));
  woodCol = mix(woodCol, strawCol, hayMask);

  // Tension darkens shadows (higher contrast)
  woodCol *= 1.0 - tension * 0.3;

  return woodCol;
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  // ─── Clamp audio uniforms ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicP = clamp(uMelodicPitch, 0.0, 1.0);
  float timbralB = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceS = clamp(uSpaceScore, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float semRhythm = clamp(uSemanticRhythmic, 0.0, 1.0);

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Climax ───
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);
  float climaxOpen = climaxBoost * 0.8; // walls blow open

  // ─── Palette ───
  float h1 = uPalettePrimary;
  vec3 warmTint = paletteHueColor(h1, 0.8, 0.9);
  float h2 = uPaletteSecondary;
  vec3 coolTint = paletteHueColor(h2, 0.8, 0.9);

  // Push warm tint toward amber for boxcar feel
  warmTint = mix(warmTint, vec3(1.0, 0.75, 0.35), 0.3);
  coolTint = mix(coolTint, vec3(0.2, 0.25, 0.4), 0.2);

  // ─── Time / motion ───
  float flowTime = uDynamicTime * (0.06 + slowE * 0.04) * mix(1.0, 1.4, sJam) * mix(1.0, 0.4, sSpace);
  float scrollSpeed = 0.5 + slowE * 1.5 + sJam * 0.8;

  // ─── Slat gap width (audio modulated) ───
  float gapWidth = 0.015 + energy * 0.008 + sChorus * 0.012 + climaxOpen * 0.06;

  // ─── Bass rattle (modulated by beat stability) ───
  // Stable beat = rhythmic, predictable rattle. Unstable = chaotic shake.
  float rattleFreq = mix(7.0, 3.0, beatStab);
  float bassShake = bass * (0.5 + semRhythm * 0.5) * sin(uDynamicTime * rattleFreq);
  bassShake += drumOn * 0.8; // Track bump on onset

  // ─── Camera: seated in boxcar, looking down the length ───
  vec3 ro = vec3(
    sin(flowTime * 0.15) * 0.2 + bassShake * 0.03,
    -0.3 + cos(flowTime * 0.1) * 0.05 + drumOn * 0.08,
    flowTime * 2.0
  );

  // Look direction: slightly varied, mostly forward
  vec3 lookTarget = ro + vec3(
    sin(flowTime * 0.08) * 0.15 + vocalP * 0.1,
    0.05 + melodicP * 0.15,
    3.0
  );

  vec3 fw = normalize(lookTarget - ro);
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  // Tilt with bass rattle for that boxcar sway
  float tiltAngle = bassShake * 0.02 * (1.0 + semRhythm * 0.5);
  worldUp = normalize(vec3(sin(tiltAngle), cos(tiltAngle), 0.0));
  vec3 ri = normalize(cross(fw, worldUp));
  vec3 camUp = cross(ri, fw);
  float fov = 0.75 + energy * 0.1 + climaxBoost * 0.2;
  vec3 rd = normalize(p.x * ri + p.y * camUp + fov * fw);

  // ─── Sunlight direction (from right wall, slightly above) ───
  float sunAngle = flowTime * 0.02 + sJam * sin(flowTime * 1.5) * 0.3;
  vec3 sunDir = normalize(vec3(
    cos(sunAngle) * 0.8,
    0.4 + sChorus * 0.3,
    sin(sunAngle) * 0.3
  ));
  vec3 sunColor = mix(
    vec3(1.0, 0.85, 0.5),           // warm amber default
    vec3(1.0, 0.95, 0.8),           // golden hour (chorus)
    sChorus
  );
  sunColor = mix(sunColor, vec3(1.0, 0.6, 0.3), tension * 0.3); // tension pushes toward orange
  sunColor *= 1.0 + timbralB * 0.3; // brighter with timbral brightness

  // ─── Raymarch the boxcar interior ───
  float totalDist = 0.0;
  vec3 hitPos = ro;
  bool didHitGeom = false;
  int maxSteps = int(mix(48.0, 80.0, energy));

  for (int i = 0; i < 80; i++) {
    if (i >= maxSteps) break;
    vec3 pos = ro + rd * totalDist;
    float dist = btMap(pos, bassShake, gapWidth, climaxOpen, flowTime);

    if (dist < 0.002) {
      hitPos = pos;
      didHitGeom = true;
      break;
    }
    if (totalDist > 15.0) break;
    totalDist += dist * 0.7;
  }

  vec3 col = vec3(0.0);

  if (didHitGeom) {
    // ─── Normal via shared raymarching utilities ───
    vec3 norm = btNormal(hitPos);

    // ─── Material ───
    vec3 matCol = btMaterial(hitPos, norm, tension);

    // ─── Lighting ───
    // Diffuse from sun direction (through slats)
    float slatLight = btSlat(hitPos, gapWidth, flowTime);
    float diff = max(dot(norm, sunDir), 0.0);
    float sunLit = diff * slatLight;

    // Specular (wet wood sheen)
    vec3 reflDir = reflect(-sunDir, norm);
    float spec = pow(max(dot(reflDir, -rd), 0.0), 16.0 + energy * 32.0);
    spec *= slatLight;

    // ─── Fresnel: rim light on edges ───
    float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 3.0);

    // ─── Ambient occlusion via shared raymarching utilities ───
    float occl = btAO(hitPos, norm);

    // ─── Depth fog within boxcar ───
    float depthFade = exp(-totalDist * 0.12);

    // ─── Combine lighting ───
    // Ambient: cool shadow base
    vec3 ambient = coolTint * 0.04 * (1.0 - spaceS * 0.5);

    // Vocal presence adds warm fill
    ambient += warmTint * 0.06 * vocalP;

    // Direct sun through slats
    vec3 directLight = sunColor * sunLit * (0.4 + energy * 0.3);

    // Specular
    vec3 specLight = sunColor * spec * 0.15;

    // Fresnel rim
    vec3 rimLight = warmTint * fresnel * 0.08 * (1.0 + energy * 0.3);

    col = matCol * (ambient + directLight) * occl + specLight + rimLight;
    col *= depthFade;

    // Space score: push deeper into darkness
    col *= 1.0 - spaceS * 0.4;

  } else {
    // ─── Miss: looking through a gap at the exterior ───
    col = btWheatField(rd, flowTime, scrollSpeed, timbralB);

    // Sky gradient above wheat
    float skyGrad = smoothstep(-0.1, 0.5, rd.y);
    vec3 skyCol = mix(vec3(0.5, 0.65, 0.9), vec3(0.85, 0.8, 0.6), skyGrad);
    skyCol = mix(skyCol, sunColor, 0.3);
    col = mix(col, skyCol, skyGrad * 0.6);

    // Chorus: golden hour flood through gaps
    col += sunColor * sChorus * 0.3;

    // Climax: pure white light
    col = mix(col, vec3(1.2, 1.1, 0.95), climaxBoost * 0.7);
  }

  // ─── God rays: volumetric light shafts through slats ───
  float godRayDist = didHitGeom ? totalDist : 8.0;
  vec3 godRays = btGodRays(
    ro, rd, godRayDist, energy, bass, gapWidth, flowTime,
    sunDir, sunColor, vocalP, dynRange, sJam, sSpace
  );
  col += godRays * (1.0 + climaxBoost * 0.5);

  // ─── Dust motes in light beams ───
  vec3 dustMotes = btDustMotes(ro, rd, godRayDist, energy, flowTime, melodicP, gapWidth, bass);
  col += dustMotes;

  // ─── Beat snap: rail click flash (brief white pulse) ───
  float railClick = uBeatSnap * 0.12;
  col += vec3(1.0, 0.95, 0.85) * railClick;

  // ─── Drum onset: track bump jolt flash ───
  col += sunColor * drumOn * 0.08;

  // ─── Climax: walls blow open, everything floods with light ───
  if (climaxBoost > 0.1) {
    float floodMask = 1.0 - exp(-climaxBoost * 2.0);
    col = mix(col, sunColor * 1.5, floodMask * 0.4);
  }

  // ─── Solo boost: heightened contrast ───
  if (sSolo > 0.1) {
    float soloLuma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, col * 1.3, sSolo * 0.3);
  }

  // ─── Vignette: boxcar framing ───
  float vigStrength = mix(0.4, 0.3, energy);
  float vig = 1.0 - dot(p * vigStrength, p * vigStrength);
  vig = smoothstep(0.0, 1.0, vig);
  col = mix(vec3(0.02, 0.015, 0.01), col, vig);

  // ─── Dead iconography ───
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, uBass, warmTint, coolTint, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, uBass, warmTint, coolTint, _nf, uSectionIndex);

  // ─── Lifted blacks: never pure black (boxcar has ambient) ───
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float liftMult = mix(1.0, 0.2, isBuild * clamp(uClimaxIntensity, 0.0, 1.0));
  col = max(col, vec3(0.025, 0.02, 0.015) * liftMult);

  // ─── Post-process chain ───
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
