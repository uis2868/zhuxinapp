(function () {
  const CFG = Object.assign(
    {
      storageKey: "zhuxin.assistant.threads.v1",
      activeThreadKey: "zhuxin.assistant.activeThreadId.v1",
      maxThreads: 200,
      maxModelTurns: 20
    },
    (window.ZHUXIN_CONFIG && window.ZHUXIN_CONFIG.assistantThreads) || {}
  );

  const ui = {};
  const state = load();

  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function safeText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (value.content) return safeText(value.content);
    if (value.text) return safeText(value.text);
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  function esc(value) {
    return safeText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cleanText(value) {
    return safeText(value).trim();
  }

  function truncate(value, max) {
    const text = cleanText(value).replace(/\s+/g, " ");
    if (!text) return "";
    return text.length <= max ? text : text.slice(0, max - 1).trim() + "…";
  }

  function deriveTitle(value) {
    return truncate(value, 80) || "New thread";
  }

  function hydrateTurn(turn) {
    turn = turn || {};
    const text = safeText(turn.text || turn.content || "");

    return {
      id: turn.id || uid("turn"),
      role: turn.role || "assistant",
      text: text,
      content: text,
      status: turn.status || "done",
      createdAt: turn.createdAt || nowIso(),
      meta: turn.meta || turn.metadata || {},
      type: turn.type || null,
      kind: turn.kind || null,
      payload: turn.payload || null,
      citations: Array.isArray(turn.citations) ? turn.citations : [],
      sources: Array.isArray(turn.sources) ? turn.sources : [],
      verification: turn.verification || null,
      deepAnalysisMeta: turn.deepAnalysisMeta || null,
      groundedQa: turn.groundedQa || null
    };
  }

  function hydrateThread(thread) {
    thread = thread || {};
    const turns = Array.isArray(thread.turns) ? thread.turns.map(hydrateTurn) : [];
    const lastTurn = turns.length ? turns[turns.length - 1] : null;

    return {
      id: thread.id || uid("thread"),
      title: thread.title || "New thread",
      matterId: thread.matterId || "",
      matterLabel: thread.matterLabel || "",
      pinned: !!thread.pinned,
      archived: !!thread.archived,
      isDraft: !!thread.isDraft,
      createdAt: thread.createdAt || nowIso(),
      updatedAt: thread.updatedAt || thread.createdAt || nowIso(),
      lastPreview: thread.lastPreview || (lastTurn ? truncate(lastTurn.text, 140) : ""),
      turns: turns,
      assistantReuse: thread.assistantReuse || null,
      languageUnderstanding: thread.languageUnderstanding || null,
      collaboration: thread.collaboration || null
    };
  }

  function load() {
    let threads = [];
    let activeThreadId = "";

    try {
      const raw = localStorage.getItem(CFG.storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      threads = Array.isArray(parsed) ? parsed.map(hydrateThread) : [];
    } catch {
      threads = [];
    }

    try {
      activeThreadId = localStorage.getItem(CFG.activeThreadKey) || "";
    } catch {
      activeThreadId = "";
    }

    return {
      threads: threads,
      activeThreadId: activeThreadId
    };
  }

  function save() {
    pruneThreads();
    localStorage.setItem(CFG.storageKey, JSON.stringify(state.threads));
    localStorage.setItem(CFG.activeThreadKey, state.activeThreadId || "");
  }

  function pruneThreads() {
    state.threads = state.threads
      .filter(function (thread) {
        const hasTurns = Array.isArray(thread.turns) && thread.turns.length > 0;
        return thread.id === state.activeThreadId || thread.pinned || thread.archived || !thread.isDraft || hasTurns;
      })
      .slice(0, CFG.maxThreads);
  }

  function sortThreads(list) {
    return list.slice().sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  function getThread(threadId) {
    return state.threads.find(function (thread) {
      return thread.id === threadId;
    }) || null;
  }

  function getActiveThread() {
    return getThread(state.activeThreadId);
  }

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function emitThreadChanged(thread) {
    emit("zhuxin:thread-changed", {
      threadId: thread ? thread.id : null,
      thread: thread || null
    });

    if (
      window.ZhuxinApp &&
      window.ZhuxinApp.AssistantCollaboration &&
      typeof window.ZhuxinApp.AssistantCollaboration.onThreadActivated === "function" &&
      thread
    ) {
      window.ZhuxinApp.AssistantCollaboration.onThreadActivated(thread.id);
    }

    if (
      window.AssistantReuseLibrary &&
      typeof window.AssistantReuseLibrary.restoreThreadState === "function" &&
      thread &&
      thread.assistantReuse
    ) {
      window.AssistantReuseLibrary.restoreThreadState(thread.assistantReuse);
    }
  }

  function getMatterOptions() {
    if (typeof ui.getMatterOptions === "function") {
      return ui.getMatterOptions() || [];
    }
    return [];
  }

  function normalizeMatterOption(item) {
    if (!item) return null;
    return {
      id: item.id || item.matterId || "",
      label: item.label || item.name || item.title || ""
    };
  }

  function findMatterLabel(matterId) {
    if (!matterId) return "";
    const found = getMatterOptions()
      .map(normalizeMatterOption)
      .filter(Boolean)
      .find(function (item) {
        return item.id === matterId;
      });
    return found ? found.label : "";
  }

  function createThread(options) {
    options = options || {};

    const thread = hydrateThread({
      id: uid("thread"),
      title: options.title || "New thread",
      matterId: options.matterId || "",
      matterLabel: options.matterLabel || "",
      pinned: false,
      archived: false,
      isDraft: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastPreview: "",
      turns: []
    });

    state.threads.unshift(thread);
    state.activeThreadId = thread.id;
    save();
    renderAll();
    emit("zhuxin:assistant-thread-created", { thread: thread });
    emitThreadChanged(thread);
    return thread;
  }

  function ensureThreadForPrompt(promptText, matterMeta) {
    let thread = getActiveThread();

    if (!thread || thread.archived) {
      thread = createThread({
        title: deriveTitle(promptText),
        matterId: matterMeta && matterMeta.id ? matterMeta.id : "",
        matterLabel: matterMeta && matterMeta.label ? matterMeta.label : ""
      });
    }

    if (thread.isDraft && (!thread.title || thread.title === "New thread")) {
      thread.title = deriveTitle(promptText);
    }

    if (matterMeta && matterMeta.id && !thread.matterId) {
      thread.matterId = matterMeta.id;
      thread.matterLabel = matterMeta.label || findMatterLabel(matterMeta.id);
    }

    if (window.AssistantReuseLibrary && typeof window.AssistantReuseLibrary.getThreadState === "function") {
      thread.assistantReuse = window.AssistantReuseLibrary.getThreadState();
    }

    thread.updatedAt = nowIso();
    save();
    renderAll();
    return thread;
  }

  function appendTurn(threadId, payload) {
    const thread = getThread(threadId);
    if (!thread) return null;

    payload = payload || {};
    const text = safeText(payload.text || payload.content || "");

    const turn = hydrateTurn({
      id: uid("turn"),
      role: payload.role || "assistant",
      text: text,
      status: payload.status || "done",
      createdAt: nowIso(),
      meta: payload.meta || payload.metadata || {},
      type: payload.type || null,
      kind: payload.kind || null,
      payload: payload.payload || null,
      citations: payload.citations || [],
      sources: payload.sources || [],
      verification: payload.verification || null,
      deepAnalysisMeta: payload.deepAnalysisMeta || null,
      groundedQa: payload.groundedQa || null
    });

    thread.turns.push(turn);
    thread.isDraft = false;
    thread.updatedAt = nowIso();
    thread.lastPreview = truncate(text, 140);

    if (window.AssistantReuseLibrary && typeof window.AssistantReuseLibrary.getThreadState === "function") {
      thread.assistantReuse = window.AssistantReuseLibrary.getThreadState();
    }

    save();
    renderAll();
    emit("zhuxin:assistant-thread-updated", { thread: thread, turn: turn });
    return turn;
  }

  function patchTurnText(threadId, turnId, text, options) {
    const thread = getThread(threadId);
    if (!thread) return;

    const turn = (thread.turns || []).find(function (item) {
      return item.id === turnId;
    });
    if (!turn) return;

    options = options || {};
    const nextText = safeText(text);

    turn.text = options.append ? safeText(turn.text) + nextText : nextText;
    turn.content = turn.text;

    if (options.status) turn.status = options.status;

    if (options.meta) {
      turn.meta = Object.assign({}, turn.meta || {}, options.meta);

      if (options.meta.normalizedResponse) {
        const response = options.meta.normalizedResponse;
        turn.type = response.type || turn.type;
        turn.kind = response.kind || turn.kind;
        turn.payload = response.payload || turn.payload;
        turn.citations = Array.isArray(response.citations) ? response.citations : turn.citations;
        turn.sources = Array.isArray(response.sources) ? response.sources : turn.sources;
        turn.verification = response.verification || turn.verification;
        turn.deepAnalysisMeta = response.deepAnalysisMeta || turn.deepAnalysisMeta;
        turn.groundedQa = response.groundedQa || turn.groundedQa;
      }
    }

    thread.updatedAt = nowIso();
    thread.lastPreview = truncate(turn.text, 140);

    save();
    renderAll();
    emit("zhuxin:assistant-thread-updated", { thread: thread, turn: turn });
  }

  function renameThread(threadId, nextTitle) {
    const thread = getThread(threadId);
    if (!thread) return;

    const title = truncate(nextTitle, 80);
    if (!title) return;

    thread.title = title;
    thread.updatedAt = nowIso();
    save();
    renderAll();
  }

  function archiveThread(threadId) {
    const thread = getThread(threadId);
    if (!thread) return;

    thread.archived = true;
    thread.updatedAt = nowIso();

    if (state.activeThreadId === threadId) {
      const replacement = sortThreads(state.threads.filter(function (item) {
        return !item.archived && item.id !== threadId;
      }))[0];

      if (replacement) {
        state.activeThreadId = replacement.id;
      } else {
        const next = createThread({ title: "New thread" });
        state.activeThreadId = next.id;
      }
    }

    save();
    renderAll();
    emitThreadChanged(getActiveThread());
  }

  function togglePinned(threadId) {
    const thread = getThread(threadId);
    if (!thread) return;

    thread.pinned = !thread.pinned;
    thread.updatedAt = nowIso();
    save();
    renderAll();
  }

  function setThreadMatter(threadId, matterId) {
    const thread = getThread(threadId);
    if (!thread) return;

    thread.matterId = matterId || "";
    thread.matterLabel = findMatterLabel(matterId);
    thread.updatedAt = nowIso();
    save();
    renderAll();
  }

  function openThread(threadId) {
    const thread = getThread(threadId);
    if (!thread) return;

    state.activeThreadId = thread.id;
    save();
    renderAll();
    emitThreadChanged(thread);
  }

  function buildModelHistory(threadId) {
    const thread = getThread(threadId);
    if (!thread) return [];

    return (thread.turns || [])
      .filter(function (turn) {
        return (turn.role === "user" || turn.role === "assistant") && turn.status !== "error";
      })
      .slice(-CFG.maxModelTurns)
      .map(function (turn) {
        return {
          role: turn.role,
          content: safeText(turn.text)
        };
      });
  }

  function filteredThreads() {
    const query = cleanText(ui.searchInputEl && ui.searchInputEl.value).toLowerCase();
    const selectedMatter = (ui.matterFilterEl && ui.matterFilterEl.value) || "";

    return sortThreads(state.threads.filter(function (thread) {
      return !thread.archived;
    }))
      .filter(function (thread) {
        if (selectedMatter && thread.matterId !== selectedMatter) return false;
        if (!query) return true;

        const haystack = [
          thread.title,
          thread.matterLabel,
          thread.lastPreview
        ]
          .concat((thread.turns || []).map(function (turn) {
            return safeText(turn.text);
          }))
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
  }

  function renderMatterFilter() {
    if (!ui.matterFilterEl) return;

    const current = ui.matterFilterEl.value || "";
    const options = getMatterOptions().map(normalizeMatterOption).filter(Boolean);

    ui.matterFilterEl.innerHTML = [
      '<option value="">All matters</option>'
    ].concat(options.map(function (option) {
      return '<option value="' + esc(option.id) + '"' + (option.id === current ? " selected" : "") + ">" + esc(option.label) + "</option>";
    })).join("");
  }

  function renderActiveMatterSelect() {
    if (!ui.activeMatterSelectEl) return;

    const thread = getActiveThread();
    const selectedMatterId = thread ? thread.matterId || "" : "";
    const options = getMatterOptions().map(normalizeMatterOption).filter(Boolean);

    ui.activeMatterSelectEl.innerHTML = [
      '<option value="">No matter</option>'
    ].concat(options.map(function (option) {
      return '<option value="' + esc(option.id) + '"' + (option.id === selectedMatterId ? " selected" : "") + ">" + esc(option.label) + "</option>";
    })).join("");
  }

  function renderThreadList() {
    if (!ui.threadListEl) return;

    const threads = filteredThreads();

    if (!threads.length) {
      ui.threadListEl.innerHTML = '<div class="muted">No threads yet.</div>';
      return;
    }

    ui.threadListEl.innerHTML = threads.map(function (thread) {
      return (
        '<div class="thread-item' + (thread.id === state.activeThreadId ? " is-active" : "") + '" data-thread-id="' + esc(thread.id) + '">' +
          '<div><strong>' + esc(thread.title) + '</strong></div>' +
          '<div class="muted">' + esc(thread.lastPreview || "No messages yet") + '</div>' +
        '</div>'
      );
    }).join("");
  }

  function renderConversation() {
    if (!ui.messageListEl) return;

    const thread = getActiveThread();

    if (!thread) {
      ui.messageListEl.innerHTML = "";
      return;
    }

    const turns = thread.turns || [];

    if (!turns.length) {
      ui.messageListEl.innerHTML = '<span class="muted">No output yet.</span>';
      return;
    }

    ui.messageListEl.innerHTML = turns.map(function (turn) {
      if (typeof ui.renderMessage === "function") {
        const custom = ui.renderMessage(turn);
        if (custom) return custom;
      }

      return (
        '<div class="assistant-msg assistant-msg--' + esc(turn.role) + '" data-message-id="' + esc(turn.id) + '" data-turn-id="' + esc(turn.id) + '">' +
          '<div class="assistant-msg-role">' + esc(turn.role) + '</div>' +
          '<div class="assistant-msg-body">' + esc(turn.text) + '</div>' +
        '</div>'
      );
    }).join("");

    try {
      ui.messageListEl.scrollTop = ui.messageListEl.scrollHeight;
    } catch {
      // ignore
    }
  }

  function renderActiveThreadMeta() {
    const thread = getActiveThread();

    if (ui.activeTitleEl) {
      ui.activeTitleEl.textContent = thread ? thread.title : "New thread";
    }

    renderActiveMatterSelect();
  }

  function renderAll() {
    renderMatterFilter();
    renderThreadList();
    renderActiveThreadMeta();
    renderConversation();
  }

  function bindEvents() {
    if (ui.newThreadBtnEl) {
      ui.newThreadBtnEl.addEventListener("click", function () {
        createThread({ title: "New thread" });
      });
    }

    if (ui.renameBtnEl) {
      ui.renameBtnEl.addEventListener("click", function () {
        const active = getActiveThread();
        if (!active) return;
        const nextTitle = window.prompt("Rename thread", active.title || "New thread");
        if (nextTitle) renameThread(active.id, nextTitle);
      });
    }

    if (ui.archiveBtnEl) {
      ui.archiveBtnEl.addEventListener("click", function () {
        const active = getActiveThread();
        if (!active) return;
        archiveThread(active.id);
      });
    }

    if (ui.searchInputEl) {
      ui.searchInputEl.addEventListener("input", renderThreadList);
    }

    if (ui.matterFilterEl) {
      ui.matterFilterEl.addEventListener("change", renderThreadList);
    }

    if (ui.activeMatterSelectEl) {
      ui.activeMatterSelectEl.addEventListener("change", function (event) {
        const active = getActiveThread();
        if (!active) return;
        setThreadMatter(active.id, event.target.value);
      });
    }

    if (ui.threadListEl) {
      ui.threadListEl.addEventListener("click", function (event) {
        const row = event.target.closest("[data-thread-id]");
        if (!row) return;
        openThread(row.getAttribute("data-thread-id"));
      });
    }
  }

  function init(options) {
    Object.assign(ui, options || {});
    bindEvents();

    if (!state.threads.length) {
      createThread({ title: "New thread" });
      return;
    }

    const active = getActiveThread() || sortThreads(state.threads.filter(function (thread) {
      return !thread.archived;
    }))[0] || state.threads[0];

    if (active) {
      state.activeThreadId = active.id;
    }

    save();
    renderAll();
    emitThreadChanged(getActiveThread());
  }

  window.ZhuxinAssistantThreads = {
    init: init,
    createThread: createThread,
    getThread: getThread,
    getActiveThread: getActiveThread,
    ensureThreadForPrompt: ensureThreadForPrompt,
    appendTurn: appendTurn,
    patchTurnText: patchTurnText,
    renameThread: renameThread,
    archiveThread: archiveThread,
    togglePinned: togglePinned,
    setThreadMatter: setThreadMatter,
    openThread: openThread,
    buildModelHistory: buildModelHistory,
    renderAll: renderAll,
    safeText: safeText
  };
})();
