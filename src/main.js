import { LANGUAGES, STYLES, aiEndpoint, createTranslator, engineName, languageName } from './core.js';
import { createModel } from './model.js';
import { createReplyTranslationController, findConversation } from './conversation.js';
import css from '../styles.css';

export default function activate(ctx) {
  const { createElement: h, useState, useEffect, useRef, useSyncExternalStore } = ctx.react;
  const translator = createTranslator((command, args) => ctx.bridge.invoke(command, args));
  const model = createModel(ctx, translator);
  const controller = createReplyTranslationController({ document, translator, getSettings: () => model.getSnapshot().settings, onChange: reply => model.patch({ reply }) });
  let disposed = false;
  const useModel = () => useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  ctx.theme.injectCss(css);
  void model.load();

  function Icon({ name, ...props }) {
    const paths = {
      translate: 'm4 5 7 0M7.5 3v2m-2 0c.5 4 3 6 6 7M10 5c-.5 4-3 7-6 8m8 5 4-11 4 11m-6.5-4h5',
      swap: 'M4 7h13l-3-3m6 13H7l3 3M17 7l-3 3M7 17l3-3',
      settings: 'M9 3h6l.7 3 2.6 1.5 3 .9-3 5.2-2.3 2.1L15 21H9l-.7-3-2.6-1.5-3-.9 3-5.2L8 8.3 9 3M15.5 12a3.5 3.5 0 1 0-7 0 3.5 3.5 0 0 0 7 0',
      close: 'm6 6 12 12M18 6 6 18',
      copy: 'M9 9h11v12H9zM15 5V2H3v13h3',
      globe: 'M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
      arrow: 'M5 12h14m-5-5 5 5-5 5',
    };
    return h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.55, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...props }, h('path', { d: paths[name] || paths.translate }));
  }
  const iconButton = (label, name, onClick, extra = {}) => h('button', { type: 'button', className: 'ct-icon-btn', 'aria-label': label, title: label, onClick, ...extra }, h(Icon, { name }));
  function LanguageSelect({ label, value, onChange, target = false, disabled = false }) {
    return h('select', { className: 'ct-language', 'aria-label': label, value, onChange: e => onChange(e.target.value), disabled }, LANGUAGES.filter(([id]) => !target || id !== 'auto').map(([id, name]) => h('option', { value: id, key: id }, name)));
  }
  function openSettings() { model.close(); model.patch({ menu: null }); ctx.ui.openSettings(); }
  function saveLanguages(partial) { controller.clearTranslations(); void model.updateSettings(partial).catch(() => {}); }
  async function copy(text, onDone) {
    try { await navigator.clipboard.writeText(text); if (!disposed) onDone?.(); }
    catch { model.patch({ error: '复制失败，请选中译文后使用 Ctrl+C 复制。' }); }
  }

  function StatusBar() {
    const state = useModel();
    return h('button', { type: 'button', className: `ct-status${state.panelOpen ? ' ct-active' : ''}`, 'aria-label': '打开翻译', 'aria-expanded': state.panelOpen, 'aria-controls': 'ct-panel', title: '轻译 · 选区 / 文本 / 回复翻译', onClick: () => state.panelOpen ? model.close() : model.open() }, h(Icon, { name: 'translate', width: 15, height: 15 }), h('span', null, '翻译'));
  }

  function Panel() {
    const state = useModel(), inputRef = useRef(null);
    const [copied, setCopied] = useState(false);
    useEffect(() => {
      const previous = document.activeElement;
      inputRef.current?.focus();
      return () => { if (previous?.isConnected) previous.focus?.(); };
    }, []);
    useEffect(() => { setCopied(false); }, [state.output]);
    const settings = state.settings;
    return h('section', { id: 'ct-panel', className: 'ct-panel', role: 'dialog', 'aria-modal': false, 'aria-label': '轻译翻译面板', 'data-ct-ui': '' },
      h('header', { className: 'ct-header' }, h('div', { className: 'ct-brand' }, h('span', { className: 'ct-brand-icon' }, h(Icon, { name: 'translate' })), h('span', null, '轻译'), h('span', { className: 'ct-tag' }, 'TRANSLATE')), h('div', { className: 'ct-row' }, iconButton('翻译设置', 'settings', openSettings), iconButton('关闭翻译', 'close', () => model.close()))),
      h('div', { className: 'ct-language-row' },
        h(LanguageSelect, { label: '源语言', value: settings.source, disabled: !state.ready, onChange: value => saveLanguages({ source: value }) }),
        iconButton('交换源语言和目标语言', 'swap', () => { controller.clearTranslations(); void model.swap().catch(() => {}); }, { className: 'ct-icon-btn ct-swap', disabled: !state.ready }),
        h(LanguageSelect, { label: '目标语言', value: settings.target, target: true, disabled: !state.ready, onChange: value => saveLanguages({ target: value }) })),
      h('div', { className: 'ct-input-wrap' },
        h('div', { className: 'ct-section-caption' }, h('span', null, '原文'), h('span', { className: 'ct-muted' }, `${state.input.length.toLocaleString()} 字符`)),
        h('textarea', { ref: inputRef, className: 'ct-input', 'aria-label': '待翻译文本', placeholder: '在这里输入或粘贴文字…', value: state.input, onChange: e => model.setInput(e.target.value), onKeyDown: e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); model.translateNow(); } }, spellCheck: false }),
        state.input && h('button', { type: 'button', className: 'ct-clear', onClick: () => model.setInput('') }, '清空')),
      h('div', { className: 'ct-output-wrap' },
        h('div', { className: 'ct-section-caption' }, h('span', null, '译文'), h('span', { className: 'ct-row' }, state.detected && h('span', { className: 'ct-muted' }, `检测到${languageName(state.detected)}`), state.output && iconButton(copied ? '已复制' : '复制译文', 'copy', () => void copy(state.output, () => setCopied(true))))),
        h('div', { className: `ct-output${!state.output ? ' ct-output-empty' : ''}`, 'aria-live': 'polite', 'aria-busy': state.pending },
          state.pending ? h('span', { className: 'ct-row ct-muted' }, h('span', { className: 'ct-spinner' }), '正在翻译…')
            : state.error ? h('div', { className: 'ct-error-text', role: 'alert' }, state.error, h('button', { type: 'button', className: 'ct-text-btn', onClick: () => model.translateNow() }, '重试'))
              : state.output || h('div', { className: 'ct-empty' }, h(Icon, { name: 'translate', width: 30, height: 30 }), h('span', null, '译文会自动显示在这里'))),
        state.passthrough && h('div', { className: 'ct-panel-hint ct-passthrough' }, `原文已是${languageName(settings.target)}，已原样返回`)),
      state.storageError && h('div', { className: 'ct-alert', role: 'alert' }, state.storageError, !state.ready && h('button', { className: 'ct-text-btn', type: 'button', onClick: () => void model.load() }, '重新读取设置')),
      h('footer', { className: 'ct-footer' }, h('span', { className: 'ct-engine' }, h('span', { className: 'ct-dot' }), engineName(settings.engine)), h('span', { className: 'ct-muted' }, '粘贴即译', h('span', { className: 'ct-footer-sep' }, '·'), 'Ctrl + Enter 立即翻译')),
      h('div', { className: 'ct-panel-hint' }, '也可点击模型回复下方的翻译图标'));
  }

  function ContextMenu() {
    const { menu } = useModel(), ref = useRef(null);
    useEffect(() => { ref.current?.querySelector('button')?.focus(); }, []);
    if (!menu) return null;
    const item = (text, onClick, icon = 'translate') => h('button', { type: 'button', role: 'menuitem', className: 'ct-menu-item', onClick: () => { model.patch({ menu: null }); onClick(); } }, h(Icon, { name: icon, width: 16, height: 16 }), text);
    return h('div', { ref, className: 'ct-menu', 'data-ct-ui': '', role: 'menu', 'aria-label': '翻译菜单', style: { left: Math.min(menu.x, Math.max(4, window.innerWidth - 210)), top: Math.min(menu.y, Math.max(4, window.innerHeight - 200)) }, onKeyDown: e => {
      const buttons = [...ref.current.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    } },
      item('翻译选中文字', () => model.open(menu.text)),
      item('复制选中文字', () => void copy(menu.text), 'copy'),
      h('div', { className: 'ct-menu-divider' }), item('翻译设置', openSettings, 'settings'));
  }

  function Overlay() {
    const state = useModel();
    return h('div', { className: 'ct-overlay' }, state.panelOpen && h(Panel), state.menu && h(ContextMenu));
  }

  function Settings() {
    const state = useModel();
    const [form, setForm] = useState(state.settings), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [showKey, setShowKey] = useState(false), [modelOptions, setModelOptions] = useState([]), [modelOpen, setModelOpen] = useState(false), [modelActive, setModelActive] = useState(-1);
    const alive = useRef(true), dirty = useRef(false), modelRef = useRef(null);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { if (state.ready && !dirty.current) setForm(state.settings); }, [state.ready, state.settings]);
    useEffect(() => {
      if (!modelOpen) return;
      const onPointerDown = event => { if (!modelRef.current?.contains(event.target)) setModelOpen(false); };
      document.addEventListener('pointerdown', onPointerDown, true);
      return () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, [modelOpen]);
    const change = (key, value) => { dirty.current = true; setForm(previous => ({ ...previous, [key]: value })); if (key === 'baseUrl' || key === 'apiKey') setModelOptions([]); setNotice(''); };
    function validate() { if (form.engine === 'ai') { aiEndpoint(form.baseUrl, form.protocol); if (!form.model.trim()) throw new Error('请填写模型名称。'); } }
    async function save() {
      try {
        validate(); setBusy(true); controller.clearTranslations(); await model.updateSettings(form);
        if (alive.current) { dirty.current = false; setNotice('设置已保存'); }
      } catch (error) { if (alive.current) setNotice(error.message); }
      finally { if (alive.current) setBusy(false); }
    }
    async function testConnection() {
      try {
        validate(); setBusy(true); setNotice('正在测试…');
        const result = await translator.translate('Hello, world!', form, { isCancelled: () => !alive.current });
        if (alive.current) setNotice(`连接成功：${result.text}`);
      } catch (error) { if (alive.current && error.name !== 'AbortError') setNotice(error.message); }
      finally { if (alive.current) setBusy(false); }
    }
    async function pullModels() {
      try {
        aiEndpoint(form.baseUrl, form.protocol);
        setBusy(true); setNotice('正在拉取模型列表…');
        const models = await translator.listModels(form);
        if (alive.current) { setModelOptions(models); setNotice(`已拉取 ${models.length} 个模型。`); }
      } catch (error) { if (alive.current) setNotice(error.message); }
      finally { if (alive.current) setBusy(false); }
    }
    const modelMatches = form.model.trim() ? modelOptions.filter(id => id.toLowerCase().includes(form.model.trim().toLowerCase())).slice(0, 8) : modelOptions.slice(0, 8);
    function pickModel(value) { change('model', value); setModelOpen(false); setModelActive(-1); }
    function onModelKeyDown(event) {
      if (event.key === 'Escape') { if (modelOpen) { event.preventDefault(); setModelOpen(false); } return; }
      if (event.key === 'Enter') { event.preventDefault(); if (modelOpen && modelActive >= 0 && modelMatches[modelActive]) pickModel(modelMatches[modelActive]); else { setModelOpen(false); setModelActive(-1); } return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!modelMatches.length) return;
        event.preventDefault();
        if (!modelOpen) { setModelOpen(true); setModelActive(event.key === 'ArrowDown' ? 0 : modelMatches.length - 1); return; }
        setModelActive((modelActive + (event.key === 'ArrowDown' ? 1 : -1) + modelMatches.length) % modelMatches.length);
      }
    }
    const field = (label, content, help) => h('div', { className: 'ct-field' }, h('label', { className: 'ct-field-label' }, label, content), help && h('p', { className: 'ct-help' }, help));
    const textInput = (label, key, props = {}) => field(label, h('input', { className: 'ct-setting-input', value: form[key], onChange: e => change(key, e.target.value), autoComplete: 'off', spellCheck: false, ...props }));
    return h('div', { className: 'ct-settings', 'data-ct-ui': '' },
      h('div', { className: 'ct-settings-title' }, h('span', { className: 'ct-brand-icon ct-brand-icon-large' }, h(Icon, { name: 'translate', width: 24, height: 24 })), h('div', null, h('h2', null, '轻译设置'), h('p', { className: 'ct-muted' }, '让语言成为沟通的桥梁。'))),
      h('section', { className: 'ct-settings-card' }, h('h3', null, '翻译语言'), h('p', { className: 'ct-help' }, '选区翻译、输入翻译和回复翻译共用以下语言设置。'),
        h('div', { className: 'ct-settings-languages' }, field('源语言', h(LanguageSelect, { label: '默认源语言', value: form.source, onChange: value => change('source', value) })), h(Icon, { name: 'arrow' }), field('目标语言', h(LanguageSelect, { label: '默认目标语言', value: form.target, target: true, onChange: value => change('target', value) })))),
      h('section', { className: 'ct-settings-card' }, h('h3', null, '翻译引擎'),
        h('div', { className: 'ct-engine-options', role: 'radiogroup', 'aria-label': '翻译引擎' }, [['bing', 'Bing', '必应翻译'], ['google', 'Google', '谷歌翻译'], ['ai', '自定义 AI', '连接你的模型']].map(([id, name, description]) => h('label', { key: id, className: `ct-engine-option${form.engine === id ? ' ct-selected' : ''}` }, h('input', { type: 'radio', name: 'ct-engine', value: id, checked: form.engine === id, onChange: () => change('engine', id) }), h('strong', null, name), h('span', null, description)))),
        form.engine !== 'ai' && h('p', { className: 'ct-help ct-engine-help' }, '使用网页翻译接口，无需 API Key。可用性取决于网络和服务限制；Google 需要可访问其翻译服务的网络。'),
        form.engine === 'ai' && h('div', { className: 'ct-ai-fields' },
          textInput('Base URL', 'baseUrl', { placeholder: 'https://api.example.com/v1' }),
          field('API 协议', h('select', { className: 'ct-setting-input', value: form.protocol, onChange: e => change('protocol', e.target.value) }, h('option', { value: 'responses' }, 'Responses · /responses'), h('option', { value: 'chat' }, 'Chat Completions · /chat/completions'))),
          field('翻译风格', h('select', { className: 'ct-setting-input', value: form.style, onChange: e => change('style', e.target.value) }, STYLES.map(([id, name]) => h('option', { value: id, key: id }, name))), STYLES.find(([id]) => id === form.style)?.[2] || ''),
          h('div', { className: 'ct-key-field' }, textInput('API Key', 'apiKey', { type: showKey ? 'text' : 'password', placeholder: 'sk-…（本地无认证服务可留空）' }), h('button', { className: 'ct-text-btn', type: 'button', onClick: () => setShowKey(!showKey), 'aria-label': showKey ? '隐藏 API Key' : '显示 API Key' }, showKey ? '隐藏' : '显示')),
          h('div', { className: 'ct-model-field' },
            h('div', { className: 'ct-model-heading' },
              h('label', { className: 'ct-field-label', htmlFor: 'ct-model-name' }, '模型名称'),
              h('button', { type: 'button', className: 'ct-text-btn', disabled: busy, onClick: () => void pullModels() }, busy && notice === '正在拉取模型列表…' ? '正在拉取…' : '拉取模型列表')),
            h('div', { className: 'ct-model-combo', ref: modelRef },
              h('input', { id: 'ct-model-name', className: 'ct-setting-input', value: form.model, placeholder: modelOptions.length ? '输入以匹配已拉取的模型，或直接回车使用自定义名称' : '填写模型 ID', autoComplete: 'off', spellCheck: false, role: 'combobox', 'aria-expanded': modelOpen && modelMatches.length > 0, 'aria-controls': 'ct-model-options', 'aria-autocomplete': 'list', 'aria-activedescendant': modelOpen && modelActive >= 0 ? `ct-model-option-${modelActive}` : undefined, onChange: e => { change('model', e.target.value); setModelOpen(modelOptions.length > 0); setModelActive(-1); }, onFocus: () => { if (modelOptions.length) { setModelOpen(true); setModelActive(-1); } }, onBlur: () => setModelActive(-1), onKeyDown: onModelKeyDown }),
              modelOpen && modelMatches.length > 0 && h('ul', { id: 'ct-model-options', className: 'ct-model-options', role: 'listbox', 'aria-label': '已拉取的模型' }, modelMatches.map((id, index) => h('li', { key: id, id: `ct-model-option-${index}`, role: 'option', 'aria-selected': form.model === id, className: `ct-model-option${index === modelActive ? ' ct-active' : ''}`, onMouseEnter: () => setModelActive(index), onMouseDown: event => { event.preventDefault(); pickModel(id); } }, id)))),
            h('p', { className: 'ct-model-status ct-help' }, modelOptions.length ? '输入时会自动匹配已拉取的模型；没有匹配时按回车即使用自定义名称。' : '可先拉取模型列表再从中匹配，也可直接填写自定义模型名称。')),
          h('p', { className: 'ct-help' }, 'API Key 保存在本机插件存储中，非加密保险库。模型列表通过供应商 OpenAI 兼容的 /models 接口拉取。宿主网络权限按主机名精确限制，尚不支持在设置页动态申请新供应商域名。'))),
      (state.storageError || notice) && h('p', { className: 'ct-settings-notice', role: 'status' }, notice || state.storageError),
      h('div', { className: 'ct-settings-actions' }, h('button', { type: 'button', className: 'ct-primary-btn', disabled: busy || !state.ready, onClick: () => void save() }, busy ? '处理中…' : '保存设置'), h('button', { type: 'button', className: 'ct-secondary-btn', disabled: busy || !state.ready, onClick: () => void testConnection() }, '测试连接'), !state.ready && h('button', { type: 'button', className: 'ct-secondary-btn', onClick: () => void model.load() }, '重新读取设置')),
      h('p', { className: 'ct-help ct-settings-note' }, '回复翻译只读取已完成回答中的正文，保留代码块和原文；译文显示在对应回答下方，可点击翻译图标收起或重新显示。切换会话后，未完成的请求会自动丢弃。'));
  }

  function onContextMenu(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target || target.closest('[data-ct-ui], input, textarea, [contenteditable="true"]')) return;
    const root = findConversation(document, target);
    if (!root) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    const inConversation = text && root.contains(selection.anchorNode) && root.contains(selection.focusNode);
    if (!inConversation) return;
    event.preventDefault(); event.stopPropagation();
    model.patch({ menu: { x: event.clientX, y: event.clientY, text } });
  }
  function onPointerDown(event) { if (model.getSnapshot().menu && !event.target?.closest?.('.ct-menu')) model.patch({ menu: null }); }
  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    if (model.getSnapshot().menu) { event.preventDefault(); event.stopPropagation(); model.patch({ menu: null }); }
    else if (model.getSnapshot().panelOpen) { event.preventDefault(); event.stopPropagation(); model.close(); }
  }
  document.addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  // zone 'end' 让入口落在右侧内置集群内部（性能 / 缩放 / 同步 / 版本所在行），
  // 再由 .ct-status 的 flex order 前移到集群最左，紧邻缩放入口左侧。
  ctx.ui.registerStatusBarItem({ key: 'translate', component: StatusBar, zone: 'end', order: 0 });
  ctx.ui.registerOverlay({ key: 'translate', component: Overlay, order: 100 });
  ctx.ui.registerSettingsSection({ label: () => '轻译', icon: props => h(Icon, { ...props, name: 'translate' }), component: Settings });
  return () => {
    disposed = true;
    document.removeEventListener('contextmenu', onContextMenu, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    controller.dispose(); model.dispose(); translator.dispose();
  };
}
