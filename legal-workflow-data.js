import { getCurrentMatterFromMirror, listMatterFiles, createGeneratedDocument, listGeneratedDocuments } from './app-data.js';

const TITLE_CHAIN_KEY = 'zhuxin_title_chain_runs';
const INHERITANCE_KEY = 'zhuxin_inheritance_runs';
const VERIFICATION_KEY = 'zhuxin_verification_queue';
const REVIEW_KEY = 'zhuxin_review_tables';

function safeJson(key, fallback) {
  return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  try {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(value) }));
  } catch {}
}

export function getTitleChainState() {
  return safeJson(TITLE_CHAIN_KEY, { runs: [] });
}

export function getInheritanceState() {
  return safeJson(INHERITANCE_KEY, { runs: [] });
}

export function getVerificationState() {
  return safeJson(VERIFICATION_KEY, { requests: [] });
}

export function getReviewState() {
  return safeJson(REVIEW_KEY, { tables: [] });
}

function classifyDocumentName(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('cs')) return 'CS';
  if (n.includes('sa')) return 'SA';
  if (n.includes('rs')) return 'RS';
  if (n.includes('brs')) return 'BRS';
  if (n.includes('mutation')) return 'Mutation';
  if (n.includes('deed') || n.includes('kobala') || n.includes('sale')) return 'Deed';
  return 'Unclassified';
}

function computeTitleChainRisk(files, confirmations) {
  const types = files.map(f => classifyDocumentName(f.name));
  let score = 0;
  if (!types.includes('CS')) score += 2;
  if (!types.includes('SA')) score += 1;
  if (!types.includes('RS')) score += 2;
  if (!types.includes('BRS')) score += 1;
  if (!types.includes('Deed')) score += 3;
  if (!confirmations.arrangementConfirmed) score += 2;
  if (!confirmations.completenessConfirmed) score += 2;
  if (files.some(f => f.origin === 'intake')) score += 1;
  const label = score >= 7 ? 'High risk' : score >= 4 ? 'Moderate risk' : 'Preliminary low risk';
  return { score, label, missing: ['CS','SA','RS','BRS','Deed'].filter(t => !types.includes(t)) };
}

export async function createTitleChainAnalysis({ notes = '', arrangementConfirmed = false, completenessConfirmed = false } = {}) {
  const matter = getCurrentMatterFromMirror();
  if (!matter) throw new Error('Select a current matter first.');
  const files = await listMatterFiles(matter.id);
  const risk = computeTitleChainRisk(files, { arrangementConfirmed, completenessConfirmed });
  const classifications = files.map(f => ({ name: f.name, type: classifyDocumentName(f.name), origin: f.origin }));
  const content = [
    'TITLE CHAIN PRE-CHECK',
    '',
    'Matter: ' + matter.name,
    'Client: ' + matter.client,
    '',
    'Arrangement confirmed: ' + (arrangementConfirmed ? 'Yes' : 'No'),
    'Completeness confirmed: ' + (completenessConfirmed ? 'Yes' : 'No'),
    '',
    'Detected record layers:',
    ...(classifications.length ? classifications.map((c, i) => `${i + 1}. ${c.name} — ${c.type} (${c.origin})`) : ['1. No files attached.']),
    '',
    'Missing layers:',
    ...(risk.missing.length ? risk.missing.map((m, i) => `${i + 1}. ${m}`) : ['1. No obvious missing core layer detected from file names.']),
    '',
    'Risk result: ' + risk.label,
    'Risk score: ' + risk.score,
    '',
    'Note:',
    notes || 'No additional notes provided.',
    '',
    'This is a preliminary title-chain workflow result and should be verified by an advocate before being treated as final legal advice.'
  ].join('\n');

  const document = await createGeneratedDocument({ matterId: matter.id, moduleName: 'title-chain', title: 'Title Chain — ' + matter.name, content, exportType: 'governed-draft' });
  const state = getTitleChainState();
  const run = { id: 'tc_' + Date.now(), matterId: matter.id, createdAt: new Date().toISOString(), arrangementConfirmed, completenessConfirmed, classifications, risk, note: notes, documentId: document.id };
  state.runs.unshift(run);
  saveJson(TITLE_CHAIN_KEY, state);
  return { run, document };
}

export function listTitleChainAnalyses(matterId = null) {
  const state = getTitleChainState();
  return matterId ? state.runs.filter(r => r.matterId === matterId) : state.runs;
}

function simpleInheritanceShares(input) {
  const sons = Number(input.sons || 0);
  const daughters = Number(input.daughters || 0);
  const wifeCount = Number(input.wives || 0);
  const husband = Boolean(input.husband);
  const mother = Boolean(input.mother);
  const father = Boolean(input.father);
  const shares = [];
  if (wifeCount > 0) shares.push({ label: wifeCount === 1 ? 'Wife' : 'Wives (collectively)', share: sons || daughters ? '1/8' : '1/4' });
  if (husband) shares.push({ label: 'Husband', share: sons || daughters ? '1/4' : '1/2' });
  if (mother) shares.push({ label: 'Mother', share: sons || daughters ? '1/6' : '1/3 subject to other heirs' });
  if (father) shares.push({ label: 'Father', share: sons || daughters ? '1/6 plus residue if applicable' : 'Residue or fixed share depending on facts' });
  if (sons || daughters) shares.push({ label: 'Children', share: daughters && sons ? 'Residue with male receiving roughly twice female share' : sons ? 'Residue among sons' : daughters === 1 ? '1/2 to one daughter' : '2/3 collectively to daughters subject to residue rules' });
  return shares;
}

