import { getCurrentMatterFromMirror, listMatterFiles, getAppSettings } from './app-data.js';
import { createAssistantStore, buildAssistantInitialState } from './helpers/assistant-store.js';
import { runAssistantWorkflow } from './helpers/assistant-workflow.js';

const $ = (id) => document.getElementById(id);

const els = {
  promptBox: $('promptBox'),
  sendBtn: $('sendBtn'),
  messages: $('messages'),
  statusBar: $('statusBar'),
  matterChip: $('matterChip'),
  aiChip: $('aiChip'),

  tabs: document.querySelectorAll('[data-tab]'),
  panels: document.querySelectorAll('[data-panel]'),

  draftEditor: $('draftEditor'),
  deliverableEditor: $('deliverableEditor'),
  deliverableTitle: $('deliverableTitle'),
  applyDraftBtn: $('applyDraftBtn'),
  generateDeliverableBtn: $('generateDeliverableBtn'),

  citationList: $('citationList'),

  exportBtn: $('exportBtn'),
  shareBtn: $('shareBtn'),
  exportModal: $('exportModal'),
  shareModal: $('shareModal'),
  closeExportModalBtn: $('closeExportModalBtn'),
  closeShareModalBtn: $('closeShareModalBtn'),
  buildExportBtn: $('buildExportBtn'),
  downloadExportLink: $('downloadExportLink'),
  exportPreview: $('exportPreview'),
  exportIncludeHistory: $('exportIncludeHistory'),
  exportIncludeSources: $('exportIncludeSources'),

  shareAssignee: $('shareAssignee'),
  shareReviewers: $('shareReviewers'),
  shareNote: $('shareNote'),
  buildSharePacketBtn: $('buildSharePacketBtn'),
  shareOutput: $('shareOutput'),

  openDrawerBtn: $('openDrawerBtn'),
  closeDrawerBtn: $('closeDrawerBtn'),
  sourceDrawer: $('sourceDrawer'),
  sourceList: $('sourceList'),

  threadList: $('threadList'),
  newThreadBtn: $('newThreadBtn'),

  copyBtn: $('copyBtn'),
  downloadBtn: $('downloadBtn'),
  saveDocBtn: $('saveDocBtn')
};

let store;

async function init() {
  const matter = getCurrentMatterFromMirror();
  const files = matter?.id ? await listMatterFiles(matter.id) : [];
  const settings = await getAppSettings();

  store = createAssistantStore(buildAssistantInitialState({ matter, settings, files }));

  bindEvents();

  els.exportModal?.classList.remove('show');
  els.shareModal?.classList.remove('show');
  els.sourceDrawer?.classList.remove('open');

  store.subscribe(render);
  render(store.getState());
}

function bindEvents() {
  els.sendBtn?.addEventListener('click', handleSend);

  els.tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      els.tabs.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      els.panels.forEach(p => {
        p.classList.toggle('is-active', p.dataset.panel === tab);
      });
    });
  });

  els.exportBtn?.addEventListener('click', () => {
    els.exportModal?.classList.add('show');
  });

  els.shareBtn?.addEventListener('click', () => {
    els.shareModal?.classList.add('show');
  });

  els.closeExportModalBtn?.addEventListener('click', () => {
    els.exportModal?.classList.remove('show');
  });

  els.closeShareModalBtn?.addEventListener('click', () => {
    els.shareModal?.classList.remove('show');
  });

  els.exportModal?.addEventListener('click', (e) => {
    if (e.target === els.exportModal) els.exportModal.classList.remove('show');
  });

  els.shareModal?.addEventListener('click', (e) => {
    if (e.target === els.shareModal) els.shareModal.classList.remove('show');
  });

  els.openDrawerBtn?.addEventListener('click', () => {
    els.sourceDrawer?.classList.add('open');
  });

  els.closeDrawerBtn?.addEventListener('click', () => {
    els.sourceDrawer?.classList.remove('open');
  });

  els.applyDraftBtn?.addEventListener('click', () => {
    if (els.draftEditor && store) {
      store.setState(d => {
        d.workspace.answer = els.draftEditor.value.trim();
      });
    }
  });

  els.generateDeliverableBtn?.addEventListener('click', () => {
    if (els.deliverableEditor && store) {
      store.setState(d => {
        d.workspace.answer = els.deliverableEditor.value.trim();
      });
    }
  });

  els.buildExportBtn?.addEventListener('click', () => {
    const state = store.getState();
    let output = state.workspace.answer || '';

    if (els.exportIncludeSources?.checked && state.workspace.citations?.length) {
      output += '\n\nSources:\n';
      state.workspace.citations.forEach(c => {
        output += `- ${c.title}: ${c.snippet}\n`;
      });
    }

    if (els.exportIncludeHistory?.checked) {
      output += '\n\nHistory included.';
    }

    if (els.exportPreview) els.exportPreview.textContent = output;

    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    if (els.downloadExportLink) {
      els.downloadExportLink.href = url;
      els.downloadExportLink.download = 'zhuxin-export.txt';
    }
  });

  els.buildSharePacketBtn?.addEventListener('click', () => {
    const state = store.getState();
    const packet = [
      `Assignee: ${els.shareAssignee?.value || ''}`,
      `Reviewers: ${els.shareReviewers?.value || ''}`,
      `Note: ${els.shareNote?.value || ''}`,
      '',
      'Latest output:',
      state.workspace.answer || ''
    ].join('\n');

    if (els.shareOutput) els.shareOutput.textContent = packet;
  });

  els.copyBtn?.addEventListener('click', async () => {
    const text = store?.getState().workspace.answer || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      els.statusBar.textContent = 'Copied.';
    } catch {
      els.statusBar.textContent = 'Copy failed.';
    }
  });

  els.downloadBtn?.addEventListener('click', () => {
    const text = store?.getState().workspace.answer || '';
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zhuxin-output.txt';
    a.click();
  });

  els.saveDocBtn?.addEventListener('click', () => {
    els.statusBar.textContent = 'Save action ready.';
  });

  els.newThreadBtn?.addEventListener('click', () => {
    els.statusBar.textContent = 'New thread action ready.';
  });
}

