(function () {
  let state = {
    rawPrompt: "",
    original: "",
    improved: false,
    outputMode: "memo",
    audience: "",
    tone: "",
    depth: "standard"
  };

  const $ = (id) => document.getElementById(id);

  function init() {
    const input = $("assistantPromptInput");
    if (!input) return;

    input.addEventListener("input", () => {
      state.rawPrompt = input.value;
      updateStatus();
    });

    if ($("assistantImproveBtn")) $("assistantImproveBtn").onclick = improve;
    if ($("assistantRestoreBtn")) $("assistantRestoreBtn").onclick = restore;
    if ($("assistantMetaToggleBtn")) $("assistantMetaToggleBtn").onclick = toggleMeta;
    if ($("assistantSendBtn")) $("assistantSendBtn").onclick = send;

    renderChips();
    updateStatus();
  }

  function renderChips() {
    const modes = ["memo", "bullets", "table", "checklist", "summary", "draft"];
    const wrap = $("assistantOutputModeChips");
    if (!wrap) return;

    wrap.innerHTML = modes.map(m => {
      const active = state.outputMode === m
        ? 'style="background:#2563eb;color:white;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;"'
        : 'style="background:#e5e7eb;color:#111827;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;"';
      return `<button type="button" ${active} onclick="ZhuxinComposer.setMode('${m}')">${m}</button>`;
    }).join(" ");
  }

  function setMode(mode) {
    state.outputMode = mode;
    renderChips();
  }

  function improve() {
    const input = $("assistantPromptInput");
    if (!input || !input.value.trim()) return;

    if (!state.improved) {
      state.original = input.value;
    }

    const improved = [
      "Task: " + input.value.trim(),
      "Output format: " + state.outputMode,
      "Tone: " + (state.tone || "clear"),
      "Depth: " + (state.depth || "standard"),
      state.audience ? "Audience: " + state.audience : "",
      "Assumptions policy: Be explicit about uncertainty instead of guessing."
    ].filter(Boolean).join("\n");

    input.value = improved;
    state.rawPrompt = improved;
    state.improved = true;

    if ($("assistantRestoreBtn")) $("assistantRestoreBtn").hidden = false;
    updateStatus();
  }

  function restore() {
    const input = $("assistantPromptInput");
    if (!input || !state.original) return;

    input.value = state.original;
    state.rawPrompt = state.original;
    state.improved = false;

    if ($("assistantRestoreBtn")) $("assistantRestoreBtn").hidden = true;
    updateStatus();
  }

  function toggleMeta() {
    const panel = $("assistantMetaPanel");
    if (!panel) return;
    panel.hidden = !panel.hidden;
  }

  function updateStatus() {
    const input = $("assistantPromptInput");
    const status = $("assistantPromptStatus");
    const hints = $("assistantPromptHints");
    if (!input) return;

    const text = input.value.trim();
    let rating = "Weak";

    if (text.length > 50) rating = "Strong";
    else if (text.length > 20) rating = "Fair";

    if (status) status.innerText = text ? ("Prompt quality: " + rating) : "";
    if (hints) {
      hints.innerText = text
        ? "Tip: choose output format and use Improve before Send."
        : "";
    }
  }

  async function send() {
    const payload = getSendPayload();
    if (!payload.ok) return;

    const res = await fetch(window.AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: payload.resolvedPrompt,
        mode: "answer"
      })
    });

    const data = await res.json();
    const messages = $("messages");
    if (messages) {
      messages.innerText = data.output || "No output";
    }
  }

  function getSendPayload() {
    const input = $("assistantPromptInput");
    const error = $("assistantComposerError");
    const text = input ? input.value.trim() : "";

    if (!text) {
      if (error) {
        error.innerText = "Write something first";
        error.hidden = false;
      }
      return { ok: false };
    }

    if (error) error.hidden = true;

    return {
      ok: true,
      rawPrompt: state.original || text,
      resolvedPrompt: text,
      composerMeta: {
        improved: state.improved,
        outputMode: state.outputMode,
        audience: state.audience,
        tone: state.tone,
        depth: state.depth
      }
    };
  }

  window.ZhuxinComposer = {
    init,
    setMode,
    getSendPayload
  };
})();
