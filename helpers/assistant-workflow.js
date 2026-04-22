import { generateAssistantReply } from '../generation-engine.js';

export async function runAssistantWorkflow({ prompt, matter, files, settings }) {
  const reply = await generateAssistantReply({ prompt, matter, files, settings });

  return {
    answer: reply,
    citations: files?.slice(0, 5).map(f => ({
      id: f.id,
      title: f.name,
      snippet: f.note || 'Referenced file'
    })) || []
  };
}
