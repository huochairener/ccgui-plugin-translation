import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as module from '../src/model.js';
const wait = ms => new Promise(r => setTimeout(r, ms));
const ctx = (storage = {}) => ({ storage: { get: async () => null, set: async () => {}, ...storage } });

test('a late old translation cannot overwrite the newest input', async () => {
  assert.equal(typeof module.createModel, 'function');
  const requests = [];
  const model = module.createModel(ctx(), { translate: text => new Promise(resolve => requests.push({ text, resolve })), clear() {} }, { debounce: 1 });
  await model.load(); model.open(); model.setInput('old'); await wait(10);
  model.setInput('new'); await wait(10);
  requests[1].resolve({ text: '新的译文', detected: 'en' }); await wait(0);
  requests[0].resolve({ text: '旧的译文', detected: 'en' }); await wait(0);
  assert.equal(model.getSnapshot().output, '新的译文');
  model.dispose();
});

test('closing the panel cancels pending automatic requests', async () => {
  assert.equal(typeof module.createModel, 'function');
  let requests = 0;
  const model = module.createModel(ctx(), { translate: async () => { requests++; return { text: '译文' }; }, clear() {} }, { debounce: 10 });
  await model.load(); model.open(); model.setInput('Hello'); model.close(); await wait(30);
  assert.equal(requests, 0); model.dispose();
});

test('swapping auto source uses detected language and persists valid source/target', async () => {
  assert.equal(typeof module.createModel, 'function');
  const saved = [];
  const model = module.createModel(ctx({ set: async (_, value) => saved.push(value) }), { translate: async () => ({ text: '你好', detected: 'en' }), clear() {} }, { debounce: 1 });
  await model.load(); model.open(); model.setInput('Hello'); await wait(10); await model.swap();
  assert.equal(model.getSnapshot().settings.source, 'zh-Hans');
  assert.equal(model.getSnapshot().settings.target, 'en');
  assert.equal(saved.at(-1).target, 'en');
  model.dispose();
});

test('storage failure stays visible and is never reported as saved', async () => {
  assert.equal(typeof module.createModel, 'function');
  const model = module.createModel(ctx({ set: async () => { throw new Error('disk full'); } }), { clear() {} });
  await model.load();
  await assert.rejects(model.updateSettings({ target: 'ja' }));
  assert.match(model.getSnapshot().storageError, /保存/); model.dispose();
});
