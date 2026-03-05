const command = process.argv[2];

if (command === 'watch') {
  const { run } = require('./cli');
  run();
} else {
  const { main } = require('./mcp-server');
  main().catch(console.error);
}
