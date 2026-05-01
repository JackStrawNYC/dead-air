//! GLSL compatibility layer — converts WebGL GLSL ES 1.00 to desktop GLSL 450.
//!
//! The Dead Air shaders are written for WebGL (Three.js/Remotion), which uses
//! GLSL ES 1.00 conventions. naga expects desktop GLSL 450. This module
//! transforms the source before compilation.
//!
//! Conversions:
//!   - Remove `precision highp float;`
//!   - `varying` → `in` (fragment shader inputs)
//!   - `gl_FragColor` → `out vec4 fragColor`
//!   - `texture2D(...)` → `texture(...)`
//!   - Add `#version 450` header
//!   - Convert individual `uniform float/vec2/vec3/vec4` → UBO block
//!   - Strip sampler2D uniforms (textures handled separately)

use std::collections::HashMap;

/// Replace `texture(samplerName, uvExpr)` with `funcName(uvExpr)`.
/// Extracts the UV argument (everything after the first comma) and passes it
/// to the replacement function. Handles nested parentheses.
fn regex_replace_texture_with_func(source: &str, sampler_name: &str, func_name: &str) -> String {
    let pattern = format!("texture({}", sampler_name);
    let mut result = String::with_capacity(source.len());
    let mut i = 0;
    let bytes = source.as_bytes();
    let pbytes = pattern.as_bytes();
    let plen = pbytes.len();

    while i < bytes.len() {
        if i + plen <= bytes.len() && &bytes[i..i + plen] == pbytes {
            // Found texture(samplerName — extract UV argument
            let mut j = i + plen;
            // Skip to first comma (separating sampler name from UV coords)
            while j < bytes.len() && bytes[j] != b',' {
                j += 1;
            }
            if j < bytes.len() {
                j += 1; // skip comma
            }
            // j now points past the comma — start of UV expression
            let uv_start = j;
            let mut depth = 1; // inside the outer texture( call
            while j < bytes.len() && depth > 0 {
                if bytes[j] == b'(' { depth += 1; }
                if bytes[j] == b')' { depth -= 1; }
                if depth > 0 { j += 1; }
            }
            // j points to the closing paren
            let uv_arg = std::str::from_utf8(&bytes[uv_start..j]).unwrap_or("vec2(0.0)");
            result.push_str(func_name);
            result.push('(');
            result.push_str(uv_arg.trim());
            result.push(')');
            i = j + 1; // skip past closing paren
        } else {
            result.push(bytes[i] as char);
            i += 1;
        }
    }

    result
}

/// Check if a word appears as a standalone identifier in GLSL source.
/// Returns false for substrings (e.g., "ft" inside "ftMap" or "float").
fn is_word_used_in(source: &str, word: &str) -> bool {
    let bytes = source.as_bytes();
    let word_bytes = word.as_bytes();
    let wlen = word_bytes.len();

    for (i, window) in bytes.windows(wlen).enumerate() {
        if window == word_bytes {
            // Check character before: must be non-alphanumeric/underscore (or start of string)
            let before_ok = if i == 0 {
                true
            } else {
                let c = bytes[i - 1];
                !c.is_ascii_alphanumeric() && c != b'_'
            };

            // Check character after: must be non-alphanumeric/underscore (or end of string)
            let after_idx = i + wlen;
            let after_ok = if after_idx >= bytes.len() {
                true
            } else {
                let c = bytes[after_idx];
                !c.is_ascii_alphanumeric() && c != b'_'
            };

            if before_ok && after_ok {
                return true;
            }
        }
    }

    false
}

/// Fix captured locals in generated raymarching functions.
///
/// buildRaymarchNormal/AO/Shadow generate functions like:
///   vec3 ftCalcNormal(vec3 _rmp) { ... ftMap(_rmp, energy, bass, ft, psyche) ... }
/// where energy/bass/ft/psyche are locals in main() — valid in WebGL, invalid in GLSL 450.
///
/// Fix: declare these common locals as globals (float, initialized to 0.0).
/// In main(), the shader reassigns them before calling the generated functions,
/// so the globals act as "pass-through" values.
/// Return everything in the source EXCEPT the body of `void main() { ... }`.
/// Brace-counted so it correctly handles nested blocks. Used to decide which
/// candidate variables need a top-level global (main has its own scope).
fn scope_outside_main(source: &str) -> String {
    let bytes = source.as_bytes();
    // Find the start of `void main(`.
    let main_marker = "void main(";
    let main_pos = match source.find(main_marker) {
        Some(p) => p,
        None => return source.to_string(),
    };
    // Find the opening `{` after the signature.
    let mut i = main_pos + main_marker.len();
    while i < bytes.len() && bytes[i] != b'{' {
        i += 1;
    }
    if i >= bytes.len() {
        return source.to_string();
    }
    let body_start = i; // points at `{`
    // Brace-count to the matching `}`.
    let mut depth = 0i32;
    let mut j = i;
    while j < bytes.len() {
        if bytes[j] == b'{' { depth += 1; }
        if bytes[j] == b'}' {
            depth -= 1;
            if depth == 0 { break; }
        }
        j += 1;
    }
    let body_end = (j + 1).min(bytes.len()); // include the closing `}`

    // Concatenate pre-main + post-main.
    let mut out = String::with_capacity(source.len());
    out.push_str(&source[..body_start]);
    out.push(' ');
    if body_end < source.len() {
        out.push_str(&source[body_end..]);
    }
    out
}

