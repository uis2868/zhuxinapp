(function () {
  const STORAGE_KEY = "zhuxin.assistant.drafts.v1";

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  }

  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function getThreadId() {
    if (window.ZhuxinAssistantThreads && window.ZhuxinAssistantThreads.getActiveThread) {
      var thread = window.ZhuxinAssistantThreads.getActiveThread();
      return thread && thread.id ? thread.id : "assistant-default-thread";
    }
    return "assistant-default-thread";
  }

  function ensureThreadDraft(threadId) {
    var store = loadStore();
    if (!store[threadId]) {
      store[threadId] = {
        title: "Working Draft",
        basePrompt: "",
        content: "",
        dirty: false,
        versions: []
      };
      saveStore(store);
    }
    return store[threadId];
  }

  function readEls() {
    return {
      workspace: document.getElementById("assistantDraftWorkspace"),
      title: document.getElementById("assistantDraftTitle"),
      meta: document.getElementById("assistantDraftMeta"),
      status: document.getElementById("assistantDraftStatus"),
      instruction: document.getElementById("assistantDraftInstructionInput"),
      editor: document.getElementById("assistantDraftEditor"),
      dirty: document.getElementById("assistantDraftDirtyState"),
      versions: document.getElementById("assistantDraftVersions"),
      openBtn: document.getElementById("assistantGenerateDraftBtn"),
      closeBtn: document.getElementById("assistantDraftCloseBtn"),
      applyBtn: document.getElementById("assistantDraftApplyInstructionBtn"),
      saveBtn: document.getElementById("assistantDraftSaveVersionBtn"),
      regenBtn: document.getElementById("assistantDraftRegenerateBtn"),
      prompt: document.getElementById("assistant-prompt-input")
    };
  }

  function setStatus(text) {
    var els = readEls();
    if (els.status) els.status.textContent = text || "";
  }

  function renderVersions(threadId) {
    var els = readEls();
    var draft = ensureThreadDraft(threadId);
    if (!els.versions) return;

    if (!draft.versions.length) {
      els.versions.innerHTML = '<div class="muted">No saved versions yet.</div>';
      return;
    }

    els.versions.innerHTML = draft.versions.map(function (v) {
      return (
        '<div class="assistant-draft-version-item">' +
          '<div class="assistant-draft-version-item-meta">' +
            "<strong>" + v.label + "</strong>" +
            "<span>" + v.createdAt + "</span>" +
          "</div>" +
          '<div class="assistant-draft-version-item-actions">' +
            '<button type="button" class="btn-soft" data-restore-version="' + v.id + '">Restore</button>' +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  function render() {
    var els = readEls();
    var threadId = getThreadId();
    var draft = ensureThreadDraft(threadId);

    if (els.title) els.title.textContent = draft.title || "Working Draft";
    if (els.meta) els.meta.textContent = draft.basePrompt ? ("Base prompt: " + draft.basePrompt.slice(0, 80)) : "No draft yet";
    if (els.editor) els.editor.value = draft.content || "";
    if (els.dirty) els.dirty.textContent = draft.dirty ? "Unsaved edits" : "";
    renderVersions(threadId);
  }

  function openWorkspace() {
    var els = readEls();
    if (els.workspace) els.workspace.classList.remove("is-hidden");
  }

  function closeWorkspace() {
    var els = readEls();
    if (els.workspace) els.workspace.classList.add("is-hidden");
  }

  function generateDraft() {
    var els = readEls();
    var threadId = getThreadId();
    var draft = ensureThreadDraft(threadId);
    var prompt = (els.prompt && els.prompt.value || "").trim();

    if (!prompt) {
      setStatus("Write a prompt first.");
      return;
    }

    openWorkspace();

    draft.basePrompt = prompt;
    draft.title = prompt.slice(0, 48) || "Working Draft";
    draft.content = "Draft generated from prompt:\n\n" + prompt;
    draft.dirty = false;
    draft.versions.unshift({
      id: "v_" + Date.now(),
      label: "Initial draft",
      createdAt: new Date().toISOString(),
      content: draft.content
    });
    draft.versions = draft.versions.slice(0, 10);

    var store = loadStore();
    store[threadId] = draft;
    saveStore(store);

    setStatus("Draft ready");
    render();
  }

  function applyInstruction() {
    var els = readEls();
    var threadId = getThreadId();
    var draft = ensureThreadDraft(threadId);
    var instruction = (els.instruction && els.instruction.value || "").trim();

    if (!instruction) {
      setStatus("Write a revision instruction.");
      return;
    }

    draft.content = (draft.content || "") + "\n\n[Revision applied]\n" + instruction;
    draft.dirty = false;
    draft.versions.unshift({
      id: "v_" + Date.now(),
      label: "Revision",
      createdAt: new Date().toISOString(),
      content: draft.content
    });
    draft.versions = draft.versions.slice(0, 10);

    var store = loadStore();
    store[threadId] = draft;
    saveStore(store);

    if (els.instruction) els.instruction.value = "";
    setStatus("Revision applied");
    render();
  }

  function saveVersion() {
    var els = readEls();
    var threadId = getThreadId();
    var draft = ensureThreadDraft(threadId);

    draft.content = els.editor ? els.editor.value : draft.content;
    draft.dirty = false;
    draft.versions.unshift({
      id: "v_" + Date.now(),
      label: "Manual save",
      createdAt: new Date().toISOString(),
      content: draft.content
    });
    draft.versions = draft.versions.slice(0, 10);

    var store = loadStore();
    store[threadId] = draft;
    saveStore(store);

    setStatus("Version saved");
    render();
  }

  function regenerate() {
    var threadId = getThreadId();
    var draft = ensureThreadDraft(threadId);
    if (!draft.basePrompt) {
      setStatus("No base prompt found.");
      return;
    }
    draft.content = "Draft regenerated from prompt:\n\n" + draft.basePrompt;
    draft.dirty = false;

    var store = loadStore();
    store[threadId] = draft;
    saveStore(store);

    setStatus("Draft regenerated");
    render();
  }

  function bind() {
    var els = readEls();

    if (els.openBtn) els.openBtn.addEventListener("click", generateDraft);
    if (els.closeBtn) els.closeBtn.addEventListener("click", closeWorkspace);
    if (els.applyBtn) els.applyBtn.addEventListener("click", applyInstruction);
    if (els.saveBtn) els.saveBtn.addEventListener("click", saveVersion);
    if (els.regenBtn) els.regenBtn.addEventListener("click", regenerate);

    if (els.editor) {
      els.editor.addEventListener("input", function () {
        var threadId = getThreadId();
        var draft = ensureThreadDraft(threadId);
        draft.content = els.editor.value;
        draft.dirty = true;
        var store = loadStore();
        store[threadId] = draft;
        saveStore(store);
        if (els.dirty) els.dirty.textContent = "Unsaved edits";
      });
    }

    if (els.versions) {
      els.versions.addEventListener("click", function (event) {
        var restoreBtn = event.target.closest("[data-restore-version]");
        if (!restoreBtn) return;

        var id = restoreBtn.getAttribute("data-restore-version");
        var threadId = getThreadId();
        var draft = ensureThreadDraft(threadId);
        var version = draft.versions.find(function (v) { return v.id === id; });
        if (!version) return;

        draft.content = version.content;
        draft.dirty = false;
        var store = loadStore();
        store[threadId] = draft;
        saveStore(store);

        render();
        setStatus("Version restored");
      });
    }

    render();
  }

  window.AssistantDraftEditor = { init: bind };
})();
