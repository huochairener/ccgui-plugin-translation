import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as adapter from '../src/conversation.js';

function fixture() {
  const dom = new JSDOM(`<div data-tab-key="session-a"><div role="tab" aria-selected="true"></div></div><div id="center-tabpanel"><div data-split-pane="pane-a"><header class="border-border-focus-ring"></header><div id="scroll"><div data-sentinel></div><div data-virtual-inner>
    <div data-index="0"><div class="bg-bubble-user">Original user request.</div><button class="message-copy-btn">copy</button></div>
    <div data-index="1"><div class="prose-chat"><p>First <code>private_code()</code> response.</p><pre>SECRET_BLOCK</pre></div><div class="message-action-row"><button class="message-copy-btn">copy</button><button class="message-fork-btn">fork</button></div></div>
    <div data-index="2"><div class="prose-chat"><p>The final <code>inline_code</code> sentence.</p></div><div class="message-action-row"><button class="message-copy-btn">copy</button><button class="message-fork-btn">fork</button></div></div>
    <div data-index="3"><div class="tool-output prose-chat">tool output must stay private</div></div>
    <div data-index="4"><div class="prose-chat"><p>Still generating the answer.</p></div><div class="message-action-row"><button class="message-copy-btn" disabled>copy</button><button class="message-fork-btn" disabled>fork</button></div></div>
  </div></div></div></div>`);
  const document = dom.window.document, root = document.querySelector('#scroll');
  Object.defineProperties(root, { clientHeight: { value: 500 }, scrollHeight: { value: 500, configurable: true } });
  root.getClientRects = () => [{ width: 600, height: 500 }];
  return { dom, root, document };
}

test('translation actions appear only beside completed assistant copy/fork icons', async () => {
  assert.equal(typeof adapter.createReplyTranslationController, 'function');
  const { dom, root, document } = fixture();
  const controller = adapter.createReplyTranslationController({ document, translator: { translate: async () => ({ text: '译文' }) }, getSettings: () => ({ target: 'zh-Hans' }), onChange() {} });
  await new Promise(r => setTimeout(r, 180));
  assert.equal(root.querySelectorAll('.ct-reply-translate-btn').length, 2);
  assert.equal(root.querySelectorAll('[data-index="0"] .ct-reply-translate-btn').length, 0);
  assert.equal(root.querySelectorAll('[data-index="3"] .ct-reply-translate-btn').length, 0);
  assert.equal(root.querySelectorAll('[data-index="4"] .ct-reply-translate-btn').length, 0);
  const actions = root.querySelector('[data-index="2"] .message-action-row');
  assert.equal(actions.querySelector('.ct-reply-translate-btn').previousElementSibling, actions.querySelector('.message-copy-btn'));
  assert.equal(actions.querySelector('.message-fork-btn').previousElementSibling, actions.querySelector('.ct-reply-translate-btn'));
  assert.equal(root.querySelectorAll('.ct-reply-translation').length, 0);
  controller.dispose(); dom.window.close();
});

test('click translates only the current finished assistant reply and preserves literal and rendered code', async () => {
  assert.equal(typeof adapter.createReplyTranslationController, 'function');
  const { dom, root, document } = fixture();
  const original = root.querySelector('[data-index="2"] .prose-chat').innerHTML;
  let received = '';
  const controller = adapter.createReplyTranslationController({ document, translator: { translate: async text => { received = text; return { text: '<img src=x onerror=alert(1)>译文' }; } }, getSettings: () => ({ target: 'zh-Hans' }), onChange() {} });
  await new Promise(r => setTimeout(r, 150));
  root.querySelector('[data-index="2"] .ct-reply-translate-btn').click();
  await new Promise(r => setTimeout(r, 35));
  assert.match(received, /final.*sentence/);
  assert.ok(!received.includes('inline_code'));
  assert.ok(!received.includes('SECRET_BLOCK'));
  assert.ok(!received.includes('First'));
  assert.equal(root.querySelector('[data-index="2"] .prose-chat').innerHTML, original);
  const translated = root.querySelector('[data-index="2"] [data-ct-translation]');
  assert.match(translated.textContent, /<img/);
  assert.equal(translated.querySelector('img'), null);
  assert.match(translated.textContent, /inline_code/, '行内代码要在译文中保留位置');
  assert.equal(root.querySelectorAll('[data-ct-translation]').length, 1);
  controller.dispose(); dom.window.close();
});

