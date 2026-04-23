(function () {
  const CFG = Object.assign(
    {
      storageKey: "zhuxin.assistant.threads.v1",
      activeThreadKey: "zhuxin.assistant.activeThreadId.v1",
      maxModelTurns: 20
    },
    (window.ZHUXIN_CONFIG && window.ZHUXIN_CONFIG.assistantThreads) || {}
  );

  const ui = {};
  const state = load();

  function id(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  function now() {
    return new Date().toISOString();
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function makeTitle(text) {
    const cleaned = String(text || "").trim().replace(/\s+/g, " ");
    return (cleaned || "New thread").slice(0, 80);
  }

  function hydrateTurn(turn) {
    turn = turn || {};
    const text = turn.text || turn.content || "";
    return {
      id: turn.id || id("turn"),
      role: turn.role || "assistant",
      text,
      content: text,
      status: turn.status || "done",
      createdAt: turn.createdAt || now(),
      meta: turn.meta || turn.metadata || {}
    };
  }

  function hydrateThread(thread) {
    thread = thread || {};
    return {
      id: thread.id || id("thread"),
      title: thread.title || "New thread",
      matterId: thread.matterId || "",
      matterLabel: thread.matterLabel || "",
      pinned: !!thread.pinned,
      archived: !!thread.archived,
      isDraft: !!thread.isDraft,
      createdAt: thread.createdAt || now(),
      updatedAt: thread.updatedAt || now(),
      lastPreview: thread.lastPreview || "",
      turns: Array.isArray(thread.turns) ? thread.turns.map(hydrateTurn) : []
    };
  }

  function load() {
    let threads = [];
    let activeThreadId = "";

    try {
      threads = JSON.parse(localStorage.getItem(CFG.storageKey) || "[]").map(hydrateThread);
    } catch {
      threads = [];
    }

    try {
      activeThreadId = localStorage.getItem(CFG.activeThreadKey) || "";
    } catch {
      activeThreadId = "";
    }

    return { threads, activeThreadId };
  }

  function save() {
    localStorage.setItem(CFG.storageKey, JSON.stringify(state.threads));
    localStorage.setItem(CFG.activeThreadKey, state.activeThreadId || "");
  }

  function getThread(threadId) {
    return state.threads.find(function (thread) {
      return thread.id === threadId;
    }) || null;
  }

  function getActiveThread() {
    return getThread(state.activeThreadId);
  }

  function emitThreadChanged(thread) {
    document.dispatchEvent(
      new CustomEvent("zhuxin:thread-changed", {
        detail: {
          threadId: thread ? thread.id : null,
          thread: thread || null
        }
      })
    );
  }

  function createThread(options) {
    options = options || {};

    const thread = hydrateThread({
      title: options.title || "New thread",
      matterId: options.matterId || "",
      matterLabel: options.matterLabel || "",
      isDraft: true
    });

    state.threads.unshift(thread);
    state.activeThreadId = thread.id;
    save();
    renderAll();
    emitThreadChanged(thread);
    return thread;
  }

  function ensureThreadForPrompt(promptText, matterMeta) {
    let thread = getActiveThread();

    if (!thread || thread.archived) {
      thread = createThread({
        title: makeTitle(promptText),
        matterId: (matterMeta && matterMeta.id) || "",
        matterLabel: (matterMeta && matterMeta.label) || ""
      });
    }

    if (thread.isDraft && (!thread.title || thread.title === "New thread")) {
      thread.title = makeTitle(promptText);
    }

    if (matterMeta && matterMeta.id) {
      thread.matterId = thread.matterId || matterMeta.id;
      thread.matterLabel = thread.matterLabel || matterMeta.label || "";
    }

    thread.updatedAt = now();
    save();
    renderAll();
    return thread;
  }

  function appendTurn(threadId, payload) {
    const thread = getThread(threadId);
    if (!thread) return null;

    const text = payload.text || payload.content || "";
    const turn = hydrateTurn({
      role: payload.role,
      text,
      status: payload.status || "done",
      meta: payload.meta || payload.metadata || {}
    });

    thread.turns.push(turn);
    thread.isDraft = false;
    thread.updatedAt = now();
    thread.lastPreview = (text || "").slice(0, 140);

    save();
    renderAll();
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
    const nextText = text || "";

    turn.text = options.append ? (turn.text || "") + nextText : nextText;
    turn.content = turn.text;

    if (options.status) turn.status = options.status;
    if (options.meta) {
      turn.meta = Object.assign({}, turn.meta || {}, options.meta);
    }

    thread.updatedAt = now();
    thread.lastPreview = (turn.text || "").slice(0, 140);

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

  function renameThread(threadId, nextTitle) {
    const thread = getThread(threadId);
    if (!thread) return;

    nextTitle = String(nextTitle || "").trim();
    if (!nextTitle) return;

    thread.title = nextTitle.slice(0, 80);
    thread.updatedAt = now();
    save();
    renderAll();
  }

  function archiveThread(threadId) {
    const thread = getThread(threadId);
    if (!thread) return;

    thread.archived = true;
    thread.updatedAt = now();

    if (state.activeThreadId === threadId) {
      const replacement =
        state.threads.find(function (item) {
          return !item.archived && item.id !== threadId;
        }) || createThread({ title: "New thread" });
      state.activeThreadId = replacement.id;
    }

    save();
    renderAll();
    emitThreadChanged(getActiveThread());
  }

  function togglePinned(threadId) {
    const thread = getThread(threadId);
    if (!thread) return;

    thread.pinned = !thread.pinned;
    thread.updatedAt = now();
    save();
    renderAll();
  }

  function setThreadMatter(threadId, matterId) {
    const thread = getThread(threadId);
    if (!thread) return;

    thread.matterId = matterId || "";
    thread.updatedAt = now();
    save();
    renderAll();
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
          content: turn.text
        };
      });
  }

  function renderThreadList() {
    if (!ui.threadListEl) return;

    const threads = state.threads
      .filter(function (thread) {
        return !thread.archived;
      })
      .sort(function (a, b) {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });

    ui.threadListEl.innerHTML =
      threads
        .map(function (thread) {
          return (
            '<div class="thread-item' +
            (thread.id === state.activeThreadId ? " is-active" : "") +
            '" data-thread-id="' +
            esc(thread.id) +
            '">' +
            "<div><strong>" +
            esc(thread.title) +
            "</strong></div>" +
            '<div class="muted">' +
            esc(thread.lastPreview || "No messages yet") +
            "</div>" +
            "</div>"
          );
        })
        .join("") || '<div class="muted">No threads yet.</div>';
  }

  function renderConversation() {
    if (!ui.messageListEl) return;

    const thread = getActiveThread();
    if (!thread) {
      ui.messageListEl.innerHTML = "";
      return;
    }

    if (!(thread.turns || []).length) {
      ui.messageListEl.innerHTML = '<div class="muted">Start a thread by sending a message.</div>';
      return;
    }

    ui.messageListEl.innerHTML = (thread.turns || [])
      .map(function (turn) {
        if (typeof ui.renderMessage === "function") {
          const custom = ui.renderMessage(turn);
          if (custom) return custom;
        }

        return (
          '<div class="assistant-msg assistant-msg--' +
          esc(turn.role) +
          '" data-message-id="' +
          esc(turn.id) +
          '" data-turn-id="' +
          esc(turn.id) +
          '">' +
          '<div class="assistant-msg-role">' +
          esc(turn.role) +
          "</div>" +
          '<div class="assistant-msg-body">' +
          esc(turn.text) +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderMeta() {
    if (!ui.activeTitleEl) return;
    const thread = getActiveThread();
    ui.activeTitleEl.textContent = thread ? thread.title : "New thread";
  }

  function renderAll() {
    renderThreadList();
    renderMeta();
    renderConversation();
  }

  function init(options) {
    Object.assign(ui, options || {});

    if (ui.newThreadBtnEl) {
      ui.newThreadBtnEl.addEventListener("click", function () {
        createThread({ title: "New thread" });
      });
    }

    if (ui.renameBtnEl) {
      ui.renameBtnEl.addEventListener("click", function () {
        const thread = getActiveThread();
        if (!thread) return;
        const next = window.prompt("Rename thread", thread.title || "New thread");
        if (next) renameThread(thread.id, next);
      });
    }

    if (ui.archiveBtnEl) {
      ui.archiveBtnEl.addEventListener("click", function () {
        const thread = getActiveThread();
        if (thread) archiveThread(thread.id);
      });
    }

    if (ui.threadListEl) {
      ui.threadListEl.addEventListener("click", function (event) {
        const row = event.target.closest("[data-thread-id]");
        if (row) openThread(row.getAttribute("data-thread-id"));
      });
    }

    if (!state.threads.length) {
      createThread({ title: "New thread" });
    } else {
      if (!getActiveThread()) state.activeThreadId = state.threads[0].id;
      save();
      renderAll();
      emitThreadChanged(getActiveThread());
    }
  }

  window.ZhuxinAssistantThreads = {
    init,
    createThread,
    getThread,
    getActiveThread,
    ensureThreadForPrompt,
    appendTurn,
    patchTurnText,
    renameThread,
    archiveThread,
    togglePinned,
    setThreadMatter,
    openThread,
    buildModelHistory,
    renderAll
  };
})();
