(function () {
  const STORAGE_KEY = "zhuxin.assistant.collaboration.v1";

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (err) {
      return {};
    }
  }

  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function getThreadId() {
    if (window.ZhuxinAssistantThreads && window.ZhuxinAssistantThreads.getActiveThread) {
      const thread = window.ZhuxinAssistantThreads.getActiveThread();
      return thread && thread.id ? thread.id : "default-thread";
    }
    return "default-thread";
  }

  function getThreadData() {
    if (window.ZhuxinAssistantThreads && window.ZhuxinAssistantThreads.getActiveThread) {
      return window.ZhuxinAssistantThreads.getActiveThread();
    }
    return { id: "default-thread", title: "New thread", turns: [] };
  }

  function ensureThreadState(threadId) {
    const store = loadStore();
    if (!store[threadId]) {
      store[threadId] = {
        draft: {
          recipientsText: "",
          access: "view",
          includePrompt: true,
          includeAnswer: true,
          includeSources: true,
          includeOpenItems: true,
          handoffNote: "",
          preparedPreview: "",
          updatedAt: new Date().toISOString()
        },
        history: []
      };
      saveStore(store);
    }
    return store[threadId];
  }

  function readEls() {
    return {
      modal: document.getElementById("assistantShareModal"),
      status: document.getElementById("assistantShareStatus"),
      recipients: document.getElementById("assistantShareRecipients"),
      access: document.getElementById("assistantShareAccess"),
      includePrompt: document.getElementById("assistantShareIncludePrompt"),
      includeAnswer: document.getElementById("assistantShareIncludeAnswer"),
      includeSources: document.getElementById("assistantShareIncludeSources"),
      includeOpenItems: document.getElementById("assistantShareIncludeOpenItems"),
      note: document.getElementById("assistantShareNote"),
      preview: document.getElementById("assistantSharePreview"),
      history: document.getElementById("assistantShareHistory")
    };
  }

  function latestTurnByRole(turns, role) {
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      if (turns[i] && turns[i].role === role) return turns[i];
    }
    return null;
  }

  function buildPreview(thread, draft) {
    const turns = Array.isArray(thread.turns) ? thread.turns : [];
    const latestUser = latestTurnByRole(turns, "user");
    const latestAssistant = latestTurnByRole(turns, "assistant");

    const lines = [];
    lines.push("Title: " + (thread.title || "Untitled thread"));
    lines.push("Access: " + (draft.access || "view"));

    if ((draft.recipientsText || "").trim()) {
      lines.push("Recipients: " + draft.recipientsText.trim());
    }

    lines.push("Prepared: " + new Date().toISOString());

    if ((draft.handoffNote || "").trim()) {
      lines.push("");
      lines.push("Handoff note:");
      lines.push(draft.handoffNote.trim());
    }

    if (draft.includePrompt && latestUser && latestUser.text) {
      lines.push("");
      lines.push("Latest prompt:");
      lines.push(latestUser.text);
    }

    if (draft.includeAnswer && latestAssistant && latestAssistant.text) {
      lines.push("");
      lines.push("Latest answer:");
      lines.push(latestAssistant.text);
    }

    return lines.join("\n");
  }

  function writeDraftToForm(threadId) {
    const state = ensureThreadState(threadId);
    const els = readEls();
    if (!els.modal) return;

    els.recipients.value = state.draft.recipientsText || "";
    els.access.value = state.draft.access || "view";
    els.includePrompt.checked = !!state.draft.includePrompt;
    els.includeAnswer.checked = !!state.draft.includeAnswer;
    els.includeSources.checked = !!state.draft.includeSources;
    els.includeOpenItems.checked = !!state.draft.includeOpenItems;
    els.note.value = state.draft.handoffNote || "";
    els.preview.value = state.draft.preparedPreview || "";
    renderHistory(threadId);
  }

  function readFormToDraft(threadId) {
    const store = loadStore();
    const current = ensureThreadState(threadId);
    const els = readEls();

    current.draft = {
      recipientsText: els.recipients.value || "",
      access: els.access.value || "view",
      includePrompt: !!els.includePrompt.checked,
      includeAnswer: !!els.includeAnswer.checked,
      includeSources: !!els.includeSources.checked,
      includeOpenItems: !!els.includeOpenItems.checked,
      handoffNote: els.note.value || "",
      preparedPreview: els.preview.value || "",
      updatedAt: new Date().toISOString()
    };

    store[threadId] = current;
    saveStore(store);
    return current.draft;
  }

  function renderHistory(threadId) {
    const els = readEls();
    const state = ensureThreadState(threadId);
    if (!els.history) return;

    if (!state.history.length) {
      els.history.innerHTML = '<div class="assistant-share-history-item">No saved shares yet.</div>';
      return;
    }

    els.history.innerHTML = state.history.map(function (item) {
      return (
        '<div class="assistant-share-history-item">' +
          '<div>' + escapeHtml(item.recipientsText || "No recipients") + '</div>' +
          '<div class="assistant-share-history-meta">' + escapeHtml(item.access + " • " + item.savedAt) + '</div>' +
        '</div>'
      );
    }).join("");
  }

  function refreshStatus() {
    const els = readEls();
    if (!els.status) return;

    const threadId = getThreadId();
    const state = ensureThreadState(threadId);
    if (!state.history.length) {
      els.status.hidden = true;
      els.status.textContent = "";
      return;
    }

    els.status.hidden = false;
    els.status.textContent = "Shared " + state.history.length;
  }

  function openModal() {
    const els = readEls();
    const threadId = getThreadId();
    writeDraftToForm(threadId);
    if (els.modal) {
      els.modal.hidden = false;
      els.modal.setAttribute("aria-hidden", "false");
    }
  }

  function closeModal() {
    const els = readEls();
    if (els.modal) {
      els.modal.hidden = true;
      els.modal.setAttribute("aria-hidden", "true");
    }
  }

  function preparePreview() {
    const threadId = getThreadId();
    const thread = getThreadData();
    const draft = readFormToDraft(threadId);
    const preview = buildPreview(thread, draft);
    const els = readEls();
    els.preview.value = preview;

    const store = loadStore();
    store[threadId].draft.preparedPreview = preview;
    saveStore(store);
  }

  function saveShare() {
    const threadId = getThreadId();
    preparePreview();

    const store = loadStore();
    const threadState = ensureThreadState(threadId);
    const els = readEls();

    const record = {
      id: "share_" + Date.now(),
      recipientsText: els.recipients.value || "",
      access: els.access.value || "view",
      previewText: els.preview.value || "",
      savedAt: new Date().toISOString()
    };

    threadState.history.unshift(record);
    threadState.history = threadState.history.slice(0, 10);
    store[threadId] = threadState;
    saveStore(store);

    renderHistory(threadId);
    refreshStatus();
  }

  function copyPreview() {
    const els = readEls();
    const text = els.preview.value || "";
    if (!text.trim()) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      return;
    }

    els.preview.focus();
    els.preview.select();
    document.execCommand("copy");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function bind() {
    const shareBtn = document.getElementById("assistantShareBtn");
    const closeBtn = document.getElementById("assistantShareClose");
    const cancelBtn = document.getElementById("assistantShareCancel");
    const prepareBtn = document.getElementById("assistantSharePrepare");
    const copyBtn = document.getElementById("assistantShareCopy");
    const saveBtn = document.getElementById("assistantShareSave");
    const modal = document.getElementById("assistantShareModal");

    if (shareBtn) shareBtn.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    if (prepareBtn) prepareBtn.addEventListener("click", preparePreview);
    if (copyBtn) copyBtn.addEventListener("click", copyPreview);
    if (saveBtn) saveBtn.addEventListener("click", saveShare);

    if (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target && event.target.getAttribute("data-close-share-modal") === "true") {
          closeModal();
        }
      });
    }

    document.addEventListener("zhuxin:assistant-thread-activated", refreshStatus);
    document.addEventListener("zhuxin:assistant-thread-updated", refreshStatus);

    refreshStatus();
  }

  window.AssistantCollaboration = {
    init: bind,
    refreshStatus: refreshStatus
  };
})();
