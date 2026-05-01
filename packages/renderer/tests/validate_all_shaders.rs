//! Batch validation: compile ALL Dead Air shaders through the full pipeline.
//! Reports which shaders pass and which fail naga parsing.

#[test]
fn test_validate_all_shaders() {
    let glsl_dir = "/tmp/dead-air-glsl";
    let dir = match std::fs::read_dir(glsl_dir) {
        Ok(d) => d,
        Err(_) => {
            eprintln!("No shader GLSL files found at {}. Run export-shaders.mts first.", glsl_dir);
            return;
        }
    };

    let mut files: Vec<_> = dir
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "glsl"))
        .collect();
    files.sort_by_key(|e| e.file_name());

    let total = files.len();
    let mut passed = 0;
    let mut failed_parse = 0;
    let mut failed_validate = 0;
    let mut failed_wgsl = 0;
    let mut failures: Vec<(String, String)> = Vec::new();

    for entry in &files {
        let path = entry.path();
        let name = path.file_stem().unwrap().to_string_lossy().to_string();
        let glsl = std::fs::read_to_string(&path).unwrap();

        // Convert WebGL → desktop
        let desktop = dead_air_renderer::glsl_compat::webgl_to_desktop(&glsl);

        // Parse
        let mut parser = naga::front::glsl::Frontend::default();
        let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);

        let module = match parser.parse(&options, &desktop) {
            Ok(m) => m,
            Err(e) => {
                let msg = e.errors.iter().take(4).map(|err| format!("{:?}", err)).collect::<Vec<_>>().join(" | ");
                failures.push((name.clone(), format!("PARSE: {}", msg)));
                failed_parse += 1;
                continue;
            }
        };

        // Validate
        let info = match naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        ).validate(&module) {
            Ok(i) => i,
            Err(e) => {
                let mut buf = String::new();
                let mut src: &dyn std::error::Error = &e;
                buf.push_str(&format!("VALIDATE: {}", e));
                while let Some(c) = src.source() {
                    buf.push_str(&format!(" -> {}", c));
                    src = c;
                }
                // Span hint
                let spans: Vec<_> = e.spans().collect();
                if !spans.is_empty() {
                    let s = &spans[0].0;
                    let to_byte = s.to_range().map(|r| format!("bytes {}..{}", r.start, r.end)).unwrap_or_default();
                    buf.push_str(&format!(" [{}]", to_byte));
                }
                failures.push((name.clone(), buf));
                failed_validate += 1;
                continue;
            }
        };

        // Generate WGSL
        match naga::back::wgsl::write_string(&module, &info, naga::back::wgsl::WriterFlags::empty()) {
            Ok(_) => {
                passed += 1;
            }
            Err(e) => {
                failures.push((name.clone(), format!("WGSL: {}", e)));
                failed_wgsl += 1;
            }
        }
    }

    // Report
    println!("\n============================================================");
    println!("SHADER VALIDATION REPORT");
    println!("============================================================");
    println!("Total:  {}", total);
    println!("Passed: {} ({:.0}%)", passed, passed as f64 / total as f64 * 100.0);
    println!("Failed: {} (parse: {}, validate: {}, wgsl: {})",
        failed_parse + failed_validate + failed_wgsl,
        failed_parse, failed_validate, failed_wgsl);

    if !failures.is_empty() {
        println!("\nFailed shaders:");
        for (name, err) in &failures {
            println!("  {}: {}", name, &err[..err.len().min(120)]);
        }
    }

    // Don't assert all pass — this is diagnostic
    println!("\n{} of {} shaders compile through the full Rust/wgpu pipeline.", passed, total);
}
