import {
  isSupabaseConfigured,
  getSupabaseClient,
  getSession,
  signInWithEmail as supabaseSignIn,
  signUpWithEmail as supabaseSignUp,
  signOutSupabase,
  ensureUserProfile
} from './supabase-client.js';

export const MATTER_KEY = 'zhuxin_matter_state';
export const FILES_KEY = 'zhuxin_matter_files';
export const LAB_KEY = 'zhuxin_backend_lab';
export const LOCAL_AUTH_KEY = 'zhuxin_local_auth';
export const THREADS_KEY = 'zhuxin_threads_state';
export const DOCS_KEY = 'zhuxin_generated_documents';
export const SETTINGS_KEY = 'zhuxin_app_settings';

function dispatchKey(key, value) {
  const encoded = JSON.stringify(value);
  localStorage.setItem(key, encoded);
  try {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: encoded }));
  } catch {
    // ignore synthetic storage event failures on some browsers
  }
}

function safeJson(key, fallback) {
  return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
}

export function getLocalMatterState() {
  return safeJson(MATTER_KEY, { currentId: null, matters: [] });
}

export function setLocalMatterState(state) {
  dispatchKey(MATTER_KEY, state);
}

export function getLocalFilesState() {
  return safeJson(FILES_KEY, { byMatter: {} });
}

export function setLocalFilesState(state) {
  dispatchKey(FILES_KEY, state);
}

export function getLocalThreadsState() {
  return safeJson(THREADS_KEY, { threads: [], messagesByThread: {} });
}

export function setLocalThreadsState(state) {
  dispatchKey(THREADS_KEY, state);
}

export function getLocalDocsState() {
  return safeJson(DOCS_KEY, { documents: [] });
}

export function setLocalDocsState(state) {
  dispatchKey(DOCS_KEY, state);
}

export function getLocalSettingsState() {
  return safeJson(SETTINGS_KEY, { theme: 'light-harvey', locale: 'en', preferences: {} });
}

export function setLocalSettingsState(state) {
  dispatchKey(SETTINGS_KEY, state);
}

export function getLabState() {
  return safeJson(LAB_KEY, { plan: 'free', used: 0, payment: 'idle', docs: [] });
}

export function getLocalAuth() {
  return JSON.parse(localStorage.getItem(LOCAL_AUTH_KEY) || 'null');
}

export function setLocalAuth(user) {
  if (user) {
    localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(LOCAL_AUTH_KEY);
  }
  try {
    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_AUTH_KEY, newValue: user ? JSON.stringify(user) : null }));
  } catch {
    // ignore
  }
}

export async function getDataMode() {
  if (!isSupabaseConfigured()) return 'local';
  const session = await getSession();
  return session ? 'supabase' : 'local';
}

export async function getAuthSummary() {
  const mode = await getDataMode();
  if (mode === 'supabase') {
    const session = await getSession();
    const profile = await ensureUserProfile();
    return {
      mode,
      configured: true,
      session,
      user: session?.user || null,
      profile,
      displayName: profile?.full_name || session?.user?.email || 'Signed in'
    };
  }
  const user = getLocalAuth();
  return {
    mode: 'local',
    configured: isSupabaseConfigured(),
    session: null,
    user,
    profile: user,
    displayName: user?.full_name || user?.email || 'Local mode'
  };
}

export async function signInWithEmail(email, password) {
  if (!isSupabaseConfigured()) {
    const localUser = { id: 'local-user', email, full_name: email.split('@')[0] || 'Local User' };
    setLocalAuth(localUser);
    return { mode: 'local', user: localUser };
  }
  const data = await supabaseSignIn({ email, password });
  await ensureUserProfile();
  return { mode: 'supabase', data };
}

export async function signUpWithEmail(email, password, fullName) {
  if (!isSupabaseConfigured()) {
    const localUser = { id: 'local-user', email, full_name: fullName || email.split('@')[0] || 'Local User' };
    setLocalAuth(localUser);
    return { mode: 'local', user: localUser };
  }
  const data = await supabaseSignUp({ email, password, fullName });
  return { mode: 'supabase', data };
}

