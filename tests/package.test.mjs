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

test('installable package grants network access to the three configured translation providers', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  for (const host of ['fanyi-api.baidu.com', 'mt.cn-hangzhou.aliyuncs.com', 'openapi.youdao.com']) {
    assert.ok(manifest.permissions.includes(`network:${host}`), `missing host permission for ${host}`);
  }
});