fn inject_global_captures(source: &str) -> String {
    // Variables commonly captured by generated raymarch functions.
    // Comprehensive list derived from batch-validating all 123 shaders.
    let capture_candidates = [
        // Common audio/section locals
        "energy", "bass", "ft", "psyche", "flowTime", "floodLevel",
        "melodicPitch", "eruptionScale", "geyserTime", "tension",
        "drumOnset", "slowE", "vocalP", "sJam", "sSpace",
        "sChorus", "sSolo", "climB", "spaceScore", "aggressive",
        "stability", "onset", "highs", "mids", "timbral",
        "timeVal", "energyVal", "bassVal", "midsVal", "vocalPresence",
        "drumOn", "climaxBoost", "coherence", "holdP",
        // Discovered from batch validation of 123 shaders
        "basePipeRadius", "bassShake", "bassV", "bassVib",
        "beatSnap", "beatSnap2", "bloomState", "cellScale",
        "climaxAmount", "climaxPhase", "corruption", "dcTime",
        "destructionLevel", "dissolveProgress", "drumSnap",
        "expansionPhase", "flowSpeedMod", "gapWidth", "growthRate",
        "hcTime", "icoRadius", "llTime", "majorR", "maTime",
        "melPitch", "musTime", "ncTime", "reelAngle", "rockAngle",
        "sway", "time", "trackStability", "tunnelRadius",
        // Second batch from validation
        "baseFluidRadius", "bassBreath", "bassPulse", "bassSize",
        "beatStab", "beatStability", "chaos", "climaxBurst",
        "climaxIntensity", "climaxLift", "climaxOpen", "climaxShatter",
        "d0", "density", "dishCount", "drumV", "emergence", "energyV",
        "filmAdvance", "fl2BeatPulse", "forecast", "fzScale",
        "granDisp", "melodicP", "minorR", "pitch", "randomness",
        "rotSpeed", "sceneTime", "shakeAmp", "slowTime", "twist",
        "twistMult", "ventTime", "viscosity", "wallThickness",
        // Third batch
        "beatSteady", "churn", "climax", "climaxAperture",
        "drumShift", "firingRate", "flowPhase", "fzFoldLimit",
        "gemCount", "irregularity", "jamDissolve", "morphAmt",
        "prismAngle", "ringCountMod", "roadW", "rotAngle",
        "rotation", "seismicPhase", "splashWave", "tempoV",
        "tiltDir", "vocalGlow", "weave",
        // Fourth batch
        "blobCount", "branchDensity", "burstAmount", "cellTime",
        "climaxV", "crowdCount", "explSpeed", "fzIterations",
        "halfW", "melodicFreq", "onsetCascade", "shatterAmt",
        "slowEnergy", "tensionV",
        // Fifth batch
        "bassScale", "climaxErupt", "fzFoldDistort", "stabilityV",
        "halfH", "drumSync", "turbulence", "pressureWave", "shatterAmount",
        // Sixth batch
        "climaxWarp", "breachAmount", "pressureOrigin",
        // Seventh batch
        "sectionSpeedMul",
        // Int captures (detected from failing shaders)
        "numSignals", "fogSteps",
        "marchSteps", "signalSteps", "steps",
        // 2026-05-01: discovered via golden_frame_silent_failure_gate strict mode
        "stemBass", "stemDrums", "vocalE",
    ];

    // The "captured scope" is all source text EXCEPT the body of `void main()`.
    // (main owns its own locals — they don't need capture injection.) Anywhere
    // else a candidate appears, treat it as needing a global.
    let lines: Vec<&str> = source.lines().collect();
    let captured_scope = scope_outside_main(source);

    if captured_scope.is_empty() {
        return source.to_string();
    }

    // Find which candidates are actually used in any captured-scope body.
    let mut needed_globals: Vec<&str> = Vec::new();
    for var in &capture_candidates {
        let is_used = is_word_used_in(&captured_scope, var);

        if is_used {
            // Skip if the candidate is already declared as a uniform OR as a
            // top-level global (some shaders manually declare it).
            let uniform_decl = format!("uniform float {};", var);
            let global_decl = format!("\nfloat {} = ", var);
            if source.contains(&uniform_decl) || source.contains(&global_decl) {
                continue;
            }
            needed_globals.push(var);
        }
    }

    if needed_globals.is_empty() {
        return source.to_string();
    }

    // Detect the type of each captured variable from its declaration in main()
    // Look for patterns like "int blobCount = ..." or "float energy = ..."
    let mut var_types: HashMap<&str, &str> = HashMap::new();
    let mut in_main_scan = false;
    let mut scan_depth = 0;
    for line in &lines {
        let t = line.trim();
        if t == "void main() {" || t.starts_with("void main()") {
            in_main_scan = true;
            scan_depth = 0;
        }
        if in_main_scan {
            for ch in t.chars() {
                if ch == '{' { scan_depth += 1; }
                if ch == '}' { scan_depth -= 1; }
            }
            if scan_depth <= 0 && t.contains('}') { in_main_scan = false; }

            for var in &needed_globals {
                let float_decl = format!("float {} = ", var);
                let int_decl = format!("int {} = ", var);
                let vec2_decl = format!("vec2 {} = ", var);
                let vec3_decl = format!("vec3 {} = ", var);
                if t.starts_with(&float_decl) || t.contains(&format!(" {} = ", var)) && t.contains("float") {
                    var_types.entry(var).or_insert("float");
                } else if t.starts_with(&int_decl) {
                    var_types.insert(var, "int");
                } else if t.starts_with(&vec2_decl) {
                    var_types.insert(var, "vec2");
                } else if t.starts_with(&vec3_decl) {
                    var_types.insert(var, "vec3");
                }
            }
        }
    }

    // Inject global declarations BEFORE the generated functions.
    let mut output = String::with_capacity(source.len() + 512);
    let mut globals_injected = false;
    let mut in_main = false;
    let mut main_depth = 0;

    for line in &lines {
        let trimmed = line.trim();

        // Inject globals right before the FIRST top-level function definition
        // (any return type / name — not just `_rmp`). Catches captures from
        // helper functions like `iwInkDensity` that aren't generated raymarchers.
        let looks_like_fn = trimmed.contains('(')
            && trimmed.contains(')')
            && trimmed.ends_with('{')
            && !trimmed.starts_with("if")
            && !trimmed.starts_with("for")
            && !trimmed.starts_with("while")
            && !trimmed.starts_with("switch")
            && !trimmed.starts_with("//")
            && (trimmed.starts_with("vec2 ")
                || trimmed.starts_with("vec3 ")
                || trimmed.starts_with("vec4 ")
                || trimmed.starts_with("float ")
                || trimmed.starts_with("int ")
                || trimmed.starts_with("void ")
                || trimmed.starts_with("mat2 ")
                || trimmed.starts_with("mat3 ")
                || trimmed.starts_with("mat4 "));
        if !globals_injected && looks_like_fn {
            output.push_str("// [compat] globals for generated function captures\n");
            for var in &needed_globals {
                let var_type = var_types.get(var).copied().unwrap_or("float");
                let default_val = match var_type {
                    "int" => "0",
                    "vec2" => "vec2(0.0)",
                    "vec3" => "vec3(0.0)",
                    _ => "0.0",
                };
                output.push_str(&format!("{} {} = {};\n", var_type, var, default_val));
            }
            output.push('\n');
            globals_injected = true;
        }

        // Track when we're inside main()
        if trimmed == "void main() {" || trimmed.starts_with("void main()") {
            in_main = true;
            main_depth = 0;
        }
        if in_main {
            for ch in trimmed.chars() {
                if ch == '{' { main_depth += 1; }
                if ch == '}' { main_depth -= 1; }
            }
            if main_depth <= 0 && trimmed.contains('}') {
                in_main = false;
            }
        }

        // Convert local declarations to assignments ONLY inside main()
        let mut modified = line.to_string();
        if in_main {
            for var in &needed_globals {
                let var_type = var_types.get(var).copied().unwrap_or("float");
                let local_decl = format!("{} {} = ", var_type, var);
                let assignment = format!("{} = ", var);
                if trimmed.starts_with(&local_decl) {
                    modified = modified.replace(&local_decl, &assignment);
                    break;
                }
            }
        }

        output.push_str(&modified);
        output.push('\n');
    }

    output
}