export async function signOutCurrentUser() {
  if (await getDataMode() === 'supabase') {
    await signOutSupabase();
  }
  setLocalAuth(null);
}

function mapMatterRow(row) {
  return {
    id: row.id,
    name: row.name,
    client: row.client || 'Unspecified client',
    project: row.project || 'General project',
    area: row.practice_area || row.area || 'General Advisory',
    jurisdiction: row.jurisdiction || 'Unspecified',
    notes: row.notes || '',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    status: row.status || 'active'
  };
}

export function inferRecordType(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('brs')) return 'BRS';
  if (n.includes('mutation') || n.includes('namjari')) return 'Mutation';
  if (n.includes('deed') || n.includes('kobala') || n.includes('sale') || n.includes('heba') || n.includes('gift')) return 'Deed';
  if (n.includes('cs')) return 'CS';
  if (n.includes('sa')) return 'SA';
  if (n.includes('rs')) return 'RS';
  return 'Unclassified';
}

function mapFileRow(row) {
  const name = row.file_name || row.name;
  return {
    id: row.id,
    name,
    origin: row.origin || 'manual',
    status: row.status || 'attached',
    note: row.note || '',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    fileType: row.file_type || deriveFileType(name),
    recordType: row.record_type || row.recordType || inferRecordType(name),
    sequenceNumber: row.sequence_number || row.sequenceNumber || 0,
    isVerified: row.is_verified || row.isVerified || false,
    tag: row.tag || row.fileTag || ''
  };
}

