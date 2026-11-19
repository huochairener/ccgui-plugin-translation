import React from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import activate from '../main.js';
const registrations = {}, roots = [];
window.testState = { requests: [], saved: null, settingsOpened: 0, disposed: false };
function mount(id, component, prepend = false) {
  const slot = document.createElement('div');
  const host = document.getElementById(id);
  if (prepend) host.prepend(slot); else host.append(slot);
  renderInto(slot, component);
}
function renderInto(container, component) {
  const root = createRoot(container);
  root.render(React.createElement(component)); roots.push(root);
}
// Status bar mirrors the host markup: start zone (left, auto margin) + the
// right-aligned builtin cluster (performance · zoom · sync) that plugin chips
// for zone "end" are rendered into as direct flex children.
const statusBar = document.getElementById('status');
const statusCluster = document.createElement('div');
statusCluster.className = 'status-cluster';
statusCluster.innerHTML = '<button type="button" aria-label="性能诊断">性能 0 MB</button><span class="status-sep">·</span><span class="status-zoom"><button type="button" aria-label="缩小">−</button><button type="button" aria-label="重置缩放">100%</button><button type="button" aria-label="放大">+</button></span><span class="status-sep">·</span><button type="button" aria-label="立即同步">⟳</button><span>已同步</span>';
statusBar.append(statusCluster);
function mountPortal(container, component) {
  // Portal keeps the chip a direct child (flex item), like the host's PluginBoundary.
  const root = createRoot(document.createElement('div'));
  // Host commits plugin chips inside its own render tree; flush so the mock
  // keeps the same synchronous DOM order (chip before the version chip).
  flushSync(() => root.render(createPortal(React.createElement(component), container)));
  roots.push(root);
}
function mountStatusChip(component, zone) {
  if (zone === 'start') {
    let start = statusBar.querySelector('.status-start');
    if (!start) { start = document.createElement('div'); start.className = 'status-start'; statusBar.prepend(start); }
    mountPortal(start, component);
    return;
  }
  const sep = document.createElement('span');
  sep.className = 'status-sep'; sep.textContent = '·';
  statusCluster.append(sep);
  mountPortal(statusCluster, component);
}
const ctx = {
  react: React, pluginId: 'ccgui-translation', version: '0.1.0', host: { sdkVersion: '0.3.25', isWeb: false },
  storage: { get: async () => window.testState.saved, set: async (_, value) => { window.testState.saved = value; } },
  theme: { injectCss(css) { const style = document.createElement('style'); style.textContent = css; document.head.append(style); registrations.style = style; } },
  ui: {
    registerStatusBarItem(def) {
      const zone = def.zone ?? 'end';
      if (zone !== 'start' && zone !== 'end') throw new Error(`Unknown status bar zone: ${zone}`);
      window.testState.statusZone = zone;
      mountStatusChip(def.component, zone);
    },
    registerOverlay(def) { mount('overlay', def.component); },
    registerSettingsSection(def) { registrations.settings = def.component; },
    openSettings() { window.testState.settingsOpened++; document.getElementById('chat').hidden = true; document.getElementById('settings').hidden = false; mount('settings', registrations.settings); },
  },
  bridge: { async invoke(command, args) {
    if (command !== 'plugin_http_request') throw new Error('Unknown SDK command');
    window.testState.requests.push(args);
    await new Promise(r => setTimeout(r, 40));
    if (args.method === 'GET' && args.url.includes('bing.com/translator')) return { status: 200, body: '<html>IG:"test";params_AbusePreventionHelper = [123,"test-token",3600];<div data-iid="translator.5"></div></html>' };
    if (args.method === 'GET' && args.url.endsWith('/models')) return { status: 200, body: JSON.stringify({ data: [{ id: 'sensechat-5' }, { id: 'sensechat-4' }] }) };
    if (args.url.includes('fanyi-api.baidu.com')) return { status: 200, body: JSON.stringify({ from: 'en', to: 'zh', trans_result: [{ src: 'Hello, world!', dst: '你好，世界！' }] }) };
    if (args.url.includes('mt.cn-hangzhou.aliyuncs.com')) return { status: 200, body: JSON.stringify({ Code: 200, Data: { Translated: '你好，世界！', DetectedLanguage: 'en' } }) };
    if (args.url.includes('openapi.youdao.com')) return { status: 200, body: JSON.stringify({ errorCode: '0', translation: ['你好，世界！'], l: 'en2zh-CHS' }) };
    const query = new URL(args.url).searchParams;
    let text = args.url.includes('bing.com') ? new URLSearchParams(args.body).get('text') : query.get('q');
    const ai = args.url.includes('/responses') || args.url.includes('/chat/completions');
    if (ai) { const body = JSON.parse(args.body); text = String(body.input || body.messages.at(-1).content).replace(/^Translate the following text into [^\n]*\(output the translation only\):\n/, ''); }
    const translated = text === 'Hello, world!' ? '你好，世界！' : text === '你好，世界！' ? 'Hello, world!' : `[zh] ${text}`;
    if (args.url.includes('bing.com')) return { status: 200, body: JSON.stringify([{ detectedLanguage: { language: 'en' }, translations: [{ text: translated }] }]) };
    if (args.url.includes('googleapis')) return { status: 200, body: JSON.stringify([[[translated, text]], null, 'en']) };
    if (args.url.includes('/responses')) return { status: 200, body: JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: translated }] }] }) };
    return { status: 200, body: JSON.stringify({ choices: [{ message: { content: translated }, finish_reason: 'stop' }] }) };
  } },
};
const dispose = activate(ctx);
const versionSep = document.createElement('span');
versionSep.className = 'status-sep'; versionSep.textContent = '·';
const version = document.createElement('span');
version.textContent = 'v1.2.4';
statusCluster.append(versionSep, version);
window.disposePlugin = () => { dispose(); for (const root of roots) root.unmount(); registrations.style.remove(); window.testState.disposed = true; };
window.ready = true;