test('translation can hide, reveal, and clear when languages change', async () => {
  const { dom, root, document } = fixture();
  let calls = 0;
  const controller = adapter.createReplyTranslationController({ document, translator: { translate: async () => ({ text: `译文${++calls}` }), clear() {} }, getSettings: () => ({ target: 'zh-Hans' }), onChange() {} });
  await new Promise(r => setTimeout(r, 150));
  const button = root.querySelector('[data-index="2"] .ct-reply-translate-btn');
  button.click(); await new Promise(r => setTimeout(r, 35));
  const aside = root.querySelector('[data-index="2"] [data-ct-translation]');
  assert.equal(aside.textContent.includes('译文1'), true);
  button.click(); assert.equal(root.querySelector('[data-ct-translation]').hidden, true);
  button.click(); await new Promise(r => setTimeout(r, 35));
  assert.equal(root.querySelector('[data-ct-translation]').textContent.includes('译文1'), true);
  controller.clearTranslations();
  assert.equal(root.querySelectorAll('[data-ct-translation]').length, 0);
  controller.dispose(); dom.window.close();
});

test('switching sessions while one reply is pending discards its late result', async () => {
  const { dom, root, document } = fixture();
  let resolve;
  const controller = adapter.createReplyTranslationController({ document, translator: { translate: () => new Promise(r => { resolve = r; }) }, getSettings: () => ({}), onChange() {} });
  await new Promise(r => setTimeout(r, 150));
  root.querySelector('[data-index="2"] .ct-reply-translate-btn').click();
  while (!resolve) await new Promise(r => setTimeout(r, 2));
  document.querySelector('[data-tab-key]').setAttribute('data-tab-key', 'session-b');
  resolve({ text: 'old session result' });
  await new Promise(r => setTimeout(r, 150));
  assert.equal(root.querySelectorAll('[data-ct-translation]').length, 0);
  controller.dispose(); dom.window.close();
});

test('completed reply with edited source drops its stale translation', async () => {
  const { dom, root, document } = fixture();
  const controller = adapter.createReplyTranslationController({ document, translator: { translate: async () => ({ text: 'old translation' }) }, getSettings: () => ({}), onChange() {} });
  await new Promise(r => setTimeout(r, 140));
  const button = root.querySelector('[data-index="2"] .ct-reply-translate-btn'); button.click();
  await new Promise(r => setTimeout(r, 30));
  root.querySelector('[data-index="2"] .prose-chat p').textContent = 'Edited assistant response.';
  await new Promise(r => setTimeout(r, 170));
  assert.equal(root.querySelector('[data-index="2"] [data-ct-translation]'), null);
  controller.dispose(); dom.window.close();
});

test('host rerender keeps the action and does not translate the reply again', async () => {
  const { dom, root, document } = fixture();
  let calls = 0, resolve;
  const controller = adapter.createReplyTranslationController({ document, translator: { translate: () => { calls++; return new Promise(r => { resolve = r; }); } }, getSettings: () => ({ target: 'zh-Hans' }), onChange() {} });
  await new Promise(r => setTimeout(r, 150));
  const row = root.querySelector('[data-index="2"]');
  row.querySelector('.ct-reply-translate-btn').click();
  while (!resolve) await new Promise(r => setTimeout(r, 2));
  assert.match(row.querySelector('[data-ct-translation]').textContent, /正在翻译/);
  row.querySelector('.ct-reply-translate-btn').remove();
  row.querySelector('[data-ct-translation]').remove();
  await new Promise(r => setTimeout(r, 180));
  const restored = row.querySelector('.ct-reply-translate-btn');
  assert.equal(restored.previousElementSibling, row.querySelector('.message-copy-btn'));
  assert.match(row.querySelector('[data-ct-translation]').textContent, /正在翻译/);
  resolve({ text: '恢复后的译文' });
  await new Promise(r => setTimeout(r, 30));
  assert.match(row.querySelector('[data-ct-translation]').textContent, /恢复后的译文/);
  row.querySelector('.ct-reply-translate-btn').remove();
  row.querySelector('[data-ct-translation]').remove();
  await new Promise(r => setTimeout(r, 180));
  assert.equal(calls, 1);
  assert.match(row.querySelector('[data-ct-translation]').textContent, /恢复后的译文/);
  row.querySelector('.ct-reply-translate-btn').click();
  assert.equal(row.querySelector('[data-ct-translation]').hidden, true);
  controller.dispose(); dom.window.close();
});