function mapThreadRow(row) {
  return {
    id: row.id,
    matterId: row.matter_id || row.matterId || null,
    title: row.title || 'Untitled thread',
    moduleName: row.module_name || row.moduleName || 'assistant',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

function mapMessageRow(row) {
  return {
    id: row.id,
    threadId: row.thread_id || row.threadId,
    role: row.role,
    content: row.content,
    metadata: row.metadata || {},
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

function mapDocumentRow(row) {
  return {
    id: row.id,
    matterId: row.matter_id || row.matterId || null,
    moduleName: row.module_name || row.moduleName || 'assistant',
    title: row.title || 'Untitled document',
    content: row.content || '',
    exportType: row.export_type || row.exportType || 'text',
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

function deriveFileType(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ext || 'file';
}

function syncMatterMirror(matters) {
  const previous = getLocalMatterState();
  const currentId = matters.some(m => m.id === previous.currentId)
    ? previous.currentId
    : (matters[0]?.id || null);
  setLocalMatterState({ currentId, matters });
  return currentId;
}

function syncMatterFilesMirror(matterId, files) {
  const state = getLocalFilesState();
  state.byMatter[matterId] = files;
  setLocalFilesState(state);
}

function syncThreadsMirror(threads, messagesByThread) {
  setLocalThreadsState({ threads, messagesByThread: messagesByThread || getLocalThreadsState().messagesByThread || {} });
}

function syncDocumentsMirror(documents) {
  setLocalDocsState({ documents });
}

export async function listMatters() {
  const mode = await getDataMode();
  if (mode === 'local') {
    return getLocalMatterState();
  }
  const client = await getSupabaseClient();
  const profile = await ensureUserProfile();
  const { data, error } = await client
    .from('matters')
    .select('*')
    .eq('owner_id', profile.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const matters = (data || []).map(mapMatterRow);
  const currentId = syncMatterMirror(matters);
  return { currentId, matters };
}

export async function createMatter(input) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalMatterState();
    const matter = {
      id: 'm_' + Date.now(),
      name: input.name,
      client: input.client || 'Unspecified client',
      project: input.project || 'General project',
      area: input.area || 'General Advisory',
      jurisdiction: input.jurisdiction || 'Unspecified',
      notes: input.notes || '',
      createdAt: new Date().toISOString(),
      status: 'active'
    };
    state.matters.unshift(matter);
    state.currentId = matter.id;
    setLocalMatterState(state);
    return matter;
  }
  const client = await getSupabaseClient();
  const profile = await ensureUserProfile();
  const payload = {
    owner_id: profile.id,
    name: input.name,
    client: input.client || null,
    project: input.project || null,
    practice_area: input.area || null,
    jurisdiction: input.jurisdiction || null,
    notes: input.notes || null,
    status: 'active'
  };
  const { data, error } = await client.from('matters').insert(payload).select().single();
  if (error) throw error;
  const matter = mapMatterRow(data);
  const listed = await listMatters();
  setLocalMatterState({ currentId: matter.id, matters: listed.matters });
  return matter;
}

export async function setCurrentMatter(id) {
  const state = await listMatters();
  setLocalMatterState({ currentId: id, matters: state.matters });
}

export async function deleteMatter(id) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalMatterState();
    state.matters = state.matters.filter(m => m.id !== id);
    if (state.currentId === id) state.currentId = state.matters[0]?.id || null;
    setLocalMatterState(state);
    return;
  }
  const client = await getSupabaseClient();
  const { error } = await client.from('matters').delete().eq('id', id);
  if (error) throw error;
  await listMatters();
}

export async function clearAllMatters() {
  const mode = await getDataMode();
  if (mode === 'local') {
    setLocalMatterState({ currentId: null, matters: [] });
    setLocalFilesState({ byMatter: {} });
    return;
  }
  const client = await getSupabaseClient();
  const profile = await ensureUserProfile();
  const { error } = await client.from('matters').delete().eq('owner_id', profile.id);
  if (error) throw error;
  setLocalMatterState({ currentId: null, matters: [] });
  setLocalFilesState({ byMatter: {} });
}

export async function seedDemoMatters() {
  const state = await listMatters();
  if (state.matters.length) throw new Error('Demo matters were not loaded because saved matters already exist.');
  const demo = [
    { name: 'Acme v Delta — Patent Defense', client: 'Acme Corp', project: 'Delta Litigation', area: 'Litigation', jurisdiction: 'US / UK', notes: 'Initial complaint review and contradiction search.' },
    { name: 'Northbridge — Supply Agreement Review', client: 'Northbridge Holdings', project: 'Commercial Contracts', area: 'Commercial Contracts', jurisdiction: 'England', notes: 'Review change-of-control and assignment language.' },
    { name: 'Avenor — Series B Financing', client: 'Avenor AI', project: 'Series B Financing', area: 'M&A', jurisdiction: 'Delaware', notes: 'Draft closing checklist and timeline.' }
  ];
  for (const item of demo) {
    await createMatter(item);
  }
}

export function getCurrentMatterFromMirror() {
  const state = getLocalMatterState();
  return state.matters.find(m => m.id === state.currentId) || null;
}

export async function listMatterFiles(matterId) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalFilesState();
    return (state.byMatter[matterId] || []).slice().sort((a,b)=> (a.sequenceNumber||0) - (b.sequenceNumber||0) || String(a.createdAt).localeCompare(String(b.createdAt)));
  }
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from('matter_files')
    .select('*')
    .eq('matter_id', matterId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const files = (data || []).map(mapFileRow).sort((a,b)=> (a.sequenceNumber||0) - (b.sequenceNumber||0) || String(a.createdAt).localeCompare(String(b.createdAt)));
  syncMatterFilesMirror(matterId, files);
  return files;
}

export async function addMatterFile(matterId, file) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalFilesState();
    if (!state.byMatter[matterId]) state.byMatter[matterId] = [];
    const nextSequence = (state.byMatter[matterId][0]?.sequenceNumber || state.byMatter[matterId].length || 0) + 1;
    const record = {
      id: 'file_' + Date.now(),
      name: file.name,
      origin: file.origin || 'manual',
      status: file.status || 'attached',
      note: file.note || '',
      createdAt: new Date().toISOString(),
      fileType: deriveFileType(file.name),
      recordType: file.recordType || inferRecordType(file.name),
      sequenceNumber: file.sequenceNumber || nextSequence,
      isVerified: Boolean(file.isVerified),
      tag: file.tag || ''
    };
    state.byMatter[matterId].unshift(record);
    setLocalFilesState(state);
    return record;
  }
  const client = await getSupabaseClient();
  const profile = await ensureUserProfile();
  const payload = {
    matter_id: matterId,
    owner_id: profile.id,
    file_name: file.name,
    file_type: deriveFileType(file.name),
    origin: file.origin || 'manual',
    status: file.status || 'attached',
    note: JSON.stringify({
      text: file.note || null,
      recordType: file.recordType || inferRecordType(file.name),
      sequenceNumber: file.sequenceNumber || 0,
      isVerified: Boolean(file.isVerified),
      tag: file.tag || ''
    }),
    storage_path: file.storagePath || null
  };
  const { data, error } = await client.from('matter_files').insert(payload).select().single();
  if (error) throw error;
  await listMatterFiles(matterId);
  return mapFileRow(data);
}

