export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  return true;
}

export function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function matterSummary(matter) {
  if (!matter) return 'No current matter selected.';
  return [matter.name, matter.client, matter.area, matter.jurisdiction].filter(Boolean).join(' · ');
}

function fileSummary(files) {
  if (!files?.length) return 'No matter files attached.';
  return files.slice(0, 5).map(f => f.name).join(', ');
}

function getAiSource(settings) {
  return settings?.preferences?.aiSource || {
    provider: 'builtin',
    label: 'Built-in Zhuxin fallback',
    endpoint: '',
    model: '',
    apiKey: '',
    systemPrompt: ''
  };
}

export function getAiSourceLabel(settings) {
  const ai = getAiSource(settings);
  const labels = {
    builtin: 'Built-in fallback',
    'openai-compatible': 'Open-source / custom endpoint',
    ollama: 'Ollama local',
    backend: 'Backend AI route'
  };
  return ai.label || labels[ai.provider] || 'Built-in fallback';
}

function buildAssistantSystemPrompt({ matter, files, settings }) {
  const style = settings?.preferences?.responseStyle || 'structured';
  const base = [
    'You are Zhuxin, a Bangladesh-focused legal workflow assistant.',
    'Give practical structured legal workflow help.',
    'Do not claim final legal certainty.',
    'Use the supplied matter and file context only as working context.'
  ];
  if (style === 'formal') base.push('Use a formal advisory tone.');
  if (style === 'concise') base.push('Keep the response concise and direct.');
  const custom = getAiSource(settings)?.systemPrompt?.trim();
  return [...base, custom || ''].filter(Boolean).join(' ');
}

function buildAssistantUserPrompt({ prompt, matter, files }) {
  const facts = files?.length ? files.slice(0, 5).map((f, i) => `${i + 1}. ${f.name}${f.note ? ' — ' + f.note : ''}`).join('\n') : '1. No attached files yet.';
  return [
    'Current matter:',
    matterSummary(matter),
    '',
    'Attached files:',
    fileSummary(files),
    '',
    'Quick file notes:',
    facts,
    '',
    'User request:',
    prompt,
    '',
    'Return a structured working answer with practical next steps.'
  ].join('\n');
}

async function fetchJsonFast(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { content: text };
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callConfiguredAi({ messages, settings }) {
  const ai = getAiSource(settings);
  if (ai.provider === 'builtin') return null;

  const endpoint = ai.provider === 'ollama'
    ? (ai.endpoint?.trim() || 'http://localhost:11434/v1/chat/completions')
    : ai.endpoint?.trim();

  if (!endpoint) return null;

  const headers = { 'Content-Type': 'application/json' };
  if (ai.apiKey?.trim()) headers.Authorization = 'Bearer ' + ai.apiKey.trim();

  const body = {
    model: ai.model?.trim() || (ai.provider === 'ollama' ? 'llama3.1' : ''),
    messages,
    temperature: 0.2
  };

  const data = await fetchJsonFast(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }, 8000);
  const content = data?.choices?.[0]?.message?.content || data?.message?.content || data?.response || data?.content || '';
  return String(content || '').trim() || null;
}

function buildFallbackAssistantReply({ prompt, matter, files, settings }) {
  const style = settings?.preferences?.responseStyle || 'structured';
  const toneLine = style === 'formal' ? 'Formal advisory draft' : style === 'concise' ? 'Concise working note' : 'Structured working analysis';
  const facts = files?.length ? files.slice(0, 3).map((f, i) => `${i + 1}. ${f.name}${f.note ? ' — ' + f.note : ''}`).join('\n') : '1. No attached files yet.';
  return [
    toneLine,
    '',
    'Current matter:',
    matterSummary(matter),
    '',
    'Attached files:',
    fileSummary(files),
    '',
    'Request:',
    prompt,
    '',
    'Working response:',
    '1. Identify the controlling facts and issues from the current matter.',
    '2. Review the attached documents for contradictions, key dates, obligations, and missing evidence.',
    '3. Convert the result into the next work product that best fits the request.',
    '',
    'Suggested next outputs:',
    '- notice draft',
    '- client update',
    '- issue list',
    '- evidence checklist',
    '',
    'Quick evidence view:',
    facts
  ].join('\n');
}