/// Fix dynamic loop bounds that cause black renders in naga/WGSL/SPIRV.
///
/// GLSL shaders use patterns like:
///   int steps = int(mix(16.0, 28.0, energy));
///   for (int i = 0; i < steps; i++) { ... }
///
/// naga can't determine loop bounds at compile time. WGSL/SPIRV requires
/// analyzable bounds, resulting in 0 iterations and black output.
///
/// This pass rewrites dynamic loops to use constant max bounds with early break:
///   for (int i = 0; i < 28; i++) { if (i >= steps) break; ... }
fn fix_dynamic_loop_bounds(src: &str) -> String {
    let lines: Vec<&str> = src.lines().collect();
    let mut output = Vec::with_capacity(lines.len());

    // First pass: collect declarations of variables that are assigned int(mix(...))
    // or other dynamic expressions, so we know their max values.
    let mut var_max: HashMap<String, u32> = HashMap::new();

    for line in &lines {
        let trimmed = line.trim();
        // Match: int <varname> = int(mix(<a>, <b>, ...));
        // Also match with trailing arithmetic: int(mix(24.0, 40.0, energy) * ...) + int(...)
        if let Some(rest) = trimmed.strip_prefix("int ") {
            if let Some(eq_pos) = rest.find(" = ") {
                let var_name = rest[..eq_pos].trim().to_string();
                let rhs = rest[eq_pos + 3..].trim();

                // Skip pure constant assignments like "int steps = 80;"
                if let Some(val) = parse_int_literal(rhs.trim_end_matches(';')) {
                    var_max.insert(var_name, val as u32);
                    continue;
                }

                // Extract max from int(mix(a, b, ...)) patterns
                if let Some(max_val) = extract_mix_max(rhs) {
                    var_max.insert(var_name, max_val);
                } else if rhs.contains("int(") || rhs.contains("float(") {
                    // Some dynamic expression we can't parse — use safe default
                    var_max.insert(var_name, 128);
                }
            }
        }
    }

    // Second pass: rewrite for-loops with dynamic bounds
    for line in &lines {
        let trimmed = line.trim();

        // Match: for (int <var> = 0; <var> < <bound>; <var>++)
        if let Some(rewritten) = try_rewrite_for_loop(trimmed, &var_max) {
            // Preserve leading whitespace
            let indent = &line[..line.len() - line.trim_start().len()];
            output.push(format!("{}{}", indent, rewritten));
        } else {
            output.push(line.to_string());
        }
    }

    output.join("\n")
}