export async function updateMatterFile(matterId, fileId, patch) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalFilesState();
    state.byMatter[matterId] = (state.byMatter[matterId] || []).map(f => f.id === fileId ? { ...f, ...patch } : f);
    setLocalFilesState(state);
    return (state.byMatter[matterId] || []).find(f => f.id === fileId) || null;
  }
  const current = (await listMatterFiles(matterId)).find(f => f.id === fileId);
  if (!current) throw new Error('Matter file not found.');
  const client = await getSupabaseClient();
  const notePayload = {
    text: patch.note ?? current.note ?? null,
    recordType: patch.recordType || current.recordType || inferRecordType(current.name),
    sequenceNumber: patch.sequenceNumber ?? current.sequenceNumber ?? 0,
    isVerified: patch.isVerified ?? current.isVerified ?? false,
    tag: patch.tag ?? current.tag ?? ''
  };
  const payload = {
    file_name: patch.name || current.name,
    status: patch.status || current.status,
    note: JSON.stringify(notePayload)
  };
  const { data, error } = await client.from('matter_files').update(payload).eq('id', fileId).select().single();
  if (error) throw error;
  await listMatterFiles(matterId);
  return mapFileRow(data);
}

export async function removeMatterFile(matterId, fileId) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalFilesState();
    state.byMatter[matterId] = (state.byMatter[matterId] || []).filter(f => f.id !== fileId);
    setLocalFilesState(state);
    return;
  }
  const client = await getSupabaseClient();
  const { error } = await client.from('matter_files').delete().eq('id', fileId);
  if (error) throw error;
  await listMatterFiles(matterId);
}

export async function clearMatterFiles(matterId) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalFilesState();
    state.byMatter[matterId] = [];
    setLocalFilesState(state);
    return;
  }
  const client = await getSupabaseClient();
  const { error } = await client.from('matter_files').delete().eq('matter_id', matterId);
  if (error) throw error;
  syncMatterFilesMirror(matterId, []);
}

export async function listThreads({ matterId = null } = {}) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalThreadsState();
    return matterId ? state.threads.filter(t => t.matterId === matterId) : state.threads;
  }
  const client = await getSupabaseClient();
  let query = client.from('threads').select('*').order('updated_at', { ascending: false });
  if (matterId) query = query.eq('matter_id', matterId);
  const { data, error } = await query;
  if (error) throw error;
  const threads = (data || []).map(mapThreadRow);
  syncThreadsMirror(threads);
  return threads;
}

export async function getThreadMessages(threadId) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalThreadsState();
    return state.messagesByThread[threadId] || [];
  }
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const messages = (data || []).map(mapMessageRow);
  const state = getLocalThreadsState();
  state.messagesByThread[threadId] = messages;
  setLocalThreadsState(state);
  return messages;
}

