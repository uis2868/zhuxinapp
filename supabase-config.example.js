window.ZHUXIN_SUPABASE_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLIC_ANON_KEY',
  apiBaseUrl: 'https://YOUR_API_BASE_URL',
  storageBuckets: {
    matterFiles: 'matter-files',
    generatedDocs: 'generated-docs',
    avatars: 'avatars'
  },
  phaseOneModules: [
    'auth',
    'matter-hub',
    'matter-files',
    'assistant',
    'notice-generator'
  ]
};