/// Try to parse a simple integer literal (e.g., "80", "128").
fn parse_int_literal(s: &str) -> Option<i64> {
    s.trim().parse::<i64>().ok()
}

/// Extract the maximum value from a `int(mix(a, b, ...))` expression.
///
/// Handles patterns like:
///   int(mix(16.0, 28.0, energy))                       → 28
///   int(mix(24.0, 40.0, energy) * energyDetail * 0.85) → 40  (conservative: just mix max)
///   int(mix(32.0, 96.0, energy)) + int(sJam * 12.0)    → 96 + 12 = 108
///   int(mix(4.0, float(MAX_CRYSTALS), energy))          → can't parse float(MAX_CRYSTALS), use 128
fn extract_mix_max(rhs: &str) -> Option<u32> {
    // Find all int(mix(a, b, ...)) occurrences and sum their max values.
    // This handles cases like:
    //   int(mix(24.0, 48.0, energy) * 0.8) + int(sJam * 8.0) - int(sSpace * 8.0)
    // We take the max of each additive int(...) term (ignore subtractive terms for safety).

    let mut total_max: Option<u32> = None;
    let mut pos = 0;
    let bytes = rhs.as_bytes();

    while pos < bytes.len() {
        // Look for int(mix(
        if let Some(mix_start) = rhs[pos..].find("int(mix(") {
            let abs_start = pos + mix_start + 8; // skip "int(mix("
            // Extract the first two arguments of mix(a, b, ...)
            if let Some((a, b)) = extract_two_floats(&rhs[abs_start..]) {
                let max_val = if a > b { a } else { b };
                total_max = Some(total_max.unwrap_or(0) + max_val as u32);
            } else {
                // Can't parse mix args (e.g., float(MAX_CRYSTALS)) — use default
                return Some(128);
            }
            pos = abs_start;
        } else if let Some(int_start) = rhs[pos..].find("int(") {
            // Handle standalone int(expr) like int(sJam * 12.0)
            let abs_start = pos + int_start + 4;
            // Try to extract a numeric multiplier
            if let Some(val) = extract_int_expr_max(&rhs[abs_start..]) {
                total_max = Some(total_max.unwrap_or(0) + val);
            }
            pos = abs_start;
        } else {
            break;
        }
    }

    total_max
}

/// Extract two float literals from the beginning of a mix() argument list.
/// Input: "16.0, 28.0, energy))"  →  Some((16.0, 28.0))
fn extract_two_floats(s: &str) -> Option<(f64, f64)> {
    let mut parts = s.splitn(3, ',');
    let a_str = parts.next()?.trim();
    let b_str = parts.next()?.trim();

    let a = a_str.parse::<f64>().ok()?;
    let b = b_str.parse::<f64>().ok()?;

    Some((a, b))
}

/// Extract the max value from a simple int() expression like "sJam * 12.0)".
/// Looks for a numeric literal and returns its ceiling.
fn extract_int_expr_max(s: &str) -> Option<u32> {
    // Find the closing paren, accounting for nesting
    let mut depth = 1;
    let mut end = 0;
    for (i, ch) in s.chars().enumerate() {
        if ch == '(' { depth += 1; }
        if ch == ')' {
            depth -= 1;
            if depth == 0 { end = i; break; }
        }
    }
    let expr = &s[..end];

    // Look for numeric literals in the expression
    let mut max_num: Option<f64> = None;
    for token in expr.split(|c: char| !c.is_ascii_digit() && c != '.') {
        if let Ok(v) = token.parse::<f64>() {
            if v > 1.0 {
                max_num = Some(match max_num {
                    Some(prev) => if v > prev { v } else { prev },
                    None => v,
                });
            }
        }
    }

    max_num.map(|v| v.ceil() as u32)
}

