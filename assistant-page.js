import { getCurrentMatterFromMirror, listMatterFiles, getAppSettings } from './app-data.js';
import { createAssistantStore, buildAssistantInitialState } from './helpers/assistant-store.js';
import { runAssistantWorkflow } from './helpers/assistant-workflow.js';

const els = {
  promptBox: document.getElementById('promptBox'),
  sendBtn: document.getElementById('sendBtn'),
  messages: document.getElementById('messages'),
  statusBar: document.getElementById('statusBar')
};

let store;

async function init() {
  const matter = getCurrentMatterFromMirror();
  const files = matter?.id ? await listMatterFiles(matter.id) : [];
  const settings = await getAppSettings();

  store = createAssistantStore(buildAssistantInitialState({ matter, settings, files }));

  store.subscribe(render);
  render(store.getState());
}

function render(state) {
  els.messages.innerHTML = '';

  if (!state.workspace.answer) {
    els.messages.innerHTML = '<div class="zhx-empty">No output yet.</div>';
    return;
  }

  const div = document.createElement('div');
  div.className = 'zhx-msg';
  div.innerHTML = '<strong>assistant</strong><div>' + state.workspace.answer.replace(/\n/g,'<br>') + '</div>';
  els.messages.appendChild(div);
}

async function handleSend() {
  const state = store.getState();
  const prompt = els.promptBox.value.trim();
  if (!prompt) return;

  els.sendBtn.disabled = true;
  els.statusBar.textContent = 'Generating…';

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
  els.sendBtn.disabled = false;
}

els.sendBtn.addEventListener('click', handleSend);

init();
