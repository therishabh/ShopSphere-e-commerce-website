// Integration tests: src/server.js. Yahan asli port khulte hain (ephemeral, PORT=0) aur ek test child process
// bhi chalata hai, kyunki server.js ka entrypoint process-level kaam (exit code, stderr) karta hai.

import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { startServer } from '../../src/server.js';
import { loadConfig } from '../../src/config/env.js';

// PORT=0 = OS koi free port de deta hai, isliye tests ke ports kabhi takrate nahi.
describe('startServer', () => {
  test('binds a port, serves health, and closes cleanly', async () => {
    const config = loadConfig({ NODE_ENV: 'test', PORT: '0' });
    const { port, close } = await startServer(config);
    expect(port).toBeGreaterThan(0);

    const res = await fetch(`http://127.0.0.1:${port}/health/ready`);
    expect(res.status).toBe(200);

    await close();
    await expect(fetch(`http://127.0.0.1:${port}/health/live`)).rejects.toThrow();
  });

  // Pehle ek 'blocker' server us port par chalate hain, phir startServer wahi port maange to EADDRINUSE aana chahiye.
  test('rejects when the port is already in use', async () => {
    const blocker = net.createServer().listen(0, '127.0.0.1');
    await once(blocker, 'listening');
    const config = loadConfig({ NODE_ENV: 'test', PORT: String(blocker.address().port) });
    await expect(startServer(config)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    blocker.close();
  });
});

// Asli `node src/server.js` ko alag process mein chalate hain (spawn) aur galat PORT dekar dekhte hain ki
// wo saaf message print karke exit code 1 se band hota hai.
describe('server entrypoint', () => {
  test('exits 1 with a readable message on invalid configuration', async () => {
    const child = spawn(process.execPath, ['src/server.js'], {
      env: { ...process.env, PORT: 'not-a-number' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    const [code] = await once(child, 'close');
    expect(code).toBe(1);
    expect(stderr).toMatch(/Invalid environment configuration/);
    expect(stderr).toMatch(/PORT/);
  });
});
