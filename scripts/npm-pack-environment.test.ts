import { describe, expect, it } from 'vitest';

import { environmentForNestedNpmPack } from './npm-pack-environment.js';

describe('environmentForNestedNpmPack', () => {
  it('turns off an inherited npm dry-run for the nested tarball build', () => {
    const environment = environmentForNestedNpmPack({
      PATH: '/usr/bin',
      npm_config_dry_run: 'true',
      NPM_CONFIG_DRY_RUN: 'true',
    });

    expect(environment.PATH).toBe('/usr/bin');
    expect(environment.npm_config_dry_run).toBe('false');
    expect(environment.NPM_CONFIG_DRY_RUN).toBeUndefined();
  });
});