test('reply actions are attached only to visible, eligible split panes', async () => {
  const { dom, root, document } = fixture();
  const hidden = root.closest('[data-split-pane]').cloneNode(true);
  hidden.querySelector('header').className = 'border-separator-border';
  hidden.querySelectorAll('.ct-reply-translate-btn').forEach(n => n.remove());
  const copied = hidden.querySelectorAll('.ct-reply-translate-btn');
  assert.equal(copied.length, 0);
  const controller = adapter.createReplyTranslationController({ document, translator: { clear() {} }, getSettings: () => ({}), onChange() {} });
  await new Promise(r => setTimeout(r, 150));
  assert.equal(root.querySelectorAll('.ct-reply-translate-btn').length, 2);
  assert.equal(hidden.querySelectorAll('.ct-reply-translate-btn').length, 0);
  controller.dispose(); dom.window.close();
});

test('paths and identifiers in a reply survive translation instead of being deleted', () => {
  const { dom, document } = fixture();
  const row = document.querySelector('[data-index="1"]');
  assert.equal(adapter.readCurrentAssistantReply(row), 'First private_code() response.\nSECRET_BLOCK');
  const { source, request, parts } = adapter.readTranslationSource(row);
  assert.equal(source, 'First private_code() response.\nSECRET_BLOCK');
  assert.deepEqual(parts, ['private_code()', 'SECRET_BLOCK']);
  assert.equal(request, 'First [[1]] response.\n[[2]]');
  assert.equal(adapter.restoreCodeSpans('第一个 [[1]] 响应。\n\n[[2]]', parts), '第一个 private_code() 响应。\n\nSECRET_BLOCK');
  // Full-width brackets are what an engine writing Chinese tends to produce.
  assert.equal(adapter.restoreCodeSpans('第一个 ［［1］］ 响应。\n\n［［2］］', parts), '第一个 private_code() 响应。\n\nSECRET_BLOCK');
  // A dropped placeholder must not silently delete the path it stands for.
  assert.equal(adapter.restoreCodeSpans('第一个 [[1]] 响应。', parts), '第一个 private_code() 响应。\n\nSECRET_BLOCK');
  dom.window.close();
});

test('a translated reply restores paths in place and never sends code to the engine', async () => {
  const { dom, root, document } = fixture();
  let received = '';
  const controller = adapter.createReplyTranslationController({ document, translator: { translate: async text => { received = text; return { text: '第一个 [[1]] 响应。\n\n[[2]]' }; } }, getSettings: () => ({ target: 'zh-Hans' }), onChange() {} });
  await new Promise(r => setTimeout(r, 150));
  root.querySelector('[data-index="1"] .ct-reply-translate-btn').click();
  await new Promise(r => setTimeout(r, 35));
  assert.ok(!received.includes('private_code'), '标识符不得发给引擎');
  assert.ok(!received.includes('SECRET_BLOCK'), '代码块不得发给引擎');
  assert.match(received, /\[\[1\]\]/);
  const card = root.querySelector('[data-index="1"] [data-ct-translation]');
  assert.match(card.textContent, /private_code\(\)/);
  assert.match(card.textContent, /SECRET_BLOCK/);
  assert.equal(card.querySelector('pre'), null, '代码以文本显示，不注入宿主 DOM');
  controller.dispose(); dom.window.close();
});
