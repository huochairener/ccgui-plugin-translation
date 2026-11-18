import { DEFAULTS, normalizeSettings } from './core.js';

export function createModel(ctx, translator, { debounce = 600 } = {}) {
  let snapshot = { ready: false, settings: { ...DEFAULTS }, panelOpen: false, input: '', output: '', detected: null, passthrough: false, pending: false, error: '', storageError: '', menu: null, reply: null };
  const listeners = new Set();
  let generation = 0, timer, disposed = false, saveChain = Promise.resolve();
  function patch(value) { if (!disposed) { snapshot = { ...snapshot, ...value }; for (const listener of listeners) listener(); } }
  function cancel() { generation++; clearTimeout(timer); }
  function schedule(immediate = false) {
    cancel();
    const run = generation;
    if (!snapshot.ready || !snapshot.panelOpen || !snapshot.input.trim()) { patch({ pending: false }); return; }
    const text = snapshot.input, settings = { ...snapshot.settings };
    patch({ pending: true, output: '', error: '', detected: null, passthrough: false });
    timer = setTimeout(async () => {
      try {
        const result = await translator.translate(text, settings, { isCancelled: () => disposed || run !== generation });
        if (!disposed && run === generation) patch({ output: result.text, detected: result.detected, passthrough: Boolean(result.passthrough), pending: false });
      } catch (error) {
        if (!disposed && run === generation && error.name !== 'AbortError') patch({ error: error.message, pending: false });
      }
    }, immediate ? 0 : debounce);
  }
  const model = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    patch,
    async load() {
      try { const saved = await ctx.storage.get('settings'); patch({ settings: normalizeSettings(saved), ready: true, storageError: '' }); if (snapshot.panelOpen) schedule(); }
      catch { patch({ ready: false, storageError: '无法读取翻译设置，请重试后再翻译。' }); }
    },
    open(text) { patch({ panelOpen: true, menu: null, ...(typeof text === 'string' ? { input: text, output: '', error: '' } : {}) }); if (!snapshot.output || typeof text === 'string') schedule(typeof text === 'string'); },
    close() { cancel(); patch({ panelOpen: false, pending: false }); },
    setInput(input) { patch({ input, output: '', error: '', detected: null, passthrough: false }); schedule(); },
    translateNow() { schedule(true); },
    async updateSettings(partial) {
      const settings = normalizeSettings({ ...snapshot.settings, ...partial });
      translator.clear();
      patch({ settings, storageError: '' }); schedule();
      const save = saveChain.catch(() => {}).then(() => ctx.storage.set('settings', settings));
      saveChain = save;
      try { await save; patch({ storageError: '' }); }
      catch { patch({ storageError: '设置保存失败，本次修改仅在当前运行中生效。请重试保存。' }); throw new Error('设置保存失败，请重试。'); }
    },
    async swap() {
      const { source, target } = snapshot.settings;
      const nextTarget = source === 'auto' ? (snapshot.detected || (target === 'en' ? 'zh-Hans' : 'en')) : source;
      const output = snapshot.output;
      patch({ input: output || snapshot.input, output: '', detected: null });
      await model.updateSettings({ source: target, target: nextTarget });
    },
    dispose() { disposed = true; cancel(); listeners.clear(); },
  };
  return model;
}
