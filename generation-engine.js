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

async function generateAssistantResponse(payload) {
  var assistant = (window.appData && window.appData.assistant) || {};
  var groundedSettings = (assistant.settings && assistant.settings.groundedQa) || {};

  if (groundedSettings.enabled && groundedSettings.groundedOnly && window.ZhuxinGroundedQA) {
    return await generateGroundedQaResponse(payload);
  }

  return await generateStandardAssistantResponse(payload);
}

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
  var currentThreadId =
    typeof window.getCurrentAssistantThreadId === "function"
      ? window.getCurrentAssistantThreadId()
      : "assistant-default-thread";

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
