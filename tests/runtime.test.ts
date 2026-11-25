import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

test('production preview overrides inherited listener settings without opening a server', () => {
  const result = execFileSync(process.execPath, [
    '--import', './scripts/local-server.ts', '--input-type=module', '-e',
    'console.log(JSON.stringify([process.env.HOST, process.env.PORT, process.env.SOCKET_PATH]))'
  ], {
    env: { PATH: process.env.PATH, HOST: '0.0.0.0', PORT: '9999', SOCKET_PATH: '/not-a-real-socket' },
    encoding: 'utf8'
  });
  assert.deepEqual(JSON.parse(result), ['127.0.0.1', '8765', null]);
});
