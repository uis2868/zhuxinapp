import { getCurrentMatterFromMirror, listMatterFiles, createGeneratedDocument, listGeneratedDocuments } from './app-data.js';

const TITLE_CHAIN_KEY = 'zhuxin_title_chain_runs';
const INHERITANCE_KEY = 'zhuxin_inheritance_runs';
const VERIFICATION_KEY = 'zhuxin_verification_queue';
const REVIEW_KEY = 'zhuxin_review_tables';
const CORE_LAYERS = ['CS', 'SA', 'RS', 'BRS', 'Deed', 'Mutation'];

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

export function classifyDocumentName(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('brs')) return 'BRS';
  if (n.includes('mutation') || n.includes('namjari')) return 'Mutation';
  if (n.includes('deed') || n.includes('kobala') || n.includes('sale') || n.includes('heba') || n.includes('gift')) return 'Deed';
  if (n.includes('cs')) return 'CS';
  if (n.includes('sa')) return 'SA';
  if (n.includes('rs')) return 'RS';
  return 'Unclassified';
}

function severityFromMissing(type) {
  if (type === 'Deed') return 'critical';
  if (type === 'CS' || type === 'RS') return 'major';
  return 'moderate';
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function buildTitleChainAnalysis(classifications, confirmations) {
  const types = classifications.map(f => f.type);
  const counts = CORE_LAYERS.reduce((acc, layer) => ({ ...acc, [layer]: types.filter(t => t === layer).length }), {});
  const missing = CORE_LAYERS.filter(layer => counts[layer] === 0);
  const duplicateLayers = CORE_LAYERS.filter(layer => counts[layer] > 1).map(layer => ({ layer, count: counts[layer] }));
  const unclassified = classifications.filter(c => c.type === 'Unclassified');
  const hasStart = counts.CS > 0 || counts.SA > 0;
  const hasMiddle = counts.RS > 0 || counts.BRS > 0;
  const hasTransfer = counts.Deed > 0;
  const hasMutation = counts.Mutation > 0;

  let score = 0;
  if (!counts.CS) score += 2;
  if (!counts.SA) score += 1;
  if (!counts.RS) score += 2;
  if (!counts.BRS) score += 1;
  if (!counts.Deed) score += 3;
  if (!counts.Mutation) score += 1;
  if (!confirmations.arrangementConfirmed) score += 2;
  if (!confirmations.completenessConfirmed) score += 2;
  if (unclassified.length) score += Math.min(2, unclassified.length);
  if (duplicateLayers.length) score += 1;
  if (!hasStart || !hasMiddle || !hasTransfer) score += 1;

  const label = score >= 9 ? 'High risk' : score >= 5 ? 'Moderate risk' : 'Preliminary low risk';
  const confidence = confirmations.arrangementConfirmed && confirmations.completenessConfirmed && !unclassified.length
    ? 'Higher preliminary confidence'
    : 'Limited preliminary confidence';

  const issues = [];
  missing.forEach(layer => {
    issues.push({
      type: 'missing-layer',
      title: `Missing ${layer} layer`,
      detail: `No clear ${layer} document was detected from the current matter files.`,
      severity: severityFromMissing(layer)
    });
  });
  duplicateLayers.forEach(item => {
    issues.push({
      type: 'duplicate-layer',
      title: `Multiple ${item.layer} files detected`,
      detail: `Detected ${plural(item.count, item.layer + ' file', item.layer + ' files')}. These may need chronology or authenticity review.`,
      severity: item.layer === 'Deed' ? 'major' : 'moderate'
    });
  });
  if (unclassified.length) {
    issues.push({
      type: 'unclassified',
      title: 'Unclassified files present',
      detail: `${plural(unclassified.length, 'file remains', 'files remain')} unclassified and may affect chain continuity.`,
      severity: 'moderate'
    });
  }
  if (!confirmations.arrangementConfirmed) {
    issues.push({
      type: 'arrangement',
      title: 'Arrangement not confirmed',
      detail: 'The user did not confirm that the uploaded sequence is correctly arranged.',
      severity: 'major'
    });
  }
  if (!confirmations.completenessConfirmed) {
    issues.push({
      type: 'completeness',
      title: 'Completeness not confirmed',
      detail: 'The user did not confirm that the file set is complete enough for preliminary analysis.',
      severity: 'major'
    });
  }
  if (!hasMutation) {
    issues.push({
      type: 'mutation-gap',
      title: 'Mutation support not visible',
      detail: 'No clear mutation document was detected. Possession and later record linkage may need checking.',
      severity: 'moderate'
    });
  }

  const recommendations = [];
  if (missing.includes('Deed')) recommendations.push('Collect at least one transfer document or explain why title passed without a conventional deed layer.');
  if (missing.includes('CS') || missing.includes('SA')) recommendations.push('Obtain the older foundational record layer to strengthen the origin side of the chain.');
  if (missing.includes('RS') || missing.includes('BRS')) recommendations.push('Obtain the later survey layer to confirm how the land appears in more recent records.');
  if (!counts.Mutation) recommendations.push('Add mutation or namjari support if available to show later administrative recognition.');
  if (unclassified.length) recommendations.push('Rename or re-tag unclear files so the chain can be read more confidently.');
  if (!confirmations.arrangementConfirmed || !confirmations.completenessConfirmed) recommendations.push('Confirm file arrangement and completeness before treating the chain result as reliable.');
  if (!recommendations.length) recommendations.push('Move the current chain result into advocate verification before professional use.');

  const sequenceNarrative = [
    counts.CS || counts.SA ? 'Origin-side layer visible.' : 'Origin-side layer weak or absent.',
    counts.RS || counts.BRS ? 'Later survey layer visible.' : 'Later survey layer weak or absent.',
    counts.Deed ? 'Transfer layer visible.' : 'Transfer layer weak or absent.',
    counts.Mutation ? 'Mutation support visible.' : 'Mutation support not visible.'
  ].join(' ');

  return {
    score,
    label,
    missing,
    counts,
    duplicateLayers,
    unclassified,
    confidence,
    sequenceNarrative,
    issues,
    recommendations
  };
}

function formatTitleChainContent(matter, analysis, classifications, notes, confirmations) {
  return [
    'TITLE CHAIN PRE-CHECK',
    '',
    'Matter: ' + matter.name,
    'Client: ' + matter.client,
    '',
    'Arrangement confirmed: ' + (confirmations.arrangementConfirmed ? 'Yes' : 'No'),
    'Completeness confirmed: ' + (confirmations.completenessConfirmed ? 'Yes' : 'No'),
    'Confidence: ' + analysis.confidence,
    '',
    'Detected files and tentative classification:',
    ...(classifications.length ? classifications.map((c, i) => `${i + 1}. ${c.name} — ${c.type} (${c.origin})`) : ['1. No files attached.']),
    '',
    'Layer coverage summary:',
    ...CORE_LAYERS.map(layer => `- ${layer}: ${analysis.counts[layer] || 0}`),
    '',
    'Sequence reading:',
    analysis.sequenceNarrative,
    '',
    'Main issues:',
    ...(analysis.issues.length ? analysis.issues.map((issue, i) => `${i + 1}. ${issue.title} — ${issue.detail} [${issue.severity}]`) : ['1. No major issue detected from the current preliminary inputs.']),
    '',
    'Recommendations:',
    ...analysis.recommendations.map((r, i) => `${i + 1}. ${r}`),
    '',
    'Risk result: ' + analysis.label,
    'Risk score: ' + analysis.score,
    '',
    'User note:',
    notes || 'No additional notes provided.',
    '',
    'This is a preliminary title-chain workflow result and should be verified by an advocate before being treated as final legal advice.'
  ].join('\n');
}

export async function createTitleChainAnalysis({ notes = '', arrangementConfirmed = false, completenessConfirmed = false } = {}) {
  const matter = getCurrentMatterFromMirror();
  if (!matter) throw new Error('Select a current matter first.');
  const files = await listMatterFiles(matter.id);
  const classifications = files.map(f => ({ name: f.name, type: classifyDocumentName(f.name), origin: f.origin }));
  const analysis = buildTitleChainAnalysis(classifications, { arrangementConfirmed, completenessConfirmed });
  const content = formatTitleChainContent(matter, analysis, classifications, notes, { arrangementConfirmed, completenessConfirmed });

  const document = await createGeneratedDocument({ matterId: matter.id, moduleName: 'title-chain', title: 'Title Chain — ' + matter.name, content, exportType: 'governed-draft' });
  const state = getTitleChainState();
  const run = {
    id: 'tc_' + Date.now(),
    matterId: matter.id,
    createdAt: new Date().toISOString(),
    arrangementConfirmed,
    completenessConfirmed,
    classifications,
    risk: analysis,
    note: notes,
    documentId: document.id
  };
  state.runs.unshift(run);
  saveJson(TITLE_CHAIN_KEY, state);
  return { run, document };
}

export function listTitleChainAnalyses(matterId = null) {
  const state = getTitleChainState();
  return matterId ? state.runs.filter(r => r.matterId === matterId) : state.runs;
}

export async function createTitleChainReviewTable(runId) {
  const run = getTitleChainState().runs.find(r => r.id === runId);
  if (!run) throw new Error('Title-chain run not found.');
  const rows = run.risk.issues.length
    ? run.risk.issues.map(issue => ({
        issue: issue.title,
        source: 'Title-chain analysis',
        severity: issue.severity,
        status: 'open'
      }))
    : [{ issue: 'No obvious missing core layer found', source: 'Title-chain analysis', severity: 'minor', status: 'open' }];
  return createReviewTable({ title: 'Title Chain Review — ' + new Date(run.createdAt).toLocaleDateString('en-GB'), matterId: run.matterId, rows });
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
  const existing = sourceDocumentId ? state.requests.find(r => r.sourceDocumentId === sourceDocumentId && r.status !== 'verification rejected') : null;
  if (existing) return existing;
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
    reviewerName: '',
    reviewerEnrollmentId: '',
    reviewerNote: '',
    verifiedAt: '',
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
  state.requests = state.requests.map(r => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch, updatedAt: new Date().toISOString() };
    if (patch.status === 'verified by advocate' && !next.verifiedAt) next.verifiedAt = new Date().toISOString();
    if (patch.status && patch.status !== 'verified by advocate' && patch.status !== r.status && patch.status !== 'under advocate review') next.verifiedAt = patch.status === 'verification rejected' ? '' : next.verifiedAt;
    return next;
  });
  saveJson(VERIFICATION_KEY, state);
  return state.requests.find(r => r.id === id);
}