export async function generateAssistantReply({ prompt, matter, files, settings }) {
  const cfg = window.ZHUXIN_SUPABASE_CONFIG || {};
  if (cfg.apiBaseUrl) {
    const data = await fetchJsonFast(cfg.apiBaseUrl.replace(/\/$/, '') + '/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, matter, files, settings })
    }, 8000);
    if (data?.content) return data.content;
  }

  const aiResponse = await callConfiguredAi({
    settings,
    messages: [
      { role: 'system', content: buildAssistantSystemPrompt({ matter, files, settings }) },
      { role: 'user', content: buildAssistantUserPrompt({ prompt, matter, files }) }
    ]
  });
  if (aiResponse) return aiResponse;

  return buildFallbackAssistantReply({ prompt, matter, files, settings });
}

function buildNoticeSystemPrompt(settings) {
  const ai = getAiSource(settings);
  return [
    'You are Zhuxin, a legal drafting assistant.',
    'Draft a notice in clean professional English.',
    'Do not invent legal certainty beyond the facts provided.',
    ai.systemPrompt?.trim() || ''
  ].filter(Boolean).join(' ');
}

function buildNoticeUserPrompt({ input, matter, files, settings }) {
  const responseDays = input.responseDays || settings?.preferences?.noticeDays || '7';
  return [
    'Generate a legal notice draft.',
    '',
    'Matter:',
    matterSummary(matter),
    '',
    'Recipient:',
    input.recipientName || '',
    input.recipientAddress || '',
    '',
    'Subject:',
    input.subject || '',
    '',
    'Facts:',
    input.facts || 'Facts not yet inserted.',
    '',
    'Demand:',
    input.demandText || 'Please comply with the obligations set out above.',
    '',
    'Documents reviewed:',
    fileSummary(files),
    '',
    'Response period:',
    responseDays + ' days',
    '',
    'Return only the draft notice text.'
  ].join('\n');
}

export async function generateNoticeContent({ input, matter, files, settings }) {
  const cfg = window.ZHUXIN_SUPABASE_CONFIG || {};
  if (cfg.apiBaseUrl) {
    const data = await fetchJsonFast(cfg.apiBaseUrl.replace(/\/$/, '') + '/notice-generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, matter, files, settings })
    }, 8000);
    if (data?.content) {
      return { title: data.title || ('Notice — ' + (input.subject || 'Draft')), content: data.content };
    }
  }

  const aiResponse = await callConfiguredAi({
    settings,
    messages: [
      { role: 'system', content: buildNoticeSystemPrompt(settings) },
      { role: 'user', content: buildNoticeUserPrompt({ input, matter, files, settings }) }
    ]
  });
  if (aiResponse) {
    return { title: 'Notice — ' + (input.subject || 'Draft'), content: aiResponse };
  }

  const responseDays = input.responseDays || settings?.preferences?.noticeDays || '7';
  const title = 'Notice — ' + (input.subject || 'Draft');
  const content = [
    input.letterhead || 'LEGAL NOTICE',
    '',
    'From: ' + (input.senderName || 'Zhuxin Legal Team'),
    'Matter: ' + matterSummary(matter),
    '',
    'To: ' + (input.recipientName || ''),
    input.recipientAddress || '',
    '',
    'Subject: ' + (input.subject || ''),
    '',
    'Background:',
    input.facts || 'Facts not yet inserted.',
    '',
    files?.length ? ('Documents reviewed: ' + fileSummary(files)) : 'Documents reviewed: no attached files.',
    '',
    'Demand:',
    input.demandText || 'Please comply with the obligations set out above.',
    '',
    'You are requested to respond within ' + responseDays + ' days from receipt of this notice, failing which appropriate steps may be taken without further reference.',
    '',
    'Sincerely,',
    input.senderName || 'Zhuxin Legal Team'
  ].join('\n');
  return { title, content };
}

