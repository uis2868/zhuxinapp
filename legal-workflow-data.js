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
  const unordered = classifications.filter((c, index, arr) => index > 0 && Number(c.sequenceNumber || 0) <= Number(arr[index - 1].sequenceNumber || 0));
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
  if (unordered.length) score += 1;
  if (!hasStart || !hasMiddle || !hasTransfer) score += 1;

  const label = score >= 9 ? 'High risk' : score >= 5 ? 'Moderate risk' : 'Preliminary low risk';
  const confidence = confirmations.arrangementConfirmed && confirmations.completenessConfirmed && !unclassified.length && !unordered.length
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
  if (unordered.length) {
    issues.push({
      type: 'ordering',
      title: 'Sequence ordering may be weak',
      detail: 'One or more files appear out of intended sequence order. Recheck the sequence numbers in Matter Files.',
      severity: 'major'
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
  if (unclassified.length) recommendations.push('Use Matter Files to classify unclear files into CS/SA/RS/BRS/Deed/Mutation where possible.');
  if (unordered.length) recommendations.push('Adjust sequence numbers in Matter Files so the title chain runs in a clear order from older to later material.');
  if (!confirmations.arrangementConfirmed || !confirmations.completenessConfirmed) recommendations.push('Confirm file arrangement and completeness before treating the chain result as reliable.');
  if (!recommendations.length) recommendations.push('Move the current chain result into advocate verification before professional use.');

  const sequenceNarrative = [
    counts.CS || counts.SA ? 'Origin-side layer visible.' : 'Origin-side layer weak or absent.',
    counts.RS || counts.BRS ? 'Later survey layer visible.' : 'Later survey layer weak or absent.',
    counts.Deed ? 'Transfer layer visible.' : 'Transfer layer weak or absent.',
    counts.Mutation ? 'Mutation support visible.' : 'Mutation support not visible.',
    unordered.length ? 'Sequence ordering needs attention.' : 'Sequence ordering looks usable.'
  ].join(' ');

  return {
    score,
    label,
    missing,
    counts,
    duplicateLayers,
    unclassified,
    unordered,
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
    ...(classifications.length ? classifications.map((c, i) => `${i + 1}. [${c.sequenceNumber || 0}] ${c.name} — ${c.type} (${c.origin})`) : ['1. No files attached.']),
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
  const classifications = files.map(f => ({ name: f.name, type: f.recordType || classifyDocumentName(f.name), origin: f.origin, sequenceNumber: f.sequenceNumber || 0 }));
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

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function buildInheritanceAnalysis(input) {
  const wives = toNumber(input.wives);
  const sons = toNumber(input.sons);
  const daughters = toNumber(input.daughters);
  const husband = Boolean(input.husband);
  const father = Boolean(input.father);
  const mother = Boolean(input.mother);
  const childrenPresent = sons + daughters > 0;
  const warnings = [];
  const explanations = [];
  const shares = [];

  if (husband && wives > 0) warnings.push('Both husband and wives were entered. Normally only one spousal side should apply for one deceased person.');
  if (!husband && wives === 0 && !father && !mother && !childrenPresent) warnings.push('No obvious heir was entered. This result is only a placeholder until heirs are added.');
  if (wives > 4) warnings.push('More than four wives were entered. Recheck the input facts.');

  if (wives > 0) {
    const share = childrenPresent ? '1/8 collectively' : '1/4 collectively';
    shares.push({ label: wives === 1 ? 'Wife' : 'Wives', share });
    explanations.push(childrenPresent ? 'Because children are present, the wife/wives side usually drops to 1/8 collectively.' : 'Because no child is entered, the wife/wives side is usually treated as 1/4 collectively.');
  }
  if (husband) {
    const share = childrenPresent ? '1/4' : '1/2';
    shares.push({ label: 'Husband', share });
    explanations.push(childrenPresent ? 'Because children are present, the husband usually takes 1/4.' : 'Because no child is entered, the husband usually takes 1/2.');
  }
  if (mother) {
    const share = childrenPresent ? '1/6' : '1/3 subject to surrounding heirs';
    shares.push({ label: 'Mother', share });
    explanations.push(childrenPresent ? 'Mother usually reduces to 1/6 when children are present.' : 'Without children, mother may move toward 1/3 subject to surrounding heirs.');
  }
  if (father) {
    const share = childrenPresent ? '1/6 plus possible residue questions' : 'Residue or fixed share depending on surrounding heirs';
    shares.push({ label: 'Father', share });
    explanations.push(childrenPresent ? 'Father usually takes 1/6 when children are present, but residue questions can still matter.' : 'Without children, the father may absorb residue depending on the wider heir picture.');
  }
  if (sons > 0 || daughters > 0) {
    let share = '';
    if (sons > 0 && daughters > 0) share = 'Residue with male usually taking roughly double the female share';
    else if (sons > 0) share = 'Residue among sons';
    else share = daughters === 1 ? '1/2 to one daughter subject to surrounding heirs' : '2/3 collectively to daughters subject to surrounding heirs';
    shares.push({ label: 'Children', share });
    explanations.push(sons > 0 && daughters > 0 ? 'Where sons and daughters are both present, distribution usually moves into residue with the male taking about twice the female share.' : sons > 0 ? 'With sons only, the children side normally takes residue among the sons.' : daughters === 1 ? 'A single daughter commonly appears with a 1/2 share subject to the wider heir picture.' : 'Multiple daughters often appear at 2/3 collectively, again subject to the wider heir picture.');
  }

  const quickSummary = shares.length
    ? shares.map(s => `${s.label}: ${s.share}`).join(' • ')
    : 'No clear share could be produced from the current heir input.';

  const recommendations = [];
  if (warnings.length) recommendations.push('Correct any inconsistent heir input before treating the result as reliable.');
  recommendations.push('Treat this as an indicative calculation only if the facts entered are true and complete.');
  recommendations.push('Use advocate verification for complex family trees, debts, wills, exclusions, or disputed heir status.');

  return {
    normalizedInput: { deceasedName: input.deceasedName || '', wives, sons, daughters, husband, father, mother },
    shares,
    warnings,
    explanations,
    quickSummary,
    recommendations
  };
}

function formatInheritanceContent(matter, analysis) {
  const input = analysis.normalizedInput;
  return [
    'INHERITANCE CALCULATION WORKFLOW RESULT',
    '',
    'Matter: ' + (matter?.name || 'General inheritance matter'),
    'Deceased: ' + (input.deceasedName || 'Not specified'),
    '',
    'Heir summary:',
    'Husband present: ' + (input.husband ? 'Yes' : 'No'),
    'Wives: ' + input.wives,
    'Father present: ' + (input.father ? 'Yes' : 'No'),
    'Mother present: ' + (input.mother ? 'Yes' : 'No'),
    'Sons: ' + input.sons,
    'Daughters: ' + input.daughters,
    '',
    'Indicative shares:',
    ...(analysis.shares.length ? analysis.shares.map((s, i) => `${i + 1}. ${s.label}: ${s.share}`) : ['1. No supported heir set entered.']),
    '',
    'Explanation:',
    ...(analysis.explanations.length ? analysis.explanations.map((line, i) => `${i + 1}. ${line}`) : ['1. No explanatory line generated.']),
    '',
    'Warnings:',
    ...(analysis.warnings.length ? analysis.warnings.map((line, i) => `${i + 1}. ${line}`) : ['1. No immediate warning detected from the entered heir set.']),
    '',
    'Recommendations:',
    ...analysis.recommendations.map((line, i) => `${i + 1}. ${line}`),
    '',
    'Important disclaimer:',
    'If the description given by the user is true and complete, this is the likely inheritance position. Complex facts, debts, wills, exclusions, and school-specific questions should be verified by an enrolled advocate.'
  ].join('\n');
}

export async function createInheritanceCalculation(input) {
  const matter = getCurrentMatterFromMirror();
  const analysis = buildInheritanceAnalysis(input);
  const content = formatInheritanceContent(matter, analysis);

  const document = await createGeneratedDocument({ matterId: matter?.id || null, moduleName: 'inheritance', title: 'Inheritance — ' + (analysis.normalizedInput.deceasedName || 'Draft'), content, exportType: 'governed-draft' });
  const state = getInheritanceState();
  const run = {
    id: 'inh_' + Date.now(),
    matterId: matter?.id || null,
    createdAt: new Date().toISOString(),
    input: analysis.normalizedInput,
    shares: analysis.shares,
    warnings: analysis.warnings,
    explanations: analysis.explanations,
    quickSummary: analysis.quickSummary,
    recommendations: analysis.recommendations,
    documentId: document.id
  };
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

function draftTypeLabel(documentType) {
  const labels = {
    pleading: 'Pleading / petition draft',
    memo: 'Internal legal memo',
    application: 'Application / representation',
    agreement: 'Agreement / clause outline',
    advisory: 'Client advisory note'
  };
  return labels[documentType] || 'Professional draft';
}

function draftStructure(documentType) {
  const structures = {
    pleading: ['Caption / title', 'Facts', 'Cause of action / grounds', 'Documents relied on', 'Reliefs sought', 'Review risks'],
    memo: ['Issue presented', 'Short answer', 'Facts', 'Applicable law', 'Analysis', 'Risk / recommendation'],
    application: ['Applicant and authority', 'Background facts', 'Legal or equitable grounds', 'Prayer / request', 'Attachments / enclosure list'],
    agreement: ['Parties', 'Commercial purpose', 'Key obligations', 'Payment / timeline', 'Risk clauses', 'Open points for review'],
    advisory: ['Client question', 'Relevant facts', 'Legal position', 'Risk areas', 'Recommended next steps', 'Documents needed']
  };
  return structures[documentType] || ['Facts', 'Issues', 'Documents', 'Relief / position', 'Review flags'];
}

export async function createDraftStudioDocument({ matterClass = 'civil/property', documentType = 'pleading', objective = '', instructions = '' }) {
  const matter = getCurrentMatterFromMirror();
  const sections = draftStructure(documentType);
  const title = draftTypeLabel(documentType) + ' — ' + (matter?.name || matterClass);
  const content = [
    'PROFESSIONAL DRAFTING WORKSPACE OUTPUT',
    '',
    'Draft type: ' + draftTypeLabel(documentType),
    'Matter class: ' + matterClass,
    'Matter: ' + (matter?.name || 'No current matter'),
    '',
    'Drafting objective:',
    objective || 'No objective entered.',
    '',
    'Drafting instructions:',
    instructions || 'No instructions inserted.',
    '',
    'Structured working sections:',
    ...sections.map((section, index) => `${index + 1}. ${section}`),
    '',
    'Professional drafting note:',
    'This output is intended as a chamber-grade working draft. Review, verification, and governed export should follow before filing, service, or client delivery.'
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