export async function createReviewTable({ title = 'Review table', matterId = null, rows = [] }) {
  const state = getReviewState();
  const table = { id: 'rt_' + Date.now(), title, matterId, rows, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  state.tables.unshift(table);
  saveJson(REVIEW_KEY, state);
  return table;
}

export function listReviewTables(matterId = null) {
  const state = getReviewState();
  return matterId ? state.tables.filter(t => t.matterId === matterId) : state.tables;
}

export function getReviewTable(tableId) {
  return getReviewState().tables.find(t => t.id === tableId) || null;
}

export async function updateReviewTable(tableId, patch) {
  const state = getReviewState();
  state.tables = state.tables.map(t => t.id === tableId ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t);
  saveJson(REVIEW_KEY, state);
  return state.tables.find(t => t.id === tableId) || null;
}

export async function addReviewTableRow(tableId, row) {
  const table = getReviewTable(tableId);
  if (!table) throw new Error('Review table not found.');
  const rows = [...(table.rows || []), { ...row, id: 'rtr_' + Date.now() }];
  return updateReviewTable(tableId, { rows });
}

export async function updateReviewTableRow(tableId, rowId, patch) {
  const table = getReviewTable(tableId);
  if (!table) throw new Error('Review table not found.');
  const rows = (table.rows || []).map(r => r.id === rowId ? { ...r, ...patch } : r);
  return updateReviewTable(tableId, { rows });
}

export async function deleteReviewTableRow(tableId, rowId) {
  const table = getReviewTable(tableId);
  if (!table) throw new Error('Review table not found.');
  const rows = (table.rows || []).filter(r => r.id !== rowId);
  return updateReviewTable(tableId, { rows });
}

export async function createReviewVerificationRequest(tableId) {
  const table = getReviewTable(tableId);
  if (!table) throw new Error('Review table not found.');
  return createVerificationRequest({
    matterId: table.matterId,
    title: table.title + ' verification',
    sourceModule: 'review-table',
    sourceDocumentId: null,
    note: 'Review table sent for advocate review.'
  });
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

export async function createDraftVerificationRequest(documentId, matterId = null) {
  return createVerificationRequest({
    matterId,
    title: 'Draft Studio verification',
    sourceModule: 'draft-studio',
    sourceDocumentId: documentId,
    note: 'Draft Studio output sent for advocate review.'
  });
}

export async function getGovernedExportSummary(documentId) {
  const docs = await listGeneratedDocuments({});
  const doc = docs.find(d => d.id === documentId);
  const requests = listVerificationRequests();
  const match = requests.find(r => r.sourceDocumentId === documentId);
  const verified = match?.status === 'verified by advocate';
  const verificationBlock = verified && match ? {
    reviewerName: match.reviewerName || 'Advocate reviewer',
    reviewerEnrollmentId: match.reviewerEnrollmentId || 'Enrollment not entered',
    reviewerNote: match.reviewerNote || 'Verified through Zhuxin workflow.',
    verifiedAt: match.verifiedAt || match.updatedAt || ''
  } : null;
  return {
    document: doc || null,
    verification: match || null,
    verificationBlock,
    exportMode: verified ? 'verified-export' : 'governed-unverified',
    disclaimer: verified
      ? 'Verified output: show advocate or chamber verification block and allow broader export.'
      : 'Unverified output: keep strong system-generated disclaimer and limit editable export.',
    displayContent: doc
      ? (verified
          ? doc.content
          : 'SYSTEM-GENERATED UNVERIFIED OUTPUT\n\nThis document has not yet been verified by an advocate.\n\n' + doc.content)
      : ''
  };
}
