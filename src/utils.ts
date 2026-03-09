import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Resolve the effective home directory for driftcli file discovery.
 *
 * DRIFTCLI_HOME overrides os.homedir() — intended for tests and non-standard
 * setups. If the override is set but points to a non-existent or non-directory
 * path, it is ignored with a warning and os.homedir() is used instead.
 */
export function resolveHomeDir(): string {
  const override = process.env.DRIFTCLI_HOME;
  if (!override) return os.homedir();

  const resolved = path.resolve(override);
  try {
    if (fs.statSync(resolved).isDirectory()) return resolved;
  } catch {
    // fall through to warning
  }
  console.warn(`[driftcli] DRIFTCLI_HOME "${override}" is not a valid directory — using home dir instead`);
  return os.homedir();
}
