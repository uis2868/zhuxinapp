import { getAuthSummary } from './app-data.js';

const ACCESS_KEY = 'zhuxin_access_state';
const ADMIN_KEY = 'zhuxin_admin_controls';

const PLAN_CATALOG = {
  'public-free': { id: 'public-free', label: 'Public Free', role: 'public', priceBdt: 0, quota: 5 },
  'public-plus': { id: 'public-plus', label: 'Public Plus', role: 'public', priceBdt: 799, quota: 25 },
  'chamber-basic': { id: 'chamber-basic', label: 'Chamber Basic', role: 'advocate', priceBdt: 2999, quota: 120 },
  'chamber-plus': { id: 'chamber-plus', label: 'Chamber Plus', role: 'chamber_admin', priceBdt: 6999, quota: 300 },
  'chamber-pro': { id: 'chamber-pro', label: 'Chamber Pro', role: 'chamber_admin', priceBdt: 14999, quota: 800 }
};

const ROLE_CAPABILITIES = {
  public: ['title-chain', 'inheritance', 'basic-notice', 'document-upload', 'verification-request'],
  advocate: ['title-chain', 'inheritance', 'basic-notice', 'assistant', 'matter-files', 'verification-queue', 'review-tables'],
  chamber_staff: ['assistant', 'matter-files', 'review-tables', 'draft-studio'],
  chamber_admin: ['assistant', 'matter-files', 'review-tables', 'draft-studio', 'verification-queue', 'billing', 'exports'],
  admin: ['assistant', 'matter-files', 'review-tables', 'draft-studio', 'verification-queue', 'billing', 'admin-console', 'user-controls']
};

function safeJson(key, fallback) {
  return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  try {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(value) }));
  } catch {}
}

function defaultProfile(email = '') {
  return {
    email,
    role: 'public',
    planId: 'public-free',
    chamberName: '',
    territory: 'Bangladesh',
    enrollmentId: '',
    verificationScore: 0,
    panelStatus: 'not-on-panel'
  };
}

export function getPlanCatalog() {
  return PLAN_CATALOG;
}

export function getRoleCapabilities(role) {
  return ROLE_CAPABILITIES[role] || ROLE_CAPABILITIES.public;
}

export function getAccessState() {
  return safeJson(ACCESS_KEY, { profilesByEmail: {}, enrollmentRequired: false });
}

export function getAdminControls() {
  return safeJson(ADMIN_KEY, { enrollmentRequired: false, publicAdvancedDrafting: false, offlineTerritoryStrict: true });
}

export function saveAdminControls(input) {
  const next = { ...getAdminControls(), ...input };
  saveJson(ADMIN_KEY, next);
  const access = getAccessState();
  access.enrollmentRequired = next.enrollmentRequired;
  saveJson(ACCESS_KEY, access);
  return next;
}

export async function getCurrentAccessProfile() {
  const auth = await getAuthSummary();
  const email = auth.user?.email || auth.profile?.email || '';
  const state = getAccessState();
  if (!email) return { ...defaultProfile('guest@example.com'), displayName: auth.displayName || 'Guest' };
  if (!state.profilesByEmail[email]) {
    state.profilesByEmail[email] = defaultProfile(email);
    saveJson(ACCESS_KEY, state);
  }
  return { ...state.profilesByEmail[email], displayName: auth.displayName || email };
}

export async function saveCurrentAccessProfile(patch) {
  const auth = await getAuthSummary();
  const email = auth.user?.email || auth.profile?.email || patch.email || '';
  if (!email) throw new Error('No current signed-in user found.');
  const state = getAccessState();
  const current = state.profilesByEmail[email] || defaultProfile(email);
  const next = { ...current, ...patch, email };
  state.profilesByEmail[email] = next;
  saveJson(ACCESS_KEY, state);
  return next;
}

export async function getCurrentRoleLanding() {
  const profile = await getCurrentAccessProfile();
  if (profile.role === 'admin') return './admin-console.html';
  if (profile.role === 'advocate' || profile.role === 'chamber_staff' || profile.role === 'chamber_admin') return './chamber-dashboard.html';
  return './public-dashboard.html';
}

export async function getBillingSummary() {
  const access = await getCurrentAccessProfile();
  const plan = PLAN_CATALOG[access.planId] || PLAN_CATALOG['public-free'];
  return {
    plan,
    role: access.role,
    chamberName: access.chamberName,
    verificationDiscountEligible: plan.id !== 'public-free',
    paymentOptions: ['bKash', 'Nagad', 'SSLCommerz'],
    periods: ['1 week', '1 month', '3 months', '6 months', '1 year']
  };
}

export async function changeCurrentPlan(planId) {
  if (!PLAN_CATALOG[planId]) throw new Error('Unknown plan selected.');
  return saveCurrentAccessProfile({ planId });
}

export async function currentUserHasCapability(capability) {
  const profile = await getCurrentAccessProfile();
  const controls = getAdminControls();
  if (capability === 'draft-studio' && profile.role === 'public' && controls.publicAdvancedDrafting) return true;
  return getRoleCapabilities(profile.role).includes(capability);
}

export function capabilityRestrictionMessage(capability) {
  const map = {
    'draft-studio': 'Draft Studio is reserved for chamber and advocate workflows.',
    'review-tables': 'Review Tables are reserved for chamber and advocate workflows.',
    'verification-queue': 'Verification Queue is reserved for professional review workflows.',
    'billing': 'Billing & Plans management is reserved for chamber or admin users.',
    'admin-console': 'Admin Console is reserved for platform admins.'
  };
  return map[capability] || 'This page is not available for the current role.';
}
