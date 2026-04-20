window.ZHUXIN_SUPABASE_CONFIG = window.ZHUXIN_SUPABASE_CONFIG || {
  supabaseUrl: '',
  supabaseAnonKey: '',
  apiBaseUrl: '',
  storageBuckets: {
    matterFiles: 'matter-files',
    generatedDocs: 'generated-docs',
    avatars: 'avatars'
  },
  phaseOneModules: ['auth', 'matter-hub', 'matter-files', 'assistant', 'notice-generator']
};
