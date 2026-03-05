import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ConfigTarget {
  name: string;
  filePath: string;
}

const TARGETS: ConfigTarget[] = [
  { name: 'Claude Code',  filePath: path.join(os.homedir(), '.claude.json') },
  { name: 'Gemini CLI',   filePath: path.join(os.homedir(), '.gemini', 'settings.json') },
  { name: 'Codex CLI',    filePath: path.join(os.homedir(), '.codex', 'config.json') },
  { name: 'Cursor',       filePath: path.join(os.homedir(), '.cursor', 'mcp.json') },
];

const MCP_ENTRY = {
  command: 'driftguard-mcp',
};

export function setup() {
  console.log('driftguard-mcp setup\n');

  for (const target of TARGETS) {
    try {
      const dir = path.dirname(target.filePath);

      // Read existing config or start fresh
      let config: Record<string, unknown> = {};
      if (fs.existsSync(target.filePath)) {
        try {
          config = JSON.parse(fs.readFileSync(target.filePath, 'utf-8'));
        } catch {
          console.log(`  ${target.name}: skipped — could not parse ${target.filePath}`);
          continue;
        }
      }

      // Check if already registered
      const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
      if (servers.driftguard) {
        console.log(`  ${target.name}: already configured`);
        continue;
      }

      // Merge in the new entry
      config.mcpServers = { ...servers, driftguard: MCP_ENTRY };

      // Write back
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(target.filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      console.log(`  ${target.name}: configured (${target.filePath})`);
    } catch (err) {
      console.log(`  ${target.name}: failed — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('\nDone. Restart your AI CLI to activate the tools.');
}
