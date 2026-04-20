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

export async function generateAssistantReply({ prompt, matter, files, settings }) {
  const cfg = window.ZHUXIN_SUPABASE_CONFIG || {};
  if (cfg.apiBaseUrl) {
    try {
      const res = await fetch(cfg.apiBaseUrl.replace(/\/$/, '') + '/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, matter, files, settings })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.content) return data.content;
      }
    } catch {
      // fallback below
    }
  }

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

export async function generateNoticeContent({ input, matter, files, settings }) {
  const cfg = window.ZHUXIN_SUPABASE_CONFIG || {};
  if (cfg.apiBaseUrl) {
    try {
      const res = await fetch(cfg.apiBaseUrl.replace(/\/$/, '') + '/notice-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, matter, files, settings })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.content) return { title: data.title || ('Notice — ' + (input.subject || 'Draft')), content: data.content };
      }
    } catch {
      // fallback below
    }
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
