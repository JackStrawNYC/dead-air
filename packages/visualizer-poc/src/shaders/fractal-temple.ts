/**
 * Fractal Temple — raymarched infinite sacred geometry cathedral.
 * Dark gothic tunnel with sacred geometry walls, structural ribs,
 * pillars, floating octahedra, and volumetric god rays.
 */
import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const fractalTempleVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({ bloomThresholdOffset: 0.05, caEnabled: true, dofEnabled: true, eraGradingEnabled: true });

export const fractalTempleFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${postProcess}
varying vec2 vUv;
#define TAU 6.28318530

float ftOcta(vec3 p, float s) { p = abs(p); return (p.x+p.y+p.z-s)*0.57735027; }

float ftMap(vec3 p, float energy, float bass, float ft, float psyche) {
  float cz = floor(p.z / 2.5);
  vec3 rp = p; rp.z = mod(p.z + 1.25, 2.5) - 1.25;
  float ch = fract(sin(cz*127.1+311.7)*43758.5453);
  float ch2 = fract(sin(cz*269.5+183.3)*43758.5453);
  float R = 1.0 + bass*0.15 + sin(ft*0.3 + ch*TAU)*0.08;
  // Wall sculpting
  float wa = atan(rp.y, rp.x);
  float sc = sin(wa*6.0+ft*0.08)*0.1 + sin(wa*12.0-ft*0.04+ch*3.0)*0.05 + sin(rp.z*4.0+ft*0.15)*0.06;
  sc *= (1.0 + psyche*0.6);
  float d = -(length(rp.xy) - R - sc);
  // Ribs
  float ribZ = abs(rp.z) - (1.25 - 0.15 - energy*0.06);
  float ribR = length(rp.xy) - (R - 0.4 - energy*0.15);
  d = min(d, max(ribZ, -ribR));
  // Pillars
  for (int i = 0; i < 6; i++) {
    float a = float(i)*TAU/6.0 + ch2*0.4;
    vec2 pc = vec2(cos(a),sin(a)) * (R*0.82);
    d = min(d, length(rp.xy-pc) - (0.1+energy*0.04));
  }
  // Jewels
  for (int i = 0; i < 3; i++) {
    float a = float(i)*TAU/3.0 + ch*3.14159265 + ft*0.03;
    float jr = R*0.35;
    vec3 jp = rp - vec3(cos(a)*jr, sin(a)*jr, 0.0);
    float rot = ft*0.1 + float(i)*2.094;
    float cr2 = cos(rot); float sr2 = sin(rot);
    jp.xy = mat2(cr2,sr2,-sr2,cr2) * jp.xy;
    jp.yz = mat2(cr2,sr2,-sr2,cr2) * jp.yz;
    d = min(d, ftOcta(jp, 0.12+energy*0.08+ch*0.03));
  }
  return d;
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x/uResolution.y, 1.0);
  vec2 p = (uv-0.5)*asp;
  float energy = clamp(uEnergy,0.0,1.0);
  float bass = clamp(uBass,0.0,1.0);
  float slowE = clamp(uSlowEnergy,0.0,1.0);
  float drumOn = clamp(uDrumOnset,0.0,1.0);
  float vocalP = clamp(uVocalPresence,0.0,1.0);
  float psyche = clamp(uSemanticPsychedelic,0.0,1.0);
  float sJam = smoothstep(4.5,5.5,uSectionType)*(1.0-step(5.5,uSectionType));
  float sSpace = smoothstep(6.5,7.5,uSectionType);
  float climB = step(1.5,uClimaxPhase)*step(uClimaxPhase,3.5)*clamp(uClimaxIntensity,0.0,1.0);
  float ft = uDynamicTime*(0.06+slowE*0.04)*(1.0+sJam*0.4-sSpace*0.3);

  // Palette
  float h1 = hsvToCosineHue(uPalettePrimary);
  vec3 wt = 0.5+0.5*cos(TAU*vec3(h1,h1+0.33,h1+0.67));
  float wl = dot(wt,vec3(0.299,0.587,0.114));
  wt = mix(vec3(wl),wt,0.4);
  float h2 = hsvToCosineHue(uPaletteSecondary);
  vec3 lt = 0.5+0.5*cos(TAU*vec3(h2,h2+0.33,h2+0.67));
  vec3 grCol = mix(lt, vec3(1.0,0.85,0.6), clamp(uVocalPitch,0.0,1.0)*0.4);

  // Camera: forward travel
  float fwd2 = ft*3.0;
  vec3 ro = vec3(sin(ft*0.15)*0.2, cos(ft*0.12)*0.12, fwd2+drumOn*0.3);
  vec3 tg = ro + vec3(sin(ft*0.08)*0.1, cos(ft*0.06)*0.08, 3.0);
  vec3 fw = normalize(tg-ro);
  vec3 ri = normalize(cross(vec3(0.0,1.0,0.0),fw));
  vec3 up2 = cross(fw,ri);
  float fov = 0.85+energy*0.1+climB*0.15;
  vec3 rd = normalize(p.x*ri + p.y*up2 + fov*fw);

  // Raymarch
  float td = 0.0; vec3 hp = ro; bool ht = false;
  int ms = int(mix(48.0,80.0,energy));
  for (int i = 0; i < 80; i++) {
    if (i >= ms) break;
    vec3 ps = ro+rd*td;
    float d = ftMap(ps, energy, bass, ft, psyche);
    d += climB*0.6*(0.5+0.5*snoise(ps*1.5+ft*3.0));
    if (d < 0.003) { hp = ps; ht = true; break; }
    if (td > 12.0) break;
    td += d*0.7;
  }

  vec3 col = vec3(0.0);
  if (ht) {
    vec2 e2 = vec2(0.002,0.0);
    float b0 = ftMap(hp,energy,bass,ft,psyche);
    vec3 n = normalize(vec3(
      ftMap(hp+e2.xyy,energy,bass,ft,psyche)-b0,
      ftMap(hp+e2.yxy,energy,bass,ft,psyche)-b0,
      ftMap(hp+e2.yyx,energy,bass,ft,psyche)-b0));
    vec3 L = normalize(vec3(0.3,0.8,0.5));
    float df = max(dot(n,L),0.0);
    float sp = pow(max(dot(reflect(-L,n),-rd),0.0), 24.0+energy*40.0);
    float fr = pow(1.0-max(dot(n,-rd),0.0), 4.0);
    // AO
    float ao2 = 1.0;
    for (int j = 1; j < 4; j++) {
      float aod = ftMap(hp+n*0.15*float(j),energy,bass,ft,psyche);
      ao2 -= (0.15*float(j)-aod)*(0.4/float(j));
    }
    ao2 = clamp(ao2,0.15,1.0);
    float dp = clamp(td/10.0,0.0,1.0);
    vec3 stone = mix(wt*0.18, wt*0.04, dp);
    col = stone*(0.03+df*0.25)*ao2 + lt*sp*0.15 + grCol*fr*0.06;
    col *= 1.0+energy*0.3;
  } else {
    col = wt*0.01 + grCol*exp(-td*0.5)*0.03;
    // Climax: stars
    if (climB > 0.1) {
      vec3 cl = floor(rd*30.0);
      float hh = fract(sin(dot(cl,vec3(127.1,311.7,74.7)))*43758.5453);
      col += mix(vec3(0.9),lt,0.3)*step(0.88,hh)*smoothstep(0.06,0.01,length(fract(rd*30.0)-0.5))*climB*0.5;
    }
  }

  // God rays
  vec3 lp = vec3(sin(ft*0.08)*0.4, 0.8, ro.z+4.0);
  float ra = 0.0;
  for (int g = 0; g < 10; g++) {
    float gt2 = 0.2+float(g)*0.7;
    if (gt2 > td && ht) break;
    vec3 gp = ro+rd*gt2;
    float occ = ftMap(gp+normalize(lp-gp)*0.5, energy,bass,ft,psyche);
    float fog = fbm3(gp*0.3+ft*0.02)*(0.1+bass*0.15);
    ra += smoothstep(-0.1,0.3,occ)*0.02*(0.3+fog);
  }
  col += grCol*ra*(0.3+vocalP*0.4+climB*0.3);

  col += wt*0.015;
  col *= 1.0+uBeatSnap*0.1;
  float vg = 1.0-dot(p*0.28,p*0.28);
  col = mix(vec3(0.02,0.015,0.03), col, smoothstep(0.0,1.0,vg));
  float _nf = snoise(vec3(p*2.0,uTime*0.1));
  col += iconEmergence(p,uTime,energy,uBass,wt,lt,_nf,uClimaxPhase,uSectionIndex);
  col += heroIconEmergence(p,uTime,energy,uBass,wt,lt,_nf,uSectionIndex);
  col = max(col, vec3(0.03,0.02,0.04));
  col = applyPostProcess(col, uv, p);
  gl_FragColor = vec4(col, 1.0);
}
`;