export async function createThread({ matterId = null, title = 'New thread', moduleName = 'assistant' } = {}) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalThreadsState();
    const thread = {
      id: 'thread_' + Date.now(),
      matterId,
      title,
      moduleName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.threads.unshift(thread);
    state.messagesByThread[thread.id] = [];
    setLocalThreadsState(state);
    return thread;
  }
  const client = await getSupabaseClient();
  const profile = await ensureUserProfile();
  const payload = {
    matter_id: matterId,
    owner_id: profile.id,
    title,
    module_name: moduleName
  };
  const { data, error } = await client.from('threads').insert(payload).select().single();
  if (error) throw error;
  const thread = mapThreadRow(data);
  const listed = await listThreads({ matterId });
  syncThreadsMirror(listed);
  return thread;
}

export async function appendThreadMessage(threadId, { role, content, metadata = {} }) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalThreadsState();
    const msg = { id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), threadId, role, content, metadata, createdAt: new Date().toISOString() };
    if (!state.messagesByThread[threadId]) state.messagesByThread[threadId] = [];
    state.messagesByThread[threadId].push(msg);
    state.threads = state.threads.map(t => t.id === threadId ? { ...t, updatedAt: msg.createdAt, title: t.title === 'New thread' && role === 'user' ? content.slice(0, 48) : t.title } : t);
    setLocalThreadsState(state);
    return msg;
  }
  const client = await getSupabaseClient();
  const payload = { thread_id: threadId, role, content, metadata };
  const { data, error } = await client.from('messages').insert(payload).select().single();
  if (error) throw error;
  const msg = mapMessageRow(data);
  const { error: updateError } = await client.from('threads').update({ updated_at: new Date().toISOString(), title: role === 'user' ? content.slice(0, 48) : undefined }).eq('id', threadId);
  if (updateError) {
    // ignore thread title/update error for now
  }
  await getThreadMessages(threadId);
  return msg;
}

export async function listGeneratedDocuments({ matterId = null } = {}) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalDocsState();
    return matterId ? state.documents.filter(d => d.matterId === matterId) : state.documents;
  }
  const client = await getSupabaseClient();
  let query = client.from('generated_documents').select('*').order('created_at', { ascending: false });
  if (matterId) query = query.eq('matter_id', matterId);
  const { data, error } = await query;
  if (error) throw error;
  const docs = (data || []).map(mapDocumentRow);
  syncDocumentsMirror(docs);
  return docs;
}

export async function createGeneratedDocument({ matterId = null, moduleName = 'assistant', title = 'Untitled document', content = '', exportType = 'text' }) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalDocsState();
    const doc = { id: 'doc_' + Date.now(), matterId, moduleName, title, content, exportType, createdAt: new Date().toISOString() };
    state.documents.unshift(doc);
    setLocalDocsState(state);
    return doc;
  }
  const client = await getSupabaseClient();
  const profile = await ensureUserProfile();
  const payload = { matter_id: matterId, owner_id: profile.id, module_name: moduleName, title, content, export_type: exportType };
  const { data, error } = await client.from('generated_documents').insert(payload).select().single();
  if (error) throw error;
  const doc = mapDocumentRow(data);
  await listGeneratedDocuments({ matterId });
  return doc;
}

export async function createNoticeDraft(input) {
  const matterId = input.matterId || null;
  const title = input.subject ? 'Notice — ' + input.subject : 'Notice draft';
  const content = [
    input.letterhead || 'LEGAL NOTICE',
    '',
    'Recipient: ' + (input.recipientName || ''),
    input.recipientAddress || '',
    '',
    'Subject: ' + (input.subject || ''),
    '',
    input.facts || '',
    '',
    'Demand:',
    input.demandText || '',
    '',
    'Response period: ' + (input.responseDays || '7') + ' days.',
    '',
    input.senderName || 'Zhuxin Draft'
  ].join('\n');

  const document = await createGeneratedDocument({
    matterId,
    moduleName: 'notice-generator',
    title,
    content,
    exportType: 'notice'
  });

  const mode = await getDataMode();
  if (mode === 'supabase') {
    const client = await getSupabaseClient();
    const profile = await ensureUserProfile();
    const payload = {
      matter_id: matterId,
      owner_id: profile.id,
      recipient_name: input.recipientName || null,
      recipient_address: input.recipientAddress || null,
      subject: input.subject || null,
      facts: input.facts || null,
      demand_text: input.demandText || null,
      generated_document_id: document.id
    };
    const { error } = await client.from('notice_requests').insert(payload);
    if (error) throw error;
  }

  return document;
}

