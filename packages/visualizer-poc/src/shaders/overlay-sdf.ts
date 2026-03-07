/**
 * Shared GLSL SDF primitives for overlay rendering.
 * Used by GLSL-based overlays (BreathingStealie, ThirteenPointBolt, etc.)
 */

export const overlaySdfGLSL = /* glsl */ `
// --- Basic SDF primitives ---

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

// --- N-pointed star SDF ---
float sdStar(vec2 p, float r, int n, float m) {
  float an = 3.14159 / float(n);
  float en = 3.14159 / m;
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}

// --- 13-point lightning bolt SDF ---
float sdBolt(vec2 p) {
  // Zigzag bolt shape from line segments
  p.y += 0.3;
  float d = 1e10;
  // Main bolt segments
  vec2 a = vec2(0.0, 0.5);
  vec2 b = vec2(-0.1, 0.15);
  vec2 c = vec2(0.05, 0.15);
  vec2 dd = vec2(-0.05, -0.2);
  vec2 e = vec2(0.08, -0.2);
  vec2 f = vec2(0.0, -0.5);

  // Line segment distance helper (inline)
  vec2 pa, ba;
  float t;

  pa = p - a; ba = b - a; t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  d = min(d, length(pa - ba * t));

  pa = p - b; ba = c - b; t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  d = min(d, length(pa - ba * t));

  pa = p - c; ba = dd - c; t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  d = min(d, length(pa - ba * t));

  pa = p - dd; ba = e - dd; t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  d = min(d, length(pa - ba * t));

  pa = p - e; ba = f - e; t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  d = min(d, length(pa - ba * t));

  return d - 0.02; // thicken the bolt
}

// --- Stealie skull constructed from SDF primitives ---
float sdSkull(vec2 p) {
  // Main skull circle
  float skull = sdCircle(p, 0.3);

  // Jaw (elongated bottom)
  float jaw = sdCircle(p - vec2(0.0, -0.12), 0.22);
  skull = min(skull, jaw);

  // Eye sockets (subtract)
  float leftEye = sdCircle(p - vec2(-0.1, 0.05), 0.07);
  float rightEye = sdCircle(p - vec2(0.1, 0.05), 0.07);

  // Nose
  float nose = sdCircle(p - vec2(0.0, -0.05), 0.03);

  // Subtract eyes and nose
  skull = max(skull, -leftEye);
  skull = max(skull, -rightEye);
  skull = max(skull, -nose);

  return skull;
}

// --- Polar rose curve (for ChinaCatSunflower petals) ---
float sdRose(vec2 p, float r, float petals) {
  float angle = atan(p.y, p.x);
  float radius = length(p);
  float rose = r * cos(petals * angle);
  return radius - abs(rose);
}

// --- Dancing bear silhouette (constructed from ellipses) ---
float sdBear(vec2 p) {
  // Body
  float body = length(p / vec2(0.2, 0.25)) - 1.0;

  // Head
  float head = sdCircle(p - vec2(0.0, 0.28), 0.12);

  // Ears
  float earL = sdCircle(p - vec2(-0.08, 0.38), 0.05);
  float earR = sdCircle(p - vec2(0.08, 0.38), 0.05);

  // Arms (tilted ellipses for dancing pose)
  vec2 armL = p - vec2(-0.18, 0.08);
  float aL = length(armL / vec2(0.12, 0.06)) - 1.0;
  vec2 armR = p - vec2(0.22, 0.15);
  float aR = length(armR / vec2(0.12, 0.06)) - 1.0;

  // Legs
  vec2 legL = p - vec2(-0.08, -0.28);
  float lL = length(legL / vec2(0.06, 0.1)) - 1.0;
  vec2 legR = p - vec2(0.1, -0.3);
  float lR = length(legR / vec2(0.06, 0.1)) - 1.0;

  float bear = body;
  bear = min(bear, head);
  bear = min(bear, earL);
  bear = min(bear, earR);
  bear = min(bear, aL);
  bear = min(bear, aR);
  bear = min(bear, lL);
  bear = min(bear, lR);

  return bear;
}

// --- Concentric rings (for DarkStarPortal) ---
float sdRings(vec2 p, float r, float width, int count) {
  float d = 1e10;
  for (int i = 0; i < 8; i++) {
    if (i >= count) break;
    float ri = r * (1.0 - float(i) * 0.12);
    float ring = abs(length(p) - ri) - width;
    d = min(d, ring);
  }
  return d;
}

// --- VW Bus silhouette ---
float sdVWBus(vec2 p) {
  // Body rectangle
  float body = sdRoundBox(p, vec2(0.25, 0.15), 0.04);

  // Roof (slightly narrower top)
  float roof = sdRoundBox(p - vec2(0.0, 0.12), vec2(0.22, 0.06), 0.03);
  body = min(body, roof);

  // Windshield area (subtract)
  float windshield = sdBox(p - vec2(0.08, 0.05), vec2(0.06, 0.08));

  // Wheels
  float wheelL = sdCircle(p - vec2(-0.15, -0.17), 0.04);
  float wheelR = sdCircle(p - vec2(0.15, -0.17), 0.04);

  body = min(body, -windshield * 0.5);
  body = min(body, wheelL);
  body = min(body, wheelR);

  return body;
}

// --- Glow helper: smooth falloff around SDF ---
vec3 sdfGlow(float d, vec3 color, float intensity, float spread) {
  float glow = intensity / (abs(d) / spread + 1.0);
  return color * glow * glow;
}
`;
