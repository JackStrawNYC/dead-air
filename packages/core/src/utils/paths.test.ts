import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  findWorkspaceRoot,
  packageRoot,
  rendererRoot,
  visualizerPocRoot,
  fromRoot,
  _resetWorkspaceRootCache,
} from './paths.js';

describe('paths', () => {
  beforeEach(() => {
    delete process.env.DEAD_AIR_ROOT;
    _resetWorkspaceRootCache();
  });

  it('findWorkspaceRoot locates the monorepo root from a nested cwd', () => {
    const root = findWorkspaceRoot();
    expect(existsSync(join(root, 'pnpm-workspace.yaml'))).toBe(true);
    expect(existsSync(join(root, 'packages'))).toBe(true);
  });

  it('findWorkspaceRoot honors DEAD_AIR_ROOT env var', () => {
    process.env.DEAD_AIR_ROOT = '/tmp';
    expect(findWorkspaceRoot()).toBe('/tmp');
  });

  it('rendererRoot returns the renderer package directory', () => {
    const r = rendererRoot();
    expect(existsSync(join(r, 'Cargo.toml'))).toBe(true);
  });

  it('visualizerPocRoot returns the visualizer-poc package directory', () => {
    const r = visualizerPocRoot();
    expect(existsSync(join(r, 'package.json'))).toBe(true);
  });

  it('packageRoot throws on unknown package', () => {
    expect(() => packageRoot('@dead-air/does-not-exist')).toThrow(/not found/);
  });

  it('fromRoot joins from workspace root', () => {
    const p = fromRoot('packages', 'core');
    expect(existsSync(p)).toBe(true);
  });
});