function getAppAssistant() {
  window.appData = window.appData || {};
  window.appData.assistant = window.appData.assistant || {};
  return window.appData.assistant;
}

function getSettingsFromWindow() {
  var preferences = {
    groundedQa: ((window.appData || {}).assistant || {}).settings
      ? (((window.appData || {}).assistant || {}).settings.groundedQa || {})
      : {}
  };
  return window.__zhuxinSettings || window.zhuxinSettings || { preferences: preferences };
}

function getCurrentMatterFromWindow() {
  if (window.__zhuxinCurrentMatter) return window.__zhuxinCurrentMatter;
  if (window.zhuxinCurrentMatter) return window.zhuxinCurrentMatter;
  return null;
}

function getCurrentFilesFromWindow() {
  if (Array.isArray(window.__zhuxinCurrentFiles)) return window.__zhuxinCurrentFiles;
  if (Array.isArray(window.zhuxinCurrentFiles)) return window.zhuxinCurrentFiles;
  return [];
}

function normalizeAssistantTransportError(error) {
  return {
    role: 'assistant',
    type: 'grounded_qa',
    text: 'The grounded answer could not be completed reliably from the current source material.',
    meta: {
      groundedQa: {
        supportLevel: 'insufficient',
        basis: [],
        gaps: ['Model output was unavailable or invalid for grounded mode.'],
        assumptions: [],
        analysisMode: (((window.appData || {}).assistant || {}).settings || {}).groundedQa?.analysisMode || 'direct_answer'
      }
    }
  };
}

async function callAssistantModel(modelPayload) {
  const matter = getCurrentMatterFromWindow();
  const files = getCurrentFilesFromWindow();
  const settings = getSettingsFromWindow();

  const contextText = (modelPayload.contextBlocks || []).map(function (b, i) {
    return `[${i + 1}] ${b.label}\n${b.text}`;
  }).join('\n\n');

  const combinedPrompt = [
    modelPayload.instruction || '',
    '',
    contextText ? ('SOURCE CONTEXT:\n' + contextText) : '',
    '',
    'USER QUESTION:',
    modelPayload.userPrompt || ''
  ].join('\n');

  const aiResponse = await callConfiguredAi({
    settings,
    messages: [
      { role: 'system', content: 'Return only JSON when asked.' },
      { role: 'user', content: combinedPrompt }
    ]
  });

  if (aiResponse) return aiResponse;

  return JSON.stringify({
    answer: "The provided material supports only a limited grounded answer.",
    support_level: modelPayload.contextBlocks && modelPayload.contextBlocks.length ? "partial" : "insufficient",
    basis: (modelPayload.contextBlocks || []).slice(0, 2).map(function (b) {
      return {
        sourceId: b.id,
        sourceLabel: b.label,
        snippet: String(b.text || '').slice(0, 180),
        reason: "Included from currently active grounded context."
      };
    }),
    gaps: modelPayload.contextBlocks && modelPayload.contextBlocks.length ? [] : ["No source context was available."],
    assumptions: []
  });
}

function getCurrentThreadId() {
  const assistant = getAppAssistant();
  return assistant.activeThreadId || 'assistant-default-thread';
}

function getThreadRecord(threadId) {
  const assistant = getAppAssistant();
  assistant.threadsById = assistant.threadsById || {};
  assistant.threadsById[threadId] = assistant.threadsById[threadId] || { id: threadId };
  return assistant.threadsById[threadId];
}

