/**
 * Shared GLSL raymarching utilities — normal estimation, ambient occlusion,
 * and soft shadows.
 *
 * Uses TypeScript builder functions (like buildPostProcessGLSL) because
 * GLSL functions at global scope can't access main()'s local variables.
 * The builders inline the map call so locals remain in scope.
 *
 * Usage in a shader:
 *
 *   const rmNormal = buildRaymarchNormal("ftMap($P, energy, bass, ft, psyche)");
 *   const rmAO = buildRaymarchAO("ftMap($P, energy, bass, ft, psyche)");
 *
 *   export const frag = \`
 *     ${rmNormal}
 *     ${rmAO}
 *     void main() {
 *       float energy = clamp(uEnergy, 0.0, 1.0);
 *       ...
 *       vec3 n = rmNormal(hp);
 *       float ao = rmAO(hp, n);
 *     }
 *   \`;
 *
 * $P is replaced with the position parameter in each sample point.
 */

export interface RaymarchNormalConfig {
  /** Epsilon for central differences. Default: 0.002 */
  eps?: number;
  /** Function name to generate. Default: "rmNormal" */
  name?: string;
}

/**
 * Generate a GLSL normal estimation function using central differences.
 * The mapExpr should use $P as the position placeholder.
 *
 * Example: buildRaymarchNormal("ftMap($P, energy, bass, ft, psyche)")
 * Generates: vec3 rmNormal(vec3 p) { ... }
 */
export function buildRaymarchNormal(
  mapExpr: string,
  config: RaymarchNormalConfig = {},
): string {
  const { eps = 0.002, name = "rmNormal" } = config;
  const e = eps.toFixed(6);
  const d0 = mapExpr.replace(/\$P/g, "_rmp");
  const dx = mapExpr.replace(/\$P/g, `(_rmp + vec3(${e}, 0.0, 0.0))`);
  const dy = mapExpr.replace(/\$P/g, `(_rmp + vec3(0.0, ${e}, 0.0))`);
  const dz = mapExpr.replace(/\$P/g, `(_rmp + vec3(0.0, 0.0, ${e}))`);

  return /* glsl */ `
vec3 ${name}(vec3 _rmp) {
  float _rmd = ${d0};
  return normalize(vec3(
    ${dx} - _rmd,
    ${dy} - _rmd,
    ${dz} - _rmd
  ));
}
`;
}

export interface RaymarchAOConfig {
  /** Number of AO sample steps. Default: 5 */
  steps?: number;
  /** Base step distance. Default: 0.01 */
  stepBase?: number;
  /** Step distance scale per iteration. Default: 0.12 */
  stepScale?: number;
  /** Weight decay per step. Default: 0.7 */
  weightDecay?: number;
  /** Final occlusion multiplier. Default: 3.0 */
  finalMult?: number;
  /** Function name to generate. Default: "rmAO" */
  name?: string;
}

/**
 * Generate a GLSL ambient occlusion function.
 * The mapExpr should use $P as the position placeholder.
 *
 * Example: buildRaymarchAO("ftMap($P, energy, bass, ft, psyche)")
 * Generates: float rmAO(vec3 pos, vec3 nor) { ... }
 */
export function buildRaymarchAO(
  mapExpr: string,
  config: RaymarchAOConfig = {},
): string {
  const {
    steps = 5,
    stepBase = 0.01,
    stepScale = 0.12,
    weightDecay = 0.7,
    finalMult = 3.0,
    name = "rmAO",
  } = config;
  const mapCall = mapExpr.replace(/\$P/g, "(_rmp + _rmn * _rmdist)");

  return /* glsl */ `
float ${name}(vec3 _rmp, vec3 _rmn) {
  float _rmocc = 0.0;
  float _rmw = 1.0;
  for (int _rmi = 1; _rmi <= ${steps}; _rmi++) {
    float _rmdist = ${stepBase.toFixed(4)} + ${stepScale.toFixed(4)} * float(_rmi);
    float _rmd = ${mapCall};
    _rmocc += (_rmdist - _rmd) * _rmw;
    _rmw *= ${weightDecay.toFixed(4)};
  }
  return clamp(1.0 - ${finalMult.toFixed(4)} * _rmocc, 0.0, 1.0);
}
`;
}

export interface RaymarchShadowConfig {
  /** Number of shadow march steps. Default: 4 */
  steps?: number;
  /** Shadow softness (higher = harder). Default: 8.0 */
  k?: number;
  /** Function name to generate. Default: "rmShadow" */
  name?: string;
}

/**
 * Generate a GLSL soft shadow function.
 * The mapExpr should use $P as the position placeholder.
 *
 * Example: buildRaymarchShadow("ftMap($P, energy, bass, ft, psyche)")
 * Generates: float rmShadow(vec3 ro, vec3 rd, float mint, float maxt) { ... }
 */
export function buildRaymarchShadow(
  mapExpr: string,
  config: RaymarchShadowConfig = {},
): string {
  const { steps = 4, k = 8.0, name = "rmShadow" } = config;
  const mapCall = mapExpr.replace(/\$P/g, "(_rmro + _rmrd * _rmt)");

  return /* glsl */ `
float ${name}(vec3 _rmro, vec3 _rmrd, float _rmmint, float _rmmaxt) {
  float _rmshade = 1.0;
  float _rmt = _rmmint;
  for (int _rmi = 0; _rmi < ${steps}; _rmi++) {
    float _rmd = ${mapCall};
    _rmshade = min(_rmshade, ${k.toFixed(1)} * _rmd / _rmt);
    _rmt += clamp(_rmd, 0.02, 0.5);
    if (_rmshade < 0.01 || _rmt > _rmmaxt) break;
  }
  return clamp(_rmshade, 0.0, 1.0);
}
`;
}
