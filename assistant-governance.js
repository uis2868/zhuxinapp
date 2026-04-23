(function () {
  function evaluateAttachmentSet(attachments, context) {
    const result = {
      hardBlock: false,
      warnings: [],
      allowedFiles: attachments || [],
      blockedFiles: [],
      activeMatterId: context.activeMatterId || "general"
    };

    (attachments || []).forEach(function (file) {
      if (file.matterId && file.matterId !== result.activeMatterId) {
        result.warnings.push("Cross-matter file detected: " + file.name);
      }
    });

    return result;
  }

  function renderComposerGovernance(result) {
    const el = document.getElementById("assistantComposerError");
    if (!el) return;

    if (result.hardBlock) {
      el.hidden = false;
      el.textContent = "Blocked by governance.";
    } else if (result.warnings && result.warnings.length) {
      el.hidden = false;
      el.textContent = result.warnings.join("; ");
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  }

  function buildGovernancePromptPrefix(result) {
    if (!result || !result.warnings.length) return "";
    return "GOVERNANCE NOTE:\n" + result.warnings.join("\n");
  }

  function createSnapshot(result) {
    return {
      time: new Date().toISOString(),
      warnings: result.warnings || []
    };
  }

  window.ZhuxinGovernance = {
    evaluateAttachmentSet,
    renderComposerGovernance,
    buildGovernancePromptPrefix,
    createSnapshot
  };
})();