"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const config_1 = require("../../src/config");
// config.ts reads DRIFTCLI_HOME instead of os.homedir() when set.
// Tests use this to point at a temp directory instead of the real home.
(0, vitest_1.describe)('DEFAULT_CONFIG', () => {
    (0, vitest_1.it)('has all six drift factor weights', () => {
        const keys = Object.keys(config_1.DEFAULT_CONFIG.weights);
        (0, vitest_1.expect)(keys).toContain('contextSaturation');
        (0, vitest_1.expect)(keys).toContain('uncertaintySignals');
        (0, vitest_1.expect)(keys).toContain('repetition');
        (0, vitest_1.expect)(keys).toContain('goalDistance');
        (0, vitest_1.expect)(keys).toContain('confidenceDrift');
        (0, vitest_1.expect)(keys).toContain('responseLengthCollapse');
        (0, vitest_1.expect)(keys).not.toContain('topicScatter');
        (0, vitest_1.expect)(keys).not.toContain('codeInconsistency');
    });
    (0, vitest_1.it)('weights sum to approximately 1.0', () => {
        const sum = Object.values(config_1.DEFAULT_CONFIG.weights).reduce((a, b) => a + b, 0);
        (0, vitest_1.expect)(sum).toBeCloseTo(1.0, 1);
    });
    (0, vitest_1.it)('warnThreshold is 60', () => {
        (0, vitest_1.expect)(config_1.DEFAULT_CONFIG.warnThreshold).toBe(60);
    });
    (0, vitest_1.it)('sessionResolution.cacheTtlMs is 5000', () => {
        (0, vitest_1.expect)(config_1.DEFAULT_CONFIG.sessionResolution.cacheTtlMs).toBe(5000);
    });
});
(0, vitest_1.describe)('loadConfig', () => {
    let tmpDir;
    (0, vitest_1.afterEach)(() => {
        delete process.env.DRIFTCLI_HOME;
        vitest_1.vi.restoreAllMocks();
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
    (0, vitest_1.it)('returns defaults when no config files exist', () => {
        setupTmpDir();
        // Ensure there's no .driftcli in cwd either (mock cwd to tmpDir)
        vitest_1.vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
        const config = (0, config_1.loadConfig)();
        (0, vitest_1.expect)(config.warnThreshold).toBe(config_1.DEFAULT_CONFIG.warnThreshold);
        (0, vitest_1.expect)(config.weights).toEqual(config_1.DEFAULT_CONFIG.weights);
    });
    (0, vitest_1.it)('merges a global ~/.driftclirc override', () => {
        const dir = setupTmpDir();
        vitest_1.vi.spyOn(process, 'cwd').mockReturnValue(dir);
        fs.writeFileSync(path.join(dir, '.driftclirc'), JSON.stringify({ warnThreshold: 50 }));
        const config = (0, config_1.loadConfig)();
        (0, vitest_1.expect)(config.warnThreshold).toBe(50);
        // Unrelated fields should remain at defaults
        (0, vitest_1.expect)(config.weights).toEqual(config_1.DEFAULT_CONFIG.weights);
    });
    (0, vitest_1.it)('deep-merges partial weight overrides without clobbering other weights', () => {
        const dir = setupTmpDir();
        vitest_1.vi.spyOn(process, 'cwd').mockReturnValue(dir);
        fs.writeFileSync(path.join(dir, '.driftclirc'), JSON.stringify({ weights: { repetition: 0.30 } }));
        const config = (0, config_1.loadConfig)();
        (0, vitest_1.expect)(config.weights.repetition).toBe(0.30);
        // All other weights should be unchanged
        (0, vitest_1.expect)(config.weights.contextSaturation).toBe(config_1.DEFAULT_CONFIG.weights.contextSaturation);
    });
    (0, vitest_1.it)('per-project .driftcli overrides global ~/.driftclirc', () => {
        const dir = setupTmpDir();
        // Global config sets warnThreshold = 50
        fs.writeFileSync(path.join(dir, '.driftclirc'), JSON.stringify({ warnThreshold: 50 }));
        // Project config overrides to 45
        const projectDir = path.join(dir, 'myproject');
        fs.mkdirSync(projectDir);
        fs.writeFileSync(path.join(projectDir, '.driftcli'), JSON.stringify({ warnThreshold: 45 }));
        vitest_1.vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
        const config = (0, config_1.loadConfig)();
        (0, vitest_1.expect)(config.warnThreshold).toBe(45);
    });
    (0, vitest_1.it)('warns and uses defaults when a config file contains malformed JSON', () => {
        const dir = setupTmpDir();
        vitest_1.vi.spyOn(process, 'cwd').mockReturnValue(dir);
        const warnSpy = vitest_1.vi.spyOn(console, 'warn').mockImplementation(() => { });
        fs.writeFileSync(path.join(dir, '.driftclirc'), '{ this is not valid json');
        const config = (0, config_1.loadConfig)();
        (0, vitest_1.expect)(warnSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining('Could not load config'));
        // Should still return defaults
        (0, vitest_1.expect)(config.warnThreshold).toBe(config_1.DEFAULT_CONFIG.warnThreshold);
    });
    (0, vitest_1.it)('ignores unknown config keys without throwing', () => {
        const dir = setupTmpDir();
        vitest_1.vi.spyOn(process, 'cwd').mockReturnValue(dir);
        fs.writeFileSync(path.join(dir, '.driftclirc'), JSON.stringify({ unknownKey: 'some-value', warnThreshold: 55 }));
        (0, vitest_1.expect)(() => (0, config_1.loadConfig)()).not.toThrow();
        const config = (0, config_1.loadConfig)();
        (0, vitest_1.expect)(config.warnThreshold).toBe(55);
    });
});
(0, vitest_1.describe)('WEIGHT_PRESETS', () => {
    (0, vitest_1.it)('defines coding, research, brainstorm, and strict presets', () => {
        (0, vitest_1.expect)(config_1.WEIGHT_PRESETS).toHaveProperty('coding');
        (0, vitest_1.expect)(config_1.WEIGHT_PRESETS).toHaveProperty('research');
        (0, vitest_1.expect)(config_1.WEIGHT_PRESETS).toHaveProperty('brainstorm');
        (0, vitest_1.expect)(config_1.WEIGHT_PRESETS).toHaveProperty('strict');
    });
    (0, vitest_1.it)('each preset weight values are all between 0 and 1', () => {
        for (const [name, weights] of Object.entries(config_1.WEIGHT_PRESETS)) {
            for (const [factor, value] of Object.entries(weights)) {
                (0, vitest_1.expect)(value, `${name}.${factor}`).toBeGreaterThanOrEqual(0);
                (0, vitest_1.expect)(value, `${name}.${factor}`).toBeLessThanOrEqual(1);
            }
        }
    });
    (0, vitest_1.it)('each preset has all six factors', () => {
        const expectedKeys = [
            'contextSaturation', 'uncertaintySignals',
            'repetition', 'goalDistance', 'confidenceDrift', 'responseLengthCollapse',
        ];
        for (const [name, weights] of Object.entries(config_1.WEIGHT_PRESETS)) {
            for (const key of expectedKeys) {
                (0, vitest_1.expect)(weights, `${name} missing ${key}`).toHaveProperty(key);
            }
        }
    });
});
(0, vitest_1.describe)('loadConfig preset resolution', () => {
    let tmpDir;
    (0, vitest_1.afterEach)(() => {
        delete process.env.DRIFTCLI_HOME;
        vitest_1.vi.restoreAllMocks();
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
    function setupTmpDir() {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'driftcli-preset-test-'));
        process.env.DRIFTCLI_HOME = tmpDir;
        return tmpDir;
    }
    (0, vitest_1.it)('applies a named preset when "preset" is set in config', () => {
        const dir = setupTmpDir();
        vitest_1.vi.spyOn(process, 'cwd').mockReturnValue(dir);
        fs.writeFileSync(path.join(dir, '.driftclirc'), JSON.stringify({ preset: 'coding' }));
        const config = (0, config_1.loadConfig)();
        (0, vitest_1.expect)(config.preset).toBe('coding');
        (0, vitest_1.expect)(config.weights).toEqual(config_1.WEIGHT_PRESETS.coding);
    });
    (0, vitest_1.it)('explicit weights override the preset', () => {
        const dir = setupTmpDir();
        vitest_1.vi.spyOn(process, 'cwd').mockReturnValue(dir);
        fs.writeFileSync(path.join(dir, '.driftclirc'), JSON.stringify({ preset: 'coding', weights: { repetition: 0.99 } }));
        const config = (0, config_1.loadConfig)();
        (0, vitest_1.expect)(config.weights.repetition).toBe(0.99);
        // Other fields should come from the preset
        (0, vitest_1.expect)(config.weights.goalDistance).toBe(config_1.WEIGHT_PRESETS.coding.goalDistance);
    });
    (0, vitest_1.it)('warns and falls back to defaults for an unknown preset name', () => {
        const dir = setupTmpDir();
        vitest_1.vi.spyOn(process, 'cwd').mockReturnValue(dir);
        const warnSpy = vitest_1.vi.spyOn(console, 'warn').mockImplementation(() => { });
        fs.writeFileSync(path.join(dir, '.driftclirc'), JSON.stringify({ preset: 'nonexistent' }));
        const config = (0, config_1.loadConfig)();
        (0, vitest_1.expect)(warnSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining('nonexistent'));
        (0, vitest_1.expect)(config.weights).toEqual(config_1.DEFAULT_CONFIG.weights);
    });
});
