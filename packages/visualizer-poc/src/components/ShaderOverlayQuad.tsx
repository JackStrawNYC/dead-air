/**
 * ShaderOverlayQuad — renders a PNG/image overlay through GLSL.
 *
 * Instead of CSS-composited images that float on top of shaders,
 * this renders the image as a textured quad in the Three.js scene
 * with audio-reactive UV domain warping, noise-based dissolve,
 * and screen-blend compositing — all at the GPU level.
 *
 * The image emerges from and dissolves back into the shader field,
 * warps with the music, and gets the same post-processing as everything else.
 */

import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useAudioData } from "./AudioReactiveCanvas";
import { useVideoConfig } from "remotion";
import { staticFile } from "remotion";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

// Note: the actual icon overlay GLSL is inlined in FullscreenQuad.tsx (ICON_OVERLAY_FRAG)
// to avoid pulling in noiseGLSL which references sharedUniformsGLSL uniforms.
// This component is a reference/standalone pattern — see FullscreenQuad for production use.
const FRAG = /* glsl */ `
precision highp float;

// Inlined simplex noise (same as ICON_OVERLAY_FRAG in FullscreenQuad)
vec4 _ico_permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 _ico_taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod(i,289.0);
  vec4 p=_ico_permute(_ico_permute(_ico_permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=1.0/7.0;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=_ico_taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float beatPulse(float mt){float f=fract(mt);return exp(-f*8.0)*step(f,0.5);}
vec3 hsv2rgb(vec3 c){vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);}

uniform sampler2D uIconTexture;
uniform sampler2D uBackgroundTexture;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDynamicTime;
uniform float uEnergy;
uniform float uBass;
uniform float uOnsetSnap;
uniform float uBeatSnap;
uniform float uSlowEnergy;
uniform float uFastEnergy;
uniform float uMusicalTime;
uniform float uBeatConfidence;
uniform float uSpectralFlux;
uniform float uOpacity;        // from overlay scoring (0-1)
uniform float uPalettePrimary;
uniform float uPaletteSecondary;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // ─── Audio-reactive UV domain warp ───
  // Quiet: clean, recognizable image. Loud: psychedelic warping.
  // The warp intensity scales with energy so the image breathes with the music.
  float warpIntensity = uSlowEnergy * 0.06 + uFastEnergy * 0.03;

  // FBM domain warp: organic, flowing distortion
  float warpX = snoise(vec3(p * 2.0, uDynamicTime * 0.15)) * warpIntensity;
  float warpY = snoise(vec3(p * 2.0 + 100.0, uDynamicTime * 0.15)) * warpIntensity;

  // Beat pulse: micro-expansion on beats (scale from center)
  float bp = beatPulse(uMusicalTime) * smoothstep(0.3, 0.6, uBeatConfidence);
  float beatScale = 1.0 - bp * 0.015; // tiny zoom on beats
  vec2 beatUV = (uv - 0.5) * beatScale + 0.5;

  // Onset jolt: brief UV displacement on transients
  float jolt = uOnsetSnap * 0.008;
  vec2 joltOffset = vec2(
    sin(uTime * 7.3) * jolt,
    cos(uTime * 5.1) * jolt
  );

  // Slow drift: gentle continuous movement so the image feels alive
  vec2 drift = vec2(
    sin(uDynamicTime * 0.04) * 0.01,
    cos(uDynamicTime * 0.03) * 0.008
  );

  // Combined warped UV
  vec2 warpedUV = beatUV + vec2(warpX, warpY) + joltOffset + drift;

  // Sample the icon texture
  vec4 iconColor = texture2D(uIconTexture, clamp(warpedUV, 0.0, 1.0));

  // ─── Noise dissolve (emergence/disappearance) ───
  // Instead of opacity fade, the image dissolves via noise threshold.
  // At low opacity, only the brightest noise-regions show the image.
  // At full opacity, the entire image is visible.
  float dissolveNoise = snoise(vec3(p * 3.0, uDynamicTime * 0.1)) * 0.5 + 0.5;
  // Map uOpacity 0-1 to dissolve threshold: 0 = fully dissolved, 1 = fully visible
  // Use a wider range so the dissolve is gradual, not binary
  float dissolveThreshold = smoothstep(0.0, 1.0, uOpacity * 1.3 - dissolveNoise * 0.4);

  // Icon luminance (for screen blending — black = transparent)
  float iconLuma = dot(iconColor.rgb, vec3(0.299, 0.587, 0.114));

  // ─── Screen blend with background ───
  // Sample the background (previous render pass)
  vec3 bg = texture2D(uBackgroundTexture, uv).rgb;

  // Screen blend: result = 1 - (1-bg) * (1-icon)
  // Only apply where icon has luminance (black bg = no effect)
  vec3 screenBlend = 1.0 - (1.0 - bg) * (1.0 - iconColor.rgb);

  // Mix based on dissolve threshold and icon luminance
  float blendFactor = dissolveThreshold * iconLuma;

  // Subtle energy-reactive color tinting from palette
  float palHue = uPalettePrimary * 6.28318;
  vec3 tint = hsv2rgb(vec3(palHue / 6.28318, 0.15, 1.0));
  vec3 tintedIcon = mix(screenBlend, screenBlend * tint, 0.08 * uEnergy);

  vec3 finalColor = mix(bg, tintedIcon, blendFactor);

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

interface Props {
  /** Path to icon image (use staticFile() in Remotion) */
  iconPath: string;
  /** Background texture from the main shader pass */
  backgroundTexture: THREE.Texture | null;
  /** Overlay opacity from scoring engine (0-1) */
  opacity: number;
}

export const ShaderOverlayQuad: React.FC<Props> = ({
  iconPath,
  backgroundTexture,
  opacity,
}) => {
  const { time, smooth, dynamicTime, musicalTime, palettePrimary, paletteSecondary } = useAudioData();
  const { width, height } = useVideoConfig();
  const gl = useThree((state) => state.gl);

  // Load icon texture
  const textureRef = useRef<THREE.Texture | null>(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(iconPath, (tex) => {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      textureRef.current = tex;
    });
    return () => {
      textureRef.current?.dispose();
      textureRef.current = null;
    };
  }, [iconPath]);

  const camera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    [],
  );

  const uniforms = useMemo(() => ({
    uIconTexture: { value: null as THREE.Texture | null },
    uBackgroundTexture: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(width, height) },
    uTime: { value: 0 },
    uDynamicTime: { value: 0 },
    uEnergy: { value: 0 },
    uBass: { value: 0 },
    uOnsetSnap: { value: 0 },
    uBeatSnap: { value: 0 },
    uSlowEnergy: { value: 0 },
    uFastEnergy: { value: 0 },
    uMusicalTime: { value: 0 },
    uBeatConfidence: { value: 0.5 },
    uSpectralFlux: { value: 0 },
    uOpacity: { value: 0 },
    uPalettePrimary: { value: 0 },
    uPaletteSecondary: { value: 0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const pass = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      depthWrite: false,
      depthTest: false,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { scene, material: mat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render target for this overlay pass
  const targetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  useEffect(() => {
    targetRef.current?.dispose();
    targetRef.current = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    return () => {
      targetRef.current?.dispose();
      targetRef.current = null;
    };
  }, [width, height]);

  // Update uniforms each frame
  uniforms.uTime.value = time;
  uniforms.uDynamicTime.value = dynamicTime;
  uniforms.uEnergy.value = smooth.energy;
  uniforms.uBass.value = smooth.bass;
  uniforms.uOnsetSnap.value = smooth.onsetSnap;
  uniforms.uBeatSnap.value = smooth.beatSnap;
  uniforms.uSlowEnergy.value = smooth.slowEnergy;
  uniforms.uFastEnergy.value = smooth.fastEnergy;
  uniforms.uMusicalTime.value = musicalTime;
  uniforms.uBeatConfidence.value = smooth.beatConfidence;
  uniforms.uSpectralFlux.value = smooth.spectralFlux;
  uniforms.uOpacity.value = opacity;
  uniforms.uPalettePrimary.value = palettePrimary;
  uniforms.uPaletteSecondary.value = paletteSecondary;
  uniforms.uResolution.value.set(width, height);
  uniforms.uIconTexture.value = textureRef.current;
  uniforms.uBackgroundTexture.value = backgroundTexture;

  // Don't render if no texture loaded or zero opacity
  if (!textureRef.current || opacity < 0.01 || !backgroundTexture) {
    return null;
  }

  return null; // Rendering handled by parent via getOverlayPass()
};

/**
 * Standalone export: renders the icon overlay into a render target,
 * compositing over the provided background texture.
 *
 * Usage in FullscreenQuad render pipeline:
 *   After main shader pass, call renderShaderOverlay() to composite
 *   the icon into the frame before FXAA.
 */
export function createShaderOverlayPass(gl: THREE.WebGLRenderer, width: number, height: number) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new THREE.Scene();
  const geo = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    uIconTexture: { value: null as THREE.Texture | null },
    uBackgroundTexture: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(width, height) },
    uTime: { value: 0 },
    uDynamicTime: { value: 0 },
    uEnergy: { value: 0 },
    uBass: { value: 0 },
    uOnsetSnap: { value: 0 },
    uBeatSnap: { value: 0 },
    uSlowEnergy: { value: 0 },
    uFastEnergy: { value: 0 },
    uMusicalTime: { value: 0 },
    uBeatConfidence: { value: 0.5 },
    uSpectralFlux: { value: 0 },
    uOpacity: { value: 0 },
    uPalettePrimary: { value: 0 },
    uPaletteSecondary: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    depthWrite: false,
    depthTest: false,
  });
  scene.add(new THREE.Mesh(geo, mat));

  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });

  return {
    uniforms,
    render(
      iconTexture: THREE.Texture,
      backgroundTexture: THREE.Texture,
      opacity: number,
    ): THREE.Texture {
      uniforms.uIconTexture.value = iconTexture;
      uniforms.uBackgroundTexture.value = backgroundTexture;
      uniforms.uOpacity.value = opacity;
      gl.setRenderTarget(target);
      gl.clear();
      gl.render(scene, camera);
      return target.texture;
    },
    resize(w: number, h: number) {
      target.setSize(w, h);
      uniforms.uResolution.value.set(w, h);
    },
    dispose() {
      target.dispose();
      mat.dispose();
      geo.dispose();
    },
  };
}
