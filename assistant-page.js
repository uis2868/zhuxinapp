import { getCurrentMatterFromMirror, listMatterFiles, getAppSettings } from './app-data.js';
import { createAssistantStore, buildAssistantInitialState } from './helpers/assistant-store.js';
import { runAssistantWorkflow } from './helpers/assistant-workflow.js';

const $ = (id) => document.getElementById(id);

const els = {
  promptBox: $('promptBox'),
  sendBtn: $('sendBtn'),
  messages: $('messages'),
  statusBar: $('statusBar'),

  // tabs
  tabs: document.querySelectorAll('[data-tab]'),
  panels: document.querySelectorAll('[data-panel]'),

  // workspace
  draftEditor: $('draftEditor'),
  deliverableEditor: $('deliverableEditor'),
  deliverableTitle: $('deliverableTitle'),

  // citations
  citationList: $('citationList'),

  // modals
  exportBtn: $('exportBtn'),
  shareBtn: $('shareBtn'),
  exportModal: $('exportModal'),
  shareModal: $('shareModal'),
  closeExportModalBtn: $('closeExportModalBtn'),
  closeShareModalBtn: $('closeShareModalBtn')
};

let store;

async function init() {
  const matter = getCurrentMatterFromMirror();
  const files = matter?.id ? await listMatterFiles(matter.id) : [];
  const settings = await getAppSettings();

  store = createAssistantStore(buildAssistantInitialState({ matter, settings, files }));

  bindEvents();

  // 🔥 ensure modals hidden at start
  els.exportModal?.classList.remove('show');
  els.shareModal?.classList.remove('show');

  store.subscribe(render);
  render(store.getState());
}

function bindEvents() {

  // SEND
  els.sendBtn?.addEventListener('click', handleSend);

  // TABS
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

  // MODALS OPEN
  els.exportBtn?.addEventListener('click', () => {
    els.exportModal?.classList.add('show');
  });

  els.shareBtn?.addEventListener('click', () => {
    els.shareModal?.classList.add('show');
  });

  // MODALS CLOSE BUTTON
  els.closeExportModalBtn?.addEventListener('click', () => {
    els.exportModal?.classList.remove('show');
  });

  els.closeShareModalBtn?.addEventListener('click', () => {
    els.shareModal?.classList.remove('show');
  });

  // 🔥 CLICK OUTSIDE TO CLOSE
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
}

function render(state) {

  // ANSWER
  els.messages.innerHTML = '';

  if (!state.workspace.answer) {
    els.messages.innerHTML = '<div class="zhx-empty">No output yet.</div>';
  } else {
    const div = document.createElement('div');
    div.className = 'zhx-msg';
    div.innerHTML = '<strong>assistant</strong><div>' + state.workspace.answer.replace(/\n/g,'<br>') + '</div>';
    els.messages.appendChild(div);
  }

  // DRAFT
  if (els.draftEditor && state.workspace.answer) {
    els.draftEditor.value = state.workspace.answer;
  }

  // DELIVERABLE
  if (els.deliverableEditor && state.workspace.answer) {
    els.deliverableEditor.value = state.workspace.answer;
  }

  // CITATIONS
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
