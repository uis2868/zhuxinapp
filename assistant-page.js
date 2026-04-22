const $ = (id) => document.getElementById(id);

const els = {
  promptBox: $('promptBox'),
  sendBtn: $('sendBtn'),
  messages: $('messages'),
  statusBar: $('statusBar'),
  threadList: $('threadList')
};

let store = {
  workspace: {
    answer: '',
    citations: []
  }
};

function loadThreads() {
  return JSON.parse(localStorage.getItem('zhx_threads') || '[]');
}

function saveThreads(threads) {
  localStorage.setItem('zhx_threads', JSON.stringify(threads));
}

function render() {
  // OUTPUT
  els.messages.innerHTML = '';

  if (!store.workspace.answer) {
    els.messages.innerHTML = '<div class="zhx-empty">No output yet.</div>';
  } else {
    const div = document.createElement('div');
    div.className = 'zhx-msg';
    div.innerHTML = '<strong>assistant</strong><div>' + store.workspace.answer.replace(/\n/g,'<br>') + '</div>';
    els.messages.appendChild(div);
  }

  // THREADS
  const threads = loadThreads();

  els.threadList.innerHTML = '';

  if (!threads.length) {
    els.threadList.innerHTML = '<div class="zhx-empty">No threads yet.</div>';
  } else {
    threads.forEach((t, i) => {
      const div = document.createElement('div');
      div.className = 'zhx-msg';
      div.textContent = t.title;

      div.onclick = () => {
        store.workspace.answer = t.answer;
        render();
      };

      els.threadList.appendChild(div);
    });
  }
}

async function handleSend() {
  const prompt = els.promptBox.value.trim();
  if (!prompt) return;

  els.sendBtn.disabled = true;
  els.statusBar.textContent = 'Generating…';

  // FAKE RESPONSE (fallback)
  const answer = `Structured working analysis

Request:
${prompt}

Working response:
1. Identify key facts
2. Review documents
3. Generate output`;

  store.workspace.answer = answer;

  // SAVE THREAD
  const threads = loadThreads();
  threads.unshift({
    title: prompt.slice(0, 40),
    answer,
    time: Date.now()
  });
  saveThreads(threads);

  render();

  els.statusBar.textContent = 'Done.';
  els.sendBtn.disabled = false;
}

els.sendBtn.addEventListener('click', handleSend);

render();
