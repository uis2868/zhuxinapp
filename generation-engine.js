(function (window, document) {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
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
    return byId("assistant-prompt-input") || byId("assistantPromptInput") || byId("assistant-composer-input");
  }

  function getMessagesRoot() {
    return byId("messages") || byId("assistant-message-list");
  }

  function getStatusBar() {
    return byId("statusBar");
  }

  function setStatus(text) {
    var el = getStatusBar();
    if (el) el.textContent = text || "";
  }

  function showError(text) {
    var err = byId("assistantComposerError");
    if (err) {
      err.hidden = false;
      err.textContent = text || "";
      return;
    }
    if (text) alert(text);
  }

  function clearError() {
    var err = byId("assistantComposerError");
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
  }

  function getMatterMeta() {
    var state = window.zhuxinAssistantState || {};
    return {
      id: state.activeMatterId || "",
      label: state.activeMatterLabel || ""
    };
  }

  function getAttachments() {
    var state = window.zhuxinAssistantState || {};
    return Array.isArray(state.attachments) ? state.attachments : [];
  }

  function getActiveThread() {
    if (window.ZhuxinAssistantThreads && typeof window.ZhuxinAssistantThreads.getActiveThread === "function") {
      return window.ZhuxinAssistantThreads.getActiveThread();
    }
    return null;
  }

  function ensureThread(rawPrompt) {
    var matter = getMatterMeta();

    if (window.ZhuxinAssistantThreads && typeof window.ZhuxinAssistantThreads.ensureThreadForPrompt === "function") {
      return window.ZhuxinAssistantThreads.ensureThreadForPrompt(rawPrompt, matter);
    }

    return {
      id: "assistant-default-thread",
      title: rawPrompt.slice(0, 80) || "New thread",
      matterId: matter.id || "",
      matterLabel: matter.label || ""
    };
  }

  function appendUserTurn(thread, rawPrompt, meta) {
    if (window.ZhuxinAssistantThreads && typeof window.ZhuxinAssistantThreads.appendTurn === "function") {
      return window.ZhuxinAssistantThreads.appendTurn(thread.id, {
        role: "user",
        text: rawPrompt,
        status: "done",
        meta: meta || {}
      });
    }

    return {
      id: uid("turn"),
      role: "user",
      text: rawPrompt,
      status: "done",
      meta: meta || {},
      createdAt: nowIso()
    };
  }

  function appendPendingAssistantTurn(thread, meta) {
    if (window.ZhuxinAssistantThreads && typeof window.ZhuxinAssistantThreads.appendTurn === "function") {
      return window.ZhuxinAssistantThreads.appendTurn(thread.id, {
        role: "assistant",
        text: "",
        status: "streaming",
        meta: meta || {}
      });
    }

    return {
      id: uid("turn"),
      role: "assistant",
      text: "",
      status: "streaming",
      meta: meta || {},
      createdAt: nowIso()
    };
  }

  function patchAssistantTurn(thread, turn, text, options) {
    options = options || {};

    if (window.ZhuxinAssistantThreads && typeof window.ZhuxinAssistantThreads.patchTurnText === "function") {
      window.ZhuxinAssistantThreads.patchTurnText(thread.id, turn.id, text, options);
      return;
    }

    turn.text = options.append ? String(turn.text || "") + String(text || "") : String(text || "");
    if (options.status) turn.status = options.status;
    if (options.meta) turn.meta = Object.assign({}, turn.meta || {}, options.meta);
  }

  function buildHistory(thread) {
    if (window.ZhuxinAssistantThreads && typeof window.ZhuxinAssistantThreads.buildModelHistory === "function") {
      return window.ZhuxinAssistantThreads.buildModelHistory(thread.id);
    }
    return [];
  }

  function getReusePayload() {
    if (window.AssistantReuseLibrary && typeof window.AssistantReuseLibrary.getAppliedPayload === "function") {
      return window.AssistantReuseLibrary.getAppliedPayload();
    }
    return null;
  }

  function applyReuse(rawPrompt) {
    var reusePayload = getReusePayload();

    if (
      reusePayload &&
      window.AssistantReuseLibrary &&
      typeof window.AssistantReuseLibrary.buildPrompt === "function" &&
      (
        (reusePayload.activeStandards && reusePayload.activeStandards.length) ||
        (reusePayload.activeFormats && reusePayload.activeFormats.length)
      )
    ) {
      return {
        finalPrompt: window.AssistantReuseLibrary.buildPrompt(rawPrompt, reusePayload),
        reuseMeta: {
          activeStandardIds: reusePayload.activeStandardIds || [],
          activeStandardTitles: (reusePayload.activeStandards || []).map(function (item) {
            return item.title;
          }),
          activeFormatTitles: (reusePayload.activeFormats || []).map(function (item) {
            return item.title;
          })
        }
      };
    }

    return {
      finalPrompt: rawPrompt,
      reuseMeta: null
    };
  }

  function applyContext(promptText, thread) {
    if (window.ZhuxinAssistantContext && typeof window.ZhuxinAssistantContext.beforeSend === "function") {
      var packet = window.ZhuxinAssistantContext.beforeSend(promptText, {
        getCurrentThreadId: function () {
          return thread.id;
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
        finalPrompt: packet && packet.serializedPrompt ? packet.serializedPrompt : promptText,
        contextPacket: packet || null
      };
    }

    return {
      ok: true,
      finalPrompt: promptText,
      contextPacket: null
    };
  }

  function applyLanguage(rawPrompt) {
    if (!window.ZhuxinLanguageUnderstanding || typeof window.ZhuxinLanguageUnderstanding.buildLanguageInstructionBlock !== "function") {
      return {
        finalPrompt: rawPrompt,
        languageMeta: null
      };
    }

    var responseModeEl = byId("assistantResponseLanguageMode");
    var customLanguageEl = byId("assistantCustomLanguage");
    var preserveTermsEl = byId("assistantPreserveTerms");
    var clarifyDenseEl = byId("assistantClarifyDenseText");

    var pack = window.ZhuxinLanguageUnderstanding.buildLanguageInstructionBlock({
      text: rawPrompt,
      preferences: {
        responseMode: responseModeEl ? responseModeEl.value : "match-input",
        customLanguage: customLanguageEl ? customLanguageEl.value.trim() : "",
        preserveTerms: preserveTermsEl ? !!preserveTermsEl.checked : true,
        clarifyDenseText: clarifyDenseEl ? !!clarifyDenseEl.checked : false
      }
    });

    return {
      finalPrompt: pack.instructionText + "\n\nUSER_REQUEST\n" + rawPrompt,
      languageMeta: pack.metadata || null
    };
  }

  function applyGovernance(baseRequest) {
    if (!window.ZhuxinGovernance || typeof window.ZhuxinGovernance.evaluateAttachmentSet !== "function") {
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

    if (typeof window.ZhuxinGovernance.renderComposerGovernance === "function") {
      window.ZhuxinGovernance.renderComposerGovernance(governanceResult);
    }

    if (governanceResult.hardBlock) {
      return {
        ok: false,
        error:
          (typeof window.ZhuxinGovernance.getUserFacingError === "function" &&
            window.ZhuxinGovernance.getUserFacingError(governanceResult)) ||
          "Blocked by governance rules."
      };
    }

    var safeAttachments = (governanceResult.allowedFiles || []).map(function (item) {
      return {
        id: item.id,
        name: item.name,
        useMode: item.useMode,
        matterId: item.matterId
      };
    });

    var prefix =
      typeof window.ZhuxinGovernance.buildGovernancePromptPrefix === "function"
        ? window.ZhuxinGovernance.buildGovernancePromptPrefix(governanceResult)
        : "";

    return {
      ok: true,
      request: Object.assign({}, baseRequest, {
        prompt: prefix ? prefix + "\n\n" + baseRequest.prompt : baseRequest.prompt,
        attachments: safeAttachments,
        governance:
          typeof window.ZhuxinGovernance.createSnapshot === "function"
            ? window.ZhuxinGovernance.createSnapshot(governanceResult)
            : null
      }),
      governance: governanceResult
    };
  }

  function readDeepAnalysisState() {
    var enabled = false;
    var profile = "balanced";
    var retrievalDepth = "standard";
    var sections = {
      issueMap: true,
      evidenceMatrix: true,
      contradictionScan: true,
      missingEvidence: true,
      followUpQuestions: true
    };

    var panel = byId("assistantDeepAnalysisPanel");
    var toggle = byId("assistantDeepAnalysisToggle");
    var depth = byId("assistantDeepAnalysisDepth");

    if (panel && !panel.classList.contains("hidden")) enabled = true;
    if (toggle && toggle.getAttribute("aria-expanded") === "true") enabled = true;
    if (depth) retrievalDepth = depth.value || "standard";

    var selectedProfile = document.querySelector("[data-da-profile].is-selected");
    if (selectedProfile) profile = selectedProfile.getAttribute("data-da-profile") || "balanced";

    document.querySelectorAll("[data-da-section]").forEach(function (input) {
      sections[input.getAttribute("data-da-section")] = !!input.checked;
    });

    return {
      enabled: enabled,
      profile: profile,
      retrievalDepth: retrievalDepth,
      sections: sections
    };
  }

  function maybeApplyDeepAnalysis(request) {
    var deepState = readDeepAnalysisState();

    if (!deepState.enabled) return request;

    if (window.ZhuxinDeepAnalysis && typeof window.ZhuxinDeepAnalysis.attachToOutgoingPayload === "function") {
      var enriched = Object.assign({}, request, { deepAnalysis: deepState });
      return window.ZhuxinDeepAnalysis.attachToOutgoingPayload(enriched);
    }

    request.deepAnalysis = deepState;
    return request;
  }

  function buildGroundedResponse(rawPrompt, request) {
    var groundedEnabled = byId("assistant-grounded-toggle");
    var groundedOn = !groundedEnabled || groundedEnabled.checked;

    if (!groundedOn) return null;

    if (
      window.ZhuxinGroundedQA &&
      typeof window.ZhuxinGroundedQA.buildRequest === "function" &&
      typeof window.ZhuxinGroundedQA.validateRequest === "function" &&
      typeof window.ZhuxinGroundedQA.normalizeResponse === "function"
    ) {
      var groundedRequest = window.ZhuxinGroundedQA.buildRequest({ promptText: rawPrompt });
      var validation = window.ZhuxinGroundedQA.validateRequest(groundedRequest);

      if (!validation.ok) {
        return {
          role: "assistant",
          type: "grounded_qa",
          text:
            (window.ZhuxinGroundedQA.buildValidationMessage &&
              window.ZhuxinGroundedQA.buildValidationMessage(validation)) ||
            "Grounded request validation failed.",
          citations: [],
          sources: [],
          verification: { status: "unverified", warnings: validation.errors || [] }
        };
      }

      var fallbackRaw = JSON.stringify({
        answer: "Grounded fallback response. The request was processed in local fallback mode.",
        support_level: "partial",
        basis: [],
        gaps: ["No live grounded transport wired yet."],
        assumptions: []
      });

      var normalized = window.ZhuxinGroundedQA.normalizeResponse(fallbackRaw, groundedRequest);

      return {
        role: "assistant",
        type: "grounded_qa",
        text: normalized.answer || "No grounded answer.",
        content: normalized.answer || "No grounded answer.",
        citations: [],
        sources: [],
        verification: {
          status: normalized.supportLevel || "partial",
          warnings: normalized.gaps || []
        },
        groundedQa: normalized
      };
    }

    return {
      role: "assistant",
      type: "grounded_qa",
      text:
        "Structured grounded response\n\n" +
        "Request:\n" + rawPrompt + "\n\n" +
        "Status:\nGrounded mode is on, but the grounded engine is not fully wired yet.\n\n" +
        "Next:\n- Keep answer limited to selected context\n- Surface gaps clearly\n- Avoid unsupported claims",
      citations: [],
      sources: [],
      verification: { status: "partial", warnings: ["Grounded helper not fully wired."] }
    };
  }

  function buildDeepAnalysisResponse(rawPrompt, request) {
    if (!request.deepAnalysis || !request.deepAnalysis.enabled) return null;

    if (
      window.ZhuxinDeepAnalysis &&
      typeof window.ZhuxinDeepAnalysis.buildSystemInstruction === "function" &&
      typeof window.ZhuxinDeepAnalysis.buildUserInstruction === "function" &&
      typeof window.ZhuxinDeepAnalysis.parseResponse === "function"
    ) {
      var plan = request.deepAnalysisPlan || {
        mode: "deep-analysis",
        profile: request.deepAnalysis.profile,
        retrievalDepth: request.deepAnalysis.retrievalDepth,
        sourceCount: 0,
        sources: [],
        promptText: rawPrompt,
        steps: []
      };

      var fallbackText = [
        "## Direct conclusion",
        "Deep-analysis mode is enabled, but only fallback processing is active right now.",
        "",
        "## Issue map",
        "- Main issue extracted from the prompt",
        "",
        "## Evidence matrix",
        "- Use only the selected and allowed context",
        "",
        "## Contradictions or tension points",
        "- None computed in fallback mode",
        "",
        "## Missing evidence / uncertainty",
        "- Rich multi-pass transport is not wired yet",
        "",
        "## Follow-up questions",
        "- What exact final output do you want?"
      ].join("\n");

      var parsed = window.ZhuxinDeepAnalysis.parseResponse(fallbackText);

      return {
        role: "assistant",
        type: "assistant-deep-analysis",
        text: parsed.raw || fallbackText,
        content: parsed.raw || fallbackText,
        citations: [],
        sources: [],
        deepAnalysisMeta: {
          config: request.deepAnalysis,
          sourceCount: plan.sourceCount || 0,
          planSteps: plan.steps || []
        }
      };
    }

    return {
      role: "assistant",
      type: "assistant-deep-analysis",
      text:
        "Deep analysis mode\n\n" +
        "Prompt:\n" + rawPrompt + "\n\n" +
        "Profile: " + request.deepAnalysis.profile + "\n" +
        "Depth: " + request.deepAnalysis.retrievalDepth,
      citations: [],
      sources: [],
      deepAnalysisMeta: {
        config: request.deepAnalysis,
        sourceCount: 0,
        planSteps: []
      }
    };
  }

  function normalizeAssistantMessage(message) {
    var out = Object.assign({}, message || {});
    out.id = out.id || uid("msg");
    out.role = out.role || "assistant";
    out.text = out.text || out.content || "";
    out.content = out.content || out.text || "";
    out.citations = Array.isArray(out.citations) ? out.citations : [];
    out.sources = Array.isArray(out.sources) ? out.sources : [];

    if (window.ZhuxinCitations && typeof window.ZhuxinCitations.computeVerification === "function") {
      out.verification = out.verification || window.ZhuxinCitations.computeVerification(out);
    } else {
      out.verification = out.verification || { status: "uncited", warnings: [] };
    }

    return out;
  }

  function renderMessageHtml(turn) {
    var role = turn.role || "assistant";
    var text = turn.text || turn.content || "";

    if (role === "user") {
      return (
        '<div class="assistant-msg assistant-msg--user" data-message-id="' + escapeHtml(turn.id) + '">' +
          '<div class="assistant-msg-role">user</div>' +
          '<div class="assistant-msg-body">' + escapeHtml(text) + '</div>' +
        "</div>"
      );
    }

    if (turn.type === "assistant-deep-analysis" && turn.deepAnalysisMeta) {
      var metaHtml = "";
      if (window.ZhuxinDeepAnalysis && typeof window.ZhuxinDeepAnalysis.renderMetaHeader === "function") {
        metaHtml = window.ZhuxinDeepAnalysis.renderMetaHeader(turn.deepAnalysisMeta || {});
      }

      return (
        '<div class="assistant-msg assistant-msg--assistant" data-message-id="' + escapeHtml(turn.id) + '">' +
          '<div class="assistant-msg-role">assistant</div>' +
          metaHtml +
          '<div class="assistant-msg-body">' + escapeHtml(text) + '</div>' +
        "</div>"
      );
    }

    if (turn.type === "grounded_qa" && turn.groundedQa) {
      if (window.ZhuxinGroundedQA && typeof window.ZhuxinGroundedQA.renderResponseCard === "function") {
        return window.ZhuxinGroundedQA.renderResponseCard(turn.groundedQa);
      }
    }

    return (
      '<div class="assistant-msg assistant-msg--assistant" data-message-id="' + escapeHtml(turn.id) + '">' +
        '<div class="assistant-msg-role">assistant</div>' +
        '<div class="assistant-msg-body">' + escapeHtml(text) + '</div>' +
      "</div>"
    );
  }

  function renderMessagesFromThread() {
    var root = getMessagesRoot();
    if (!root) return;

    var thread = getActiveThread();
    if (!thread || !Array.isArray(thread.turns) || !thread.turns.length) {
      root.innerHTML = '<span class="muted">No output yet.</span>';
      return;
    }

    root.innerHTML = thread.turns.map(renderMessageHtml).join("");
  }

  function notifyHelpersOnAssistantResponse(threadId) {
    if (
      window.ZhuxinApp &&
      window.ZhuxinApp.AssistantCollaboration &&
      typeof window.ZhuxinApp.AssistantCollaboration.onAssistantResponse === "function"
    ) {
      window.ZhuxinApp.AssistantCollaboration.onAssistantResponse(threadId);
    }
  }

  function buildRequest(rawPrompt, thread) {
    var reusePack = applyReuse(rawPrompt);

    var contextPack = applyContext(reusePack.finalPrompt, thread);
    if (!contextPack.ok) {
      return { ok: false, error: contextPack.error };
    }

    var languagePack = applyLanguage(contextPack.finalPrompt);

    var baseRequest = {
      threadId: thread.id,
      rawPrompt: rawPrompt,
      displayPrompt: rawPrompt,
      prompt: languagePack.finalPrompt,
      history: buildHistory(thread),
      attachments: getAttachments(),
      matter: getMatterMeta(),
      meta: {
        reuse: reusePack.reuseMeta,
        contextPacket: contextPack.contextPacket || null,
        language: languagePack.languageMeta || null
      }
    };

    var governancePack = applyGovernance(baseRequest);
    if (!governancePack.ok) {
      return { ok: false, error: governancePack.error };
    }

    var request = maybeApplyDeepAnalysis(governancePack.request);
    return { ok: true, request: request };
  }

  async function sendAssistantPrompt() {
    clearError();

    var promptInput = getPromptInput();
    if (!promptInput) {
      showError("Assistant prompt input not found.");
      return;
    }

    var rawPrompt = String(promptInput.value || "").trim();
    if (!rawPrompt) {
      showError("Write something first.");
      return;
    }

    setStatus("Preparing request...");

    var thread = ensureThread(rawPrompt);
    var requestPack = buildRequest(rawPrompt, thread);

    if (!requestPack.ok) {
      showError(requestPack.error || "Request preparation failed.");
      setStatus("Blocked.");
      return;
    }

    var request = requestPack.request;

    appendUserTurn(thread, rawPrompt, {
      language: request.meta.language || null,
      reuse: request.meta.reuse || null
    });

    var pendingTurn = appendPendingAssistantTurn(thread, {
      requestMeta: request.meta || {}
    });

    promptInput.value = "";
    promptInput.dispatchEvent(new Event("input", { bubbles: true }));

    renderMessagesFromThread();
    setStatus("Generating...");

    try {
      var structured = null;
      if (window.StructuredDeliverableUI && window.generateStructuredDeliverable) {
        var structuredRequest = window.StructuredDeliverableUI.collectRequest(rawPrompt);
        if (structuredRequest && structuredRequest.enabled) {
          var structuredResult = window.generateStructuredDeliverable(structuredRequest);
          if (!structuredResult || !structuredResult.ok) {
            throw new Error(
              (structuredResult && structuredResult.errors && structuredResult.errors.join("\n")) ||
              "Structured deliverable failed."
            );
          }
          structured = {
            role: "assistant",
            type: "structuredDeliverable",
            kind: "structuredDeliverable",
            text: structuredResult.leadText || "Structured deliverable created.",
            payload: structuredResult.payload || null,
            createdAt: nowIso()
          };
        }
      }

      var response =
        structured ||
        buildDeepAnalysisResponse(rawPrompt, request) ||
        buildGroundedResponse(rawPrompt, request) ||
        {
          role: "assistant",
          text:
            "Working response\n\n" +
            "Prompt:\n" + rawPrompt + "\n\n" +
            "This is the merged engine fallback. The request passed through thread/history, context, reuse, language, and governance preparation.",
          citations: [],
          sources: []
        };

      response = normalizeAssistantMessage(response);

      patchAssistantTurn(thread, pendingTurn, response.text || response.content || "", {
        append: false,
        status: "done",
        meta: {
          normalizedResponse: response,
          requestMeta: request.meta || {}
        }
      });

      var active = getActiveThread();
      if (active && Array.isArray(active.turns)) {
        var actualTurn = active.turns.find(function (turn) {
          return turn.id === pendingTurn.id;
        });
        if (actualTurn) {
          actualTurn.type = response.type || "assistant";
          actualTurn.kind = response.kind || null;
          actualTurn.payload = response.payload || null;
          actualTurn.citations = response.citations || [];
          actualTurn.sources = response.sources || [];
          actualTurn.verification = response.verification || null;
          actualTurn.deepAnalysisMeta = response.deepAnalysisMeta || null;
          actualTurn.groundedQa = response.groundedQa || null;
          actualTurn.createdAt = actualTurn.createdAt || nowIso();
        }
      }

      renderMessagesFromThread();
      notifyHelpersOnAssistantResponse(thread.id);
      setStatus("Done.");
    } catch (err) {
      patchAssistantTurn(thread, pendingTurn, (err && err.message) || "Generation failed.", {
        append: false,
        status: "error"
      });
      renderMessagesFromThread();
      showError((err && err.message) || "Generation failed.");
      setStatus("Failed.");
    }
  }

  window.sendAssistantPrompt = sendAssistantPrompt;
  window.renderMessagesFromThread = renderMessagesFromThread;
  window.__ZhuxinGenerationEngine = {
    sendAssistantPrompt: sendAssistantPrompt,
    renderMessagesFromThread: renderMessagesFromThread,
    buildRequest: buildRequest
  };

  document.addEventListener("zhuxin:thread-changed", function () {
    renderMessagesFromThread();
  });

  document.addEventListener("DOMContentLoaded", function () {
    renderMessagesFromThread();
  });
})(window, document);
