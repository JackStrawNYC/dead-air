/**
 * Shared GLSL lighting helpers — opt-in per shader.
 *
 * These functions read from the shared lighting uniforms (uKeyLightDir,
 * uKeyLightColor, uKeyLightIntensity, uAmbientColor, uColorTemperature)
 * declared in uniforms.glsl.ts. Any shader that wants consistent lighting
 * across crossfades can call these instead of computing its own.
 *
 * Usage in a shader:
 *   import { lightingGLSL } from "../shared/lighting.glsl";
 *   const frag = `
 *     ${sharedUniformsGLSL}
 *     ${lightingGLSL}
 *     void main() {
 *       vec3 normal = ...;
 *       vec3 lit = sharedDiffuse(normal);
 *       ...
 *     }
 *   `;
 */

export const lightingGLSL = /* glsl */ `
// ─── Shared Lighting Helpers ───
// Opt-in per shader. Uses uniforms from uniforms.glsl.ts:
//   uKeyLightDir, uKeyLightColor, uKeyLightIntensity, uAmbientColor, uColorTemperature

/** Diffuse (Lambertian) lighting from the shared key light + ambient fill. */
vec3 sharedDiffuse(vec3 normal) {
  float ndl = max(dot(normal, normalize(uKeyLightDir)), 0.0);
  return uKeyLightColor * uKeyLightIntensity * ndl + uAmbientColor;
}

/** Blinn-Phong specular highlight from the shared key light. */
vec3 sharedSpecular(vec3 normal, vec3 viewDir, float shininess) {
  vec3 halfVec = normalize(normalize(uKeyLightDir) + viewDir);
  float spec = pow(max(dot(normal, halfVec), 0.0), shininess);
  return uKeyLightColor * uKeyLightIntensity * spec;
}

/** Apply color temperature shift to any color.
 *  Warm (positive uColorTemperature): boost red/yellow, reduce blue.
 *  Cool (negative uColorTemperature): boost blue, reduce red/yellow. */
vec3 applyTemperature(vec3 col) {
  float t = uColorTemperature;
  col.r *= 1.0 + t * 0.15;
  col.g *= 1.0 + t * 0.05;
  col.b *= 1.0 - t * 0.15;
  return col;
}
`;
