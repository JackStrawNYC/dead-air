//! Diagnostic: dump WGSL output to find why liquid-light renders black

#[test]
fn dump_liquid_light_wgsl() {
    let glsl = match std::fs::read_to_string("/tmp/dead-air-glsl/liquid-light.glsl") {
        Ok(s) => s,
        Err(_) => { eprintln!("No liquid-light.glsl found"); return; }
    };

    let desktop = dead_air_renderer::glsl_compat::webgl_to_desktop(&glsl);

    // Parse GLSL → naga IR
    let mut parser = naga::front::glsl::Frontend::default();
    let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);
    let module = match parser.parse(&options, &desktop) {
        Ok(m) => m,
        Err(e) => {
            println!("PARSE ERROR: {:?}", e.errors.iter().take(3).map(|e| format!("{}", e)).collect::<Vec<_>>());
            return;
        }
    };

    // Validate
    let info = match naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    ).validate(&module) {
        Ok(i) => i,
        Err(e) => {
            println!("VALIDATION ERROR: {}", e);
            return;
        }
    };

    // Generate WGSL
    let wgsl = match naga::back::wgsl::write_string(&module, &info, naga::back::wgsl::WriterFlags::empty()) {
        Ok(w) => w,
        Err(e) => {
            println!("WGSL ERROR: {}", e);
            return;
        }
    };

    // Write full WGSL to file for inspection
    std::fs::write("/tmp/liquid-light-output.wgsl", &wgsl).unwrap();
    println!("WGSL written to /tmp/liquid-light-output.wgsl ({} bytes)", wgsl.len());

    // Search for the global energy/bass variables
    let lines: Vec<&str> = wgsl.lines().collect();
    
    println!("\n=== GLOBAL VARIABLES ===");
    for (i, line) in lines.iter().enumerate() {
        if line.contains("var<private>") {
            println!("{:>5}: {}", i + 1, line);
        }
    }
    
    println!("\n=== llNormal/llCalcAO functions ===");
    for (i, line) in lines.iter().enumerate() {
        if line.contains("fn llNormal") || line.contains("fn llCalcAO") {
            let end = std::cmp::min(i + 20, lines.len());
            for j in i..end {
                println!("{:>5}: {}", j + 1, lines[j]);
            }
            println!("---");
        }
    }
    
    println!("\n=== main function first 40 lines ===");
    for (i, line) in lines.iter().enumerate() {
        if line.contains("fn main") {
            let end = std::cmp::min(i + 40, lines.len());
            for j in i..end {
                println!("{:>5}: {}", j + 1, lines[j]);
            }
            break;
        }
    }
}