export async function createInheritanceCalculation(input) {
  const matter = getCurrentMatterFromMirror();
  const shares = simpleInheritanceShares(input);
  const content = [
    'INHERITANCE CALCULATION WORKFLOW RESULT',
    '',
    'Matter: ' + (matter?.name || 'General inheritance matter'),
    'Deceased: ' + (input.deceasedName || 'Not specified'),
    '',
    'Heir summary:',
    'Husband present: ' + (input.husband ? 'Yes' : 'No'),
    'Wives: ' + (input.wives || 0),
    'Father present: ' + (input.father ? 'Yes' : 'No'),
    'Mother present: ' + (input.mother ? 'Yes' : 'No'),
    'Sons: ' + (input.sons || 0),
    'Daughters: ' + (input.daughters || 0),
    '',
    'Indicative shares:',
    ...(shares.length ? shares.map((s, i) => `${i + 1}. ${s.label}: ${s.share}`) : ['1. No supported heir set entered.']),
    '',
    'Important disclaimer:',
    'If the description given by the user is true and complete, this is the likely inheritance position. Complex facts, debts, wills, exclusions, and school-specific questions should be verified by an enrolled advocate.'
  ].join('\n');

  const document = await createGeneratedDocument({ matterId: matter?.id || null, moduleName: 'inheritance', title: 'Inheritance — ' + (input.deceasedName || 'Draft'), content, exportType: 'governed-draft' });
  const state = getInheritanceState();
  const run = { id: 'inh_' + Date.now(), matterId: matter?.id || null, createdAt: new Date().toISOString(), input, shares, documentId: document.id };
  state.runs.unshift(run);
  saveJson(INHERITANCE_KEY, state);
  return { run, document };
}

export function listInheritanceCalculations(matterId = null) {
  const state = getInheritanceState();
  return matterId ? state.runs.filter(r => r.matterId === matterId) : state.runs;
}

export async function createVerificationRequest({ matterId = null, title = 'Verification request', sourceModule = 'assistant', sourceDocumentId = null, note = '', priority = 'standard' }) {
  const state = getVerificationState();
  const request = {
    id: 'vr_' + Date.now(),
    matterId,
    title,
    sourceModule,
    sourceDocumentId,
    note,
    priority,
    status: 'system-generated unverified',
    assignedTo: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.requests.unshift(request);
  saveJson(VERIFICATION_KEY, state);
  return request;
}

export function listVerificationRequests(matterId = null) {
  const state = getVerificationState();
  return matterId ? state.requests.filter(r => r.matterId === matterId) : state.requests;
}

export async function updateVerificationRequest(id, patch) {
  const state = getVerificationState();
  state.requests = state.requests.map(r => r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r);
  saveJson(VERIFICATION_KEY, state);
  return state.requests.find(r => r.id === id);
}

export async function createReviewTable({ title = 'Review table', matterId = null, rows = [] }) {
  const state = getReviewState();
  const table = { id: 'rt_' + Date.now(), title, matterId, rows, createdAt: new Date().toISOString() };
  state.tables.unshift(table);
  saveJson(REVIEW_KEY, state);
  return table;
}

export function listReviewTables(matterId = null) {
  const state = getReviewState();
  return matterId ? state.tables.filter(t => t.matterId === matterId) : state.tables;
}

export async function createDraftStudioDocument({ matterClass = 'civil/property', instructions = '' }) {
  const matter = getCurrentMatterFromMirror();
  const title = 'Draft Studio — ' + (matter?.name || matterClass);
  const content = [
    'DRAFT STUDIO WORKING DRAFT',
    '',
    'Matter class: ' + matterClass,
    'Matter: ' + (matter?.name || 'No current matter'),
    '',
    'Instructions:',
    instructions || 'No instructions inserted.',
    '',
    'Suggested structure:',
    '1. Facts',
    '2. Legal issues',
    '3. Evidence / documents',
    '4. Relief / position',
    '5. Review flags',
    '',
    'This is a chamber-grade working draft and should be reviewed before filing or service.'
  ].join('\n');
  return createGeneratedDocument({ matterId: matter?.id || null, moduleName: 'draft-studio', title, content, exportType: 'draft-studio' });
}

export async function getGovernedExportSummary(documentId) {
  const docs = await listGeneratedDocuments({});
  const doc = docs.find(d => d.id === documentId);
  const requests = listVerificationRequests();
  const match = requests.find(r => r.sourceDocumentId === documentId);
  const verified = match?.status === 'verified by advocate';
  return {
    document: doc || null,
    verification: match || null,
    exportMode: verified ? 'verified-export' : 'governed-unverified',
    disclaimer: verified
      ? 'Verified output: show advocate or chamber verification block and allow broader export.'
      : 'Unverified output: keep strong system-generated disclaimer and limit editable export.'
  };
}