/// Try to rewrite a for-loop line with a dynamic bound to use a constant max.
///
/// Matches: `for (int <v> = 0; <v> < <bound>; <v>++)`
/// where <bound> is a known dynamic variable (not a literal, not a #define constant).
///
/// Returns the rewritten line or None if no rewrite needed.
fn try_rewrite_for_loop(trimmed: &str, var_max: &HashMap<String, u32>) -> Option<String> {
    // Quick pre-check
    if !trimmed.starts_with("for") || !trimmed.contains("for ") && !trimmed.starts_with("for(") {
        if !trimmed.starts_with("for") {
            return None;
        }
    }

    // Parse: for (int <loopvar> = 0; <loopvar> < <bound>; <loopvar>++)
    // Also handle for(int ... without space
    let rest = if let Some(r) = trimmed.strip_prefix("for (") {
        r
    } else if let Some(r) = trimmed.strip_prefix("for(") {
        r
    } else {
        return None;
    };

    // Find the three semicolon-separated parts within the parens
    // First part: "int <v> = 0"
    let semi1 = rest.find(';')?;
    let init_part = rest[..semi1].trim();

    // Parse init: "int <v> = 0"
    let init_rest = init_part.strip_prefix("int ")?;
    let eq_pos = init_rest.find(" = ")?;
    let loop_var = init_rest[..eq_pos].trim();
    let init_val = init_rest[eq_pos + 3..].trim();
    if init_val != "0" {
        return None; // Only handle loops starting at 0
    }

    // Second part: "<v> < <bound>"
    let after_semi1 = &rest[semi1 + 1..];
    let semi2 = after_semi1.find(';')?;
    let cond_part = after_semi1[..semi2].trim();

    // Parse condition: "<v> < <bound>"
    let lt_pos = cond_part.find(" < ")?;
    let cond_var = cond_part[..lt_pos].trim();
    if cond_var != loop_var {
        return None;
    }
    let bound_var = cond_part[lt_pos + 3..].trim();

    // Check: is bound_var a literal integer? If so, skip (already constant).
    if bound_var.parse::<i64>().is_ok() {
        return None;
    }

    // Check: is bound_var ALL_CAPS (likely a #define constant)? If so, skip.
    if bound_var.chars().all(|c| c.is_ascii_uppercase() || c == '_') && bound_var.len() > 1 {
        return None;
    }

    // Third part: "<v>++" followed by ")" and optional " {"
    let after_semi2 = &rest[semi1 + 1 + semi2 + 1..];
    let close_paren = after_semi2.find(')')?;
    let incr_part = after_semi2[..close_paren].trim();
    let expected_incr = format!("{}++", loop_var);
    if incr_part != expected_incr {
        return None;
    }
    let after_paren = after_semi2[close_paren + 1..].trim();

    // Look up the max value for this bound variable
    let max_val = var_max.get(bound_var)?;

    // Build the rewritten for-loop
    let has_open_brace = after_paren.starts_with('{');
    let trailing = if has_open_brace {
        &after_paren[1..] // content after the {
    } else {
        after_paren
    };

    if has_open_brace {
        // Original: for (int i = 0; i < steps; i++) { <rest>
        // Rewrite:  for (int i = 0; i < 28; i++) { if (i >= steps) break; <rest>
        let break_guard = format!("if ({} >= {}) break;", loop_var, bound_var);
        let trailing_trimmed = trailing.trim();
        if trailing_trimmed.is_empty() {
            Some(format!(
                "for (int {} = 0; {} < {}; {}++) {{ {} ",
                loop_var, loop_var, max_val, loop_var, break_guard
            ))
        } else {
            Some(format!(
                "for (int {} = 0; {} < {}; {}++) {{ {} {}",
                loop_var, loop_var, max_val, loop_var, break_guard, trailing_trimmed
            ))
        }
    } else {
        // Original: for (int i = 0; i < steps; i++)
        // Rewrite:  for (int i = 0; i < 28; i++)
        // And on the NEXT line (which should be {), we'll add the break guard.
        // For simplicity, inject the brace + break inline:
        Some(format!(
            "for (int {} = 0; {} < {}; {}++) {{ if ({} >= {}) break;",
            loop_var, loop_var, max_val, loop_var, loop_var, bound_var
        ))
    }
}

/// Texture requirements detected from shader source.
#[derive(Debug, Default, Clone)]
pub struct ShaderTextureInfo {
    /// Shader uses `texture(uPrevFrame, ...)` — needs feedback buffer
    pub needs_prev_frame: bool,
    /// Shader uses `texture(uFFTTexture, ...)` — needs FFT data texture
    pub needs_fft: bool,
}

/// Detect which sampler2D textures a shader uses by scanning the GLSL source.
/// This is a read-only analysis — the shader code is NOT modified.
pub fn extract_sampler_names(source: &str) -> ShaderTextureInfo {
    ShaderTextureInfo {
        needs_prev_frame: source.contains("uPrevFrame"),
        needs_fft: source.contains("uFFTTexture"),
    }
}

