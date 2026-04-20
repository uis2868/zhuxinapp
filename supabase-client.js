function getConfig() {
  return window.ZHUXIN_SUPABASE_CONFIG || { supabaseUrl: '', supabaseAnonKey: '' };
}

let supabasePromise = null;

export function isSupabaseConfigured() {
  const config = getConfig();
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!supabasePromise) {
    supabasePromise = import('https://esm.sh/@supabase/supabase-js@2').then(({ createClient }) => {
      const config = getConfig();
      return createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    });
  }
  return supabasePromise;
}

export async function getSession() {
  const client = await getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export async function getSessionUser() {
  const session = await getSession();
  return session?.user || null;
}

export async function signUpWithEmail({ email, password, fullName }) {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured yet.');
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || '' } }
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail({ email, password }) {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured yet.');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOutSupabase() {
  const client = await getSupabaseClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function ensureUserProfile() {
  const client = await getSupabaseClient();
  if (!client) return null;
  const user = await getSessionUser();
  if (!user) return null;

  const { data: existing, error: selectError } = await client
    .from('users')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const payload = {
    auth_user_id: user.id,
    full_name: user.user_metadata?.full_name || user.email || 'Zhuxin User',
    email: user.email || null,
    role: 'user'
  };

  const { data: inserted, error: insertError } = await client
    .from('users')
    .insert(payload)
    .select()
    .single();

  if (insertError) throw insertError;
  return inserted;
}
