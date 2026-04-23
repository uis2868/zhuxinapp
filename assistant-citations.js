(function () {
  const STATUS_META = {
    verified: { label: 'Verified', className: 'assistant-verification--verified' },
    partial: { label: 'Partial verification', className: 'assistant-verification--partial' },
    unverified: { label: 'Unverified', className: 'assistant-verification--unverified' },
    uncited: { label: 'No citations needed', className: 'assistant-verification--uncited' }
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function dedupeStrings(items) {
    return Array.from(new Set(normalizeArray(items)));
  }

  function buildCitationIndex(citations) {
    return normalizeArray(citations).reduce(function (acc, item, idx) {
      const citation = {
        id: item && item.id ? String(item.id) : 'cit-' + (idx + 1),
        label: Number.isFinite(item && item.label) ? item.label : (idx + 1),
        sourceId: item && item.sourceId ? String(item.sourceId) : '',
        locator: item && item.locator ? String(item.locator) : '',
        quote: item && item.quote ? String(item.quote) : '',
        status: item && item.status ? String(item.status) : 'partial'
      };
      acc[citation.id] = citation;
      return acc;
    }, {});
  }

  function buildSourceIndex(sources) {
    return normalizeArray(sources).reduce(function (acc, item, idx) {
      const source = {
        id: item && item.id ? String(item.id) : 'src-' + (idx + 1),
        title: item && item.title ? String(item.title) : 'Untitled source',
        type: item && item.type ? String(item.type) : 'unknown',
        locator: item && item.locator ? String(item.locator) : '',
        excerpt: item && item.excerpt ? String(item.excerpt) : '',
        status: item && item.status ? String(item.status) : 'partial',
        openable: !!(item && item.openable),
        meta: item && item.meta ? item.meta : {}
      };
      acc[source.id] = source;
      return acc;
    }, {});
  }

  function computeVerification(message) {
    const evidenceMode = message.evidenceMode || 'required';
    const citations = normalizeArray(message.citations);
    const sources = normalizeArray(message.sources);

    if (evidenceMode === 'disabled') {
      return { status: 'uncited', warnings: [] };
    }

    if (!citations.length || !sources.length) {
      return {
        status: evidenceMode === 'optional' ? 'uncited' : 'unverified',
        warnings: evidenceMode === 'optional' ? [] : ['Answer requires citations but no complete citation payload was provided.']
      };
    }

    const sourceIndex = buildSourceIndex(sources);
    const warnings = [];
    let hasPartial = false;
    let hasBroken = false;

    citations.forEach(function (citation) {
      const src = sourceIndex[citation.sourceId];
      if (!src) {
        hasBroken = true;
        warnings.push('Citation ' + citation.id + ' does not map to a source.');
        return;
      }
      if (!citation.locator || !src.locator || !src.excerpt) {
        hasPartial = true;
        warnings.push('Citation ' + citation.id + ' is missing locator or excerpt detail.');
      }
      if (citation.status === 'unverified' || src.status === 'unverified') {
        hasBroken = true;
        warnings.push('Citation ' + citation.id + ' is marked unverified.');
      }
      if (citation.status === 'partial' || src.status === 'partial') {
        hasPartial = true;
      }
    });

    if (hasBroken) return { status: 'unverified', warnings: dedupeStrings(warnings) };
    if (hasPartial) return { status: 'partial', warnings: dedupeStrings(warnings) };
    return { status: 'verified', warnings: [] };
  }

  function normalizeMessage(message) {
    const normalized = Object.assign({}, message || {});
    normalized.citations = normalizeArray(normalized.citations);
    normalized.sources = normalizeArray(normalized.sources);
    normalized.evidenceMode = normalized.evidenceMode || 'required';
    normalized.verification = normalized.verification || computeVerification(normalized);
    return normalized;
  }

  function renderCitationButton(citation) {
    return '<button type="button" class="assistant-citation assistant-citation--' + escapeHtml(citation.status || 'partial') + '" data-citation-id="' + escapeHtml(citation.id) + '" data-source-id="' + escapeHtml(citation.sourceId) + '" aria-label="Open citation ' + escapeHtml(citation.label) + '">[' + escapeHtml(citation.label) + ']</button>';
  }

  function renderContentWithCitations(message) {
    const citationIndex = buildCitationIndex(message.citations || []);
    const raw = String(message.content || message.text || '');
    const safe = escapeHtml(raw).replace(/\n/g, '<br>');
    return safe.replace(/\[\[cite:([a-zA-Z0-9_-]+)\]\]/g, function (_, citationId) {
      const citation = citationIndex[citationId];
      if (!citation) return '<span class="assistant-citation assistant-citation--missing">[?]</span>';
      return renderCitationButton(citation);
    });
  }

  function renderVerificationBadge(message) {
    const verification = message.verification || computeVerification(message);
    const meta = STATUS_META[verification.status] || STATUS_META.partial;
    const warningCount = normalizeArray(verification.warnings).length;
    return '<div class="assistant-verification ' + escapeHtml(meta.className) + '"><span class="assistant-verification__label">' + escapeHtml(meta.label) + '</span>' + (warningCount ? '<span class="assistant-verification__count">' + escapeHtml(warningCount) + ' warning' + (warningCount > 1 ? 's' : '') + '</span>' : '') + '</div>';
  }

  function renderMessageMeta(message) {
    return '<div class="assistant-evidence-bar">' + renderVerificationBadge(message) + '<button type="button" class="assistant-sources-button" data-open-sources="' + escapeHtml(message.id) + '">Sources (' + escapeHtml((message.sources || []).length) + ')</button></div>';
  }

  function renderSourceCard(source, citationsForSource, focusCitationId) {
    const isFocused = citationsForSource.some(function (citation) { return citation.id === focusCitationId; });
    const citationPills = citationsForSource.map(function (citation) {
      return '<span class="assistant-source-card__citation-pill assistant-source-card__citation-pill--' + escapeHtml(citation.status || 'partial') + '">[' + escapeHtml(citation.label) + ']</span>';
    }).join('');
    return '<article class="assistant-source-card' + (isFocused ? ' assistant-source-card--focused' : '') + '" data-source-card="' + escapeHtml(source.id) + '"><header class="assistant-source-card__header"><div class="assistant-source-card__title-row"><h4 class="assistant-source-card__title">' + escapeHtml(source.title) + '</h4><span class="assistant-source-card__type">' + escapeHtml(String(source.type || 'unknown').toUpperCase()) + '</span></div><div class="assistant-source-card__locator">' + escapeHtml(source.locator || 'Locator unavailable') + '</div></header><div class="assistant-source-card__excerpt">' + escapeHtml(source.excerpt || 'No excerpt available.') + '</div><div class="assistant-source-card__footer"><div class="assistant-source-card__citations">' + citationPills + '</div><div class="assistant-source-card__status assistant-source-card__status--' + escapeHtml(source.status || 'partial') + '">' + escapeHtml(source.status || 'partial') + '</div></div></article>';
  }

  function buildDrawerHtml(message, focusCitationId) {
    const sourceIndex = buildSourceIndex(message.sources || []);
    const citations = normalizeArray(message.citations || []);
    const grouped = {};
    citations.forEach(function (citation) {
      if (!grouped[citation.sourceId]) grouped[citation.sourceId] = [];
      grouped[citation.sourceId].push(citation);
    });
    const cardsHtml = Object.keys(sourceIndex).map(function (sourceId) {
      return renderSourceCard(sourceIndex[sourceId], grouped[sourceId] || [], focusCitationId);
    }).join('');
    const warnings = normalizeArray(message.verification && message.verification.warnings);
    const warningHtml = warnings.length ? '<div class="assistant-source-drawer__warnings">' + warnings.map(function (item) { return '<div class="assistant-source-drawer__warning">' + escapeHtml(item) + '</div>'; }).join('') + '</div>' : '';
    return '<div class="assistant-source-drawer__summary-inner">' + renderVerificationBadge(message) + '<div class="assistant-source-drawer__summary-text">' + escapeHtml((message.sources || []).length) + ' source' + ((message.sources || []).length === 1 ? '' : 's') + ' linked to this answer</div></div>' + warningHtml + '<div class="assistant-source-drawer__cards">' + cardsHtml + '</div>';
  }

  function ensureDrawer() {
    if (document.getElementById('assistant-source-drawer')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<div id="assistant-source-drawer" class="assistant-source-drawer" aria-hidden="true"><div class="assistant-source-drawer__backdrop" data-close-source-drawer></div><aside class="assistant-source-drawer__panel" aria-label="Answer sources"><div class="assistant-source-drawer__header"><strong>Sources & verification</strong><button id="assistant-source-drawer-close" type="button" aria-label="Close sources">✕</button></div><div class="assistant-source-drawer__body"><div id="assistant-source-drawer-summary"></div><div id="assistant-source-drawer-list"></div></div></aside></div>';
    document.body.appendChild(wrapper.firstChild);
  }

  function ensureStyles() {
    if (document.getElementById('assistant-citations-styles')) return;
    const style = document.createElement('style');
    style.id = 'assistant-citations-styles';
    style.textContent = '.assistant-evidence-bar{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}.assistant-citation{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:24px;margin-left:4px;padding:0 8px;border:1px solid #d0d7de;border-radius:999px;background:#fff;font-size:12px;line-height:1;cursor:pointer;vertical-align:middle}.assistant-citation--verified{border-color:#1a7f37}.assistant-citation--partial{border-color:#9a6700}.assistant-citation--unverified,.assistant-citation--missing{border-color:#cf222e}.assistant-verification{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;font-size:12px;border:1px solid transparent}.assistant-verification--verified{color:#1a7f37;border-color:rgba(26,127,55,.25);background:rgba(26,127,55,.08)}.assistant-verification--partial{color:#9a6700;border-color:rgba(154,103,0,.25);background:rgba(154,103,0,.08)}.assistant-verification--unverified{color:#cf222e;border-color:rgba(207,34,46,.25);background:rgba(207,34,46,.08)}.assistant-verification--uncited{color:#57606a;border-color:rgba(87,96,106,.2);background:rgba(87,96,106,.06)}.assistant-sources-button{height:32px;padding:0 12px;border-radius:8px;border:1px solid #d0d7de;background:#fff;cursor:pointer;font-size:12px}.assistant-source-drawer{position:fixed;inset:0;display:none;z-index:5000}.assistant-source-drawer--open{display:block}.assistant-source-drawer__backdrop{position:absolute;inset:0;background:rgba(15,23,42,.35)}.assistant-source-drawer__panel{position:absolute;top:0;right:0;width:min(460px,100vw);height:100%;background:#fff;box-shadow:-8px 0 24px rgba(0,0,0,.12);display:flex;flex-direction:column}.assistant-source-drawer__header{display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #eaeef2}.assistant-source-drawer__body{padding:16px;overflow:auto}.assistant-source-drawer__warnings{display:grid;gap:8px;margin:12px 0}.assistant-source-drawer__warning{padding:10px 12px;border-radius:8px;background:#fff8c5;color:#6e4e00;font-size:12px}.assistant-source-card{border:1px solid #eaeef2;border-radius:12px;padding:14px;margin-bottom:12px;background:#fff}.assistant-source-card--focused{border-color:#218bff;box-shadow:0 0 0 3px rgba(33,139,255,.12)}.assistant-source-card__title-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.assistant-source-card__title{margin:0;font-size:14px;font-weight:600}.assistant-source-card__type,.assistant-source-card__locator,.assistant-source-card__status{font-size:12px;color:#57606a}.assistant-source-card__excerpt{margin-top:10px;font-size:13px;line-height:1.5;color:#24292f}.assistant-source-card__footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px}.assistant-source-card__citations{display:flex;gap:6px;flex-wrap:wrap}.assistant-source-card__citation-pill{display:inline-flex;align-items:center;justify-content:center;padding:4px 8px;border-radius:999px;font-size:11px;background:#f6f8fa}@media(max-width:640px){.assistant-source-drawer__panel{width:100vw}}';
    document.head.appendChild(style);
  }

  function openSourceDrawer(message, focusCitationId) {
    ensureDrawer();
    const drawer = document.getElementById('assistant-source-drawer');
    const list = document.getElementById('assistant-source-drawer-list');
    if (!drawer || !list) return;
    const normalized = normalizeMessage(message);
    list.innerHTML = buildDrawerHtml(normalized, focusCitationId);
    drawer.setAttribute('aria-hidden', 'false');
    drawer.classList.add('assistant-source-drawer--open');
    const target = focusCitationId ? list.querySelector('.assistant-source-card--focused') : list.querySelector('.assistant-source-card');
    if (target && target.scrollIntoView) target.scrollIntoView({ block: 'nearest' });
  }

  function closeSourceDrawer() {
    const drawer = document.getElementById('assistant-source-drawer');
    if (!drawer) return;
    drawer.classList.remove('assistant-source-drawer--open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function getThreadMessages() {
    if (window.ZhuxinAssistantThreads && typeof window.ZhuxinAssistantThreads.getActiveThread === 'function') {
      const thread = window.ZhuxinAssistantThreads.getActiveThread();
      return thread ? (thread.turns || thread.messages || []) : [];
    }
    if (window.ZhuxinApp && window.ZhuxinApp.state && window.ZhuxinApp.state.assistant && Array.isArray(window.ZhuxinApp.state.assistant.threads)) {
      const assistant = window.ZhuxinApp.state.assistant;
      const thread = assistant.threads.find(function (t) { return t.id === assistant.activeThreadId; });
      return thread ? (thread.turns || thread.messages || []) : [];
    }
    return [];
  }

  function getMessageById(messageId) {
    return getThreadMessages().find(function (msg) { return msg && msg.id === messageId; }) || null;
  }

  function attachCitationEvents(rootEl) {
    if (!rootEl || rootEl.__zhuxinCitationsBound) return;
    rootEl.__zhuxinCitationsBound = true;
    rootEl.addEventListener('click', function (event) {
      const citationBtn = event.target.closest('[data-citation-id]');
      if (citationBtn) {
        const messageEl = event.target.closest('[data-message-id],[data-turn-id]');
        if (!messageEl) return;
        const message = getMessageById(messageEl.getAttribute('data-message-id') || messageEl.getAttribute('data-turn-id'));
        if (!message) return;
        openSourceDrawer(message, citationBtn.getAttribute('data-citation-id'));
        return;
      }
      const sourcesBtn = event.target.closest('[data-open-sources]');
      if (sourcesBtn) {
        const message = getMessageById(sourcesBtn.getAttribute('data-open-sources'));
        if (!message) return;
        openSourceDrawer(message, null);
        return;
      }
    });

    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-close-source-drawer]') || event.target.closest('#assistant-source-drawer-close')) {
        closeSourceDrawer();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeSourceDrawer();
    });
  }

  function init() {
    ensureStyles();
    ensureDrawer();
    const root = document.getElementById('assistant-message-list') || document.getElementById('messages') || document.body;
    attachCitationEvents(root);
  }

  window.ZhuxinCitations = {
    normalizeMessage: normalizeMessage,
    computeVerification: computeVerification,
    renderContentWithCitations: renderContentWithCitations,
    renderMessageMeta: renderMessageMeta,
    openSourceDrawer: openSourceDrawer,
    closeSourceDrawer: closeSourceDrawer,
    attachCitationEvents: attachCitationEvents,
    init: init
  };

  document.addEventListener('DOMContentLoaded', init);
})();