/// Convert a WebGL GLSL ES fragment shader to desktop GLSL 450 with UBO.
pub fn webgl_to_desktop(source: &str) -> String {
    // First pass: fix captured locals in generated raymarching functions
    let source = inject_global_captures(source);
    // Second pass: fix dynamic loop bounds (naga/WGSL requires constant bounds)
    let source = fix_dynamic_loop_bounds(&source);
    let mut uniform_lines: Vec<String> = Vec::new();
    let mut body_lines: Vec<String> = Vec::new();
    let mut varying_index: u32 = 0;
    let needs_frag_color = source.contains("gl_FragColor");

    for line in source.lines() {
        let trimmed = line.trim();

        // Skip precision declarations
        if trimmed.starts_with("precision ") {
            continue;
        }

        // Skip existing #version directives
        if trimmed.starts_with("#version") {
            continue;
        }

        // Collect uniform declarations (non-sampler) into UBO
        if trimmed.starts_with("uniform ") && !trimmed.contains("sampler") {
            // Extract the type and name: "uniform float uBass;" → "  float uBass;"
            let decl = trimmed
                .strip_prefix("uniform ")
                .unwrap_or(trimmed)
                .to_string();
            uniform_lines.push(format!("  {}", decl));
            continue;
        }

        // Sampler uniforms: keep as binding 1+ (not in UBO), but stub texture calls
        if trimmed.starts_with("uniform ") && trimmed.contains("sampler") {
            // For now, skip sampler declarations — texture support comes later.
            // Code that references samplers will be stubbed below.
            continue;
        }

        let mut transformed = line.to_string();

        // varying → in (fragment shader). The shared vertex shader only writes
        // ONE output: `vUv` at location 0. Any other `varying` declarations in
        // shader source are dead (they'd never receive vertex data anyway) AND
        // cause naga validation errors ("Multiple bindings at location 0"), so
        // we strip them entirely. vUv gets explicit location 0.
        if trimmed.starts_with("varying ") {
            // Only keep vUv; strip all other varyings.
            if trimmed.contains(" vUv") || trimmed.contains("\tvUv") {
                let _ = varying_index; // suppress unused
                transformed = transformed.replacen(
                    "varying ",
                    "layout(location = 0) in ",
                    1,
                );
            } else {
                // Replace the line with a comment so line numbers in errors stay sensible.
                transformed = format!("// [compat] stripped unsupported varying: {}", trimmed);
            }
        }

        // gl_FragColor → fragColor
        transformed = transformed.replace("gl_FragColor", "fragColor");

        // texture2D → texture
        transformed = transformed.replace("texture2D(", "texture(");

        // textureCube → texture
        transformed = transformed.replace("textureCube(", "texture(");

        // Replace texture reads for known samplers with stub function calls.
        // The stub functions are injected below; in Phase 2+, shader_cache.rs
        // replaces them with real texture sampling in the generated WGSL.
        if transformed.contains("texture(uPrevFrame") {
            transformed = regex_replace_texture_with_func(
                &transformed, "uPrevFrame", "_deadair_sample_prev",
            );
        }
        if transformed.contains("texture(uFFTTexture") {
            transformed = regex_replace_texture_with_func(
                &transformed, "uFFTTexture", "_deadair_sample_fft",
            );
        }

        body_lines.push(transformed);
    }

    // Build output
    let mut output = String::with_capacity(source.len() + 1024);

    output.push_str("#version 450\n\n");

    if needs_frag_color {
        output.push_str("layout(location = 0) out vec4 fragColor;\n\n");
    }

    // Emit UBO block if we have uniforms
    if !uniform_lines.is_empty() {
        output.push_str("layout(set = 0, binding = 0) uniform Uniforms {\n");
        for u in &uniform_lines {
            output.push_str(u);
            output.push('\n');
        }
        output.push_str("};\n\n");
    }

    // Inject stub functions for texture sampling (before shader body).
    // These survive naga compilation as named functions. shader_cache.rs
    // replaces their bodies in the WGSL output with real textureSample calls.
    let needs_prev = body_lines.iter().any(|l| l.contains("_deadair_sample_prev"));
    let needs_fft = body_lines.iter().any(|l| l.contains("_deadair_sample_fft"));

    if needs_prev {
        output.push_str("vec4 _deadair_sample_prev(vec2 uv) { return vec4(0.05, 0.03, 0.08, 1.0); }\n");
    }
    if needs_fft {
        output.push_str("vec4 _deadair_sample_fft(vec2 uv) { return vec4(0.0, 0.0, 0.0, 0.0); }\n");
    }
    if needs_prev || needs_fft {
        output.push('\n');
    }

    // Emit rest of shader
    for line in &body_lines {
        output.push_str(line);
        output.push('\n');
    }

    output
}