function getDeepAnalysisState() {
  const assistant = getAppAssistant();
  const thread = getThreadRecord(getCurrentThreadId());
  const fallback = assistant.deepAnalysis?.defaultState || {
    enabled: false,
    panelOpen: false,
    profile: 'balanced',
    retrievalDepth: 'standard',
    sections: {
      issueMap: true,
      evidenceMatrix: true,
      contradictionScan: true,
      missingEvidence: true,
      followUpQuestions: true
    },
    sourceLimit: 12,
    lastRun: null
  };
  thread.deepAnalysis = Object.assign({}, fallback, thread.deepAnalysis || {});
  thread.deepAnalysis.sections = Object.assign({}, fallback.sections || {}, (thread.deepAnalysis && thread.deepAnalysis.sections) || {});
  return thread.deepAnalysis;
}

function getSelectedSourcesForAnalysis() {
  const files = getCurrentFilesFromWindow();
  return files.slice(0, getDeepAnalysisState().sourceLimit || 12).map(function (file, index) {
    return {
      rank: index + 1,
      id: file.id || ('src-' + index),
      title: file.name || ('Source ' + (index + 1)),
      type: file.fileType || 'source',
      citationLabel: file.recordType || '',
      excerpt: file.note || file.name || '',
      metadata: {}
    };
  });
}

function renderDeepAnalysisMetaHeader(meta) {
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
    '<span class="assistant-analysis-meta-chip">Profile: ' + escapeHtml(config.profile || 'balanced') + '</span>',
    '<span class="assistant-analysis-meta-chip">Depth: ' + escapeHtml(config.retrievalDepth || 'standard') + '</span>',
    '<span class="assistant-analysis-meta-chip">Sources: ' + escapeHtml(meta.sourceCount || 0) + '</span>',
    '<span class="assistant-analysis-meta-chip">Blocks: ' + escapeHtml(sectionNames.join(', ') || 'none') + '</span>',
    '</div>',
    '</div>'
  ].join('');
}

function buildDeepAnalysisPlan(promptText, state, selectedSources) {
  var steps = [];

  if (state.sections.issueMap) steps.push('Map the core issues or questions that must be resolved.');
  if (state.sections.evidenceMatrix) steps.push('Group the most relevant source-backed evidence by issue.');
  if (state.sections.contradictionScan) steps.push('Find contradictions, tension points, or unresolved source conflicts.');
  if (state.sections.missingEvidence) steps.push('Identify what is still missing or too weak to support a confident conclusion.');
  if (state.sections.followUpQuestions) steps.push('Produce the most useful follow-up questions or next retrieval targets.');

  return {
    mode: 'deep-analysis',
    profile: state.profile,
    retrievalDepth: state.retrievalDepth,
    sourceCount: selectedSources.length,
    sources: selectedSources,
    promptText: String(promptText || '').trim(),
    steps: steps
  };
}

function buildDeepAnalysisSystemInstruction(state) {
  var profileInstruction = {
    balanced: 'Be thorough, structured, and grounded. Avoid unsupported jumps.',
    precision: 'Be narrow, conservative, and explicit about uncertainty. Prefer tighter claims over broader claims.',
    broad: 'Perform wider issue spotting and alternative-angle analysis, while staying grounded in the provided materials.'
  }[state.profile] || 'Be thorough and grounded.';

  return [
    'You are operating in Deep Analysis & Retrieval Intelligence mode.',
    'Your job is not only to answer, but to decompose the problem, organize evidence, surface contradictions, and report missing support.',
    'Do not invent source support.',
    'If evidence is thin or conflicting, say so explicitly.',
    profileInstruction
  ].join('\n');
}

