(function () {
  const STORE_KEY_PREFIX = "zhuxin-draft-editor:";

  function getAssistant() {
    window.appData = window.appData || {};
    window.appData.assistant = window.appData.assistant || {};
    window.appData.assistant.activeThreadId =
      window.appData.assistant.activeThreadId || "assistant-default-thread";
    return window.appData.assistant;
  }

  function getThreadId() {
    return getAssistant().activeThreadId || "assistant-default-thread";
  }

  function getStorageKey() {
    return STORE_KEY_PREFIX + getThreadId();
  }

  function createState() {
    return {
      drafts: [],
      activeDraftId: null
    };
  }

  function createDraft(basePrompt) {
    return {
      id: "draft_" + Date.now(),
      title: "Working Draft",
      basePrompt: basePrompt || "",
      content: "",
      status: "idle",
      dirty: false,
      updatedAt: Date.now(),
      versions: []
    };
  }

  function createVersion(label, content, instruction) {
    return {
      id: "ver_" + Date.now(),
      label: label,
      content: content,
      instruction: instruction || "",
      createdAt: Date.now()
    };
  }

  let state = createState();

  const els = {};

  function save() {
    localStorage.setItem(getStorageKey(), JSON.stringify(state));
  }

  function load() {
    try {
      const raw = localStorage.getItem(getStorageKey());
      if (raw) {
        state = Object.assign(createState(), JSON.parse(raw));
      }
    } catch (e) {}
  }

  function getActiveDraft() {
    return state.drafts.find(d => d.id === state.activeDraftId) || null;
  }

  function openWorkspace() {
    els.workspace.classList.remove("hidden");
  }

  function closeWorkspace() {
    els.workspace.classList.add("hidden");
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text || "";
  }

  async function generateDraft() {
    const prompt = els.prompt?.value?.trim();
    if (!prompt) {
      setStatus("Write something first.");
      return;
    }

    openWorkspace();

    let draft = getActiveDraft();

    if (!draft || draft.basePrompt !== prompt) {
      draft = createDraft(prompt);
      state.drafts.unshift(draft);
      state.activeDraftId = draft.id;
    }

    draft.status = "generating";
    draft.dirty = false;
    setStatus("Generating draft...");
    render();

    try {
      const res = await window.ZhuxinGenerationEngine.runDraftGeneration({
        prompt
      });

      draft.title = res.title || "Working Draft";
      draft.content = res.text || "";
      draft.status = "ready";
      draft.updatedAt = Date.now();
      draft.dirty = false;

      draft.versions.unshift(
        createVersion("Initial draft", draft.content, "")
      );

      render();
      save();
    } catch (e) {
      draft.status = "idle";
      setStatus("Failed.");
    }
  }

  async function reviseDraft(instruction) {
    const draft = getActiveDraft();
    if (!draft) {
      setStatus("No draft.");
      return;
    }

    if (!instruction) {
      setStatus("Enter instruction.");
      return;
    }

    draft.status = "revising";
    setStatus("Revising...");
    render();

    try {
      const res = await window.ZhuxinGenerationEngine.runDraftRevision({
        title: draft.title,
        draftText: draft.content,
        instruction
      });

      draft.content = res.text || draft.content;
      draft.updatedAt = Date.now();
      draft.status = "ready";
      draft.dirty = false;

      draft.versions.unshift(
        createVersion("Revision", draft.content, instruction)
      );

      els.instruction.value = "";
      render();
      save();
    } catch (e) {
      draft.status = "idle";
      setStatus("Revision failed.");
    }
  }

  function manualEdit() {
    const draft = getActiveDraft();
    if (!draft) return;

    draft.content = els.editor.value;
    draft.updatedAt = Date.now();
    draft.dirty = true;
    draft.status = "dirty";
    renderMeta();
    save();
  }

  function saveVersion() {
    const draft = getActiveDraft();
    if (!draft) return;

    draft.versions.unshift(
      createVersion("Manual save", draft.content, "")
    );

    draft.dirty = false;
    draft.status = "ready";
    render();
    save();
  }

  function restoreVersion(id) {
    const draft = getActiveDraft();
    if (!draft) return;

    const v = draft.versions.find(x => x.id === id);
    if (!v) return;

    draft.content = v.content;
    draft.updatedAt = Date.now();
    draft.dirty = false;
    draft.status = "ready";

    render();
    save();
  }

  function renderMeta() {
    const draft = getActiveDraft();

    if (!draft) {
      els.meta.textContent = "No draft";
      return;
    }

    els.meta.textContent =
      "Updated " + new Date(draft.updatedAt).toLocaleString();

    els.dirty.textContent = draft.dirty ? "Unsaved edits" : "";
    setStatus(draft.status === "dirty" ? "Unsaved edits" : "");
  }

  function renderVersions() {
    const draft = getActiveDraft();

    if (!draft || !draft.versions.length) {
      els.versions.innerHTML = "<div>No versions</div>";
      return;
    }

    els.versions.innerHTML = draft.versions
      .map(v => {
        return `
        <div class="draft-version">
          <strong>${escape(v.label)}</strong>
          <span>${new Date(v.createdAt).toLocaleString()}</span>
          <button data-id="${v.id}">Restore</button>
        </div>
      `;
      })
      .join("");
  }

  function render() {
    const draft = getActiveDraft();

    if (!draft) {
      els.title.textContent = "Working Draft";
      els.editor.value = "";
      renderMeta();
      renderVersions();
      return;
    }

    openWorkspace();

    els.title.textContent = draft.title;
    if (els.editor.value !== draft.content) {
      els.editor.value = draft.content;
    }

    renderMeta();
    renderVersions();
  }

  function escape(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function bind() {
    els.generate?.addEventListener("click", generateDraft);

    els.apply?.addEventListener("click", () => {
      reviseDraft(els.instruction.value.trim());
    });

    els.editor?.addEventListener("input", manualEdit);

    els.save?.addEventListener("click", saveVersion);

    els.close?.addEventListener("click", closeWorkspace);

    els.versions?.addEventListener("click", e => {
      const id = e.target.getAttribute("data-id");
      if (id) restoreVersion(id);
    });

    window.addEventListener("zhuxin:thread-changed", () => {
      load();
      render();
    });
  }

  function cache() {
    els.prompt = document.getElementById("assistantPromptInput");
    els.generate = document.getElementById("assistantGenerateDraftBtn");

    els.workspace = document.getElementById("assistantDraftWorkspace");
    els.title = document.getElementById("assistantDraftTitle");
    els.meta = document.getElementById("assistantDraftMeta");
    els.status = document.getElementById("assistantDraftStatus");
    els.instruction = document.getElementById("assistantDraftInstructionInput");
    els.apply = document.getElementById("assistantDraftApplyInstructionBtn");
    els.editor = document.getElementById("assistantDraftEditor");
    els.close = document.getElementById("assistantDraftCloseBtn");
    els.save = document.getElementById("assistantDraftSaveVersionBtn");
    els.versions = document.getElementById("assistantDraftVersions");
    els.dirty = document.getElementById("assistantDraftDirtyState");
  }

  function init() {
    cache();
    load();
    bind();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);

  window.ZhuxinDraftEditor = {
    init
  };
})();
