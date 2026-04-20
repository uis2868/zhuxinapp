import {
  isSupabaseConfigured,
  getSupabaseClient,
  getSession,
  getSessionUser,
  signInWithEmail as supabaseSignIn,
  signUpWithEmail as supabaseSignUp,
  signOutSupabase,
  ensureUserProfile
} from './supabase-client.js';

export const MATTER_KEY = 'zhuxin_matter_state';
export const FILES_KEY = 'zhuxin_matter_files';
export const LAB_KEY = 'zhuxin_backend_lab';
export const LOCAL_AUTH_KEY = 'zhuxin_local_auth';

function dispatchKey(key, value) {
  const encoded = JSON.stringify(value);
  localStorage.setItem(key, encoded);
  try {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: encoded }));
  } catch {
    // ignore synthetic storage event failures on some browsers
  }
}

export function getLocalMatterState() {
  return JSON.parse(localStorage.getItem(MATTER_KEY) || '{"currentId":null,"matters":[]}');
}

export function setLocalMatterState(state) {
  dispatchKey(MATTER_KEY, state);
}

export function getLocalFilesState() {
  return JSON.parse(localStorage.getItem(FILES_KEY) || '{"byMatter":{}}');
}

export function setLocalFilesState(state) {
  dispatchKey(FILES_KEY, state);
}

export function getLabState() {
  return JSON.parse(localStorage.getItem(LAB_KEY) || '{"plan":"free","used":0,"payment":"idle","docs":[]}');
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

function mapFileRow(row) {
  return {
    id: row.id,
    name: row.file_name || row.name,
    origin: row.origin || 'manual',
    status: row.status || 'attached',
    note: row.note || '',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    fileType: row.file_type || ''
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
    return state.byMatter[matterId] || [];
  }
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from('matter_files')
    .select('*')
    .eq('matter_id', matterId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const files = (data || []).map(mapFileRow);
  syncMatterFilesMirror(matterId, files);
  return files;
}

export async function addMatterFile(matterId, file) {
  const mode = await getDataMode();
  if (mode === 'local') {
    const state = getLocalFilesState();
    if (!state.byMatter[matterId]) state.byMatter[matterId] = [];
    const record = {
      id: 'file_' + Date.now(),
      name: file.name,
      origin: file.origin || 'manual',
      status: file.status || 'attached',
      note: file.note || '',
      createdAt: new Date().toISOString(),
      fileType: deriveFileType(file.name)
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
    note: file.note || null,
    storage_path: file.storagePath || null
  };
  const { data, error } = await client.from('matter_files').insert(payload).select().single();
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
