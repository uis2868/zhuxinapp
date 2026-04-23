(function () {
  const STATUS_META = {
    verified: { label: "Verified", className: "assistant-verification--verified" },
    partial: { label: "Partial verification", className: "assistant-verification--partial" },
    unverified: { label: "Unverified", className: "assistant-verification--unverified" },
    uncited: { label: "No citations needed", className: "assistant-verification--uncited" }
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function buildSourceIndex(sources) {
    return normalizeArray(sources).reduce(function (acc, item, idx) {
      const source = {
        id: item && item.id ? String(item.id) : "src-" + (idx + 1),
        title: item && item.title ? String(item.title) : "Untitled source",
        type: item && item.type ? String(item.type) : "unknown",
        locator: item && item.locator ? String(item.locator) : "",
        excerpt: item && item.excerpt ? String(item.excerpt) : "",
        status: item && item.status ? String(item.status) : "partial"
      };
      acc[source.id] = source;
      return acc;
    }, {});
  }

  function buildCitationIndex(citations) {
    return normalizeArray(citations).reduce(function (acc, item, idx) {
      const citation = {
        id: item && item.id ? String(item.id) : "cit-" + (idx + 1),
        label: Number.isFinite(item && item.label) ? item.label : (idx + 1),
        sourceId: item && item.sourceId ? String(item.sourceId) : "",
        locator: item && item.locator ? String(item.locator) : "",
        quote: item && item.quote ? String(item.quote) : "",
        status: item && item.status ? String(item.status) : "partial"
      };
      acc[citation.id] = citation;
      return acc;
    }, {});
  }

  function dedupeStrings(items) {
    return Array.from(new Set(normalizeArray(items)));
  }

  function computeVerification(message) {
    const evidenceMode = message.evidenceMode || "required";
    const citations = normalizeArray(message.citations);
    const sources = normalizeArray(message.sources);

    if (evidenceMode === "disabled") {
      return { status: "uncited", warnings: [] };
    }

    if (!citations.length || !sources.length) {
      return {
        status: evidenceMode === "optional" ? "uncited" : "unverified",
        warnings: evidenceMode === "optional"
          ? []
          : ["Answer requires citations but no complete citation payload was provided."]
      };
    }

    const sourceIndex = buildSourceIndex(sources);
    const warnings = [];
    let hasPartial = false;
    let hasBroken = false;

    citations.forEach(function (citation) {
      const src = sourceIndex[citation.sourceId];
      if (!src) {
        hasBroken = true;
        warnings.push("Citation " + citation.id + " does not map to a source.");
        return;
      }
      if (!citation.locator || !src.locator || !src.excerpt) {
        hasPartial = true;
        warnings.push("Citation " + citation.id + " is missing locator or excerpt detail.");
      }
      if (citation.status === "unverified" || src.status === "unverified") {
        hasBroken = true;
      }
      if (citation.status === "partial" || src.status === "partial") {
        hasPartial = true;
      }
    });

    if (hasBroken) return { status: "unverified", warnings: dedupeStrings(warnings) };
    if (hasPartial) return { status: "partial", warnings: dedupeStrings(warnings) };
    return { status: "verified", warnings: [] };
  }

  function renderCitationButton(citation) {
    return (
      '<button type="button" class="assistant-citation assistant-citation--' +
      escapeHtml(citation.status || "partial") +
      '" data-citation-id="' +
      escapeHtml(citation.id) +
      '" data-source-id="' +
      escapeHtml(citation.sourceId) +
      '">' +
      "[" + escapeHtml(citation.label) + "]" +
      "</button>"
    );
  }

  function renderContentWithCitations(message) {
    const citationIndex = buildCitationIndex(message.citations || []);
    const raw = String(message.content || "");
    const safe = escapeHtml(raw).replace(/\n/g, "<br>");

    return safe.replace(/\[\[cite:([a-zA-Z0-9_-]+)\]\]/g, function (_, citationId) {
      const citation = citationIndex[citationId];
      if (!citation) return '<span class="assistant-citation assistant-citation--missing">[?]</span>';
      return renderCitationButton(citation);
    });
  }

  function renderVerificationBadge(message) {
    const verification = message.verification || computeVerification(message);
    const meta = STATUS_META[verification.status] || STATUS_META.partial;
    const warningCount = normalizeArray(verification.warnings).length;

    return (
      '<div class="assistant-verification ' +
      escapeHtml(meta.className) +
      '">' +
      '<span class="assistant-verification__label">' +
      escapeHtml(meta.label) +
      "</span>" +
      (warningCount
        ? '<span class="assistant-verification__count">' +
          escapeHtml(warningCount) +
          " warning" +
          (warningCount > 1 ? "s" : "") +
          "</span>"
        : "") +
      "</div>"
    );
  }

  function renderMessageMeta(message) {
    return (
      '<div class="assistant-evidence-bar">' +
      renderVerificationBadge(message) +
      '<button type="button" class="assistant-sources-button" data-open-sources="' +
      escapeHtml(message.id || "assistant-last") +
      '">' +
      "Sources (" + escapeHtml((message.sources || []).length) + ")" +
      "</button>" +
      "</div>"
    );
  }

  function renderSourceCard(source, citationsForSource, focusCitationId) {
    const isFocused = citationsForSource.some(function (citation) {
      return citation.id === focusCitationId;
    });

    const citationPills = citationsForSource.map(function (citation) {
      return (
        '<span class="assistant-source-card__citation-pill">[' +
        escapeHtml(citation.label) +
        "]</span>"
      );
    }).join("");

    return (
      '<article class="assistant-source-card' +
      (isFocused ? " assistant-source-card--focused" : "") +
      '">' +
      "<header>" +
      '<div class="assistant-source-card__title-row">' +
      '<h4 class="assistant-source-card__title">' +
      escapeHtml(source.title) +
      "</h4>" +
      '<span class="assistant-source-card__type">' +
      escapeHtml(source.type.toUpperCase()) +
      "</span>" +
      "</div>" +
      '<div class="assistant-source-card__locator">' +
      escapeHtml(source.locator || "Locator unavailable") +
      "</div>" +
      "</header>" +
      '<div class="assistant-source-card__excerpt">' +
      escapeHtml(source.excerpt || "No excerpt available.") +
      "</div>" +
      '<div class="assistant-source-card__footer">' +
      '<div class="assistant-source-card__citations">' +
      citationPills +
      "</div>" +
      '<div class="assistant-source-card__status">' +
      escapeHtml(source.status) +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function buildDrawerHtml(message, focusCitationId) {
    const sourceIndex = buildSourceIndex(message.sources || []);
    const citations = normalizeArray(message.citations || []);
    const grouped = {};

    citations.forEach(function (citation) {
      if (!grouped[citation.sourceId]) grouped[citation.sourceId] = [];
      grouped[citation.sourceId].push(citation);
    });

    return Object.keys(sourceIndex).map(function (sourceId) {
      return renderSourceCard(sourceIndex[sourceId], grouped[sourceId] || [], focusCitationId);
    }).join("");
  }

  function openSourceDrawer(message, focusCitationId) {
    const drawer = document.getElementById("assistant-source-drawer");
    const list = document.getElementById("assistant-source-drawer-list");
    if (!drawer || !list) return;

    list.innerHTML = buildDrawerHtml(message, focusCitationId);
    drawer.setAttribute("aria-hidden", "false");
    drawer.classList.add("assistant-source-drawer--open");
  }

  function closeSourceDrawer() {
    const drawer = document.getElementById("assistant-source-drawer");
    if (!drawer) return;
    drawer.classList.remove("assistant-source-drawer--open");
    drawer.setAttribute("aria-hidden", "true");
  }

  function hydrateCurrentOutput() {
    const messages = document.getElementById("messages");
    const citationList = document.getElementById("citationList");
    if (!messages) return;

    const thread = window.ZhuxinAssistantThreads && window.ZhuxinAssistantThreads.getActiveThread
      ? window.ZhuxinAssistantThreads.getActiveThread()
      : null;

    const lastAssistant = thread && Array.isArray(thread.turns)
      ? thread.turns.slice().reverse().find(function (t) { return t.role === "assistant"; })
      : null;

    if (!lastAssistant) return;

    const normalized = {
      id: lastAssistant.id || "assistant-last",
      content: lastAssistant.text || "",
      citations: lastAssistant.citations || [],
      sources: lastAssistant.sources || [],
      evidenceMode: lastAssistant.evidenceMode || "optional",
      verification: computeVerification(lastAssistant)
    };

    messages.innerHTML =
      '<div data-message-id="' +
      escapeHtml(normalized.id) +
      '">' +
      "<div>" +
      renderContentWithCitations(normalized) +
      "</div>" +
      renderMessageMeta(normalized) +
      "</div>";

    if (citationList) {
      citationList.textContent =
        normalized.sources && normalized.sources.length
          ? normalized.sources.length + " source(s) attached"
          : "No citations yet.";
    }

    messages.onclick = function (event) {
      const citationBtn = event.target.closest("[data-citation-id]");
      if (citationBtn) {
        openSourceDrawer(normalized, citationBtn.getAttribute("data-citation-id"));
        return;
      }
      const sourcesBtn = event.target.closest("[data-open-sources]");
      if (sourcesBtn) {
        openSourceDrawer(normalized, null);
      }
    };
  }

  function init() {
    document.addEventListener("click", function (event) {
      if (
        event.target.closest("[data-close-source-drawer]") ||
        event.target.closest("#assistant-source-drawer-close")
      ) {
        closeSourceDrawer();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeSourceDrawer();
    });

    document.addEventListener("zhuxin:assistant-thread-updated", hydrateCurrentOutput);
    document.addEventListener("zhuxin:assistant-thread-activated", hydrateCurrentOutput);

    hydrateCurrentOutput();
  }

  window.ZhuxinCitations = {
    init: init,
    computeVerification: computeVerification,
    renderContentWithCitations: renderContentWithCitations,
    renderMessageMeta: renderMessageMeta
  };
})();
