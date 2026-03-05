import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig, DEFAULT_CONFIG, WEIGHT_PRESETS } from '../../src/config';

// config.ts reads DRIFTCLI_HOME instead of os.homedir() when set.
// Tests use this to point at a temp directory instead of the real home.

describe('DEFAULT_CONFIG', () => {
  it('has all seven drift factor weights', () => {
    const keys = Object.keys(DEFAULT_CONFIG.weights);
    expect(keys).toContain('contextSaturation');
    expect(keys).toContain('topicScatter');
    expect(keys).toContain('uncertaintySignals');
    expect(keys).toContain('codeInconsistency');
    expect(keys).toContain('repetition');
    expect(keys).toContain('goalDistance');
    expect(keys).toContain('confidenceDrift');
  });

  it('weights sum to approximately 1.0', () => {
    const sum = Object.values(DEFAULT_CONFIG.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 1);
  });

  it('warnThreshold is 60', () => {
    expect(DEFAULT_CONFIG.warnThreshold).toBe(60);
  });

  it('sessionResolution.cacheTtlMs is 5000', () => {
    expect(DEFAULT_CONFIG.sessionResolution.cacheTtlMs).toBe(5000);
  });
});

describe('loadConfig', () => {
  let tmpDir: string;

  afterEach(() => {
    delete process.env.DRIFTCLI_HOME;
    vi.restoreAllMocks();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function setupTmpDir() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'driftcli-config-test-'));
    // Point DRIFTCLI_HOME so ~/.driftclirc resolves to tmpDir/.driftclirc
    process.env.DRIFTCLI_HOME = tmpDir;
    return tmpDir;
  }

  it('returns defaults when no config files exist', () => {
    setupTmpDir();
    // Ensure there's no .driftcli in cwd either (mock cwd to tmpDir)
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    const config = loadConfig();
    expect(config.warnThreshold).toBe(DEFAULT_CONFIG.warnThreshold);
    expect(config.weights).toEqual(DEFAULT_CONFIG.weights);
  });

  it('merges a global ~/.driftclirc override', () => {
    const dir = setupTmpDir();
    vi.spyOn(process, 'cwd').mockReturnValue(dir);

    fs.writeFileSync(
      path.join(dir, '.driftclirc'),
      JSON.stringify({ warnThreshold: 50 }),
    );

    const config = loadConfig();
    expect(config.warnThreshold).toBe(50);
    // Unrelated fields should remain at defaults
    expect(config.weights).toEqual(DEFAULT_CONFIG.weights);
  });

  it('deep-merges partial weight overrides without clobbering other weights', () => {
    const dir = setupTmpDir();
    vi.spyOn(process, 'cwd').mockReturnValue(dir);

    fs.writeFileSync(
      path.join(dir, '.driftclirc'),
      JSON.stringify({ weights: { repetition: 0.30 } }),
    );

    const config = loadConfig();
    expect(config.weights.repetition).toBe(0.30);
    // All other weights should be unchanged
    expect(config.weights.contextSaturation).toBe(DEFAULT_CONFIG.weights.contextSaturation);
  });

  it('per-project .driftcli overrides global ~/.driftclirc', () => {
    const dir = setupTmpDir();

    // Global config sets warnThreshold = 50
    fs.writeFileSync(
      path.join(dir, '.driftclirc'),
      JSON.stringify({ warnThreshold: 50 }),
    );

    // Project config overrides to 45
    const projectDir = path.join(dir, 'myproject');
    fs.mkdirSync(projectDir);
    fs.writeFileSync(
      path.join(projectDir, '.driftcli'),
      JSON.stringify({ warnThreshold: 45 }),
    );
    vi.spyOn(process, 'cwd').mockReturnValue(projectDir);

    const config = loadConfig();
    expect(config.warnThreshold).toBe(45);
  });

  it('warns and uses defaults when a config file contains malformed JSON', () => {
    const dir = setupTmpDir();
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    fs.writeFileSync(path.join(dir, '.driftclirc'), '{ this is not valid json');

    const config = loadConfig();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not load config'));
    // Should still return defaults
    expect(config.warnThreshold).toBe(DEFAULT_CONFIG.warnThreshold);
  });

  it('ignores unknown config keys without throwing', () => {
    const dir = setupTmpDir();
    vi.spyOn(process, 'cwd').mockReturnValue(dir);

    fs.writeFileSync(
      path.join(dir, '.driftclirc'),
      JSON.stringify({ unknownKey: 'some-value', warnThreshold: 55 }),
    );

    expect(() => loadConfig()).not.toThrow();
    const config = loadConfig();
    expect(config.warnThreshold).toBe(55);
  });
});

describe('WEIGHT_PRESETS', () => {
  it('defines coding, research, brainstorm, and strict presets', () => {
    expect(WEIGHT_PRESETS).toHaveProperty('coding');
    expect(WEIGHT_PRESETS).toHaveProperty('research');
    expect(WEIGHT_PRESETS).toHaveProperty('brainstorm');
    expect(WEIGHT_PRESETS).toHaveProperty('strict');
  });

  it('each preset weight values are all between 0 and 1', () => {
    for (const [name, weights] of Object.entries(WEIGHT_PRESETS)) {
      for (const [factor, value] of Object.entries(weights)) {
        expect(value, `${name}.${factor}`).toBeGreaterThanOrEqual(0);
        expect(value, `${name}.${factor}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('each preset has all seven factors', () => {
    const expectedKeys = [
      'contextSaturation', 'topicScatter', 'uncertaintySignals',
      'codeInconsistency', 'repetition', 'goalDistance', 'confidenceDrift',
    ];
    for (const [name, weights] of Object.entries(WEIGHT_PRESETS)) {
      for (const key of expectedKeys) {
        expect(weights, `${name} missing ${key}`).toHaveProperty(key);
      }
    }
  });
});

describe('loadConfig preset resolution', () => {
  let tmpDir: string;

  afterEach(() => {
    delete process.env.DRIFTCLI_HOME;
    vi.restoreAllMocks();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function setupTmpDir() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'driftcli-preset-test-'));
    process.env.DRIFTCLI_HOME = tmpDir;
    return tmpDir;
  }

  it('applies a named preset when "preset" is set in config', () => {
    const dir = setupTmpDir();
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    fs.writeFileSync(path.join(dir, '.driftclirc'), JSON.stringify({ preset: 'coding' }));

    const config = loadConfig();
    expect(config.preset).toBe('coding');
    expect(config.weights).toEqual(WEIGHT_PRESETS.coding);
  });

  it('explicit weights override the preset', () => {
    const dir = setupTmpDir();
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    fs.writeFileSync(
      path.join(dir, '.driftclirc'),
      JSON.stringify({ preset: 'coding', weights: { repetition: 0.99 } }),
    );

    const config = loadConfig();
    expect(config.weights.repetition).toBe(0.99);
    // Other fields should come from the preset
    expect(config.weights.codeInconsistency).toBe(WEIGHT_PRESETS.coding.codeInconsistency);
  });

  it('warns and falls back to defaults for an unknown preset name', () => {
    const dir = setupTmpDir();
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fs.writeFileSync(path.join(dir, '.driftclirc'), JSON.stringify({ preset: 'nonexistent' }));

    const config = loadConfig();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));
    expect(config.weights).toEqual(DEFAULT_CONFIG.weights);
  });
});
