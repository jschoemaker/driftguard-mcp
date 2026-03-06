const command = process.argv[2];

if (command === 'watch') {
  const { run } = require('./cli');
  run();
} else if (command === 'setup') {
  const { setup } = require('./setup');
  setup(process.argv.includes('--update'));
} else {
  const { main } = require('./mcp-server');
  main().catch(console.error);
}