function buildDeepAnalysisUserInstruction(plan) {
  var sections = [];

  sections.push('User request:\n' + plan.promptText);
  sections.push(
    'Normalized sources:\n' +
    plan.sources.map(function (src) {
      return [
        '- [' + src.rank + '] ' + src.title,
        '  Type: ' + src.type,
        src.citationLabel ? '  Reference: ' + src.citationLabel : '',
        src.excerpt ? '  Excerpt: ' + src.excerpt : ''
      ].filter(Boolean).join('\n');
    }).join('\n')
  );
  sections.push(
    'Required analysis steps:\n' +
    plan.steps.map(function (step, index) {
      return (index + 1) + '. ' + step;
    }).join('\n')
  );
  sections.push(
    [
      'Return the answer in this order:',
      '1. Direct conclusion',
      '2. Issue map',
      '3. Evidence matrix',
      '4. Contradictions or tension points',
      '5. Missing evidence / uncertainty',
      '6. Follow-up questions',
      'Use headings. Stay source-grounded.'
    ].join('\n')
  );

  return sections.join('\n\n');
}

function parseDeepAnalysisResponse(text) {
  var raw = String(text || '');
  var sections = raw.split(/\n(?=#+\s)/g).map(function (block) {
    return block.trim();
  }).filter(Boolean);

  return {
    raw: raw,
    sections: sections
  };
}

async function generateStandardAssistantResponse(payload) {
  const matter = getCurrentMatterFromWindow();
  const files = getCurrentFilesFromWindow();
  const settings = getSettingsFromWindow();

  const result = await generateAssistantReply({
    prompt: payload.finalPrompt || payload.rawPrompt || '',
    matter,
    files,
    settings
  });

  return {
    role: 'assistant',
    type: 'standard',
    text: result,
    meta: {}
  };
}

async function generateGroundedQaResponse(payload) {
  var request = window.ZhuxinGroundedQA.buildRequest({
    promptText: payload.rawPrompt || payload.finalPrompt || ''
  });

  var validation = window.ZhuxinGroundedQA.validateRequest(request);

  if (!validation.ok) {
    return window.ZhuxinGroundedQA.buildValidationMessage(validation);
  }

  var modelPayload = {
    taskType: 'assistant_grounded_qa',
    instruction: window.ZhuxinGroundedQA.createPromptEnvelope(request),
    userPrompt: request.query,
    contextBlocks: request.contextBlocks,
    responseFormat: 'json'
  };

  try {
    var raw = await callAssistantModel(modelPayload);
    var normalized = window.ZhuxinGroundedQA.normalizeResponse(raw, request);

    return {
      role: 'assistant',
      type: 'grounded_qa',
      text: normalized.answer,
      meta: {
        groundedQa: normalized
      }
    };
  } catch (error) {
    return normalizeAssistantTransportError(error);
  }
}

async function generateDeepAnalysisAssistantResponse(payload) {
  var state = getDeepAnalysisState();
  var sources = getSelectedSourcesForAnalysis();
  var plan = buildDeepAnalysisPlan(payload.finalPrompt || payload.rawPrompt || '', state, sources);
  var settings = getSettingsFromWindow();

  const aiResponse = await callConfiguredAi({
    settings,
    messages: [
      { role: 'system', content: buildDeepAnalysisSystemInstruction(state) },
      { role: 'user', content: buildDeepAnalysisUserInstruction(plan) }
    ]
  });

  var text = aiResponse || [
    '# Direct conclusion',
    'Deep analysis foundation is active. Live structured reasoning will become stronger after the Subfeature 4 helper batch.',
    '',
    '# Issue map',
    '- Review the prompt against the selected matter and file context.',
    '',
    '# Evidence matrix',
    '- Current selected sources are listed in the deep-analysis metadata header.',
    '',
    '# Contradictions or tension points',
    '- No contradiction engine is active yet in this foundation batch.',
    '',
    '# Missing evidence / uncertainty',
    '- More precise evidence grouping will be added in the Subfeature 4 helper batch.',
    '',
    '# Follow-up questions',
    '- What exact issue should be prioritized first?',
    '- Which attached source is most controlling?'
  ].join('\n');

  state.lastRun = {
    at: new Date().toISOString(),
    responseType: 'assistant-deep-analysis'
  };

  return {
    role: 'assistant',
    type: 'assistant-deep-analysis',
    text: text,
    parsed: parseDeepAnalysisResponse(text),
    deepAnalysisMeta: {
      config: state,
      sourceCount: plan.sourceCount,
      planSteps: plan.steps
    }
  };
}