function render(state) {
  if (els.matterChip) {
    els.matterChip.textContent = state.matter?.name || 'No current matter';
  }

  if (els.aiChip) {
    els.aiChip.textContent = state.settings?.preferences?.aiSource?.label || 'AI';
  }

  if (els.messages) {
    els.messages.innerHTML = '';

    if (!state.workspace.answer) {
      els.messages.innerHTML = '<div class="zhx-empty">No output yet.</div>';
    } else {
      const div = document.createElement('div');
      div.className = 'zhx-msg';
      div.innerHTML = '<strong>assistant</strong><div>' + state.workspace.answer.replace(/\n/g, '<br>') + '</div>';
      els.messages.appendChild(div);
    }
  }

  if (els.draftEditor && state.workspace.answer) {
    els.draftEditor.value = state.workspace.answer;
  }

  if (els.deliverableEditor && state.workspace.answer) {
    els.deliverableEditor.value = state.workspace.answer;
  }

  if (els.citationList) {
    els.citationList.innerHTML = '';

    if (!state.workspace.citations?.length) {
      els.citationList.innerHTML = '<div class="zhx-empty">No citations yet.</div>';
    } else {
      state.workspace.citations.forEach(c => {
        const div = document.createElement('div');
        div.className = 'zhx-msg';
        div.innerHTML = '<strong>' + c.title + '</strong><div>' + c.snippet + '</div>';
        els.citationList.appendChild(div);
      });
    }
  }

  if (els.sourceList) {
    els.sourceList.innerHTML = '';
    if (!state.files?.length) {
      els.sourceList.innerHTML = '<div class="zhx-empty">No sources yet.</div>';
    } else {
      state.files.forEach(f => {
        const div = document.createElement('div');
        div.className = 'zhx-msg';
        div.innerHTML = '<strong>' + (f.name || 'File') + '</strong><div>' + (f.note || f.recordType || 'Source') + '</div>';
        els.sourceList.appendChild(div);
      });
    }
  }

  if (els.threadList) {
    els.threadList.innerHTML = '<div class="zhx-empty">Threads coming from your app-data layer.</div>';
  }
}

async function handleSend() {
  const state = store.getState();
  const prompt = els.promptBox.value.trim();
  if (!prompt) return;

  els.sendBtn.disabled = true;
  els.statusBar.textContent = 'Generating…';

  try {
    const result = await runAssistantWorkflow({
      prompt,
      matter: state.matter,
      files: state.files,
      settings: state.settings
    });

    store.setState(d => {
      d.workspace.answer = result.answer;
      d.workspace.citations = result.citations;
    });

    els.statusBar.textContent = 'Done.';
  } catch (e) {
    els.statusBar.textContent = 'Error generating response';
  }

  els.sendBtn.disabled = false;
}

init();
