import { generateAssistantReply } from '../generation-engine.js';

function buildCitations(files, includeCitations) {
  if (!includeCitations) return [];
  return (files || []).slice(0, 8).map((f, index) => ({
    id: f.id || `file-${index}`,
    title: f.name || `File ${index + 1}`,
    snippet: f.note || f.recordType || f.fileType || 'Referenced file'
  }));
}

function buildPromptEnvelope(prompt, options = {}) {
  const parts = [];
  if (options.taskType) parts.push(`Task type: ${options.taskType}.`);
  if (options.deepAnalysis) parts.push('Use deeper analysis and compare the available context carefully.');
  if (options.evidenceMode) parts.push(`Evidence mode: ${options.evidenceMode}.`);
  if (options.deliverableType) parts.push(`Requested deliverable: ${options.deliverableType}.`);
  parts.push(prompt);
  return parts.join(' ');
}

export async function runAssistantWorkflow({ prompt, matter, files, settings, options = {} }) {
  const effectivePrompt = buildPromptEnvelope(prompt, options);
  const reply = await generateAssistantReply({
    prompt: effectivePrompt,
    matter,
    files,
    settings
  });

  return {
    answer: reply,
    citations: buildCitations(files, options.includeCitations !== false),
    meta: {
      taskType: options.taskType || 'answer',
      deliverableType: options.deliverableType || ''
    }
  };
}