async function generateAssistantResponse(payload) {
  var assistant = getAppAssistant();
  var groundedSettings = (assistant.settings && assistant.settings.groundedQa) || {};
  var deepAnalysisState = getDeepAnalysisState();

  if (deepAnalysisState.enabled) {
    return await generateDeepAnalysisAssistantResponse(payload);
  }

  if (groundedSettings.enabled && groundedSettings.groundedOnly && window.ZhuxinGroundedQA) {
    return await generateGroundedQaResponse(payload);
  }

  return await generateStandardAssistantResponse(payload);
}

window.ZhuxinGenerationEngine = window.ZhuxinGenerationEngine || {};

Object.assign(window.ZhuxinGenerationEngine, {
  async runDraftGeneration(payload) {
    const titleSeed = (payload && payload.prompt) ? String(payload.prompt).trim() : 'Working Draft';
    const title = titleSeed.length <= 48 ? titleSeed : (titleSeed.slice(0, 48).trim() + '...');
    return {
      title: title || 'Working Draft',
      text: [
        payload.prompt || '',
        '',
        'This is the shared foundation output for Draft Generation.',
        'Full draft generation and revision logic will be added in the Subfeature 5 batch.'
      ].join('\n').trim()
    };
  },

  async runDraftRevision(payload) {
    return {
      title: payload.title || 'Working Draft',
      text: [
        payload.draftText || '',
        '',
        '[Revision instruction applied in foundation mode]',
        payload.instruction ? ('Instruction: ' + payload.instruction) : ''
      ].join('\n').trim()
    };
  }
});

window.GenerationEngine = window.GenerationEngine || {};

window.GenerationEngine.run = async function (request) {
  return JSON.stringify({
    summary: "Foundation mode file-edit suggestions generated.",
    warnings: [
      "Structured file-edit logic will be strengthened in the Subfeature 6 batch."
    ],
    operations: []
  });
};

window.GenerationEngine.fileEdit = (function () {
  function buildBlockPayload(blocks) {
    return blocks.map(function (block) {
      return {
        id: block.id,
        index: block.index,
        text: block.text
      };
    });
  }

  function buildPrompt(payload) {
    return [
      "You are editing an existing document, not creating a new one.",
      "Return JSON only.",
      "Task mode: file_edit.",
      "Preserve the document structure unless the instruction explicitly requires structural edits.",
      "Do not invent new sections, attachments, citations, or metadata.",
      "Do not output the full rewritten document unless the entire file truly requires rewriting.",
      "Prefer targeted operations against provided blocks.",
      "",
      "Required JSON schema:",
      "{",
      '  "summary": "string",',
      '  "warnings": ["string"],',
      '  "operations": [',
      "    {",
      '      "id": "op_1",',
      '      "action": "replace|insert_before|insert_after|delete",',
      '      "blockId": "b1",',
      '      "before": "exact source text or empty string for insert",',
      '      "after": "replacement text or empty string for delete",',
      '      "reason": "why this edit is needed",',
      '      "confidence": 0.0',
      "    }",
      "  ]",
      "}",
      "",
      "User instruction:",
      payload.instruction,
      "",
      "Editing options:",
      JSON.stringify(payload.options, null, 2),
      "",
      "File metadata:",
      JSON.stringify(payload.fileMeta, null, 2),
      "",
      "Blocks:",
      JSON.stringify(buildBlockPayload(payload.blocks), null, 2)
    ].join("\n");
  }

  function normalizeOperation(op, idx) {
    return {
      id: String(op.id || ("op_" + (idx + 1))),
      action: ["replace", "insert_before", "insert_after", "delete"].indexOf(op.action) >= 0 ? op.action : "replace",
      blockId: String(op.blockId || ""),
      before: typeof op.before === "string" ? op.before : "",
      after: typeof op.after === "string" ? op.after : "",
      reason: typeof op.reason === "string" ? op.reason : "",
      confidence: typeof op.confidence === "number" ? op.confidence : 0.5
    };
  }

  function normalizeResponse(raw, payload) {
    var parsed = raw;

    if (typeof raw === "string") {
      parsed = JSON.parse(raw);
    }

    parsed = parsed || {};

    var validBlockIds = {};
    (payload.blocks || []).forEach(function (block) {
      validBlockIds[block.id] = true;
    });

    var operations = Array.isArray(parsed.operations) ? parsed.operations : [];
    operations = operations
      .map(normalizeOperation)
      .filter(function (op) {
        return !!validBlockIds[op.blockId];
      })
      .slice(0, getAppAssistant().fileEditor.maxOperationsPerPass);

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      operations: operations
    };
  }

  async function run(payload) {
    var prompt = buildPrompt(payload);
    var raw = await window.GenerationEngine.run({
      mode: "file_edit",
      prompt: prompt,
      response_format: "json"
    });
    return normalizeResponse(raw, payload);
  }

  return {
    buildPrompt: buildPrompt,
    normalizeResponse: normalizeResponse,
    run: run
  };
})();

