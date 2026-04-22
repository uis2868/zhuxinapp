const $ = (id) => document.getElementById(id);

const promptBox = $('promptBox');
const sendBtn = $('sendBtn');
const messages = $('messages');
const statusBar = $('statusBar');
const threadList = $('threadList');

let currentAnswer = '';

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

function render() {
  // OUTPUT
  messages.innerHTML = '';

  if (!currentAnswer) {
    messages.innerHTML = '<div class="zhx-empty">No output yet.</div>';
  } else {
    const div = document.createElement('div');
    div.className = 'zhx-msg';
    div.innerHTML =
      '<strong>assistant</strong><div>' +
      currentAnswer.replace(/\n/g, '<br>') +
      '</div>';
    messages.appendChild(div);
  }

  // THREADS
  const threads = loadThreads();
  threadList.innerHTML = '';

  if (!threads.length) {
    threadList.innerHTML = '<div class="zhx-empty">No threads yet.</div>';
  } else {
    threads.forEach((t) => {
      const div = document.createElement('div');
      div.className = 'zhx-msg';
      div.textContent = t.title;

      div.onclick = () => {
        currentAnswer = t.answer;
        render();
      };

      threadList.appendChild(div);
    });
  }
}

function handleSend() {
  const prompt = promptBox.value.trim();
  if (!prompt) return;

  sendBtn.disabled = true;
  statusBar.textContent = 'Generating…';

  // FORCE visible output (debug safe)
  currentAnswer = `Structured working analysis

Request:
${prompt}

Working response:
1. Identify key facts
2. Review documents
3. Generate output`;

  // SAVE THREAD
  const threads = loadThreads();
  threads.unshift({
    title: prompt.slice(0, 40),
    answer: currentAnswer,
    time: Date.now()
  });

  saveThreads(threads);

  render();

  statusBar.textContent = 'Done.';
  sendBtn.disabled = false;
}

// 🔥 CRITICAL: Ensure binding works
window.addEventListener('DOMContentLoaded', () => {
  sendBtn.addEventListener('click', handleSend);
  render();
});
