// Explicitly authorized compatibility layer for CC GUI SDK 0.3.25.
// Reads rendered prose and mounts a translate action beside the host's copy
// and fork controls. The host redraws those controls, so the button and the
// translation card are reattached without sending the reply again. Never reads
// React internals or changes the host's original message text.
//
// Code, file paths and identifiers are swapped for numbered placeholders before
// the request, so the engine translates prose only and their text never leaves
// the machine. The placeholders are put back in place when the translation is
// shown; dropping them would silently delete the names from the translation.
function isVisible(document, element) {
  if (!element?.isConnected || !element.getClientRects().length || element.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = document.defaultView.getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

export function sessionKey(document) {
  return document.querySelector('[role="tab"][aria-selected="true"]')?.closest('[data-tab-key]')?.getAttribute('data-tab-key') || null;
}

export function findConversation(document, target) {
  const candidates = [...document.querySelectorAll('#center-tabpanel [data-virtual-inner]')]
    .map(inner => inner.parentElement).filter(root => isVisible(document, root));
  if (target) return candidates.find(root => root.contains(target)) || null;
  if (candidates.length === 1) return candidates[0];
  // Split views have one visible header with the host's focus border. Never
  // guess which pane is active; the user must target a visible conversation.
  return candidates.find(root => root.closest('[data-split-pane]')?.querySelector(':scope > .border-border-focus-ring')) || null;
}

// Code and markup never reach the engine and are never rendered into the card.
// Code is not dropped, however: it becomes a placeholder so its exact position
// inside the sentence survives the round trip.
const CODE_TAGS = 'pre, code, kbd, samp';
const DROPPED_TAGS = 'script, style, button, svg, math, .katex, [data-ct-translation], [aria-hidden="true"]';

function readNodes(node, parts, placeholder) {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.nodeType !== 1) return '';
  if (node.matches(DROPPED_TAGS)) return '';
  if (node.matches(CODE_TAGS)) {
    if (!placeholder) return node.textContent;
    parts.push(node.textContent);
    return `[[${parts.length}]]`;
  }
  if (node.tagName === 'BR') return '\n';
  const body = [...node.childNodes].map(child => readNodes(child, parts, placeholder)).join('');
  return /^(P|DIV|LI|TR|H[1-6]|BLOCKQUOTE)$/.test(node.tagName) ? `${body}\n` : node.tagName === 'TD' || node.tagName === 'TH' ? `${body}\t` : body;
}

const tidy = value => value.replace(/\n{3,}/g, '\n\n').trim();
const proseBlocks = row => (!row || row.querySelector('.bg-bubble-user') ? [] : [...row.querySelectorAll('.prose-chat')]);

// The reply exactly as the user sees it, code included. This is the identity of
// the reply: it keys the cache and tells a stale translation from a live one.
export function readCurrentAssistantReply(row) {
  return proseBlocks(row).map(block => tidy(readNodes(block, [], false))).filter(Boolean).join('\n\n');
}

// `request` is what the engine receives: the same prose with every code span
// replaced by a placeholder. `parts` holds the original code in placeholder order.
export function readTranslationSource(row) {
  const parts = [];
  const request = proseBlocks(row).map(block => tidy(readNodes(block, parts, true))).filter(Boolean).join('\n\n');
  return { source: readCurrentAssistantReply(row), request, parts };
}

// Engines and models are told to copy placeholders verbatim, but a stray space
// or a full-width bracket is common enough to accept either form.
const PLACEHOLDER = /[\[\uFF3B]\s*[\[\uFF3B]\s*(\d+)\s*[\]\uFF3D]\s*[\]\uFF3D]/g;

// Code must never disappear from a translation: anything the model dropped is
// appended rather than lost.
export function restoreCodeSpans(text, parts = []) {
  if (typeof text !== 'string') return text;
  const used = new Set();
  const restored = text.replace(PLACEHOLDER, (match, index) => {
    const value = parts[Number(index) - 1];
    if (typeof value !== 'string') return match;
    used.add(Number(index));
    return value;
  });
  const missing = parts.filter((value, index) => !used.has(index + 1));
  return missing.length ? `${restored}\n\n${missing.join('\n\n')}` : restored;
}

const languageNames = { en: '英语', 'zh-Hans': '简体中文', 'zh-Hant': '繁体中文', ja: '日语', ko: '韩语', fr: '法语', de: '德语', es: '西班牙语', ru: '俄语' };
const labelLanguage = value => languageNames[value] || value || '目标语言';

export function createReplyTranslationController({ document, translator, getSettings, onChange = () => {} }) {
  let disposed = false, timer = null, runId = 0;
  const cache = new Map(), inflight = new Map(), failures = new Map();
  const notify = state => { if (!disposed) onChange(state); };
  const currentSession = () => sessionKey(document) || 'active';
  const cacheKey = (session, source) => `${session}\u0000${source}`;

  function contextFromFork(fork) {
    const row = fork.closest('[data-virtual-inner] > [data-index]');
    const root = row?.closest('[data-virtual-inner]')?.parentElement;
    const toolbar = fork.parentElement;
    const copy = toolbar?.querySelector(':scope > .message-copy-btn');
    const prose = row?.querySelector('.prose-chat');
    if (!row || !root || !toolbar || !copy || !prose || !isVisible(document, root)) return null;
    return { row, root, toolbar, copy, fork, prose, ...readTranslationSource(row) };
  }

  function contextFromButton(button) {
    const fork = button.parentElement?.querySelector(':scope > .message-fork-btn');
    return fork ? contextFromFork(fork) : null;
  }

  function setButton(button, { busy = false, translated = false, hidden = false } = {}) {
    const label = translated ? (hidden ? '显示当前回复译文' : '隐藏当前回复译文') : busy ? '正在翻译当前回复' : '翻译当前回复';
    if (button.disabled !== busy) button.disabled = busy;
    if (button.hidden) button.hidden = false;
    if (button.getAttribute('aria-busy') !== String(busy)) button.setAttribute('aria-busy', String(busy));
    const expanded = String(translated && !hidden);
    if (button.getAttribute('aria-expanded') !== expanded) button.setAttribute('aria-expanded', expanded);
    if (button.getAttribute('aria-label') !== label) { button.setAttribute('aria-label', label); button.title = label; }
  }

  function makeButton(copy) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'message-action-btn ct-reply-translate-btn';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('width', '14'); icon.setAttribute('height', '14'); icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '1.75');
    icon.setAttribute('stroke-linecap', 'round'); icon.setAttribute('stroke-linejoin', 'round'); icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 5h10M9 3v2M6 5c.5 4 3 6 6 7m-2-7c-.5 4-2 7-5 9m7 2 2-4 2 4m-3.2-1h2.4');
    icon.append(path); button.append(icon);
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); void onClick(button); });
    setButton(button);
    copy.after(button);
    return button;
  }

  function ensureButton(copy) {
    const toolbar = copy.parentElement;
    let button = toolbar?.querySelector(':scope > .ct-reply-translate-btn');
    if (!button) button = makeButton(copy);
    else if (button.previousElementSibling !== copy) copy.after(button);
    return button;
  }

  function findCard(prose) {
    return prose.parentElement?.querySelector(':scope > [data-ct-translation]') || null;
  }

  function mountCard(prose, source, mode) {
    let card = findCard(prose);
    if (!card) {
      card = document.createElement('aside');
      card.className = 'ct-inline-translation';
      card.setAttribute('data-ct-translation', '');
      prose.after(card);
    }
    card.ctSource = source;
    card.ctMode = mode;
    card.hidden = false;
    card.classList.toggle('ct-inline-error', mode === 'error');
    return card;
  }

  function removeCard(prose) { findCard(prose)?.remove(); }

  function paintPending(ctx, entry) {
    const button = ensureButton(ctx.copy);
    const card = findCard(ctx.prose);
    if (card?.ctMode === 'pending' && card.ctSource === ctx.source && card.isConnected) { setButton(button, { busy: true }); return; }
    const next = mountCard(ctx.prose, ctx.source, 'pending');
    next.replaceChildren();
    next.setAttribute('aria-label', '正在翻译');
    const body = document.createElement('div'); body.className = 'ct-inline-body'; body.textContent = '正在翻译…';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'ct-text-btn ct-reply-cancel'; cancel.textContent = '停止';
    cancel.setAttribute('aria-label', '停止翻译当前回复');
    cancel.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const key = cacheKey(entry.session, ctx.source);
      if (inflight.get(key)?.run !== entry.run) return;
      inflight.delete(key);
      removeCard(ctx.prose);
      const live = contextFromFork(ctx.fork);
      if (live?.copy && !live.copy.disabled) setButton(ensureButton(live.copy));
      notify({ kind: 'cancelled', message: '已停止翻译。' });
    });
    next.append(body, cancel);
    setButton(button, { busy: true });
  }

  function paintError(ctx, message) {
    const button = ensureButton(ctx.copy);
    const card = findCard(ctx.prose);
    if (card?.ctMode === 'error' && card.ctSource === ctx.source && card.querySelector('.ct-inline-body')?.textContent === message) {
      setButton(button); return;
    }
    const next = mountCard(ctx.prose, ctx.source, 'error');
    next.replaceChildren();
    next.setAttribute('aria-label', '翻译失败');
    const body = document.createElement('div'); body.className = 'ct-inline-body'; body.textContent = message;
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'ct-text-btn'; retry.textContent = '重试';
    retry.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const live = contextFromFork(ctx.fork);
      if (!live?.source) return;
      failures.delete(cacheKey(currentSession(), live.source));
      removeCard(live.prose);
      void startTranslation(live);
    });
    next.append(body, retry);
    setButton(button);
  }

  function paintResult(ctx, cached) {
    const button = ensureButton(ctx.copy);
    if (cached.hidden) {
      const card = findCard(ctx.prose);
      if (card) card.hidden = true;
      setButton(button, { translated: true, hidden: true });
      return;
    }
    const card = findCard(ctx.prose);
    if (card?.ctMode === 'result' && card.ctSource === cached.source && !card.hidden && card.querySelector('.ct-inline-body')?.textContent === cached.text) {
      setButton(button, { translated: true }); return;
    }
    const next = mountCard(ctx.prose, cached.source, 'result');
    const label = `${labelLanguage(cached.target)}译文`;
    next.setAttribute('aria-label', label);
    const heading = document.createElement('div'); heading.className = 'ct-inline-label'; heading.textContent = label;
    const body = document.createElement('div'); body.className = 'ct-inline-body'; body.textContent = cached.text;
    next.replaceChildren(heading, body);
    setButton(button, { translated: true });
  }

  function remember(key, value) {
    cache.set(key, value);
    if (cache.size > 80) cache.delete(cache.keys().next().value);
  }

  async function startTranslation(ctx) {
    const session = currentSession();
    const key = cacheKey(session, ctx.source);
    if (disposed || !ctx.source || inflight.has(key) || cache.has(key)) return;
    failures.delete(key);
    const settings = { ...getSettings() };
    const run = ++runId;
    const entry = { run, source: ctx.source, session, target: settings.target };
    inflight.set(key, entry);
    paintPending(ctx, entry);
    notify({ kind: 'pending', message: '正在翻译当前回复…' });
    try {
      const result = await translator.translate(ctx.request, settings, { isCancelled: () => disposed || inflight.get(key)?.run !== run });
      if (disposed || inflight.get(key)?.run !== run) return;
      inflight.delete(key);
      if (currentSession() !== session) { removeCard(ctx.prose); return; }
      const value = { source: ctx.source, text: restoreCodeSpans(result.text, ctx.parts), target: settings.target, hidden: false };
      remember(key, value);
      const live = contextFromFork(ctx.fork);
      if (live?.source === ctx.source) paintResult(live, value);
      else if (live) removeCard(live.prose);
      notify({ kind: 'done', message: '回复已翻译。' });
    } catch (error) {
      if (disposed || inflight.get(key)?.run !== run || error?.name === 'AbortError') return;
      inflight.delete(key);
      if (currentSession() !== session) return;
      const live = contextFromFork(ctx.fork);
      if (!live || live.source !== ctx.source) return;
      failures.set(key, error.message);
      paintError(live, error.message);
      notify({ kind: 'error', message: error.message });
    }
  }

  function onClick(button) {
    const ctx = contextFromButton(button);
    if (!ctx || ctx.copy.disabled) return;
    if (!ctx.source || !ctx.request) { notify({ kind: 'error', message: '当前回复暂无可翻译的正文。' }); return; }
    const key = cacheKey(currentSession(), ctx.source);
    const cached = cache.get(key);
    if (cached) { cached.hidden = !cached.hidden; paintResult(ctx, cached); return; }
    if (inflight.has(key)) return;
    void startTranslation(ctx);
  }

  function scan() {
    if (disposed) return;
    const session = currentSession();
    for (const [key, entry] of inflight) if (entry.session !== session) inflight.delete(key);
    const seen = new Set();
    for (const fork of document.querySelectorAll('#center-tabpanel .message-fork-btn')) {
      const ctx = contextFromFork(fork);
      if (!ctx) continue;
      seen.add(ctx.toolbar);
      if (!ctx.source || ctx.copy.disabled) {
        ctx.toolbar.querySelector(':scope > .ct-reply-translate-btn')?.remove();
        removeCard(ctx.prose);
        continue;
      }
      const key = cacheKey(session, ctx.source);
      const cached = cache.get(key);
      const pending = inflight.get(key);
      const failure = failures.get(key);
      if (pending?.source === ctx.source) paintPending(ctx, pending);
      else if (cached?.source === ctx.source) paintResult(ctx, cached);
      else if (failure) paintError(ctx, failure);
      else {
        const card = findCard(ctx.prose);
        if (card && card.ctSource !== ctx.source) removeCard(ctx.prose);
        else if (card && !cached && !pending && !failure) removeCard(ctx.prose);
        setButton(ensureButton(ctx.copy));
      }
    }
    for (const button of document.querySelectorAll('.ct-reply-translate-btn')) {
      if (!seen.has(button.parentElement)) button.remove();
    }
    for (const card of document.querySelectorAll('[data-ct-translation]')) {
      const row = card.closest('[data-virtual-inner] > [data-index]');
      const source = readCurrentAssistantReply(row);
      const key = source ? cacheKey(session, source) : '';
      if (!key || (!cache.has(key) && !inflight.has(key) && !failures.has(key))) card.remove();
    }
  }

  const schedule = () => { if (timer || disposed) return; timer = setTimeout(() => { timer = null; scan(); }, 100); };
  const observer = new document.defaultView.MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'aria-selected', 'data-tab-key', 'class', 'data-index', 'hidden', 'aria-hidden'] });
  scan();

  return {
    scan,
    clearTranslations() {
      cache.clear(); inflight.clear(); failures.clear(); runId++;
      for (const card of document.querySelectorAll('[data-ct-translation]')) card.remove();
      for (const button of document.querySelectorAll('.ct-reply-translate-btn')) setButton(button);
      notify({ kind: 'cleared', message: '语言设置已更改，请重新翻译。' });
    },
    dispose() {
      disposed = true; runId++; observer.disconnect(); clearTimeout(timer);
      cache.clear(); inflight.clear(); failures.clear();
      for (const node of document.querySelectorAll('.ct-reply-translate-btn, [data-ct-translation]')) node.remove();
    },
  };
}
