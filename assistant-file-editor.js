(function () {
  const STORE_KEY_PREFIX = "zhuxin-file-editor:";

  const els = {};
  let state = createEmptyState();

  function getAssistant() {
    window.appData = window.appData || {};
    window.appData.assistant = window.appData.assistant || {};
    window.appData.assistant.activeThreadId =
      window.appData.assistant.activeThreadId || "assistant-default-thread";
    return window.appData.assistant;
  }

  function getConfig() {
    const assistant = getAssistant();
    return assistant.fileEditor || {
      enabled: true,
      supportedExtensions: ["txt", "md", "html", "htm"],
      maxFileSizeBytes: 600000,
      maxInstructionChars: 3000,
      maxOperationsPerPass: 12,
      maxBlockChars: 2800,
      storageKeyPrefix: "zhuxin-assistant-fileedit:",
      defaults: {
        preserveStructure: true,
        trackChanges: true,
        wholeDocumentMode: false
      }
    };
  }

  function getThreadId() {
    return getAssistant().activeThreadId || "assistant-default-thread";
  }

  function getStorageKey() {
    return STORE_KEY_PREFIX + getThreadId();
  }

  function createEmptyState() {
    const cfg = getConfig();
    return {
      isOpen: false,
      fileName: "",
      extension: "",
      originalContent: "",
      workingContent: "",
      blocks: [],
      lastInstruction: "",
      suggestions: [],
      warnings: [],
      summary: "",
      appliedHistory: [],
      rejectedSuggestionIds: [],
      lastBatchBaseContent: "",
      options: {
        preserveStructure: cfg.defaults?.preserveStructure !== false,
        trackChanges: cfg.defaults?.trackChanges !== false,
        wholeDocumentMode: !!cfg.defaults?.wholeDocumentMode
      }
    };
  }

  function save() {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(state));
    } catch (err) {
      console.warn("File editor save failed:", err);
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(getStorageKey());
      if (!raw) {
        state = createEmptyState();
        return;
      }
      state = Object.assign(createEmptyState(), JSON.parse(raw));
    } catch (err) {
      console.warn("File editor load failed:", err);
      state = createEmptyState();
    }
  }

  function reset() {
    state = createEmptyState();
    render();
    save();
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getExtension(name) {
    const parts = String(name || "").toLowerCase().split(".");
    return parts.length > 1 ? parts.pop() : "";
  }

  function supportsExtension(ext) {
    return getConfig().supportedExtensions.indexOf(ext) >= 0;
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function segmentDocument(content, ext, wholeDocumentMode) {
    const cfg = getConfig();

    if (wholeDocumentMode) {
      return [{
        id: "b1",
        index: 0,
        text: String(content || "").slice(0, cfg.maxBlockChars)
      }];
    }

    let chunks;

    if (ext === "md") {
      chunks = String(content || "").split(/\n(?=#{1,6}\s)/g);
    } else {
      chunks = String(content || "").split(/\n\s*\n/g);
    }

    chunks = chunks
      .map(function (item) { return item.trim(); })
      .filter(Boolean);

    if (!chunks.length) {
      chunks = [String(content || "")];
    }

    return chunks.map(function (text, index) {
      return {
        id: "b" + (index + 1),
        index: index,
        text: String(text || "").slice(0, cfg.maxBlockChars)
      };
    });
  }

  function rebuildBlocks() {
    state.blocks = segmentDocument(
      state.workingContent,
      state.extension,
      state.options.wholeDocumentMode
    );
  }

  function openPanel() {
    state.isOpen = true;
    render();
    save();
  }

  function closePanel() {
    state.isOpen = false;
    render();
    save();
  }

  function setWarnings(list) {
    state.warnings = Array.isArray(list) ? list : [];
    renderWarnings();
    save();
  }

  async function handleFileLoad(file) {
    const cfg = getConfig();
    const ext = getExtension(file.name);

    if (!supportsExtension(ext)) {
      setWarnings([
        "Unsupported file type. Supported: " + cfg.supportedExtensions.join(", ")
      ]);
      return;
    }

    if (file.size > cfg.maxFileSizeBytes) {
      setWarnings([
        "File is too large for safe in-browser edit mode."
      ]);
      return;
    }

    const content = await readFileAsText(file);

    state.fileName = file.name;
    state.extension = ext;
    state.originalContent = content;
    state.workingContent = content;
    state.suggestions = [];
    state.warnings = [];
    state.summary = "";
    state.appliedHistory = [];
    state.rejectedSuggestionIds = [];
    state.lastBatchBaseContent = "";
    rebuildBlocks();

    openPanel();
    save();
  }

  function buildPayload(instruction) {
    return {
      instruction: instruction,
      options: state.options,
      fileMeta: {
        fileName: state.fileName,
        extension: state.extension
      },
      blocks: state.blocks
    };
  }

  async function runSuggestionPass() {
    const instruction = (els.instruction.value || "").trim();
    const cfg = getConfig();

    if (!state.fileName) {
      setWarnings(["Load a file first."]);
      return;
    }

    if (!instruction) {
      setWarnings(["Enter an edit instruction."]);
      return;
    }

    if (instruction.length > cfg.maxInstructionChars) {
      setWarnings(["Instruction is too long."]);
      return;
    }

    state.lastInstruction = instruction;
    state.warnings = [];
    renderWarnings();

    const payload = buildPayload(instruction);
    state.lastBatchBaseContent = state.workingContent;

    try {
      const result = await window.GenerationEngine.fileEdit.run(payload);

      state.summary = result.summary || "";
      state.warnings = result.warnings || [];
      state.suggestions = (result.operations || []).map(function (op) {
        return Object.assign({}, op, {
          status: "pending",
          stale: false
        });
      });

      render();
      save();
    } catch (err) {
      setWarnings(["Edit suggestion pass failed: " + (err.message || "Unknown error")]);
    }
  }

  function findSuggestion(id) {
    return state.suggestions.find(function (item) {
      return item.id === id;
    });
  }

  function getBlockText(blockId) {
    const block = state.blocks.find(function (b) {
      return b.id === blockId;
    });
    return block ? block.text : "";
  }

  function markStaleSuggestions() {
    state.suggestions.forEach(function (op) {
      if (op.status !== "pending") return;

      if (op.action === "replace" || op.action === "delete") {
        op.stale = !op.before || state.workingContent.indexOf(op.before) === -1;
      } else if (op.action === "insert_before" || op.action === "insert_after") {
        op.stale = state.workingContent.indexOf(getBlockText(op.blockId)) === -1;
      }
    });
  }

  function applyOperation(op) {
    if (!op || op.status !== "pending" || op.stale) return false;

    const beforeSnapshot = state.workingContent;
    let nextContent = state.workingContent;
    const anchorText = getBlockText(op.blockId);

    if (op.action === "replace") {
      if (!op.before || nextContent.indexOf(op.before) === -1) {
        op.stale = true;
        render();
        save();
        return false;
      }
      nextContent = nextContent.replace(op.before, op.after);
    }

    if (op.action === "delete") {
      if (!op.before || nextContent.indexOf(op.before) === -1) {
        op.stale = true;
        render();
        save();
        return false;
      }
      nextContent = nextContent.replace(op.before, "");
    }

    if (op.action === "insert_before") {
      if (!anchorText || nextContent.indexOf(anchorText) === -1) {
        op.stale = true;
        render();
        save();
        return false;
      }
      nextContent = nextContent.replace(anchorText, op.after + "\n\n" + anchorText);
    }

    if (op.action === "insert_after") {
      if (!anchorText || nextContent.indexOf(anchorText) === -1) {
        op.stale = true;
        render();
        save();
        return false;
      }
      nextContent = nextContent.replace(anchorText, anchorText + "\n\n" + op.after);
    }

    state.workingContent = nextContent;
    state.appliedHistory.push({
      operationId: op.id,
      previousContent: beforeSnapshot
    });

    op.status = "applied";
    rebuildBlocks();
    markStaleSuggestions();
    render();
    save();
    return true;
  }

  function rejectOperation(id) {
    const op = findSuggestion(id);
    if (!op) return;

    op.status = "rejected";
    state.rejectedSuggestionIds.push(id);
    render();
    save();
  }

  function applyAllSafe() {
    markStaleSuggestions();
    state.suggestions.forEach(function (op) {
      if (op.status === "pending" && !op.stale) {
        applyOperation(op);
      }
    });
    render();
    save();
  }

  function undoLastApply() {
    const last = state.appliedHistory.pop();
    if (!last) return;

    state.workingContent = last.previousContent;

    state.suggestions.forEach(function (op) {
      if (op.id === last.operationId) {
        op.status = "pending";
      }
      op.stale = false;
    });

    rebuildBlocks();
    render();
    save();
  }

  function renderMeta() {
    if (!state.fileName) {
      els.meta.classList.add("hidden");
      els.meta.innerHTML = "";
      return;
    }

    els.meta.classList.remove("hidden");
    els.meta.innerHTML =
      "<strong>Loaded file:</strong> " + escapeHtml(state.fileName) +
      " &nbsp;|&nbsp; <strong>Blocks:</strong> " + state.blocks.length +
      " &nbsp;|&nbsp; <strong>Mode:</strong> " +
      (state.options.wholeDocumentMode ? "Whole document" : "Block edit");
  }

  function renderWarnings() {
    if (!state.warnings.length) {
      els.warnings.classList.add("hidden");
      els.warnings.innerHTML = "";
      return;
    }

    els.warnings.classList.remove("hidden");
    els.warnings.innerHTML = state.warnings.map(function (w) {
      return '<div class="assistant-warning-line">' + escapeHtml(w) + '</div>';
    }).join("");
  }

  function renderSuggestions() {
    markStaleSuggestions();

    if (!state.suggestions.length) {
      els.suggestions.classList.add("hidden");
      els.suggestions.innerHTML = "";
      els.applyAllBtn.disabled = true;
      return;
    }

    els.suggestions.classList.remove("hidden");
    els.applyAllBtn.disabled = false;

    els.suggestions.innerHTML = state.suggestions.map(function (op) {
      const staleClass = op.stale ? " is-stale" : "";
      return (
        '<div class="assistant-edit-card' + staleClass + '" data-op-id="' + escapeHtml(op.id) + '">' +
          '<div class="assistant-edit-card-top">' +
            '<strong>' + escapeHtml(op.action) + '</strong>' +
            '<span>Block ' + escapeHtml(op.blockId) + '</span>' +
            '<span>Confidence ' + escapeHtml(String(op.confidence)) + '</span>' +
          '</div>' +
          '<div class="assistant-edit-reason">' + escapeHtml(op.reason || "") + '</div>' +
          '<div class="assistant-edit-grid">' +
            '<div><div class="assistant-edit-label">Before</div><pre>' + escapeHtml(op.before || getBlockText(op.blockId)) + '</pre></div>' +
            '<div><div class="assistant-edit-label">After</div><pre>' + escapeHtml(op.after || "") + '</pre></div>' +
          '</div>' +
          '<div class="assistant-edit-actions">' +
            '<button type="button" class="assistant-apply-op-btn" data-id="' + escapeHtml(op.id) + '" ' + ((op.status !== "pending" || op.stale) ? "disabled" : "") + '>Apply</button>' +
            '<button type="button" class="assistant-reject-op-btn" data-id="' + escapeHtml(op.id) + '" ' + (op.status !== "pending" ? "disabled" : "") + '>Reject</button>' +
          '</div>' +
        '</div>'
      );
    }).join("");
  }

  function renderWorkingPreview() {
    if (!els.preview) return;
    els.preview.textContent = state.workingContent || "";
  }

  function render() {
    if (!els.panel) return;

    els.panel.classList.toggle("hidden", !state.isOpen);
    els.instruction.value = state.lastInstruction || "";
    els.preserve.checked = !!state.options.preserveStructure;
    els.track.checked = !!state.options.trackChanges;
    els.whole.checked = !!state.options.wholeDocumentMode;
    els.undoBtn.disabled = state.appliedHistory.length === 0;

    renderMeta();
    renderWarnings();
    renderSuggestions();
    renderWorkingPreview();
  }

  function bindEvents() {
    els.openBtn?.addEventListener("click", openPanel);
    els.closeBtn?.addEventListener("click", closePanel);

    els.fileInput?.addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      if (file) handleFileLoad(file);
    });

    els.clearBtn?.addEventListener("click", reset);
    els.runBtn?.addEventListener("click", runSuggestionPass);
    els.applyAllBtn?.addEventListener("click", applyAllSafe);
    els.undoBtn?.addEventListener("click", undoLastApply);

    els.preserve?.addEventListener("change", function () {
      state.options.preserveStructure = !!els.preserve.checked;
      save();
    });

    els.track?.addEventListener("change", function () {
      state.options.trackChanges = !!els.track.checked;
      save();
    });

    els.whole?.addEventListener("change", function () {
      state.options.wholeDocumentMode = !!els.whole.checked;
      rebuildBlocks();
      render();
      save();
    });

    els.suggestions?.addEventListener("click", function (event) {
      const applyBtn = event.target.closest(".assistant-apply-op-btn");
      const rejectBtn = event.target.closest(".assistant-reject-op-btn");

      if (applyBtn) {
        applyOperation(findSuggestion(applyBtn.getAttribute("data-id")));
      }

      if (rejectBtn) {
        rejectOperation(rejectBtn.getAttribute("data-id"));
      }
    });

    window.addEventListener("zhuxin:thread-changed", function () {
      load();
      render();
    });
  }

  function bindElements() {
    els.openBtn = document.getElementById("assistantOpenFileEditBtn");
    els.closeBtn = document.getElementById("assistantCloseFileEditBtn");
    els.panel = document.getElementById("assistantFileEditPanel");
    els.fileInput = document.getElementById("assistantFileInput");
    els.clearBtn = document.getElementById("assistantClearLoadedFileBtn");
    els.meta = document.getElementById("assistantLoadedFileMeta");
    els.instruction = document.getElementById("assistantFileEditInstruction");
    els.runBtn = document.getElementById("assistantRunFileEditBtn");
    els.applyAllBtn = document.getElementById("assistantApplyAllFileEditsBtn");
    els.undoBtn = document.getElementById("assistantRevertLastFileEditBtn");
    els.warnings = document.getElementById("assistantFileEditWarnings");
    els.suggestions = document.getElementById("assistantFileEditSuggestions");
    els.preserve = document.getElementById("assistantPreserveStructureToggle");
    els.track = document.getElementById("assistantTrackChangesToggle");
    els.whole = document.getElementById("assistantWholeDocToggle");
    els.preview = document.getElementById("assistantFileWorkingPreview");
  }

  function init() {
    bindElements();
    load();
    bindEvents();
    render();
  }

  window.AssistantFileEditor = {
    init: init,
    getState: function () { return state; },
    resetState: reset
  };

  document.addEventListener("DOMContentLoaded", function () {
    window.AssistantFileEditor.init();
  });
})();
