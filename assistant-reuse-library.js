(function () {
  const KEY = "zhuxin.assistant.reuse.v1";

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function ensure() {
    const state = load();
    state.activeStandards = state.activeStandards || [];
    state.activeFormats = state.activeFormats || [];
    save(state);
    return state;
  }

  function getAppliedPayload() {
    return ensure();
  }

  function buildPrompt(base, payload) {
    const parts = [];
    if (payload.activeStandards.length) {
      parts.push("STANDARDS:");
      payload.activeStandards.forEach(s => parts.push("- " + s));
    }
    if (payload.activeFormats.length) {
      parts.push("FORMAT:");
      payload.activeFormats.forEach(f => parts.push("- " + f));
    }
    parts.push("\nUSER REQUEST:\n" + base);
    return parts.join("\n");
  }

  window.AssistantReuseLibrary = {
    getAppliedPayload,
    buildPrompt
  };
})();