import { describe, it, expect } from 'vitest';
import { SONG_IDENTITIES } from './song-identities';
import { SCENE_REGISTRY } from '../scenes/scene-registry';
import type { VisualMode } from './types';

const registeredModes = new Set(Object.keys(SCENE_REGISTRY) as VisualMode[]);

describe('song-identities validation', () => {
  const entries = Object.entries(SONG_IDENTITIES);

  it('all songs have 5-9 preferred modes', () => {
    for (const [name, identity] of entries) {
      expect(
        identity.preferredModes.length,
        `${name} has ${identity.preferredModes.length} preferred modes (expected 5-9)`,
      ).toBeGreaterThanOrEqual(5);
      expect(
        identity.preferredModes.length,
        `${name} has ${identity.preferredModes.length} preferred modes (expected 5-9)`,
      ).toBeLessThanOrEqual(9);
    }
  });

  it('no duplicates in any preferredModes array', () => {
    for (const [name, identity] of entries) {
      const unique = new Set(identity.preferredModes);
      expect(
        unique.size,
        `${name} has duplicate preferred modes: ${identity.preferredModes}`,
      ).toBe(identity.preferredModes.length);
    }
  });

  it('all preferred modes are registered in scene-registry', () => {
    for (const [name, identity] of entries) {
      for (const mode of identity.preferredModes) {
        expect(
          registeredModes.has(mode),
          `${name} references unregistered mode "${mode}"`,
        ).toBe(true);
      }
    }
  });
});
