(function () {
  const STORAGE_KEY = "zhuxin.assistant.fileedit.v1";

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

  function ensureState(threadId) {
    var store = loadStore();
    if (!store[threadId]) {
      store[threadId] = {
        fileName: "",
        extension: "",
        originalContent: "",
        workingContent: "",
        blocks: [],
        suggestions: [],
        appliedHistory: []
      };
      saveStore(store);
    }
    return store[threadId];
  }

  function readEls() {
    return {
      panel: document.getElementById("assistantFileEditPanel"),
      openBtn: document.getElementById("assistantOpenFileEditBtn"),
      closeBtn: document.getElementById("assistantCloseFileEditBtn"),
      fileInput: document.getElementById("assistantFileInput"),
      clearBtn: document.getElementById("assistantClearLoadedFileBtn"),
      meta: document.getElementById("assistantLoadedFileMeta"),
      instruction: document.getElementById("assistantFileEditInstruction"),
      runBtn: document.getElementById("assistantRunFileEditBtn"),
      applyAllBtn: document.getElementById("assistantApplyAllFileEditsBtn"),
      undoBtn: document.getElementById("assistantRevertLastFileEditBtn"),
      warnings: document.getElementById("assistantFileEditWarnings"),
      suggestions: document.getElementById("assistantFileEditSuggestions"),
      preview: document.getElementById("assistantFileWorkingPreview")
    };
  }

  function getExtension(name) {
    var parts = String(name || "").toLowerCase().split(".");
    return parts.length > 1 ? parts.pop() : "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function segment(content) {
    var chunks = String(content || "").split(/\n\s*\n/g).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!chunks.length) chunks = [String(content || "")];
    return chunks.map(function (text, index) {
      return { id: "b" + (index + 1), index: index, text: text };
    });
  }

  function render() {
    var els = readEls();
    var state = ensureState(getThreadId());

    if (els.meta) {
      if (!state.fileName) {
        els.meta.classList.add("hidden");
        els.meta.textContent = "";
      } else {
        els.meta.classList.remove("hidden");
        els.meta.textContent = "Loaded file: " + state.fileName + " | Blocks: " + state.blocks.length;
      }
    }

    if (els.preview) {
      els.preview.textContent = state.workingContent || "";
    }

    if (els.undoBtn) {
      els.undoBtn.disabled = !state.appliedHistory.length;
    }

    if (els.applyAllBtn) {
      els.applyAllBtn.disabled = !state.suggestions.some(function (s) { return s.status === "pending"; });
    }

    if (els.suggestions) {
      if (!state.suggestions.length) {
        els.suggestions.classList.add("hidden");
        els.suggestions.innerHTML = "";
      } else {
        els.suggestions.classList.remove("hidden");
        els.suggestions.innerHTML = state.suggestions.map(function (op) {
          return (
            '<div class="assistant-edit-card' + (op.stale ? ' is-stale' : '') + '">' +
              '<div class="assistant-edit-card-top"><strong>' + op.action + '</strong><span>' + op.blockId + '</span></div>' +
              '<div class="assistant-edit-label">Reason</div><div>' + escapeHtml(op.reason || "") + '</div>' +
              '<div class="assistant-edit-grid">' +
                '<div><div class="assistant-edit-label">Before</div><pre>' + escapeHtml(op.before || "") + '</pre></div>' +
                '<div><div class="assistant-edit-label">After</div><pre>' + escapeHtml(op.after || "") + '</pre></div>' +
              '</div>' +
              '<div class="assistant-edit-actions">' +
                '<button type="button" class="btn-soft" data-apply-op="' + op.id + '"' + ((op.status !== "pending" || op.stale) ? " disabled" : "") + '>Apply</button>' +
                '<button type="button" class="btn-soft" data-reject-op="' + op.id + '"' + (op.status !== "pending" ? " disabled" : "") + '>Reject</button>' +
              '</div>' +
            '</div>'
          );
        }).join("");
      }
    }
  }

  function openPanel() {
    var els = readEls();
    if (els.panel) els.panel.classList.remove("hidden");
  }

  function closePanel() {
    var els = readEls();
    if (els.panel) els.panel.classList.add("hidden");
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async function handleFileLoad(file) {
    var state = ensureState(getThreadId());
    var content = await readFileAsText(file);

    state.fileName = file.name;
    state.extension = getExtension(file.name);
    state.originalContent = content;
    state.workingContent = content;
    state.blocks = segment(content);
    state.suggestions = [];
    state.appliedHistory = [];

    var store = loadStore();
    store[getThreadId()] = state;
    saveStore(store);

    openPanel();
    render();
  }

  function buildSuggestions() {
    var els = readEls();
    var state = ensureState(getThreadId());
    var instruction = (els.instruction && els.instruction.value || "").trim();

    if (!state.fileName) {
      if (els.warnings) {
        els.warnings.classList.remove("hidden");
        els.warnings.textContent = "Load a file first.";
      }
      return;
    }

    if (!instruction) {
      if (els.warnings) {
        els.warnings.classList.remove("hidden");
        els.warnings.textContent = "Write an edit instruction first.";
      }
      return;
    }

    if (els.warnings) {
      els.warnings.classList.add("hidden");
      els.warnings.textContent = "";
    }

    state.suggestions = state.blocks.slice(0, 3).map(function (block, idx) {
      return {
        id: "op_" + Date.now() + "_" + idx,
        action: "replace",
        blockId: block.id,
        before: block.text,
        after: block.text + "\n\n[Edited: " + instruction + "]",
        reason: instruction,
        status: "pending",
        stale: false
      };
    });

    var store = loadStore();
    store[getThreadId()] = state;
    saveStore(store);
    render();
  }

  function applyOperation(opId) {
    var state = ensureState(getThreadId());
    var op = state.suggestions.find(function (s) { return s.id === opId; });
    if (!op || op.status !== "pending") return;

    if (state.workingContent.indexOf(op.before) === -1) {
      op.stale = true;
      render();
      return;
    }

    state.appliedHistory.push({
      opId: op.id,
      previousContent: state.workingContent
    });

    state.workingContent = state.workingContent.replace(op.before, op.after);
    state.blocks = segment(state.workingContent);
    op.status = "applied";

    state.suggestions.forEach(function (s) {
      if (s.status === "pending" && state.workingContent.indexOf(s.before) === -1) {
        s.stale = true;
      }
    });

    var store = loadStore();
    store[getThreadId()] = state;
    saveStore(store);
    render();
  }

  function rejectOperation(opId) {
    var state = ensureState(getThreadId());
    var op = state.suggestions.find(function (s) { return s.id === opId; });
    if (!op) return;
    op.status = "rejected";

    var store = loadStore();
    store[getThreadId()] = state;
    saveStore(store);
    render();
  }

  function applyAll() {
    var state = ensureState(getThreadId());
    state.suggestions.filter(function (s) {
      return s.status === "pending" && !s.stale;
    }).forEach(function (s) {
      applyOperation(s.id);
    });
    render();
  }

  function undoLast() {
    var state = ensureState(getThreadId());
    var last = state.appliedHistory.pop();
    if (!last) return;

    state.workingContent = last.previousContent;
    state.blocks = segment(state.workingContent);
    state.suggestions.forEach(function (s) {
      if (s.id === last.opId) s.status = "pending";
      s.stale = false;
    });

    var store = loadStore();
    store[getThreadId()] = state;
    saveStore(store);
    render();
  }

  function clearFile() {
    var store = loadStore();
    store[getThreadId()] = {
      fileName: "",
      extension: "",
      originalContent: "",
      workingContent: "",
      blocks: [],
      suggestions: [],
      appliedHistory: []
    };
    saveStore(store);
    render();
  }

  function bind() {
    var els = readEls();

    if (els.openBtn) els.openBtn.addEventListener("click", openPanel);
    if (els.closeBtn) els.closeBtn.addEventListener("click", closePanel);
    if (els.fileInput) {
      els.fileInput.addEventListener("change", function (event) {
        var file = event.target.files && event.target.files[0];
        if (file) handleFileLoad(file);
      });
    }
    if (els.clearBtn) els.clearBtn.addEventListener("click", clearFile);
    if (els.runBtn) els.runBtn.addEventListener("click", buildSuggestions);
    if (els.applyAllBtn) els.applyAllBtn.addEventListener("click", applyAll);
    if (els.undoBtn) els.undoBtn.addEventListener("click", undoLast);

    if (els.suggestions) {
      els.suggestions.addEventListener("click", function (event) {
        var applyBtn = event.target.closest("[data-apply-op]");
        var rejectBtn = event.target.closest("[data-reject-op]");
        if (applyBtn) applyOperation(applyBtn.getAttribute("data-apply-op"));
        if (rejectBtn) rejectOperation(rejectBtn.getAttribute("data-reject-op"));
      });
    }

    render();
  }

  window.AssistantFileEditor = { init: bind };
})();
