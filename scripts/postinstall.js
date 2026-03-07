#!/usr/bin/env node
'use strict';

// Skip in CI / non-interactive environments
if (process.env.CI || process.env.CONTINUOUS_INTEGRATION || !process.stdout.isTTY) {
  process.exit(0);
}

console.log('');
console.log('  If driftguard-mcp is useful, a GitHub star helps others find it.');
console.log('  https://github.com/jschoemaker/driftguard-mcp');
console.log('');
