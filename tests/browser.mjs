import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

await mkdir('artifacts', { recursive: true });
await build({ entryPoints: ['tests/host.jsx'], bundle: true, outfile: 'artifacts/host.js', format: 'esm', define: { 'process.env.NODE_ENV': '"development"' } });
const server = createServer(async (req, res) => {
  const path = req.url === '/host.js' ? 'artifacts/host.js' : 'tests/host.html';
  res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8');
  res.end(await readFile(path));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.ready);
  assert.equal(await page.evaluate(() => window.testState.statusZone), 'end');
  const statusButton = await page.getByRole('button', { name: '打开翻译' }).boundingBox();
  const perfButton = await page.getByRole('button', { name: '性能诊断' }).boundingBox();
  assert.ok(statusButton.x + statusButton.width <= perfButton.x, '翻译按钮应在性能 / 缩放集群最左侧');
  assert.ok(statusButton.x > 400, '翻译按钮不应被推到状态栏最左端');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.ct-status')).order), '-1');
  assert.equal(await page.evaluate(() => {
    const chip = document.querySelector('.ct-status');
    return getComputedStyle(chip.previousElementSibling).display;
  }), 'none', '插件槽位的分隔点应隐藏，避免出现双「·」');
  const statusText = (await page.locator('#status').innerText()).replace(/\s+/g, ' ');
  assert.match(statusText, /已同步 翻译 · v1\.2\.4/);
  assert.doesNotMatch(statusText, /· ·/);
  await page.getByRole('button', { name: '打开翻译' }).click();
  await page.getByRole('textbox', { name: '待翻译文本' }).fill('Hello, world!');
  await page.locator('.ct-output').filter({ hasText: '你好，世界！' }).waitFor();
  await page.screenshot({ path: 'artifacts/panel-light.png', animations: 'disabled' });
  await page.getByRole('button', { name: '交换源语言和目标语言' }).click();
  assert.equal(await page.getByLabel('源语言', { exact: true }).inputValue(), 'zh-Hans');
  assert.equal(await page.getByLabel('目标语言', { exact: true }).inputValue(), 'en');
  await page.locator('.ct-output').filter({ hasText: 'Hello, world!' }).waitFor();
  await page.getByRole('button', { name: '翻译设置', exact: true }).click();
  await page.getByRole('heading', { name: '轻译设置' }).waitFor();
  assert.equal(await page.evaluate(() => window.testState.settingsOpened), 1);
  await page.locator('input[type="radio"][value="ai"]').check();
  await page.getByLabel('Base URL', { exact: true }).fill('http://127.0.0.1:8888/v1');
  await page.getByLabel('API Key', { exact: true }).fill('test-only-key');
  await page.getByRole('button', { name: '拉取模型列表' }).click();
  await page.getByRole('status').filter({ hasText: '已拉取 2 个模型' }).waitFor();
  assert.equal(await page.locator('.ct-model-field input').count(), 1);
  assert.equal(await page.locator('.ct-model-field select').count(), 0);
  await page.getByLabel('模型名称').fill('sense');
  await page.locator('#ct-model-options').waitFor();
  assert.equal(await page.locator('#ct-model-options [role="option"]').count(), 2);
  await page.locator('#settings').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: 'artifacts/settings-model-menu.png', animations: 'disabled' });
  await page.getByLabel('模型名称').press('ArrowDown');
  await page.getByLabel('模型名称').press('Enter');
  assert.equal(await page.getByLabel('模型名称').inputValue(), 'sensechat-5');
  assert.equal(await page.locator('#ct-model-options').count(), 0);
  await page.getByLabel('模型名称').fill('my-custom-model');
  await page.getByLabel('模型名称').press('Enter');
  assert.equal(await page.getByLabel('模型名称').inputValue(), 'my-custom-model');
  await page.getByLabel('模型名称').fill('sensechat-5');
  assert.ok(await page.evaluate(() => window.testState.requests.some(request => request.url === 'http://127.0.0.1:8888/v1/models' && request.headers.Authorization === 'Bearer test-only-key')));
  await page.getByLabel('默认目标语言').selectOption('zh-Hans');
  await page.getByLabel('默认源语言').selectOption('auto');
  await page.getByRole('button', { name: '测试连接' }).click();
  await page.getByRole('status').filter({ hasText: '连接成功' }).waitFor();
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.getByRole('status').filter({ hasText: '设置已保存' }).waitFor();
  const configuredProviders = [
    { id: 'baidu', fields: [['百度 APP ID', 'test-baidu-id'], ['百度密钥', 'test-baidu-secret']], heading: '申请百度翻译 API', link: 'https://fanyi-api.baidu.com/manage/developer' },
    { id: 'alibaba', fields: [['阿里云 AccessKey ID', 'test-aliyun-id'], ['阿里云 AccessKey Secret', 'test-aliyun-secret']], heading: '申请阿里云机器翻译', link: 'https://www.aliyun.com/product/ai/alimt' },
    { id: 'youdao', fields: [['有道应用 ID（APP Key）', 'test-youdao-id'], ['有道应用密钥（APP Secret）', 'test-youdao-secret']], heading: '申请有道智云文本翻译', link: 'https://ai.youdao.com/' },
  ];
  await page.getByLabel('默认源语言').selectOption('en');
  await page.getByLabel('默认目标语言').selectOption('en');
  for (const provider of configuredProviders) {
    await page.locator(`input[type="radio"][value="${provider.id}"]`).check();
    await page.getByRole('heading', { name: provider.heading }).waitFor();
    assert.ok(await page.locator(`a[href="${provider.link}"]`).count(), `${provider.id} settings should show its application portal`);
    for (const [label, value] of provider.fields) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole('button', { name: '测试连接' }).click();
    await page.getByRole('status').filter({ hasText: '连接成功' }).waitFor();
    assert.ok(await page.evaluate(id => window.testState.requests.some(request => {
      if (id === 'baidu') return request.url.includes('fanyi-api.baidu.com') && request.headers['Content-Type'].startsWith('application/x-www-form-urlencoded') && new URLSearchParams(request.body).get('appid') === 'test-baidu-id';
      if (id === 'alibaba') return request.url.includes('mt.cn-hangzhou.aliyuncs.com') && request.headers.Authorization.startsWith('acs test-aliyun-id:');
      return request.url.includes('openapi.youdao.com') && request.headers['Content-Type'].startsWith('application/x-www-form-urlencoded') && new URLSearchParams(request.body).get('appKey') === 'test-youdao-id';
    }), provider.id), `${provider.id} should call its provider endpoint using its configured credentials`);
    const requestCount = await page.evaluate(() => window.testState.requests.length);
    await page.getByRole('button', { name: '测试连接' }).click();
    await page.getByRole('status').filter({ hasText: '连接成功' }).waitFor();
    assert.equal(await page.evaluate(() => window.testState.requests.length), requestCount + 1, 'testing a connection again must send a fresh request');
    await page.getByRole('button', { name: '保存设置' }).click();
    await page.getByRole('status').filter({ hasText: '设置已保存' }).waitFor();
  }
  assert.deepEqual(await page.evaluate(() => ({
    engine: window.testState.saved.engine,
    baiduAppId: window.testState.saved.baiduAppId,
    baiduSecretKey: window.testState.saved.baiduSecretKey,
    alibabaAccessKeyId: window.testState.saved.alibabaAccessKeyId,
    alibabaAccessKeySecret: window.testState.saved.alibabaAccessKeySecret,
    youdaoAppId: window.testState.saved.youdaoAppId,
    youdaoAppKey: window.testState.saved.youdaoAppKey,
  })), {
    engine: 'youdao', baiduAppId: 'test-baidu-id', baiduSecretKey: 'test-baidu-secret',
    alibabaAccessKeyId: 'test-aliyun-id', alibabaAccessKeySecret: 'test-aliyun-secret',
    youdaoAppId: 'test-youdao-id', youdaoAppKey: 'test-youdao-secret',
  });
  await page.getByLabel('默认源语言').selectOption('auto');
  await page.getByLabel('默认目标语言').selectOption('zh-Hans');
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.locator('#settings').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: 'artifacts/settings-light.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('input[type="radio"][value="ai"]').check();
  await page.getByLabel('API 协议').selectOption('chat');
  await page.getByRole('button', { name: '测试连接' }).click();
  await page.getByRole('status').filter({ hasText: '连接成功' }).waitFor();
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.getByRole('status').filter({ hasText: '设置已保存' }).waitFor();
  await page.evaluate(() => { document.getElementById('settings').hidden = true; document.getElementById('chat').hidden = false; });
  await page.locator('#selection-text').evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); });
  await page.locator('#selection-text').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '翻译选中文字' }).click();
  await page.locator('.ct-output').filter({ hasText: 'A good translation tool' }).waitFor();
  assert.match(await page.getByRole('textbox', { name: '待翻译文本' }).inputValue(), /^A good translation tool/);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await page.locator('#scroll').click({ button: 'right', position: { x: 8, y: 8 } });
  await page.waitForTimeout(150);
  assert.equal(await page.getByRole('menu', { name: '翻译菜单' }).count(), 0);
  const prose = page.locator('[data-index="1"] .prose-chat');
  const original = await prose.innerHTML();
  await page.getByRole('button', { name: '翻译当前回复' }).click();
  const translation = page.locator('[data-ct-translation]');
  await translation.filter({ hasText: '[zh] A good translation tool' }).waitFor();
  assert.equal(await translation.count(), 1);
  assert.match(await translation.innerText(), /const message = "Hello, world!";/, '译文要保留代码块的位置');
  assert.equal(await prose.innerHTML(), original);
  const leaked = await page.evaluate(() => window.testState.requests.some(request => JSON.stringify(request).includes('const message')));
  assert.equal(leaked, false);
  const order = await page.locator('[data-index="1"] .message-action-row').evaluate(row => [...row.children].map(node => node.getAttribute('aria-label') || node.className));
  assert.deepEqual(order, ['复制回答', '隐藏当前回复译文', '创建分支']);
  await page.screenshot({ path: 'artifacts/conversation-light.png', animations: 'disabled' });
  await page.getByRole('button', { name: '隐藏当前回复译文' }).click();
  assert.equal(await page.locator('[data-ct-translation]').isHidden(), true);
  await page.getByRole('button', { name: '打开翻译' }).click();
  await page.getByRole('dialog', { name: '轻译翻译面板' }).waitFor();
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ct-panel')).getPropertyValue('--ct-bg').includes('202126'));
  await page.screenshot({ path: 'artifacts/panel-dark.png', animations: 'disabled' });
  await page.setViewportSize({ width: 440, height: 760 });
  const panelBounds = await page.locator('.ct-panel').boundingBox();
  assert.ok(panelBounds.x >= 0 && panelBounds.x + panelBounds.width <= 440);
  await page.evaluate(() => window.disposePlugin());
  assert.equal(await page.locator('.ct-panel,.ct-status,[data-ct-translation],.ct-reply-translate-btn').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: status bar, auto translation, language swap, settings deep link, both AI protocols, selection menu, reply translation, code exclusion, hide, dark/narrow layouts and cleanup.');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
