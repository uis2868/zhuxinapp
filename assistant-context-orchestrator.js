(function () {
  function getAppData() {
    window.ZHUXIN_APP_DATA = window.ZHUXIN_APP_DATA || {};
    window.ZHUXIN_APP_DATA.assistant = window.ZHUXIN_APP_DATA.assistant || {};
    return window.ZHUXIN_APP_DATA;
  }

  function getConfig() {
    var app = getAppData();
    app.assistant.contextOrchestration = app.assistant.contextOrchestration || {
      defaultMode: "auto",
      maxVisibleChips: 4,
      maxInjectedChars: 6000,
      maxPerSourceChars: 1600,
      autoIncludeTypes: ["matter_profile", "thread_history"],
      strictBlocksUnavailable: true,
      typeLabels: {
        matter_profile: "Matter",
        thread_history: "Thread",
        uploaded_file: "File",
        saved_source: "Saved",
        note: "Note"
      }
    };
    return app.assistant.contextOrchestration;
  }

  function getRootState() {
    window.zhuxinState = window.zhuxinState || {};
    window.zhuxinState.assistant = window.zhuxinState.assistant || {};
    window.zhuxinState.assistant.context = window.zhuxinState.assistant.context || {
      isOpen: false,
      perThread: {}
    };
    return window.zhuxinState.assistant.context;
  }

  function ensureThreadState(threadId) {
    var root = getRootState();
    var config = getConfig();

    if (!root.perThread[threadId]) {
      root.perThread[threadId] = {
        mode: config.defaultMode || "auto",
        selectedSourceIds: [],
        lastWarning: "",
        lastPacket: null
      };
    }
    return root.perThread[threadId];
  }

  function getThreadMeta(threadId) {
    var app = getAppData();
    var threads = (app.assistant && app.assistant.threads) || [];
    return threads.find(function (t) { return t.id === threadId; }) || { id: threadId };
  }

  function getMatterProfile(matterId) {
    var app = getAppData();
    var matterProfiles = (app.assistant && app.assistant.matterProfiles) || [];
    return matterProfiles.find(function (m) { return m.id === matterId; }) || null;
  }

  function normalizeRegistry(threadId) {
    var app = getAppData();
    var threadMeta = getThreadMeta(threadId);
    var matterId = threadMeta.matterId || (app.assistant && app.assistant.currentMatterId) || null;
    var registry = [];
    var recentMessages = (threadMeta.messages || []).slice(-4);

    if (matterId) {
      var matter = getMatterProfile(matterId);
      if (matter && matter.summary) {
        registry.push({
          id: "matter-profile:" + matter.id,
          label: matter.label || matter.title || "Matter Profile",
          type: "matter_profile",
          scope: "matter",
          matterId: matter.id,
          status: matter.status || "ready",
          priority: 100,
          auto: true,
          content: matter.summary
        });
      }
    }

    if (recentMessages.length) {
      registry.push({
        id: "thread-history:" + threadId,
        label: "Recent Thread History",
        type: "thread_history",
        scope: "thread",
        threadId: threadId,
        status: "ready",
        priority: 90,
        auto: true,
        content: recentMessages.map(function (m) {
          return (m.role || "user").toUpperCase() + ": " + (m.text || "");
        }).join("\n")
      });
    }

    ((app.assistant && app.assistant.uploadedFiles) || []).forEach(function (file) {
      if (file.threadId && file.threadId !== threadId) return;
      if (file.matterId && matterId && file.matterId !== matterId) return;

      registry.push({
        id: "uploaded-file:" + file.id,
        label: file.label || file.name || "Uploaded File",
        type: "uploaded_file",
        scope: file.threadId ? "thread" : "matter",
        matterId: file.matterId || null,
        threadId: file.threadId || null,
        status: file.status || "ready",
        priority: file.priority || 70,
        auto: false,
        content: file.summary || file.excerpt || ""
      });
    });

    ((app.assistant && app.assistant.savedSources) || []).forEach(function (source) {
      if (source.threadId && source.threadId !== threadId) return;
      if (source.matterId && matterId && source.matterId !== matterId) return;

      registry.push({
        id: "saved-source:" + source.id,
        label: source.label || source.title || "Saved Source",
        type: source.type || "saved_source",
        scope: source.threadId ? "thread" : "matter",
        matterId: source.matterId || null,
        threadId: source.threadId || null,
        status: source.status || "ready",
        priority: source.priority || 60,
        auto: !!source.auto,
        content: source.summary || source.excerpt || source.text || ""
      });
    });

    return registry;
  }

  function getEffectiveSourceIds(threadId) {
    var threadState = ensureThreadState(threadId);
    var registry = normalizeRegistry(threadId);

    if (threadState.mode === "manual" || threadState.mode === "strict") {
      return threadState.selectedSourceIds.slice();
    }

    var autoIds = registry
      .filter(function (s) { return !!s.auto; })
      .map(function (s) { return s.id; });

    var manualAdditions = threadState.selectedSourceIds.filter(function (id) {
      return autoIds.indexOf(id) === -1;
    });

    return autoIds.concat(manualAdditions);
  }

  function dedupeBlocks(blocks) {
    var seen = {};
    return blocks.filter(function (b) {
      var key = [b.type, b.label, b.content].join("::");
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function trimBlocks(blocks) {
    var config = getConfig();
    var total = 0;
    var maxTotal = config.maxInjectedChars || 6000;
    var maxPerSource = config.maxPerSourceChars || 1600;

    return blocks.filter(function (block) {
      block.content = (block.content || "").slice(0, maxPerSource);

      if (!block.content.trim()) return false;
      if (total >= maxTotal) return false;

      var remaining = maxTotal - total;
      if (block.content.length > remaining) {
        block.content = block.content.slice(0, remaining);
      }

      total += block.content.length;
      return !!block.content.trim();
    });
  }

  function buildContextPacket(rawPrompt, opts) {
    opts = opts || {};
    var threadId = opts.currentThreadId || "assistant-default-thread";
    var threadState = ensureThreadState(threadId);
    var registry = normalizeRegistry(threadId);
    var effectiveIds = getEffectiveSourceIds(threadId);

    var blocks = registry
      .filter(function (item) { return effectiveIds.indexOf(item.id) !== -1; })
      .sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); })
      .map(function (item) {
        return {
          id: item.id,
          label: item.label,
          type: item.type,
          status: item.status,
          priority: item.priority || 0,
          content: item.content || ""
        };
      });

    blocks = dedupeBlocks(blocks);
    blocks = trimBlocks(blocks);

    var errors = [];
    var warnings = [];
    var config = getConfig();

    if ((threadState.mode === "manual" || threadState.mode === "strict") && !blocks.length) {
      errors.push("Select at least one source or switch back to Auto mode.");
    }

    if (config.strictBlocksUnavailable && threadState.mode === "strict") {
      var unavailable = blocks.filter(function (b) {
        return b.status && b.status !== "ready";
      });
      if (unavailable.length) {
        errors.push("Strict mode cannot send with stale or unavailable sources.");
      }
    }

    if (!blocks.length && threadState.mode === "auto") {
      warnings.push("No context sources resolved. The Assistant will use only the typed prompt.");
    }

    var packet = {
      mode: threadState.mode,
      threadId: threadId,
      rawPrompt: rawPrompt || "",
      selectedSourceIds: effectiveIds,
      blocks: blocks,
      warnings: warnings,
      errors: errors,
      blocked: errors.length > 0
    };

    packet.serializedPrompt = serializePacket(packet);
    threadState.lastPacket = packet;
    threadState.lastWarning = errors[0] || warnings[0] || "";

    return packet;
  }

  function serializePacket(packet) {
    if (!packet || !packet.blocks || !packet.blocks.length) {
      return packet.rawPrompt || "";
    }

    var lines = [];
    lines.push("[ASSISTANT CONTEXT ORCHESTRATION]");
    lines.push("Mode: " + packet.mode);
    lines.push("");

    packet.blocks.forEach(function (block, index) {
      lines.push("[" + (index + 1) + "] " + block.label + " · " + block.type + " · " + (block.status || "ready"));
      lines.push(block.content);
      lines.push("");
    });

    lines.push("[USER PROMPT]");
    lines.push(packet.rawPrompt || "");

    return lines.join("\n");
  }

  function setMode(threadId, mode) {
    var state = ensureThreadState(threadId);
    state.mode = mode;
  }

  function toggleSource(threadId, sourceId, isChecked) {
    var state = ensureThreadState(threadId);
    var exists = state.selectedSourceIds.indexOf(sourceId) !== -1;

    if (isChecked && !exists) {
      state.selectedSourceIds.push(sourceId);
      return;
    }

    if (!isChecked && exists) {
      state.selectedSourceIds = state.selectedSourceIds.filter(function (id) {
        return id !== sourceId;
      });
    }
  }

  function render(opts) {
    var threadId = opts.getCurrentThreadId();
    var state = ensureThreadState(threadId);
    var registry = normalizeRegistry(threadId);
    var config = getConfig();
    var effectiveIds = getEffectiveSourceIds(threadId);
    var matterId = getThreadMeta(threadId).matterId || "No matter";
    var chipList = document.getElementById(opts.chipListId);
    var summaryEl = document.getElementById(opts.summaryId);
    var sourceListEl = document.getElementById(opts.sourceListId);
    var currentLabelEl = document.getElementById(opts.currentLabelId);
    var warningEl = document.getElementById(opts.warningId);
    var panelEl = document.getElementById(opts.contextPanelId);

    if (currentLabelEl) {
      currentLabelEl.textContent = "Current thread: " + threadId + " · Matter: " + matterId;
    }

    var chipMarkup = [];
    effectiveIds.slice(0, config.maxVisibleChips).forEach(function (id) {
      var item = registry.find(function (s) { return s.id === id; });
      if (!item) return;

      var cls = "assistant-context-chip ";
      cls += state.selectedSourceIds.indexOf(id) !== -1 ? "assistant-context-chip--manual" : "assistant-context-chip--auto";
      if (item.status && item.status !== "ready") cls += " assistant-context-chip--stale";

      chipMarkup.push('<span class="' + cls + '">' + escapeHtml(item.label) + '</span>');
    });

    if (effectiveIds.length > config.maxVisibleChips) {
      chipMarkup.push('<span class="assistant-context-chip">+' + (effectiveIds.length - config.maxVisibleChips) + ' more</span>');
    }

    if (chipList) chipList.innerHTML = chipMarkup.join("");
    if (summaryEl) {
      summaryEl.textContent = capitalize(state.mode) + " · " + effectiveIds.length + " active source" + (effectiveIds.length === 1 ? "" : "s");
    }
