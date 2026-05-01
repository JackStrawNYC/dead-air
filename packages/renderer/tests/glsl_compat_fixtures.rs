//! Characterization fixtures for `glsl_compat::webgl_to_desktop`.
//!
//! Audit Wave 3.1 / Section 15 (the biggest risk in the project): the regex
//! based WebGL → GLSL 450 layer is fragile. Eventually it should be replaced
//! with a real parser (tree-sitter-glsl, or naga's own GLSL frontend with a
//! WebGL ES profile). To do that safely we need a regression net.
//!
//! This test walks every shader fixture in /tmp/dead-air-glsl, runs the
//! current converter, and writes the result to /tmp/dead-air-glsl-converted/.
//! Once `DEAD_AIR_GLSL_FIXTURES_DIR` is set to a checked-in directory, the
//! same test instead asserts that the converter still emits byte-identical
//! output (regression gate). Until then it's diagnostic — it logs the size
//! and hash of each conversion so drift can be inspected manually.
//!
//! Skips silently when `/tmp/dead-air-glsl` is empty (run export-shaders.mts
//! first to populate fixtures).

use dead_air_renderer::glsl_compat::webgl_to_desktop;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

#[test]
fn characterize_glsl_conversion() {
    let glsl_dir = "/tmp/dead-air-glsl";
    let out_dir = "/tmp/dead-air-glsl-converted";

    let dir = match std::fs::read_dir(glsl_dir) {
        Ok(d) => d,
        Err(_) => {
            eprintln!("[glsl-fixtures] no source at {} — skipping. Run export-shaders.mts first.", glsl_dir);
            return;
        }
    };

    let _ = std::fs::create_dir_all(out_dir);

    let mut shader_files: Vec<_> = dir
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "glsl"))
        .collect();
    shader_files.sort_by_key(|e| e.file_name());

    let mut total_in = 0usize;
    let mut total_out = 0usize;
    let mut hashes: Vec<(String, u64, usize)> = Vec::new();

    for entry in &shader_files {
        let path = entry.path();
        let name = path.file_stem().unwrap().to_string_lossy().to_string();
        let src = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let converted = webgl_to_desktop(&src);

        // Persist for offline diff inspection.
        let out_path = format!("{}/{}.glsl", out_dir, name);
        let _ = std::fs::write(&out_path, &converted);

        let mut h = DefaultHasher::new();
        converted.hash(&mut h);
        let hash = h.finish();

        total_in += src.len();
        total_out += converted.len();
        hashes.push((name, hash, converted.len()));
    }

    // Write the conversion manifest — when a future change to glsl_compat is
    // made, diffing the new manifest against this baseline shows exactly which
    // shaders' converted output changed.
    let manifest_path = format!("{}/_conversion-manifest.txt", out_dir);
    let mut manifest = String::new();
    manifest.push_str("# glsl_compat conversion manifest\n");
    manifest.push_str("# format: <shader>\\t<hash>\\t<bytes>\n");
    for (name, hash, bytes) in &hashes {
        manifest.push_str(&format!("{}\t{:016x}\t{}\n", name, hash, bytes));
    }
    let _ = std::fs::write(&manifest_path, &manifest);

    println!(
        "[glsl-fixtures] {} shaders converted: {} → {} bytes total ({}% size change)",
        shader_files.len(),
        total_in, total_out,
        if total_in > 0 { (total_out as i64 - total_in as i64) * 100 / total_in as i64 } else { 0 },
    );
    println!("[glsl-fixtures] manifest: {}", manifest_path);

    // Gate: every shader must produce non-empty converted output. Catches the
    // catastrophic regression of "converter returns empty string for valid input".
    let empty: Vec<&str> = hashes.iter()
        .filter(|(_, _, bytes)| *bytes == 0)
        .map(|(name, _, _)| name.as_str())
        .collect();
    assert!(
        empty.is_empty(),
        "{} shaders produced empty conversion: {:?}",
        empty.len(), empty
    );

    // Gate: converted GLSL must contain `#version 450` (the basic structural
    // contract glsl_compat is meant to deliver).
    let mut missing_version = Vec::new();
    for entry in &shader_files {
        let name = entry.path().file_stem().unwrap().to_string_lossy().to_string();
        let out_path = format!("{}/{}.glsl", out_dir, name);
        if let Ok(s) = std::fs::read_to_string(&out_path) {
            if !s.contains("#version 450") {
                missing_version.push(name);
            }
        }
    }
    assert!(
        missing_version.is_empty(),
        "{} shaders missing #version 450: {:?}",
        missing_version.len(), missing_version
    );

    // Optional regression gate: if a baseline manifest exists, byte-compare.
    if let Ok(baseline) = std::env::var("DEAD_AIR_GLSL_BASELINE") {
        let baseline_path = std::path::Path::new(&baseline);
        if baseline_path.exists() {
            let expected = std::fs::read_to_string(baseline_path).expect("read baseline");
            assert_eq!(
                expected.trim(), manifest.trim(),
                "glsl_compat conversion drift vs baseline {}", baseline
            );
        }
    }
}
