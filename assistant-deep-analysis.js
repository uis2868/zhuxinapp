window.ZhuxinDeepAnalysis = (function () {
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getAssistant() {
    window.appData = window.appData || {};
    window.appData.assistant = window.appData.assistant || {};
    window.appData.assistant.threadsById = window.appData.assistant.threadsById || {};
    window.appData.assistant.activeThreadId = window.appData.assistant.activeThreadId || "assistant-default-thread";
    return window.appData.assistant;
  }

  function getConfig() {
    var assistant = getAssistant();
    return assistant.deepAnalysis || {
      profiles: {
        balanced: { label: "Balanced", description: "" },
        precision: { label: "Precision", description: "" },
        broad: { label: "Broad scan", description: "" }
      },
      retrievalDepthOptions: ["standard", "expanded", "max"],
      defaultState: {
        enabled: false,
        panelOpen: false,
        profile: "balanced",
        retrievalDepth: "standard",
        sections: {
          issueMap: true,
          evidenceMatrix: true,
          contradictionScan: true,
          missingEvidence: true,
          followUpQuestions: true
        },
        sourceLimit: 12,
        lastRun: null
      }
    };
  }

  function getDefaultState() {
    return clone(getConfig().defaultState);
  }

  function getActiveThreadId() {
    return getAssistant().activeThreadId || "assistant-default-thread";
  }

  function getActiveThread() {
    var assistant = getAssistant();
    var id = getActiveThreadId();
    assistant.threadsById[id] = assistant.threadsById[id] || { id: id };
    return assistant.threadsById[id];
  }

  function saveActiveThread(thread) {
    if (!thread || !thread.id) return;
    getAssistant().threadsById[thread.id] = thread;
  }

  function ensureThreadState(thread) {
    if (!thread) return null;

    if (!thread.deepAnalysis) {
      thread.deepAnalysis = getDefaultState();
    }

    if (!thread.deepAnalysis.sections) {
      thread.deepAnalysis.sections = clone(getDefaultState().sections);
    }

    return thread.deepAnalysis;
  }

  function sanitizeState(raw) {
    var clean = getDefaultState();
    var source = raw || {};

    clean.enabled = !!source.enabled;
    clean.panelOpen = !!source.panelOpen;
    clean.profile = ["balanced", "precision", "broad"].indexOf(source.profile) >= 0
      ? source.profile
      : clean.profile;

    clean.retrievalDepth = ["standard", "expanded", "max"].indexOf(source.retrievalDepth) >= 0
      ? source.retrievalDepth
      : clean.retrievalDepth;

    clean.sections.issueMap = source.sections ? !!source.sections.issueMap : clean.sections.issueMap;
    clean.sections.evidenceMatrix = source.sections ? !!source.sections.evidenceMatrix : clean.sections.evidenceMatrix;
    clean.sections.contradictionScan = source.sections ? !!source.sections.contradictionScan : clean.sections.contradictionScan;
    clean.sections.missingEvidence = source.sections ? !!source.sections.missingEvidence : clean.sections.missingEvidence;
    clean.sections.followUpQuestions = source.sections ? !!source.sections.followUpQuestions : clean.sections.followUpQuestions;

    clean.sourceLimit = typeof source.sourceLimit === "number" ? source.sourceLimit : clean.sourceLimit;
    clean.lastRun = source.lastRun || null;

    return clean;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getSelectedSources() {
    if (typeof window.getAssistantSelectedSources === "function") {
      return window.getAssistantSelectedSources() || [];
    }

    if (Array.isArray(window.__zhuxinCurrentFiles)) {
      return window.__zhuxinCurrentFiles;
    }

    if (Array.isArray(window.zhuxinCurrentFiles)) {
      return window.zhuxinCurrentFiles;
    }

    return [];
  }

  function normalizeSource(source, index) {
    return {
      rank: index + 1,
      id: source.id || ("src-" + index),
      title: source.title || source.name || ("Source " + (index + 1)),
      type: source.type || source.fileType || "unknown",
      citationLabel: source.citationLabel || source.reference || source.recordType || "",
      excerpt: source.excerpt || source.snippet || source.preview || source.note || source.summary || source.name || "",
      metadata: source.metadata || {}
    };
  }

  function buildSourcePackets(selectedSources, state) {
    return (selectedSources || [])
      .slice(0, state.sourceLimit)
      .map(normalizeSource);
  }

  function buildPlan(promptText, state, selectedSources) {
    var packets = buildSourcePackets(selectedSources, state);
    var steps = [];

    if (state.sections.issueMap) {
      steps.push("Map the core issues or questions that must be resolved.");
    }

    if (state.sections.evidenceMatrix) {
      steps.push("Group the most relevant source-backed evidence by issue.");
    }

    if (state.sections.contradictionScan) {
      steps.push("Find contradictions, tension points, or unresolved source conflicts.");
    }

    if (state.sections.missingEvidence) {
      steps.push("Identify what is still missing or too weak to support a confident conclusion.");
    }

    if (state.sections.followUpQuestions) {
      steps.push("Produce the most useful follow-up questions or next retrieval targets.");
    }

    return {
      mode: "deep-analysis",
      profile: state.profile,
      retrievalDepth: state.retrievalDepth,
      sourceCount: packets.length,
      sources: packets,
      promptText: String(promptText || "").trim(),
      steps: steps
    };
  }

  function buildSystemInstruction(state) {
    var profileInstruction = {
      balanced: "Be thorough, structured, and grounded. Avoid unsupported jumps.",
      precision: "Be narrow, conservative, and explicit about uncertainty. Prefer tighter claims over broader claims.",
      broad: "Perform wider issue spotting and alternative-angle analysis, while staying grounded in the provided materials."
    }[state.profile];

    return [
      "You are operating in Deep Analysis & Retrieval Intelligence mode.",
      "Your job is not only to answer, but to decompose the problem, organize evidence, surface contradictions, and report missing support.",
      "Do not invent source support.",
      "If evidence is thin or conflicting, say so explicitly.",
      profileInstruction || "Be structured and grounded."
    ].join("\n");
  }

  function buildUserInstruction(plan) {
    var sections = [];

    sections.push("User request:\n" + plan.promptText);

    sections.push(
      "Normalized sources:\n" +
      plan.sources.map(function (src) {
        return [
          "- [" + src.rank + "] " + src.title,
          "  Type: " + src.type,
          src.citationLabel ? "  Reference: " + src.citationLabel : "",
          src.excerpt ? "  Excerpt: " + src.excerpt : ""
        ].filter(Boolean).join("\n");
      }).join("\n")
    );

    sections.push(
      "Required analysis steps:\n" +
      plan.steps.map(function (step, index) {
        return (index + 1) + ". " + step;
      }).join("\n")
    );

    sections.push(
      [
        "Return the answer in this order:",
        "1. Direct conclusion",
        "2. Issue map",
        "3. Evidence matrix",
        "4. Contradictions or tension points",
        "5. Missing evidence / uncertainty",
        "6. Follow-up questions",
        "Use headings. Stay source-grounded."
      ].join("\n")
    );

    return sections.join("\n\n");
  }

  function parseResponse(text) {
    var raw = String(text || "");
    var sections = raw.split(/\n(?=#+\s)/g).map(function (block) {
      return block.trim();
    }).filter(Boolean);

    return {
      raw: raw,
      sections: sections
    };
  }

  function renderMetaHeader(meta) {
    var config = meta.config || {};
    var sectionNames = [];
    var sections = config.sections || {};

    Object.keys(sections).forEach(function (key) {
      if (sections[key]) sectionNames.push(key);
    });

    return [
      '<div class="assistant-analysis-meta">',
      '<div class="assistant-analysis-meta-title">Deep analysis</div>',
      '<div class="assistant-analysis-meta-chips">',
      '<span class="assistant-analysis-meta-chip">Profile: ' + escapeHtml(config.profile || "balanced") + '</span>',
      '<span class="assistant-analysis-meta-chip">Depth: ' + escapeHtml(config.retrievalDepth || "standard") + '</span>',
      '<span class="assistant-analysis-meta-chip">Sources: ' + escapeHtml(meta.sourceCount || 0) + '</span>',
      '<span class="assistant-analysis-meta-chip">Blocks: ' + escapeHtml(sectionNames.join(", ") || "none") + '</span>',
      '</div>',
      '</div>'
    ].join("");
  }

  function syncUiFromThread() {
    var thread = getActiveThread();
    if (!thread) return;

    var state = sanitizeState(ensureThreadState(thread));
    thread.deepAnalysis = state;
    saveActiveThread(thread);

    var toggle = document.getElementById("assistantDeepAnalysisToggle");
    var panel = document.getElementById("assistantDeepAnalysisPanel");
    var depth = document.getElementById("assistantDeepAnalysisDepth");
    var profileButtons = document.querySelectorAll("[data-da-profile]");
    var sectionChecks = document.querySelectorAll("[data-da-section]");

    if (toggle) {
      toggle.classList.toggle("is-active", state.enabled);
      toggle.setAttribute("aria-expanded", state.panelOpen ? "true" : "false");
    }

    if (panel) {
      panel.classList.toggle("hidden", !state.panelOpen);
    }

    if (depth) {
      depth.value = state.retrievalDepth;
    }

    profileButtons.forEach(function (button) {
      button.classList.toggle("is-selected", button.getAttribute("data-da-profile") === state.profile);
    });

    sectionChecks.forEach(function (input) {
      var key = input.getAttribute("data-da-section");
      input.checked = !!state.sections[key];
    });
  }

  function updateThreadState(mutator) {
    var thread = getActiveThread();
    if (!thread) return;

    var state = ensureThreadState(thread);
    mutator(state);
    thread.deepAnalysis = sanitizeState(state);
    saveActiveThread(thread);
    syncUiFromThread();
  }

  function mount() {
    var toggle = document.getElementById("assistantDeepAnalysisToggle");
    var depth = document.getElementById("assistantDeepAnalysisDepth");

    if (toggle) {
      toggle.addEventListener("click", function () {
        updateThreadState(function (state) {
          state.enabled = true;
          state.panelOpen = !state.panelOpen;
        });
      });
    }

    document.querySelectorAll("[data-da-profile]").forEach(function (button) {
      button.addEventListener("click", function () {
        var profile = button.getAttribute("data-da-profile");
        updateThreadState(function (state) {
          state.enabled = true;
          state.profile = profile;
          state.panelOpen = true;
        });
      });
    });

    if (depth) {
      depth.addEventListener("change", function () {
        updateThreadState(function (state) {
          state.enabled = true;
          state.retrievalDepth = depth.value;
        });
      });
    }

    document.querySelectorAll("[data-da-section]").forEach(function (input) {
      input.addEventListener("change", function () {
        var key = input.getAttribute("data-da-section");
        updateThreadState(function (state) {
          state.enabled = true;
          state.sections[key] = input.checked;
          state.panelOpen = true;
        });
      });
    });

    window.addEventListener("zhuxin:thread-changed", function () {
      syncUiFromThread();
    });

    syncUiFromThread();
  }

  function attachToOutgoingPayload(payload) {
    var thread = getActiveThread();
    if (!thread) return payload;

    var state = sanitizeState(ensureThreadState(thread));
    payload.deepAnalysis = clone(state);

    if (!state.enabled) {
      return payload;
    }

    var selectedSources = getSelectedSources();
    payload.deepAnalysisPlan = buildPlan(payload.prompt || payload.finalPrompt || payload.rawPrompt || "", state, selectedSources);

    return payload;
  }

  function stampRunMeta(response) {
    var thread = getActiveThread();
    if (!thread) return response;

    var state = sanitizeState(ensureThreadState(thread));
    state.lastRun = {
      at: new Date().toISOString(),
      responseType: response.type || "assistant-deep-analysis"
    };

    thread.deepAnalysis = state;
    saveActiveThread(thread);

    return response;
  }

  return {
    mount: mount,
    sanitizeState: sanitizeState,
    buildPlan: buildPlan,
    buildSystemInstruction: buildSystemInstruction,
    buildUserInstruction: buildUserInstruction,
    parseResponse: parseResponse,
    renderMetaHeader: renderMetaHeader,
    attachToOutgoingPayload: attachToOutgoingPayload,
    stampRunMeta: stampRunMeta
  };
})();
