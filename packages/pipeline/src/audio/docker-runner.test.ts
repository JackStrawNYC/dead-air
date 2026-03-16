import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveMode, toContainerPath, buildVolumeMount } from './docker-runner.js';

// Mock child_process and @dead-air/core
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('@dead-air/core', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

// Import after mocks are set up
const { execFileSync } = await import('child_process');
const { isDockerAvailable } = await import('./docker-runner.js');

describe('toContainerPath', () => {
  it('rewrites host path to container mount point', () => {
    expect(toContainerPath('/Users/foo/data/audio/1977-05-08/track01.flac'))
      .toBe('/data/audio/track01.flac');
  });

  it('handles simple filenames', () => {
    expect(toContainerPath('/tmp/song.mp3'))
      .toBe('/data/audio/song.mp3');
  });
});

describe('buildVolumeMount', () => {
  it('mounts parent directory read-only', () => {
    expect(buildVolumeMount('/Users/foo/data/audio/1977-05-08/track01.flac'))
      .toBe('/Users/foo/data/audio/1977-05-08:/data/audio:ro');
  });

  it('handles nested paths', () => {
    expect(buildVolumeMount('/a/b/c/file.wav'))
      .toBe('/a/b/c:/data/audio:ro');
  });
});

describe('resolveMode', () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
    // Clear the module-level cache by re-importing fresh
    // Since cache is internal, we test behavior through isDockerAvailable
  });

  it('returns "docker" when preferred is "docker"', () => {
    expect(resolveMode('docker', 'dead-air-gpu')).toBe('docker');
  });

  it('returns "local" when preferred is "local"', () => {
    expect(resolveMode('local', 'dead-air-gpu')).toBe('local');
  });

  it('does not call docker inspect when mode is explicit', () => {
    resolveMode('docker', 'some-image');
    resolveMode('local', 'some-image');
    expect(execFileSync).not.toHaveBeenCalled();
  });
});

describe('isDockerAvailable', () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
  });

  it('returns true when docker image inspect succeeds', () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(''));
    // Use a unique image name to avoid cache from other tests
    const result = isDockerAvailable('test-image-found');
    expect(result).toBe(true);
    expect(execFileSync).toHaveBeenCalledWith(
      'docker',
      ['image', 'inspect', 'test-image-found'],
      expect.objectContaining({ stdio: 'ignore' }),
    );
  });

  it('returns false when docker image inspect fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('No such image');
    });
    const result = isDockerAvailable('test-image-missing');
    expect(result).toBe(false);
  });

  it('caches result per image', () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(''));
    isDockerAvailable('test-cache-image');
    isDockerAvailable('test-cache-image');
    // Only called once due to caching
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });
});
