export function createAssistantStore(initialState) {
  let state = structuredClone(initialState);
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(updater) {
    const draft = structuredClone(state);
    updater(draft);
    state = draft;
    listeners.forEach(listener => listener(state));
    return state;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, setState, subscribe };
}

export function buildAssistantInitialState({ matter, settings, files }) {
  return {
    boot: { ready: false },
    matter,
    settings,
    files,
    ui: {
      activeTab: 'answer',
      showSourceDrawer: false,
      showShareModal: false,
      showExportModal: false,
      status: '',
      banner: null
    },
    threads: {
      list: [],
      activeThreadId: null,
      messages: []
    },
    composer: {
      prompt: '',
      improvedPrompt: '',
      useImprovedPrompt: false,
      guidanceMode: 'balanced',
      taskType: 'answer',
      tone: 'clear',
      density: 'balanced',
      targetLanguage: settings?.locale || 'en',
      deepAnalysis: false,
      includeCitations: true,
      denseTextMode: false,
      selectedDeliverableType: '',
      evidenceMode: 'grounded'
    },
    sources: {
      selectedSourceIds: ['matter', 'matter-files', 'thread-history'],
      selectedFileIds: [],
      attachments: []
    },
    workspace: {
      answer: '',
      citations: [],
      draftText: '',
      deliverableTitle: '',
      deliverableText: '',
      sharePacket: '',
      exportText: '',
      fileEditor: {
        selectedAttachmentId: '',
        content: ''
      }
    }
  };
}
