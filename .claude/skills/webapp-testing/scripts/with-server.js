#!/usr/bin/env node
/**
 * Start one or more local servers, wait for each to accept TCP connections,
 * run a command, then always tear the servers down.
 *
 * Usage:
 *   node with-server.js --server "node src/server.js" --port 3000 -- node script.js
 *   node with-server.js --server "cd landing && npm run dev" --port 5173 \
 *                       --server "node src/server.js" --port 3000 \
 *                       -- node smoke.js
 */
'use strict';
const { spawn } = require('node:child_process');
const net = require('node:net');

function parseArgs(argv) {
  const servers = [];
  const ports = [];
  let i = 0;
  for (; i < argv.length; i++) {
    if (argv[i] === '--server') servers.push(argv[++i]);
    else if (argv[i] === '--port') ports.push(Number(argv[++i]));
    else if (argv[i] === '--') { i++; break; }
    else throw new Error(`Unrecognized argument: ${argv[i]}`);
  }
  const command = argv.slice(i);
  if (servers.length !== ports.length) {
    throw new Error('Each --server needs a matching --port');
  }
  if (command.length === 0) {
    throw new Error('Missing command after --');
  }
  return { servers, ports, command };
}

function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      const socket = net.createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => { socket.end(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for port ${port}`));
        } else {
          setTimeout(poll, 500);
        }
      });
    })();
  });
}

async function main() {
  const { servers, ports, command } = parseArgs(process.argv.slice(2));
  const children = servers.map((cmd) =>
    spawn(cmd, { shell: true, stdio: 'inherit' })
  );

  const cleanup = () => {
    for (const child of children) {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  try {
    await Promise.all(ports.map((port) => waitForPort(port)));
    const result = spawn(command[0], command.slice(1), { stdio: 'inherit' });
    const code = await new Promise((resolve) => result.on('exit', resolve));
    process.exitCode = code ?? 1;
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
