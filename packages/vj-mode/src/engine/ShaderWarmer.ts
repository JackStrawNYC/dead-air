/**
 * ShaderWarmer — pre-compiles all shader programs during loading screen.
 * Eliminates first-render stalls when switching scenes.
 */

import * as THREE from "three";
import { VJ_SCENE_LIST } from "../scenes/scene-list";
import { createVJUniforms } from "./VJUniformBridge";

/**
 * Pre-compile all shader programs by rendering each once offscreen.
 * Call during loading screen to eliminate jank on first scene switch.
 */
export async function warmShaders(
  renderer: THREE.WebGLRenderer,
): Promise<void> {
  const uniforms = createVJUniforms(960, 540);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new THREE.Scene();

  for (const entry of VJ_SCENE_LIST) {
    if (!entry.vertexShader || !entry.fragmentShader) continue;

    const material = new THREE.ShaderMaterial({
      vertexShader: entry.vertexShader,
      fragmentShader: entry.fragmentShader,
      uniforms: { ...uniforms },
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    renderer.render(scene, camera);
    scene.remove(mesh);
    material.dispose();

    // Yield to allow loading screen to update
    await new Promise((r) => setTimeout(r, 0));
  }

  geometry.dispose();
}