/// Convert a WebGL GLSL ES vertex shader to desktop GLSL 450.
pub fn webgl_vertex_to_desktop(source: &str) -> String {
    let mut output = String::with_capacity(source.len() + 256);

    output.push_str("#version 450\n\n");

    for line in source.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("precision ") {
            continue;
        }

        if trimmed.starts_with("#version") {
            continue;
        }

        let mut transformed = line.to_string();

        // attribute → in
        if trimmed.starts_with("attribute ") {
            transformed = transformed.replacen("attribute ", "in ", 1);
        }

        // varying → out (for vertex shader)
        if trimmed.starts_with("varying ") {
            transformed = transformed.replacen("varying ", "out ", 1);
        }

        output.push_str(&transformed);
        output.push('\n');
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_conversion() {
        let webgl = r#"
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uEnergy;

void main() {
  vec3 col = vec3(vUv, sin(uTime) * uEnergy);
  gl_FragColor = vec4(col, 1.0);
}
"#;

        let desktop = webgl_to_desktop(webgl);
        assert!(desktop.contains("#version 450"));
        assert!(desktop.contains("in vec2 vUv;"));
        assert!(desktop.contains("fragColor = vec4(col, 1.0);"));
        assert!(desktop.contains("layout(location = 0) out vec4 fragColor;"));
        assert!(desktop.contains("layout(set = 0, binding = 0) uniform Uniforms {"));
        assert!(desktop.contains("  float uTime;"));
        assert!(desktop.contains("  float uEnergy;"));
        assert!(!desktop.contains("precision highp"));
        assert!(!desktop.contains("gl_FragColor"));
        assert!(!desktop.contains("varying"));
        // Uniforms should NOT appear as individual declarations
        assert!(!desktop.contains("uniform float"));
    }

    #[test]
    fn test_texture2d_conversion() {
        let webgl = "vec4 c = texture2D(uTex, uv);";
        let desktop = webgl_to_desktop(webgl);
        assert!(desktop.contains("texture(uTex, uv)"));
        assert!(!desktop.contains("texture2D"));
    }

    #[test]
    fn test_sampler_stripped() {
        let webgl = r#"
uniform float uTime;
uniform sampler2D uPrevFrame;
uniform float uEnergy;
void main() { fragColor = vec4(uTime); }
"#;

        let desktop = webgl_to_desktop(webgl);
        // Sampler should be stripped
        assert!(!desktop.contains("sampler2D"));
        assert!(!desktop.contains("uPrevFrame"));
        // Value uniforms should be in UBO
        assert!(desktop.contains("  float uTime;"));
        assert!(desktop.contains("  float uEnergy;"));
    }

    #[test]
    fn test_ubo_block_structure() {
        let webgl = r#"
uniform float uBass;
uniform vec2 uResolution;
uniform vec3 uCamPos;
void main() {}
"#;

        let desktop = webgl_to_desktop(webgl);
        assert!(desktop.contains("layout(set = 0, binding = 0) uniform Uniforms {"));
        assert!(desktop.contains("  float uBass;"));
        assert!(desktop.contains("  vec2 uResolution;"));
        assert!(desktop.contains("  vec3 uCamPos;"));
        assert!(desktop.contains("};"));
    }

    // ─── Dynamic loop bound tests ───────────────────────────────────────

    #[test]
    fn test_dynamic_loop_basic_mix() {
        let src = r#"
int steps = int(mix(16.0, 28.0, energy));
for (int i = 0; i < steps; i++) {
    color += marchStep(i);
}
"#;
        let result = fix_dynamic_loop_bounds(src);
        assert!(result.contains("for (int i = 0; i < 28; i++) { if (i >= steps) break;"),
            "Expected constant max 28 with break guard, got:\n{}", result);
        // Original variable declaration should be preserved
        assert!(result.contains("int steps = int(mix(16.0, 28.0, energy));"));
    }

    #[test]
    fn test_dynamic_loop_larger_mix() {
        let src = r#"
int maxSteps = int(mix(32.0, 96.0, energy));
for (int i = 0; i < maxSteps; i++) {
    d = sceneSDF(ro + rd * t);
}
"#;
        let result = fix_dynamic_loop_bounds(src);
        assert!(result.contains("i < 96;"), "Expected max 96, got:\n{}", result);
        assert!(result.contains("if (i >= maxSteps) break;"));
    }

    #[test]
    fn test_dynamic_loop_reversed_mix_args() {
        // mix(larger, smaller, x) — max should still be the larger value
        let src = r#"
int steps = int(mix(40.0, 20.0, energy));
for (int i = 0; i < steps; i++) {
    doSomething();
}
"#;
        let result = fix_dynamic_loop_bounds(src);
        assert!(result.contains("i < 40;"), "Expected max 40, got:\n{}", result);
    }

    #[test]
    fn test_literal_loop_untouched() {
        let src = r#"
for (int i = 0; i < 80; i++) {
    color += step(i);
}
"#;
        let result = fix_dynamic_loop_bounds(src);
        assert!(result.contains("i < 80; i++)"), "Literal loop should not be modified");
        assert!(!result.contains("break;"), "Literal loop should not get a break guard");
    }

    #[test]
    fn test_define_constant_untouched() {
        let src = r#"
for (int i = 0; i < MAX_STEPS; i++) {
    march();
}
"#;
        let result = fix_dynamic_loop_bounds(src);
        assert!(result.contains("i < MAX_STEPS;"), "ALL_CAPS constant should not be modified");
        assert!(!result.contains("break;"));
    }

    #[test]
    fn test_prefixed_define_constant_untouched() {
        let src = r#"
for (int i = 0; i < LL_MAX_STEPS; i++) {
    march();
}
"#;
        let result = fix_dynamic_loop_bounds(src);
        assert!(result.contains("i < LL_MAX_STEPS;"), "ALL_CAPS constant should not be modified");
    }

    #[test]
    fn test_multiple_dynamic_loops() {
        let src = r#"
int steps = int(mix(16.0, 28.0, energy));
for (int i = 0; i < steps; i++) {
    color += marchStep(i);
}
int maxSteps = int(mix(32.0, 96.0, energy));
for (int j = 0; j < maxSteps; j++) {
    d = sceneSDF(ro + rd * t);
}
"#;
        let result = fix_dynamic_loop_bounds(src);
        assert!(result.contains("i < 28;"), "First loop should use max 28");
        assert!(result.contains("j < 96;"), "Second loop should use max 96");
        assert!(result.contains("if (i >= steps) break;"));
        assert!(result.contains("if (j >= maxSteps) break;"));
    }

    #[test]
    fn test_mix_with_extra_arithmetic() {
        // int(mix(24.0, 48.0, energy) * energyDetail * 0.8) + int(sJam * 8.0) - int(sSpace * 8.0)
        let src = r#"
int steps = int(mix(24.0, 48.0, energy) * energyDetail * 0.8) + int(sJam * 8.0) - int(sSpace * 8.0) + int(tension * 4.0);
for (int i = 0; i < steps; i++) {
    march();
}
"#;
        let result = fix_dynamic_loop_bounds(src);
        // Should extract mix max (48) + sJam term (8) + tension term (4) = 60
        assert!(result.contains("if (i >= steps) break;"),
            "Should have break guard, got:\n{}", result);
        // The exact max depends on parsing, but it should be > 48
        assert!(!result.contains("i < steps;"),
            "Dynamic bound should be replaced with constant");
    }

    #[test]
    fn test_constant_int_assignment_skipped() {
        // int steps = 80; — already constant, the loop already has constant bound
        // But since the loop references 'steps' (a variable), it will still get rewritten
        let src = r#"
int steps = 80;
for (int i = 0; i < steps; i++) {
    march();
}
"#;
        let result = fix_dynamic_loop_bounds(src);
        // Even though the var is constant, the loop bound is still a variable name.
        // The rewrite makes it explicit for naga.
        assert!(result.contains("i < 80;"), "Should use the literal value 80");
        assert!(result.contains("if (i >= steps) break;"));
    }

    #[test]
    fn test_nested_loops_both_rewritten() {
        let src = r#"
int outerSteps = int(mix(10.0, 20.0, energy));
int innerSteps = int(mix(4.0, 8.0, energy));
for (int i = 0; i < outerSteps; i++) {
    for (int j = 0; j < innerSteps; j++) {
        doWork(i, j);
    }
}
"#;
        let result = fix_dynamic_loop_bounds(src);
        assert!(result.contains("i < 20;"), "Outer loop should use max 20");
        assert!(result.contains("j < 8;"), "Inner loop should use max 8");
    }

    #[test]
    fn test_end_to_end_through_webgl_to_desktop() {
        let webgl = r#"
precision highp float;
uniform float uTime;
uniform float uEnergy;

void main() {
    float energy = uEnergy;
    int steps = int(mix(16.0, 28.0, energy));
    vec3 color = vec3(0.0);
    for (int i = 0; i < steps; i++) {
        color += vec3(0.01);
    }
    gl_FragColor = vec4(color, 1.0);
}
"#;
        let desktop = webgl_to_desktop(webgl);
        assert!(desktop.contains("i < 28;"),
            "Dynamic loop should be fixed in full pipeline, got:\n{}", desktop);
        assert!(desktop.contains("if (i >= steps) break;"));
        // Other conversions should still work
        assert!(desktop.contains("#version 450"));
        assert!(desktop.contains("fragColor"));
    }

    #[test]
    fn test_extract_two_floats() {
        assert_eq!(extract_two_floats("16.0, 28.0, energy))"), Some((16.0, 28.0)));
        assert_eq!(extract_two_floats("32.0, 96.0, energy))"), Some((32.0, 96.0)));
        assert_eq!(extract_two_floats("4.0, 8.0, x)"), Some((4.0, 8.0)));
    }

    #[test]
    fn test_extract_mix_max_basic() {
        assert_eq!(extract_mix_max("int(mix(16.0, 28.0, energy));"), Some(28));
        assert_eq!(extract_mix_max("int(mix(32.0, 96.0, energy));"), Some(96));
        assert_eq!(extract_mix_max("int(mix(60.0, 90.0, energy));"), Some(90));
    }

    #[test]
    fn test_extract_mix_max_with_additive_terms() {
        let rhs = "int(mix(24.0, 48.0, energy) * 0.8) + int(sJam * 8.0);";
        let max = extract_mix_max(rhs);
        assert!(max.is_some());
        // 48 from mix + 8 from sJam term = 56
        assert!(max.unwrap() >= 48, "Expected >= 48, got {}", max.unwrap());
    }

    #[test]
    fn test_for_loop_without_space() {
        let src = r#"
int steps = int(mix(16.0, 28.0, energy));
for(int i = 0; i < steps; i++) {
    march();
}
"#;
        let result = fix_dynamic_loop_bounds(src);
        assert!(result.contains("i < 28;"), "Should handle for( without space");
    }
}
