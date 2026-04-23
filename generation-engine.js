/* Zhuxin Assistant — Unified generation-engine.js
   Final merged engine pipeline for Assistant Subfeatures 1–14.
   This file is designed for a static HTML/JS repo and assumes helper files may exist.
   Safe behavior:
   - Falls back gracefully when a helper module is not loaded
   - Keeps rawPrompt separate from finalPrompt
   - Centralizes preflight + post-processing
*/

(function (window, document) {
  "use strict";

  window.ZhuxinApp = window.ZhuxinApp || {};
  var App = window.ZhuxinApp;

  App.state = App.state || {};
  App.state.assistant = App.state.assistant || {};
  App.state.assistant.threads = App.state.assistant.threads || [];
  App.state.assistant.activeThreadId = App.state.assistant.activeThreadId || null;

  window.ZHUXIN_APP_DATA = window.ZHUXIN_APP_DATA || {};
  window.ZHUXIN_APP_DATA.assistant = window.ZHUXIN_APP_DATA.assistant || {};
  window.ZHUXIN_ASSISTANT_CONFIG = window.ZHUXIN_ASSISTANT_CONFIG || {};

  var ENGINE_NS = App.GenerationEngine = App.GenerationEngine || {};

  var DEFAULTS = {
    selectors: {
      promptInput: "#assistantPromptInput, #assistant-prompt-input, #assistant-composer-input",
      sendButton: "#assistantSendButton, #assistantSendBtn",
      improveButton: "#assistantImproveButton, #assistantImproveBtn",
      threadRoot: "#assistantThread, #assistant-thread, [data-assistant-thread]",
      messageList: "#assistant-message-list, #messages",
      inlineError: "#assistantComposerError, #assistant-inline-error",
      statusBar: "#statusBar"
    },
    requestTimeoutMs: 45000
  };

  function qs(selector) {
    if (!selector) return null;
    var parts = String(selector).split(",");
    for (var i = 0; i < parts.length; i += 1) {
      var el = document.querySelector(parts[i].trim());
      if (el) return el;
    }
    return null;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      return value;
    }
  }

  function isFn(value) {
    return typeof value === "function";
  }

  function trim(value) {
    return String(value || "").trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getPromptInput() {
    return qs(DEFAULTS.selectors.promptInput);
  }

  function getRawPrompt() {
    var input = getPromptInput();
    return input ? trim(input.value) : "";
  }

  function setRawPrompt(text) {
    var input = getPromptInput();
    if (!input) return;
    input.value = String(text || "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setStatus(message) {
    var statusBar = qs(DEFAULTS.selectors.statusBar);
    if (statusBar) statusBar.textContent = message || "";
  }

  function showInlineError(message) {
    var el = qs(DEFAULTS.selectors.inlineError);
    if (el) {
      el.hidden = false;
      el.textContent = message || "";
      return;
    }
    if (message) alert(message);
  }

  function clearInlineError() {
    var el = qs(DEFAULTS.selectors.inlineError);
    if (el) {
      el.hidden = true;
      el.textContent = "";
    }
  }

  function getAssistantState() {
    return App.state.assistant;
  }

  function getActiveThread() {
    if (window.ZhuxinAssistantThreads && isFn(window.ZhuxinAssistantThreads.getActiveThread)) {
      return window.ZhuxinAssistantThreads.getActiveThread();
    }

    var state = getAssistantState();
    var activeId = state.activeThreadId;
    if (!activeId) return null;
    for (var i = 0; i < state.threads.length; i += 1) {
      if (state.threads[i] && state.threads[i].id === activeId) return state.threads[i];
    }
    return null;
  }

  function ensureActiveThreadForPrompt(rawPrompt) {
    var thread = null;
    var matterMeta = getActiveMatterMeta();

    if (window.ZhuxinAssistantThreads && isFn(window.ZhuxinAssistantThreads.ensureThreadForPrompt)) {
      return window.ZhuxinAssistantThreads.ensureThreadForPrompt(rawPrompt, matterMeta);
    }

    var state = getAssistantState();
    thread = getActiveThread();

    if (!thread) {
      thread = {
        id: uid("thread"),
        title: trim(rawPrompt).slice(0, 80) || "New thread",
        matterId: matterMeta.id || "",
        matterLabel: matterMeta.label || "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        messages: [],
        turns: []
      };
      state.threads.unshift(thread);
      state.activeThreadId = thread.id;
    }

    return thread;
  }

  function getActiveMatterMeta() {
    var state = window.zhuxinAssistantState || {};
    var matterId = state.activeMatterId || "";
    var label = "";

    var roots = [
      window.APP_DATA && window.APP_DATA.matters,
      window.ZhuxinApp && window.ZhuxinApp.state && window.ZhuxinApp.state.matters,
      window.ZHUXIN_APP_DATA && window.ZHUXIN_APP_DATA.matters
    ];

    for (var r = 0; r < roots.length; r += 1) {
      var list = roots[r];
      if (!Array.isArray(list)) continue;
      for (var i = 0; i < list.length; i += 1) {
        var item = list[i] || {};
        if ((item.id || item.matterId) === matterId) {
          label = item.label || item.name || item.title || "";
          break;
        }
      }
      if (label) break;
    }

    return { id: matterId, label: label };
  }

  function getCurrentFiles() {
    var state = window.zhuxinAssistantState || {};
    return Array.isArray(state.attachments) ? state.attachments : [];
  }

  function getCurrentSettings() {
    return window.__zhuxinSettings || window.zhuxinSettings || { preferences: {} };
  }

  function ensureMessageArrays(thread) {
    if (!thread.messages) thread.messages = [];
    if (!thread.turns) thread.turns = [];
  }

  function appendUserTurn(thread, rawPrompt, meta) {
    ensureMessageArrays(thread);

    if (window.ZhuxinAssistantThreads && isFn(window.ZhuxinAssistantThreads.appendTurn)) {
      return window.ZhuxinAssistantThreads.appendTurn(thread.id, {
        role: "user",
        text: rawPrompt,
        status: "done",
        meta: meta || {}
      });
    }

    var turn = {
      id: uid("turn"),
      role: "user",
      text: rawPrompt,
      content: rawPrompt,
      status: "done",
      meta: meta || {},
      createdAt: nowIso()
    };
    thread.turns.push(turn);
    thread.messages.push(turn);
    thread.updatedAt = nowIso();
    return turn;
  }

  function appendPendingAssistantTurn(thread, meta) {
    ensureMessageArrays(thread);

    if (window.ZhuxinAssistantThreads && isFn(window.ZhuxinAssistantThreads.appendTurn)) {
      return window.ZhuxinAssistantThreads.appendTurn(thread.id, {
        role: "assistant",
        text: "",
        status: "streaming",
        meta: meta || {}
      });
    }

    var turn = {
      id: uid("turn"),
      role: "assistant",
      text: "",
      content: "",
      status: "streaming",
      meta: meta || {},
      createdAt: nowIso()
    };
    thread.turns.push(turn);
    thread.messages.push(turn);
    thread.updatedAt = nowIso();
    return turn;
  }

  function patchAssistantTurn(thread, turn, text, opts) {
    opts = opts || {};

    if (!thread || !turn) return;

    if (window.ZhuxinAssistantThreads && isFn(window.ZhuxinAssistantThreads.patchTurnText)) {
      window.ZhuxinAssistantThreads.patchTurnText(thread.id, turn.id, text, opts);
      return;
    }

    var value = opts.append ? String(turn.text || "") + String(text || "") : String(text || "");
    turn.text = value;
    turn.content = value;
    if (opts.status) turn.status = opts.status;
    if (opts.meta) {
      turn.meta = Object.assign({}, turn.meta || {}, opts.meta);
    }
    thread.updatedAt = nowIso();
  }

  function collectThreadHistory(thread) {
    if (window.ZhuxinAssistantThreads && isFn(window.ZhuxinAssistantThreads.buildModelHistory)) {
      return window.ZhuxinAssistantThreads.buildModelHistory(thread.id);
    }

    var turns = (thread && (thread.turns || thread.messages)) || [];
    return turns
      .filter(function (t) {
        return t && (t.role === "user" || t.role === "assistant") && t.status !== "error";
      })
      .slice(-20)
      .map(function (t) {
        return { role: t.role, content: t.text || t.content || "" };
      });
  }

  function getReusePayload() {
    if (window.AssistantReuseLibrary && isFn(window.AssistantReuseLibrary.getAppliedPayload)) {
      return window.AssistantReuseLibrary.getAppliedPayload();
    }
    return null;
  }

  function applySubfeature1QueryComposer(rawPrompt) {
    var output = {
      rawPrompt: rawPrompt,
      promptAfterComposer: rawPrompt,
      meta: {}
    };

    if (window.ZhuxinComposer && isFn(window.ZhuxinComposer.getComposerState)) {
      output.meta.queryComposer = window.ZhuxinComposer.getComposerState();
    }

    return output;
  }

  function applySubfeature2Context(promptText, thread) {
    if (window.ZhuxinAssistantContext && isFn(window.ZhuxinAssistantContext.beforeSend)) {
      var packet = window.ZhuxinAssistantContext.beforeSend(promptText, {
        getCurrentThreadId: function () {
          return (thread && thread.id) || "assistant-default-thread";
        }
      });

      if (packet && packet.blocked) {
        return {
          ok: false,
          error: (packet.errors && packet.errors[0]) || "Context validation failed."
        };
      }

      return {
        ok: true,
        text: packet ? packet.serializedPrompt : promptText,
        contextPacket: packet || null
      };
    }

    return { ok: true, text: promptText, contextPacket: null };
  }

  function applySubfeature13Governance(baseRequest) {
    if (!window.ZhuxinGovernance || !isFn(window.ZhuxinGovernance.evaluateAttachmentSet)) {
      return { ok: true, request: baseRequest, governance: null };
    }

    var state = window.zhuxinAssistantState || {};
    var attachments = Array.isArray(state.attachments) ? state.attachments : [];
    var activeMatterId = state.activeMatterId || "general";

    var governanceResult = window.ZhuxinGovernance.evaluateAttachmentSet(attachments, {
      activeMatterId: activeMatterId,
      intent: "assistant_answer"
    });

    state.lastGovernanceResult = governanceResult;

    if (isFn(window.ZhuxinGovernance.renderComposerGovernance)) {
      window.ZhuxinGovernance.renderComposerGovernance(governanceResult);
    }

    if (governanceResult.hardBlock) {
      return {
        ok: false,
        error:
          (window.ZhuxinGovernance.getUserFacingError &&
            window.ZhuxinGovernance.getUserFacingError(governanceResult)) ||
          "Blocked by governance rules."
      };
    }

    var promptPrefix = isFn(window.ZhuxinGovernance.buildGovernancePromptPrefix)
      ? window.ZhuxinGovernance.buildGovernancePromptPrefix(governanceResult)
      : "";

    var safeAttachments = (governanceResult.allowedFiles || []).map(function (item) {
      return {
        id: item.id,
        name: item.name,
        useMode: item.useMode,
        matterId: item.matterId
      };
    });

    var request = Object.assign({}, baseRequest, {
      prompt: promptPrefix ? promptPrefix + "\n\n" + String(baseRequest.prompt || "").trim() : baseRequest.prompt,
      attachments: safeAttachments,
      governance:
        window.ZhuxinGovernance.createSnapshot &&
        window.ZhuxinGovernance.createSnapshot(governanceResult)
    });

    return { ok: true, request: request, governance: governanceResult };
  }

  function applySubfeature14Language(rawPrompt) {
    var state = getLanguageState();
    if (!window.ZhuxinLanguageUnderstanding || !isFn(window.ZhuxinLanguageUnderstanding.buildLanguageInstructionBlock)) {
      return {
        prompt: rawPrompt,
        meta: {
          detectedInputLanguage: state.detectedInputLanguage || "unknown",
          detectedMixedLanguage: !!state.detectedMixedLanguage,
          responseMode: state.responseMode || "match-input"
        }
      };
    }

    var languagePack = window.ZhuxinLanguageUnderstanding.buildLanguageInstructionBlock({
      text: rawPrompt,
      preferences: {
        responseMode: state.responseMode,
        customLanguage: state.customLanguage,
        preserveTerms: state.preserveTerms,
        clarifyDenseText: state.clarifyDenseText
      }
    });

    return {
      prompt: languagePack.instructionText + "\n\nUSER_REQUEST\n" + rawPrompt,
      meta: languagePack.metadata || {}
    };
  }

  function applySubfeature10Reuse(promptText) {
    var reusePayload = getReusePayload();
    if (
      reusePayload &&
      window.AssistantReuseLibrary &&
      isFn(window.AssistantReuseLibrary.buildPrompt) &&
      ((reusePayload.activeStandards && reusePayload.activeStandards.length) ||
        (reusePayload.activeFormats && reusePayload.activeFormats.length))
    ) {
      return {
        prompt: window.AssistantReuseLibrary.buildPrompt(promptText, reusePayload),
        reuse: {
          activeStandardIds: clone(reusePayload.activeStandardIds || []),
          activeStandardTitles: (reusePayload.activeStandards || []).map(function (item) {
            return item.title;
          }),
          activeFormatTitles: (reusePayload.activeFormats || []).map(function (item) {
            return item.title;
          })
        }
      };
    }

    return { prompt: promptText, reuse: null };
  }

  function applySubfeature4DeepAnalysis(payload) {
    if (window.ZhuxinDeepAnalysis && isFn(window.ZhuxinDeepAnalysis.attachToOutgoingPayload)) {
      return window.ZhuxinDeepAnalysis.attachToOutgoingPayload(payload);
    }
    return payload;
  }

  function applySubfeature3GroundedRequest(payload) {
    if (
      window.ZhuxinGroundedQA &&
      isFn(window.ZhuxinGroundedQA.buildRequest) &&
      isFn(window.ZhuxinGroundedQA.validateRequest)
    ) {
      var request = window.ZhuxinGroundedQA.buildRequest({
        promptText: payload.prompt
      });
      var validation = window.ZhuxinGroundedQA.validateRequest(request);

      if (!validation.ok) {
        return {
          ok: false,
          message:
            window.ZhuxinGroundedQA.buildValidationMessage &&
            window.ZhuxinGroundedQA.buildValidationMessage(validation)
        };
      }

      payload.groundedRequest = request;
      payload.groundedInstruction =
        window.ZhuxinGroundedQA.createPromptEnvelope &&
        window.ZhuxinGroundedQA.createPromptEnvelope(request);
      return { ok: true, payload: payload };
    }

    return { ok: true, payload: payload };
  }

  function buildCanonicalRequest(rawPrompt, thread) {
    var q1 = applySubfeature1QueryComposer(rawPrompt);

    var reusePack = applySubfeature10Reuse(q1.promptAfterComposer);

    var contextPack = applySubfeature2Context(reusePack.prompt, thread);
    if (!contextPack.ok) {
      return { ok: false, error: contextPack.error };
    }

    var languagePack = applySubfeature14Language(contextPack.text);

    var request = {
      threadId: thread.id,
      prompt: languagePack.prompt,
      displayPrompt: rawPrompt,
      rawPrompt: rawPrompt,
      history: collectThreadHistory(thread),
      attachments: getCurrentFiles(),
      matter: getActiveMatterMeta(),
      settings: getCurrentSettings(),
      meta: {
        queryComposer: q1.meta.queryComposer || null,
        contextPacket: contextPack.contextPacket || null,
        reuse: reusePack.reuse,
        language: languagePack.meta || null
      }
    };

    var governed = applySubfeature13Governance(request);
    if (!governed.ok) {
      return { ok: false, error: governed.error };
    }

    request = governed.request;
    request.meta.governance = request.governance || null;

    request = applySubfeature4DeepAnalysis(request);

    var grounded = applySubfeature3GroundedRequest(request);
    if (!grounded.ok) {
      return { ok: false, groundedMessage: grounded.message };
    }

    request = grounded.payload;

    return { ok: true, request: request };
  }

  function normalizeAssistantEvidencePayload(rawMessage) {
    var message = Object.assign({}, rawMessage || {});
    message.id = message.id || ("msg-" + Date.now());
    message.role = message.role || "assistant";
    message.content = String(message.content || message.text || "");
    message.evidenceMode = message.evidenceMode || "optional";
    message.citations = Array.isArray(message.citations) ? message.citations : [];
    message.sources = Array.isArray(message.sources) ? message.sources : [];

    if (window.ZhuxinCitations && isFn(window.ZhuxinCitations.computeVerification)) {
      message.verification = window.ZhuxinCitations.computeVerification(message);
    } else {
      message.verification = message.verification || { status: "partial", warnings: [] };
    }
    return message;
  }

  function normalizeModelOutput(raw, request) {
    if (
      raw &&
      raw.kind === "structuredDeliverable"
    ) {
      return {
        role: "assistant",
        type: "structuredDeliverable",
        kind: "structuredDeliverable",
        text: raw.text || "Structured deliverable created.",
        payload: raw.payload || null,
        createdAt: nowIso(),
        meta: { requestMeta: raw.requestMeta || request.meta || {} }
      };
    }

    if (
      raw &&
      raw.type === "grounded_qa"
    ) {
      return normalizeAssistantEvidencePayload({
        id: raw.id || uid("msg"),
        role: "assistant",
        text: raw.text || raw.content || "",
        content: raw.text || raw.content || "",
        evidenceMode: "required",
        citations: raw.citations || [],
        sources: raw.sources || [],
        verification: raw.verification || null,
        meta: raw.meta || {}
      });
    }

    var text = "";
    if (typeof raw === "string") text = raw;
    else if (raw && typeof raw.text === "string") text = raw.text;
    else if (raw && typeof raw.content === "string") text = raw.content;
    else text = "No response.";

    var output = normalizeAssistantEvidencePayload({
      id: uid("msg"),
      role: "assistant",
      text: text,
      content: text,
      evidenceMode: raw && raw.evidenceMode ? raw.evidenceMode : "optional",
      citations: raw && raw.citations ? raw.citations : [],
      sources: raw && raw.sources ? raw.sources : [],
      createdAt: nowIso(),
      meta: {
        language: request.meta && request.meta.language,
        governance: request.meta && request.meta.governance,
        reuse: request.meta && request.meta.reuse,
        contextPacket: request.meta && request.meta.contextPacket,
        deepAnalysis: request.deepAnalysis || null,
        groundedRequest: request.groundedRequest || null
      }
    });

    return output;
  }

  async function callStructuredDeliverableIfEnabled(rawPrompt) {
    if (!window.StructuredDeliverableUI || !window.generateStructuredDeliverable) return null;

    var structuredRequest = window.StructuredDeliverableUI.collectRequest(rawPrompt);
    if (!structuredRequest || !structuredRequest.enabled) return null;

    var result = window.generateStructuredDeliverable(structuredRequest);
    if (!result || !result.ok) {
      throw new Error((result && result.errors && result.errors.join("\n")) || "Structured deliverable failed.");
    }

    return {
      kind: "structuredDeliverable",
      text: result.leadText || "Structured deliverable created.",
      payload: result.payload || null,
      requestMeta: structuredRequest
    };
  }

  async function callDraftGenerationIfEnabled(rawPrompt) {
    return null;
  }

  async function runLowLevelModelRequest(request) {
    if (request.deepAnalysis && request.deepAnalysis.enabled && window.ZhuxinDeepAnalysis) {
      return generateDeepAnalysisAssistantResponse(request);
    }

    if (request.groundedRequest && window.ZhuxinGroundedQA) {
      return generateGroundedQaResponse(request);
    }

    if (isFn(ENGINE_NS.runTask)) {
      return ENGINE_NS.runTask("assistant", { payload: request });
    }

    if (isFn(ENGINE_NS.generate)) {
      return ENGINE_NS.generate({
        taskName: "assistant",
        payload: request,
        prompt: request.prompt,
        history: request.history
      });
    }

    if (isFn(window.generateWithModel)) {
      return window.generateWithModel({
        taskName: "assistant",
        payload: request,
        prompt: request.prompt,
        history: request.history
      });
    }

    if (isFn(window.generateAssistantReply)) {
      return window.generateAssistantReply({
        prompt: request.prompt,
        matter: request.matter,
        files: request.attachments,
        settings: request.settings,
        contextPacket: request.meta && request.meta.contextPacket
      });
    }

    return buildFallbackAssistantReply(request);
  }

  function buildFallbackAssistantReply(request) {
    var rawPrompt = request.displayPrompt || request.rawPrompt || "";
    var matter = request.matter || {};
    var files = request.attachments || [];
    var reuseMeta = request.meta && request.meta.reuse;
    var governance = request.meta && request.meta.governance;
    var lang = request.meta && request.meta.language;

    var lines = [];
    lines.push("Structured working response");
    lines.push("");
    lines.push("Request:");
    lines.push(rawPrompt);
    lines.push("");
    lines.push("Matter:");
    lines.push(
      [matter.label || matter.name, matter.id].filter(Boolean).join(" · ") || "No active matter"
    );
    lines.push("");
    lines.push("Files in scope:");
    if (files.length) {
      files.slice(0, 6).forEach(function (f, idx) {
        lines.push((idx + 1) + ". " + (f.name || f.id || "File"));
      });
    } else {
      lines.push("No file context attached.");
    }
    lines.push("");
    lines.push("Working answer:");
    lines.push("1. Identify the main issues and requested output.");
    lines.push("2. Use only the permitted matter/file context.");
    lines.push("3. Separate clear facts from assumptions or missing support.");
    if (lang && lang.clarifyDenseText) {
      lines.push("4. Add a clearer plain-language explanation because dense-text clarification is on.");
    }
    if (reuseMeta && ((reuseMeta.activeStandardTitles || []).length || (reuseMeta.activeFormatTitles || []).length)) {
      lines.push("");
      lines.push("Applied reusable standards:");
      (reuseMeta.activeStandardTitles || []).forEach(function (t) { lines.push("- " + t); });
      (reuseMeta.activeFormatTitles || []).forEach(function (t) { lines.push("- " + t); });
    }
    if (governance) {
      lines.push("");
      lines.push("Governance summary:");
      lines.push("- Allowed files: " + ((governance.allowedFileIds || []).length));
      lines.push("- Summary-only files: " + ((governance.summaryOnlyFileIds || []).length));
    }

    return lines.join("\n");
  }

  async function generateGroundedQaResponse(request) {
    var groundedRequest = request.groundedRequest;
    if (!groundedRequest || !window.ZhuxinGroundedQA) {
      return "No grounded request available.";
    }

    var validation = window.ZhuxinGroundedQA.validateRequest(groundedRequest);
    if (!validation.ok) {
      return window.ZhuxinGroundedQA.buildValidationMessage(validation);
    }

    var raw;
    if (isFn(ENGINE_NS.runTask)) {
      raw = await ENGINE_NS.runTask("assistant_grounded_qa", {
        payload: request,
        groundedRequest: groundedRequest,
        instruction: request.groundedInstruction
      });
    } else if (isFn(window.generateWithModel)) {
      raw = await window.generateWithModel({
        taskName: "assistant_grounded_qa",
        payload: request,
        instruction: request.groundedInstruction,
        contextBlocks: groundedRequest.contextBlocks
      });
    } else {
      raw = JSON.stringify({
        answer: "The provided material does not support a fully grounded answer in fallback mode.",
        support_level: "insufficient",
        basis: [],
        gaps: ["No grounded model transport is wired."],
        assumptions: []
      });
    }

    var normalized = window.ZhuxinGroundedQA.normalizeResponse(raw, groundedRequest);
    return {
      id: uid("msg"),
      role: "assistant",
      type: "grounded_qa",
      text: normalized.answer,
      content: normalized.answer,
      evidenceMode: "required",
      citations: [],
      sources: [],
      verification: { status: normalized.supportLevel || "partial", warnings: normalized.gaps || [] },
      meta: { groundedQa: normalized }
    };
  }

  async function generateDeepAnalysisAssistantResponse(request) {
    if (!window.ZhuxinDeepAnalysis) {
      return buildFallbackAssistantReply(request);
    }

    var plan = request.deepAnalysisPlan || {
      mode: "deep-analysis",
      profile: request.deepAnalysis && request.deepAnalysis.profile,
      retrievalDepth: request.deepAnalysis && request.deepAnalysis.retrievalDepth,
      sourceCount: 0,
      sources: [],
      promptText: request.displayPrompt || request.rawPrompt || "",
      steps: []
    };

    var raw;
    if (isFn(ENGINE_NS.runTask)) {
      raw = await ENGINE_NS.runTask("assistant_deep_analysis", {
        payload: request,
        systemInstruction: window.ZhuxinDeepAnalysis.buildSystemInstruction(request.deepAnalysis),
        userInstruction: window.ZhuxinDeepAnalysis.buildUserInstruction(plan)
      });
    } else if (isFn(window.generateWithModel)) {
      raw = await window.generateWithModel({
        taskName: "assistant_deep_analysis",
        prompt: request.prompt,
        payload: request,
        systemInstruction: window.ZhuxinDeepAnalysis.buildSystemInstruction(request.deepAnalysis),
        userInstruction: window.ZhuxinDeepAnalysis.buildUserInstruction(plan)
      });
    } else {
      raw = [
        "## Direct conclusion",
        "No dedicated deep-analysis transport is wired yet.",
        "",
        "## Issue map",
        "- Main issue extracted from prompt",
        "",
        "## Evidence matrix",
        "- Use selected context only",
        "",
        "## Contradictions or tension points",
        "- None computed in fallback mode",
        "",
        "## Missing evidence / uncertainty",
        "- Rich deep-analysis transport not wired",
        "",
        "## Follow-up questions",
        "- What specific output format is needed?"
      ].join("\n");
    }

    var parsed = window.ZhuxinDeepAnalysis.parseResponse(raw && raw.text ? raw.text : String(raw || ""));
    var response = {
      id: uid("msg"),
      role: "assistant",
      type: "assistant-deep-analysis",
      text: parsed.raw || "",
      content: parsed.raw || "",
      evidenceMode: "optional",
      citations: [],
      sources: [],
      deepAnalysisMeta: {
        config: request.deepAnalysis || {},
        sourceCount: plan.sourceCount || 0,
        planSteps: plan.steps || []
      }
    };

    if (isFn(window.ZhuxinDeepAnalysis.stampRunMeta)) {
      response = window.ZhuxinDeepAnalysis.stampRunMeta(response);
    }
    return response;
  }

  function registerExportRecord(thread, turn, turnEl) {
    if (!window.ZhuxinAssistantExportHandoff || !isFn(window.ZhuxinAssistantExportHandoff.registerTurnRecord)) {
      return;
    }

    var bodyEl = turnEl
      ? (turnEl.querySelector(".assistant-turn__body") || turnEl.querySelector("[data-assistant-turn-body]"))
      : null;

    var record = window.ZhuxinAssistantExportHandoff.registerTurnRecord({
      exportId: "exp_" + (turn.id || Date.now()),
      threadId: (thread && thread.id) || "thread_unknown",
      threadTitle: (thread && thread.title) || "Assistant thread",
      turnId: turn.id || uid("turn"),
      turnTitle: turn.outputTitle || (thread && thread.title) || "Assistant output",
      text: turn.text || turn.content || "",
      markdown: turn.markdown || turn.text || turn.content || "",
      html: turn.html || (bodyEl ? bodyEl.innerHTML : ""),
      citations: Array.isArray(turn.citations) ? turn.citations : [],
      createdAt: turn.createdAt || nowIso(),
      source: "assistant"
    });

    if (turnEl && record) {
      turnEl.dataset.exportId = record.exportId;
      turnEl.dataset.turnId = turn.turnId || turn.id;
      turnEl.dataset.threadId = (thread && thread.id) || "";
      turnEl.setAttribute("data-assistant-turn", "");
    }
  }

  function renderAssistantTurn(turn, thread) {
    var root = qs(DEFAULTS.selectors.messageList);
    if (!root) return null;

    var turnEl = document.createElement("article");
    turnEl.className = "assistant-turn assistant-turn--" + escapeHtml(turn.role || "assistant");
    turnEl.setAttribute("data-assistant-turn", "");
    turnEl.dataset.turnId = turn.id || "";
    turnEl.dataset.threadId = (thread && thread.id) || "";

    var actionsHtml = '<div class="assistant-turn__actions" data-assistant-turn-actions></div>';

    var bodyHtml = "";
    if (turn.kind === "structuredDeliverable" && window.StructuredDeliverableUI && isFn(window.StructuredDeliverableUI.renderPayload)) {
      bodyHtml = window.StructuredDeliverableUI.renderPayload(turn.payload);
    } else if (window.ZhuxinCitations && (turn.role === "assistant")) {
      var normalized = window.ZhuxinCitations.normalizeMessage(turn);
      bodyHtml =
        '<div class="assistant-message__body">' +
        window.ZhuxinCitations.renderContentWithCitations(normalized) +
        "</div>" +
        window.ZhuxinCitations.renderMessageMeta(normalized);
    } else {
      bodyHtml = '<div class="assistant-message__body">' + escapeHtml(turn.text || turn.content || "") + "</div>";
    }

    var deepHtml = "";
    if (turn.type === "assistant-deep-analysis" && window.ZhuxinDeepAnalysis && isFn(window.ZhuxinDeepAnalysis.renderMetaHeader)) {
      deepHtml = window.ZhuxinDeepAnalysis.renderMetaHeader(turn.deepAnalysisMeta || {});
    }

    turnEl.innerHTML =
      '<div class="assistant-turn__meta">' + actionsHtml + "</div>" +
      '<div class="assistant-turn__body" data-assistant-turn-body>' + deepHtml + bodyHtml + "</div>";

    root.appendChild(turnEl);

    if (turn.type === "grounded_qa" && window.ZhuxinGroundedQA && isFn(window.ZhuxinGroundedQA.mountGroundedCard)) {
      window.ZhuxinGroundedQA.mountGroundedCard(turn, turnEl.querySelector("[data-assistant-turn-body]"));
    }

    registerExportRecord(thread, turn, turnEl);

    if (window.ZhuxinAssistantExportHandoff && isFn(window.ZhuxinAssistantExportHandoff.init)) {
      window.ZhuxinAssistantExportHandoff.init();
    }

    return turnEl;
  }

  function rerenderActiveThread() {
    if (window.ZhuxinAssistantThreads && isFn(window.ZhuxinAssistantThreads.renderAll)) {
      window.ZhuxinAssistantThreads.renderAll();
      return;
    }

    var root = qs(DEFAULTS.selectors.messageList);
    if (!root) return;

    var thread = getActiveThread();
    if (!thread) {
      root.innerHTML = "";
      return;
    }

    ensureMessageArrays(thread);
    root.innerHTML = "";
    thread.turns.forEach(function (turn) {
      renderAssistantTurn(turn, thread);
    });

    if (window.ZhuxinCitations && isFn(window.ZhuxinCitations.attachCitationEvents)) {
      window.ZhuxinCitations.attachCitationEvents(root, function (messageId) {
        var turns = thread.turns || [];
        for (var i = 0; i < turns.length; i += 1) {
          if (turns[i] && turns[i].id === messageId) return turns[i];
        }
        return null;
      });
    }
  }

  function persistTurnEnhancements(thread, turn) {
    if (!thread || !turn) return;

    if (window.AssistantReuseLibrary && isFn(window.AssistantReuseLibrary.getThreadState)) {
      thread.assistantReuse = window.AssistantReuseLibrary.getThreadState();
    }

    if (window.currentAssistantThread && window.currentAssistantThread.languageUnderstanding) {
      thread.languageUnderstanding = clone(window.currentAssistantThread.languageUnderstanding);
    }

    if (window.zhuxinAssistantState && window.zhuxinAssistantState.lastGovernanceResult) {
      thread.lastGovernanceResult = clone(window.zhuxinAssistantState.lastGovernanceResult);
    }

    if (window.ZhuxinApp && window.ZhuxinApp.AssistantCollaboration && isFn(window.ZhuxinApp.AssistantCollaboration.onAssistantResponse)) {
      window.ZhuxinApp.AssistantCollaboration.onAssistantResponse(thread.id);
    }
  }

  function buildThreadCompatibleAssistantTurn(output) {
    return Object.assign(
      {
        id: uid("turn"),
        role: "assistant",
        text: output.text || output.content || "",
        content: output.content || output.text || "",
        createdAt: nowIso(),
        status: "done"
      },
      output
    );
  }

  async function handleAssistantSend() {
    clearInlineError();

    var rawPrompt = getRawPrompt();
    if (!rawPrompt) return;

    var structuredOutput = await callStructuredDeliverableIfEnabled(rawPrompt);
    var thread = ensureActiveThreadForPrompt(rawPrompt);

    appendUserTurn(thread, rawPrompt, { source: "composer" });

    if (structuredOutput) {
      var structuredTurn = buildThreadCompatibleAssistantTurn(structuredOutput);
      ensureMessageArrays(thread);
      thread.turns.push(structuredTurn);
      thread.messages.push(structuredTurn);
      persistTurnEnhancements(thread, structuredTurn);
      setRawPrompt("");
      rerenderActiveThread();
      setStatus("Structured deliverable created.");
      return structuredTurn;
    }

    var prepared = buildCanonicalRequest(rawPrompt, thread);
    if (!prepared.ok) {
      if (prepared.groundedMessage) {
        var groundedTurn = buildThreadCompatibleAssistantTurn(prepared.groundedMessage);
        ensureMessageArrays(thread);
        thread.turns.push(groundedTurn);
        thread.messages.push(groundedTurn);
        persistTurnEnhancements(thread, groundedTurn);
        setRawPrompt("");
        rerenderActiveThread();
        return groundedTurn;
      }
      showInlineError(prepared.error || "Request preparation failed.");
      return;
    }

    var pendingTurn = appendPendingAssistantTurn(thread, {
      model: window.currentAssistantModel || ""
    });

    setRawPrompt("");
    setStatus("Generating...");

    try {
      var raw = await runLowLevelModelRequest(prepared.request);
      var normalized = normalizeModelOutput(raw, prepared.request);

      patchAssistantTurn(thread, pendingTurn, normalized.text || normalized.content || "", {
        append: false,
        status: "done",
        meta: normalized.meta || {}
      });

      Object.keys(normalized).forEach(function (key) {
        pendingTurn[key] = normalized[key];
      });

      persistTurnEnhancements(thread, pendingTurn);
      rerenderActiveThread();
      setStatus("Done.");

      return pendingTurn;
    } catch (err) {
      patchAssistantTurn(thread, pendingTurn, (err && err.message) || "Generation failed.", {
        append: false,
        status: "error"
      });
      rerenderActiveThread();
      setStatus("Error generating response.");
      showInlineError((err && err.message) || "Generation failed.");
      throw err;
    }
  }

  async function handleAssistantImprove() {
    var rawPrompt = getRawPrompt();
    if (!rawPrompt) return;

    var languagePack = applySubfeature14Language(rawPrompt);
    var text = languagePack.prompt;

    if (window.ZhuxinComposer && isFn(window.ZhuxinComposer.improvePrompt)) {
      var improved = await window.ZhuxinComposer.improvePrompt({
        prompt: text,
        userVisiblePrompt: rawPrompt,
        languageMeta: languagePack.meta
      });
      if (typeof improved === "string" && improved.trim()) {
        setRawPrompt(improved);
      }
      return improved;
    }

    return rawPrompt;
  }

  function buildAssistantRequestFromComposer() {
    var rawPrompt = getRawPrompt();
    var thread = ensureActiveThreadForPrompt(rawPrompt);
    var prepared = buildCanonicalRequest(rawPrompt, thread);
    if (!prepared.ok) {
      return { ok: false, error: prepared.error };
    }
    return {
      ok: true,
      prompt: prepared.request.prompt,
      displayPrompt: rawPrompt,
      meta: prepared.request.meta,
      request: prepared.request
    };
  }

  function getDefaultLanguageState() {
    var defaults =
      window.ZHUXIN_APP &&
      window.ZHUXIN_APP.defaults &&
      window.ZHUXIN_APP.defaults.languageUnderstanding;

    return {
      responseMode: defaults ? defaults.responseMode : "match-input",
      customLanguage: defaults ? defaults.customLanguage : "",
      preserveTerms: defaults ? defaults.preserveTerms : true,
      clarifyDenseText: defaults ? defaults.clarifyDenseText : false,
      detectedInputLanguage: "unknown",
      detectedMixedLanguage: false
    };
  }

  function getLanguageState() {
    window.currentAssistantThread = window.currentAssistantThread || {};
    if (!window.currentAssistantThread.languageUnderstanding) {
      window.currentAssistantThread.languageUnderstanding = getDefaultLanguageState();
    }
    return window.currentAssistantThread.languageUnderstanding;
  }

  var assistantLanguageUi = null;

  function hydrateAssistantLanguageStateToUi() {
    if (!assistantLanguageUi) return;
    var state = getLanguageState();

    assistantLanguageUi.responseMode.value = state.responseMode || "match-input";
    assistantLanguageUi.customLanguage.value = state.customLanguage || "";
    assistantLanguageUi.preserveTerms.checked = state.preserveTerms !== false;
    assistantLanguageUi.clarifyDenseText.checked = !!state.clarifyDenseText;
    toggleCustomLanguageField();
  }

  function toggleCustomLanguageField() {
    if (!assistantLanguageUi) return;
    var isSelected = assistantLanguageUi.responseMode.value === "selected";
    assistantLanguageUi.customLanguageWrap.classList.toggle("assistant-hidden", !isSelected);
  }

  function refreshAssistantLanguageProfile() {
    if (!assistantLanguageUi || !window.ZhuxinLanguageUnderstanding) return;

    var text = assistantLanguageUi.promptInput.value || "";
    var state = getLanguageState();
    var profile = window.ZhuxinLanguageUnderstanding.detectLanguageProfile(text);

    state.detectedInputLanguage = profile.primaryLanguage;
    state.detectedMixedLanguage = profile.mixedLanguage;

    var inputLabel = window.ZhuxinLanguageUnderstanding.humanLabel(profile.primaryLanguage);
    assistantLanguageUi.detectedBadge.textContent =
      "Input: " + inputLabel + (profile.mixedLanguage ? " + mixed" : "");

    var responseLabel = window.ZhuxinLanguageUnderstanding.resolveResponseLanguage(profile, {
      responseMode: assistantLanguageUi.responseMode.value,
      customLanguage: assistantLanguageUi.customLanguage.value.trim(),
      preserveTerms: assistantLanguageUi.preserveTerms.checked,
      clarifyDenseText: assistantLanguageUi.clarifyDenseText.checked
    });

    assistantLanguageUi.detailBadge.textContent =
      "Reply: " + responseLabel + (profile.isDense ? " · dense text" : "");
  }

  function initAssistantLanguageUnderstanding() {
    var promptInput = byId("assistantPromptInput");
    var responseMode = byId("assistantResponseLanguageMode");
    var customLanguage = byId("assistantCustomLanguage");
    var customLanguageWrap = byId("assistantCustomLanguageWrap");
    var preserveTerms = byId("assistantPreserveTerms");
    var clarifyDenseText = byId("assistantClarifyDenseText");
    var detectedBadge = byId("assistantDetectedLanguageBadge");
    var detailBadge = byId("assistantLanguageDetailBadge");

    if (
      !promptInput || !responseMode || !customLanguage || !customLanguageWrap ||
      !preserveTerms || !clarifyDenseText || !detectedBadge || !detailBadge
    ) {
      return;
    }

    assistantLanguageUi = {
      promptInput: promptInput,
      responseMode: responseMode,
      customLanguage: customLanguage,
      customLanguageWrap: customLanguageWrap,
      preserveTerms: preserveTerms,
      clarifyDenseText: clarifyDenseText,
      detectedBadge: detectedBadge,
      detailBadge: detailBadge
    };

    hydrateAssistantLanguageStateToUi();
    refreshAssistantLanguageProfile();

    promptInput.addEventListener("input", refreshAssistantLanguageProfile);

    responseMode.addEventListener("change", function () {
      var state = getLanguageState();
      state.responseMode = responseMode.value;
      toggleCustomLanguageField();
      refreshAssistantLanguageProfile();
    });

    customLanguage.addEventListener("input", function () {
      var state = getLanguageState();
      state.customLanguage = customLanguage.value.trim();
      refreshAssistantLanguageProfile();
    });

    preserveTerms.addEventListener("change", function () {
      var state = getLanguageState();
      state.preserveTerms = !!preserveTerms.checked;
    });

    clarifyDenseText.addEventListener("change", function () {
      var state = getLanguageState();
      state.clarifyDenseText = !!clarifyDenseText.checked;
    });
  }

  function initSendButtons() {
    var sendBtn = qs(DEFAULTS.selectors.sendButton);
    var improveBtn = qs(DEFAULTS.selectors.improveButton);

    if (sendBtn && !sendBtn.dataset.engineBound) {
      sendBtn.addEventListener("click", function () {
        handleAssistantSend();
      });
      sendBtn.dataset.engineBound = "1";
    }

    if (improveBtn && !improveBtn.dataset.engineBound) {
      improveBtn.addEventListener("click", function () {
        handleAssistantImprove();
      });
      improveBtn.dataset.engineBound = "1";
    }
  }

  function initReuseRestoreHooks() {
    document.addEventListener("zhuxin:assistant-thread-activated", function (event) {
      var thread = event && event.detail && event.detail.thread;
      if (!thread) return;

      if (window.AssistantReuseLibrary && isFn(window.AssistantReuseLibrary.restoreThreadState)) {
        window.AssistantReuseLibrary.restoreThreadState(thread.assistantReuse || null);
      }

      window.currentAssistantThread = thread;
      if (!window.currentAssistantThread.languageUnderstanding) {
        window.currentAssistantThread.languageUnderstanding = getDefaultLanguageState();
      }
      hydrateAssistantLanguageStateToUi();
      refreshAssistantLanguageProfile();

      if (window.ZhuxinApp && window.ZhuxinApp.AssistantCollaboration && isFn(window.ZhuxinApp.AssistantCollaboration.onThreadActivated)) {
        window.ZhuxinApp.AssistantCollaboration.onThreadActivated(thread.id);
      }

      if (window.refreshAssistantGovernanceUI) {
        window.refreshAssistantGovernanceUI();
      }
    });
  }

  function refreshAssistantGovernanceUI() {
    if (!window.ZhuxinGovernance || !isFn(window.ZhuxinGovernance.evaluateAttachmentSet)) return;
    var state = window.zhuxinAssistantState || {};
    var governanceResult = window.ZhuxinGovernance.evaluateAttachmentSet(state.attachments || [], {
      activeMatterId: state.activeMatterId || "general",
      intent: "assistant_answer"
    });
    state.lastGovernanceResult = governanceResult;
    if (isFn(window.ZhuxinGovernance.renderComposerGovernance)) {
      window.ZhuxinGovernance.renderComposerGovernance(governanceResult);
    }
  }

  function init() {
    initAssistantLanguageUnderstanding();
    initSendButtons();
    initReuseRestoreHooks();
    refreshAssistantGovernanceUI();
    rerenderActiveThread();
  }

  ENGINE_NS.handleAssistantSend = handleAssistantSend;
  ENGINE_NS.handleAssistantImprove = handleAssistantImprove;
  ENGINE_NS.buildAssistantRequestFromComposer = buildAssistantRequestFromComposer;
  ENGINE_NS.rerenderActiveThread = rerenderActiveThread;
  ENGINE_NS.refreshAssistantGovernanceUI = refreshAssistantGovernanceUI;
  ENGINE_NS.runLowLevelModelRequest = runLowLevelModelRequest;
  ENGINE_NS.normalizeModelOutput = normalizeModelOutput;
  ENGINE_NS.init = init;

  window.buildAssistantRequestFromComposer = buildAssistantRequestFromComposer;
  window.handleAssistantSend = handleAssistantSend;
  window.handleAssistantImprove = handleAssistantImprove;
  window.refreshAssistantGovernanceUI = refreshAssistantGovernanceUI;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})(window, document);
