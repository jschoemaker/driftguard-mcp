import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface JsonTarget {
  name: string;
  filePath: string;
  adapter: string;
  format: 'json';
}

interface TomlTarget {
  name: string;
  filePath: string;
  adapter: string;
  format: 'toml';
}

type ConfigTarget = JsonTarget | TomlTarget;

const TARGETS: ConfigTarget[] = [
  { name: 'Claude Code', filePath: path.join(os.homedir(), '.claude.json'),             adapter: 'claude', format: 'json' },
  { name: 'Gemini CLI',  filePath: path.join(os.homedir(), '.gemini', 'settings.json'), adapter: 'gemini', format: 'json' },
  { name: 'Codex CLI',   filePath: path.join(os.homedir(), '.codex', 'config.toml'),    adapter: 'codex',  format: 'toml' },
  { name: 'Cursor',      filePath: path.join(os.homedir(), '.cursor', 'mcp.json'),      adapter: 'claude', format: 'json' },
];

const TOML_ENTRY = (adapter: string) =>
  `\n[mcp_servers.driftguard]\ncommand = "driftguard-mcp"\nenv.DRIFTCLI_ADAPTER = "${adapter}"\n`;

function setupToml(target: TomlTarget, update: boolean): void {
  const existing = fs.existsSync(target.filePath)
    ? fs.readFileSync(target.filePath, 'utf-8')
    : '';

  if (existing.includes('[mcp_servers.driftguard]')) {
    if (!update) {
      console.log(`  ${target.name}: already configured (use --update to overwrite)`);
      return;
    }
    // Remove existing block and re-append
    const stripped = existing.replace(/\n\[mcp_servers\.driftguard\][^\[]*/s, '');
    fs.writeFileSync(target.filePath, stripped.trimEnd() + TOML_ENTRY(target.adapter), 'utf-8');
  } else {
    fs.writeFileSync(target.filePath, existing.trimEnd() + TOML_ENTRY(target.adapter), 'utf-8');
  }
  console.log(`  ${target.name}: configured (${target.filePath})`);
}

function setupJson(target: JsonTarget, update: boolean): void {
  let config: Record<string, unknown> = {};
  if (fs.existsSync(target.filePath)) {
    try {
      config = JSON.parse(fs.readFileSync(target.filePath, 'utf-8'));
    } catch {
      console.log(`  ${target.name}: skipped — could not parse ${target.filePath}`);
      return;
    }
  }

  const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
  if (servers.driftguard && !update) {
    console.log(`  ${target.name}: already configured (use --update to overwrite)`);
    return;
  }

  config.mcpServers = { ...servers, driftguard: { command: 'driftguard-mcp', env: { DRIFTCLI_ADAPTER: target.adapter } } };

  const dir = path.dirname(target.filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target.filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(`  ${target.name}: configured (${target.filePath})`);
}

export function setup(update = false) {
  console.log('driftguard-mcp setup\n');

  for (const target of TARGETS) {
    try {
      if (target.format === 'toml') {
        setupToml(target, update);
      } else {
        setupJson(target, update);
      }
    } catch (err) {
      console.log(`  ${target.name}: failed — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('\nDone. Restart your AI CLI to activate the tools.');
}
