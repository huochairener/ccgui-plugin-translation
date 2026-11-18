import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('installable package supports SenseNova without a host-grant script', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugin/manifest.json', import.meta.url), 'utf8'));
  const readme = await readFile(new URL('../plugin/README.md', import.meta.url), 'utf8');
  assert.ok(manifest.permissions.includes('network:token.sensenova.cn'));
  assert.doesNotMatch(readme, /grant-host\.mjs|重新授权/i);
  await assert.rejects(access(new URL('../plugin/scripts/grant-host.mjs', import.meta.url)));
});
