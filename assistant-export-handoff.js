(function () {
  const STORAGE_KEY = "zhuxin.assistant.export.v1";

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

  function getThread() {
    if (window.ZhuxinAssistantThreads && window.ZhuxinAssistantThreads.getActiveThread) {
      return window.ZhuxinAssistantThreads.getActiveThread();
    }
    return { id: "default-thread", title: "Untitled", turns: [] };
  }

  function ensureThreadState(threadId) {
    const store = loadStore();
    if (!store[threadId]) {
      store[threadId] = {
        lastOptions: {
          format: "txt",
          includePrompt: true,
          includeAnswer: true,
          includeSources: true
        },
        history: []
      };
      saveStore(store);
    }
    return store[threadId];
  }

  function readEls() {
    return {
      modal: document.getElementById("assistantExportModal"),
      format: document.getElementById("assistantExportFormat"),
      includePrompt: document.getElementById("assistantExportIncludePrompt"),
      includeAnswer: document.getElementById("assistantExportIncludeAnswer"),
      includeSources: document.getElementById("assistantExportIncludeSources"),
      preview: document.getElementById("assistantExportPreview"),
      history: document.getElementById("assistantExportHistory"),
      status: document.getElementById("assistantExportStatus")
    };
  }

  function latestTurn(turns, role) {
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      if (turns[i] && turns[i].role === role) return turns[i];
    }
    return null;
  }

  function buildText(thread, opts) {
    const turns = Array.isArray(thread.turns) ? thread.turns : [];
    const user = latestTurn(turns, "user");
    const assistant = latestTurn(turns, "assistant");

    const lines = [];
    lines.push("Thread: " + (thread.title || "Untitled"));
    lines.push("Exported: " + new Date().toISOString());

    if (opts.includePrompt && user && user.text) {
      lines.push("\nPrompt:\n" + user.text);
    }

    if (opts.includeAnswer && assistant && assistant.text) {
      lines.push("\nAnswer:\n" + assistant.text);
    }

    return lines.join("\n");
  }

  function updatePreview() {
    const thread = getThread();
    const els = readEls();
    const opts = {
      format: els.format.value,
      includePrompt: !!els.includePrompt.checked,
      includeAnswer: !!els.includeAnswer.checked,
      includeSources: !!els.includeSources.checked
    };

    const text = buildText(thread, opts);
    els.preview.value = text;

    const threadId = getThreadId();
    const store = loadStore();
    const state = ensureThreadState(threadId);
    state.lastOptions = opts;
    saveStore(store);
  }

  function download() {
    updatePreview();
    const els = readEls();
    const blob = new Blob([els.preview.value || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "zhuxin-export.txt";
    a.click();

    URL.revokeObjectURL(url);
    saveExport();
  }

  function copy() {
    updatePreview();
    const els = readEls();
    const text = els.preview.value || "";

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    }

    saveExport();
  }

  function saveExport() {
    const threadId = getThreadId();
    const store = loadStore();
    const state = ensureThreadState(threadId);

    const record = {
      id: "export_" + Date.now(),
      format: state.lastOptions.format,
      savedAt: new Date().toISOString()
    };

    state.history.unshift(record);
    state.history = state.history.slice(0, 10);
    saveStore(store);
    renderHistory(threadId);
  }

  function renderHistory(threadId) {
    const els = readEls();
    const state = ensureThreadState(threadId);
    if (!els.history) return;

    if (!state.history.length) {
      els.history.innerHTML = "<div>No exports yet.</div>";
      return;
    }

    els.history.innerHTML = state.history.map(function (h) {
      return "<div>" + h.format + " • " + h.savedAt + "</div>";
    }).join("");
  }

  function openModal() {
    const els = readEls();
    const threadId = getThreadId();
    ensureThreadState(threadId);
    if (els.modal) els.modal.hidden = false;
    updatePreview();
    renderHistory(threadId);
  }

  function closeModal() {
    const els = readEls();
    if (els.modal) els.modal.hidden = true;
  }

  function bind() {
    const openBtn = document.getElementById("exportBtn");
    const closeBtn = document.getElementById("assistantExportClose");
    const cancelBtn = document.getElementById("assistantExportCancel");
    const downloadBtn = document.getElementById("assistantExportDownload");
    const copyBtn = document.getElementById("assistantExportCopy");

    if (openBtn) openBtn.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    if (downloadBtn) downloadBtn.addEventListener("click", download);
    if (copyBtn) copyBtn.addEventListener("click", copy);

    const els = readEls();
    if (els.format) els.format.addEventListener("change", updatePreview);
    if (els.includePrompt) els.includePrompt.addEventListener("change", updatePreview);
    if (els.includeAnswer) els.includeAnswer.addEventListener("change", updatePreview);
    if (els.includeSources) els.includeSources.addEventListener("change", updatePreview);
  }

  window.AssistantExportHandoff = { init: bind };
})();