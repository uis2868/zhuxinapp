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

  els.tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      els.tabs.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      els.panels.forEach((p) => {
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
    if (e.target === els.exportModal) {
      els.exportModal.classList.remove('show');
    }
  });

  els.shareModal?.addEventListener('click', (e) => {
    if (e.target === els.shareModal) {
      els.shareModal.classList.remove('show');
    }
  });

  els.openDrawerBtn?.addEventListener('click', () => {
    els.sourceDrawer?.classList.add('open');
  });

  els.closeDrawerBtn?.addEventListener('click', () => {
    els.sourceDrawer?.classList.remove('open');
  });

  els.applyDraftBtn?.addEventListener('click', () => {
    if (!store || !els.draftEditor) return;
    store.setState((d) => {
      d.workspace.answer = els.draftEditor.value.trim();
    });
  });

  els.generateDeliverableBtn?.addEventListener('click', () => {
    if (!store || !els.deliverableEditor) return;
    store.setState((d) => {
      d.workspace.answer = els.deliverableEditor.value.trim();
    });
  });

  els.buildExportBtn?.addEventListener('click', () => {
    const state = store.getState();
    let output = state.workspace.answer || '';

    if (els.exportIncludeSources?.checked && state.workspace.citations?.length) {
      output += '\n\nSources:\n';
      state.workspace.citations.forEach((c) => {
        output += `- ${c.title}: ${c.snippet}\n`;
      });
    }

    if (els.exportIncludeHistory?.checked) {
      const threads = loadThreads();
      if (threads.length) {
        output += '\n\nHistory:\n';
        threads.forEach((t, index) => {
          output += `${index + 1}. ${t.title}\n`;
        });
      }
    }

    if (els.exportPreview) {
      els.exportPreview.textContent = output;
    }

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

    if (els.shareOutput) {
      els.shareOutput.textContent = packet;
    }
  });

  els.copyBtn?.addEventListener('click', async () => {
    const text = store?.getState().workspace.answer || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (els.statusBar) els.statusBar.textContent = 'Copied.';
    } catch {
      if (els.statusBar) els.statusBar.textContent = 'Copy failed.';
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
    if (els.statusBar) els.statusBar.textContent = 'Save action ready.';
  });

  els.newThreadBtn?.addEventListener('click', () => {
    const threads = loadThreads();
    threads.unshift({
      title: 'New thread',
      answer: '',
      time: Date.now()
    });
    saveThreads(threads);
    render(store.getState());
    if (els.statusBar) els.statusBar.textContent = 'New thread created.';
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
      div.innerHTML =
        '<strong>assistant</strong><div>' +
        String(state.workspace.answer).replace(/\n/g, '<br>') +
        '</div>';
      els.messages.appendChild(div);
    }
  }

  if (els.draftEditor) {
    els.draftEditor.value = state.workspace.answer || '';
  }

  if (els.deliverableEditor) {
    els.deliverableEditor.value = state.workspace.answer || '';
  }

  if (els.citationList) {
    els.citationList.innerHTML = '';

    if (!state.workspace.citations?.length) {
      els.citationList.innerHTML = '<div class="zhx-empty">No citations yet.</div>';
    } else {
      state.workspace.citations.forEach((c) => {
        const div = document.createElement('div');
        div.className = 'zhx-msg';
        div.innerHTML = `<strong>${escapeHtml(c.title)}</strong><div>${escapeHtml(c.snippet)}</div>`;
        els.citationList.appendChild(div);
      });
    }
  }

  if (els.sourceList) {
    els.sourceList.innerHTML = '';

    if (!state.files?.length) {
      els.sourceList.innerHTML = '<div class="zhx-empty">No sources yet.</div>';
    } else {
      state.files.forEach((f) => {
        const div = document.createElement('div');
        div.className = 'zhx-msg';
        div.innerHTML = `<strong>${escapeHtml(f.name || 'File')}</strong><div>${escapeHtml(f.note || f.recordType || 'Source')}</div>`;
        els.sourceList.appendChild(div);
      });
    }
  }

  renderThreads();
}

function renderThreads() {
  if (!els.threadList) return;

  const threads = loadThreads();
  els.threadList.innerHTML = '';

  if (!threads.length) {
    els.threadList.innerHTML = '<div class="zhx-empty">No threads yet.</div>';
    return;
  }

  threads.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'zhx-msg';
    div.textContent = t.title || `Thread ${i + 1}`;
    div.onclick = () => {
      store.setState((d) => {
        d.workspace.answer = t.answer || '';
      });
      if (els.statusBar) els.statusBar.textContent = 'Thread loaded.';
    };
    els.threadList.appendChild(div);
  });
}

async function handleSend() {
  const state = store.getState();
  const prompt = els.promptBox?.value.trim();
  if (!prompt) return;

  els.sendBtn.disabled = true;
  if (els.statusBar) els.statusBar.textContent = 'Generating…';

  try {
    const result = await runAssistantWorkflow({
      prompt,
      matter: state.matter,
      files: state.files,
      settings: state.settings
    });

    store.setState((d) => {
      d.workspace.answer = result.answer;
      d.workspace.citations = result.citations;
    });

    const threads = loadThreads();
    threads.unshift({
      title: prompt.slice(0, 40),
      answer: result.answer,
      time: Date.now()
    });
    saveThreads(threads);

    render(store.getState());

    if (els.statusBar) els.statusBar.textContent = 'Done.';
  } catch {
    if (els.statusBar) els.statusBar.textContent = 'Error generating response';
  }

  els.sendBtn.disabled = false;
}

function loadThreads() {
  try {
    return JSON.parse(localStorage.getItem('zhx_threads') || '[]');
  } catch {
    return [];
  }
}

function saveThreads(threads) {
  localStorage.setItem('zhx_threads', JSON.stringify(threads));
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

init();