export async function getAppSettings() {
  const mode = await getDataMode();
  if (mode === 'local') {
    return getLocalSettingsState();
  }
  const client = await getSupabaseClient();
  const profile = await ensureUserProfile();
  const { data, error } = await client.from('settings').select('*').eq('owner_id', profile.id).maybeSingle();
  if (error) throw error;
  const result = data ? {
    id: data.id,
    theme: data.theme || 'light-harvey',
    locale: data.locale || 'en',
    preferences: data.preferences || {}
  } : { theme: 'light-harvey', locale: 'en', preferences: {} };
  setLocalSettingsState(result);
  return result;
}

export async function saveAppSettings(input) {
  const current = await getAppSettings();
  const next = {
    ...current,
    theme: input.theme || current.theme || 'light-harvey',
    locale: input.locale || current.locale || 'en',
    preferences: { ...(current.preferences || {}), ...(input.preferences || {}) }
  };

  const mode = await getDataMode();
  if (mode === 'local') {
    setLocalSettingsState(next);
    return next;
  }

  const client = await getSupabaseClient();
  const profile = await ensureUserProfile();
  if (current.id) {
    const { data, error } = await client.from('settings').update({ theme: next.theme, locale: next.locale, preferences: next.preferences, updated_at: new Date().toISOString() }).eq('id', current.id).select().single();
    if (error) throw error;
    const saved = { id: data.id, theme: data.theme, locale: data.locale, preferences: data.preferences || {} };
    setLocalSettingsState(saved);
    return saved;
  }
  const payload = { owner_id: profile.id, theme: next.theme, locale: next.locale, preferences: next.preferences };
  const { data, error } = await client.from('settings').insert(payload).select().single();
  if (error) throw error;
  const saved = { id: data.id, theme: data.theme, locale: data.locale, preferences: data.preferences || {} };
  setLocalSettingsState(saved);
  return saved;
}

window.ZHUXIN_APP_DATA = window.ZHUXIN_APP_DATA || {};
window.ZHUXIN_APP_DATA.assistant = window.ZHUXIN_APP_DATA.assistant || {};

window.ZHUXIN_APP_DATA.assistant.contextOrchestration = {
  defaultMode: "auto",
  maxVisibleChips: 4,
  maxInjectedChars: 6000,
  maxPerSourceChars: 1600,
  autoIncludeTypes: ["matter_profile", "thread_history"],
  strictBlocksUnavailable: true,
  typeLabels: {
    matter_profile: "Matter",
    thread_history: "Thread",
    uploaded_file: "File",
    saved_source: "Saved",
    note: "Note"
  }
};

window.ZHUXIN_APP_DATA.assistant.matterProfiles =
  window.ZHUXIN_APP_DATA.assistant.matterProfiles || [
    {
      id: "matter-default",
      label: "Default Matter",
      status: "ready",
      summary: "High-level matter summary goes here."
    }
  ];

window.ZHUXIN_APP_DATA.assistant.threads =
  window.ZHUXIN_APP_DATA.assistant.threads || [
    {
      id: "assistant-default-thread",
      matterId: "matter-default",
      messages: []
    }
  ];

window.ZHUXIN_APP_DATA.assistant.uploadedFiles =
  window.ZHUXIN_APP_DATA.assistant.uploadedFiles || [];

window.ZHUXIN_APP_DATA.assistant.savedSources =
  window.ZHUXIN_APP_DATA.assistant.savedSources || [];
