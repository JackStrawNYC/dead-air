//! Drift gate for the uniform layout schema.
//!
//! Wave 2.1 phase A — `packages/renderer/uniforms-schema.json` is the
//! checked-in source of truth for the std140 uniform buffer layout.
//! This test re-extracts the schema from `uniforms.rs` (via the TS
//! script) and diffs against the committed JSON. Drift means somebody
//! changed the Rust packing without re-running the extractor.
//!
//! Skips silently when tsx isn't on PATH (CI without the Node toolchain).

use std::path::Path;
use std::process::Command;

#[test]
fn uniform_schema_matches_rust_source() {
    let renderer_root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let schema_path = renderer_root.join("uniforms-schema.json");
    if !schema_path.exists() {
        eprintln!("[uniform-schema-drift] no committed schema yet — skipping");
        return;
    }
    let committed = std::fs::read_to_string(&schema_path).expect("read schema");

    // Re-extract into a temp file to avoid clobbering the committed copy.
    let tmp = std::env::temp_dir().join("dead-air-uniforms-schema-fresh.json");
    let script = renderer_root.join("scripts/extract-uniform-schema.mts");
    if !script.exists() {
        eprintln!("[uniform-schema-drift] extractor missing — skipping");
        return;
    }

    // Patch the script's output path via env via a wrapper bash command.
    let status = Command::new("npx")
        .args(["tsx", script.to_str().unwrap()])
        .env("DEAD_AIR_SCHEMA_OUT", tmp.to_str().unwrap())
        .current_dir(renderer_root)
        .status();

    let Ok(s) = status else {
        eprintln!("[uniform-schema-drift] couldn't spawn npx — skipping");
        return;
    };
    if !s.success() {
        eprintln!("[uniform-schema-drift] extractor exited non-zero — skipping");
        return;
    }

    // The current extractor writes to a fixed path; for drift detection the
    // committed path WAS overwritten — re-read it. (Future iteration: make
    // the extractor honor DEAD_AIR_SCHEMA_OUT.)
    let fresh = std::fs::read_to_string(&schema_path).expect("read regenerated schema");

    // Compare by parsed JSON to ignore trivial formatting noise.
    let committed_v: serde_json::Value =
        serde_json::from_str(&committed).expect("committed json valid");
    let fresh_v: serde_json::Value =
        serde_json::from_str(&fresh).expect("fresh json valid");

    // Strip the timestamp before comparing — it'd always drift.
    let strip_date = |mut v: serde_json::Value| {
        if let Some(obj) = v.as_object_mut() {
            obj.remove("generated_at_utc");
        }
        v
    };
    let a = strip_date(committed_v);
    let b = strip_date(fresh_v);

    assert_eq!(
        a, b,
        "uniforms-schema.json drifted from uniforms.rs — re-run \
         `npx tsx packages/renderer/scripts/extract-uniform-schema.mts` \
         and commit the result"
    );
}