export async function runAssistantGeneration({ rawPrompt, finalPrompt, contextPacket }) {
  const statusBar = document.getElementById("statusBar");
  const outputEl = document.getElementById("messages");

  if (statusBar) statusBar.textContent = "Generating...";

  const message = await generateAssistantResponse({
    rawPrompt,
    finalPrompt,
    contextPacket
  });

  if (outputEl) {
    outputEl.innerHTML = "";

    if (message.type === 'assistant-deep-analysis') {
      outputEl.insertAdjacentHTML('beforeend', renderDeepAnalysisMetaHeader(message.deepAnalysisMeta || {}));
    }

    var textWrap = document.createElement("div");
    textWrap.textContent = message.text || "No response.";
    outputEl.appendChild(textWrap);

    if (message.type === 'grounded_qa' && window.ZhuxinGroundedQA) {
      window.ZhuxinGroundedQA.mountGroundedCard(message, outputEl);
    }
  }

  if (statusBar) statusBar.textContent = "Done.";

  return message.text || "";
}

export function prepareAssistantRequest(rawPrompt) {
  var currentThreadId = getCurrentThreadId();

  var contextPacket = null;

  if (window.ZhuxinAssistantContext && typeof window.ZhuxinAssistantContext.beforeSend === "function") {
    contextPacket = window.ZhuxinAssistantContext.beforeSend(rawPrompt, {
      getCurrentThreadId: function () {
        return currentThreadId;
      }
    });
  }

  if (contextPacket && contextPacket.blocked) {
    return {
      ok: false,
      error: (contextPacket.errors && contextPacket.errors[0]) || "Context validation failed."
    };
  }

  return {
    ok: true,
    rawPrompt: rawPrompt,
    finalPrompt: contextPacket ? contextPacket.serializedPrompt : rawPrompt,
    contextPacket: contextPacket
  };
}

export async function sendAssistantPrompt() {
  var inputEl = document.getElementById("assistant-prompt-input");
  if (!inputEl) return;

  var rawPrompt = (inputEl.value || "").trim();
  if (!rawPrompt) return;

  var prepared = prepareAssistantRequest(rawPrompt);
  if (!prepared.ok) {
    if (typeof window.showToast === "function") {
      window.showToast(prepared.error);
    } else {
      alert(prepared.error);
    }
    return;
  }

  return window.runAssistantGeneration({
    rawPrompt: prepared.rawPrompt,
    finalPrompt: prepared.finalPrompt,
    contextPacket: prepared.contextPacket
  });
}

window.runAssistantGeneration = runAssistantGeneration;
window.sendAssistantPrompt = sendAssistantPrompt;
window.prepareAssistantRequest = prepareAssistantRequest;
