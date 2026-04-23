(function () {
  function ensurePanel() {
    if (document.getElementById("sd-enabled")) return;
    var root = document.getElementById("assistantComposerRoot");
    if (!root) return;
    var panel = document.createElement("div");
    panel.className = "card";
    panel.style.marginTop = "12px";
    panel.innerHTML = [
      '<div class="assistant-tool-card sd-panel">',
      '  <div class="sd-panel-header">',
      '    <label class="sd-toggle">',
      '      <input type="checkbox" id="sd-enabled" />',
      '      <span>Generate structured deliverable</span>',
      '    </label>',
      '  </div>',
      '  <div id="sd-controls" class="sd-grid" style="display:none; margin-top:10px; display:none;">',
      '    <div class="sd-field"><label for="sd-type">Deliverable type</label><select id="sd-type"><option value="deck">Slide Deck</option><option value="checklist">Checklist</option><option value="tracker">Tracker</option><option value="spreadsheet">Spreadsheet</option></select><div id="sd-type-helper" class="muted"></div></div>',
      '    <div class="sd-field"><label for="sd-title">Title</label><input id="sd-title" type="text" placeholder="Optional explicit deliverable title" /></div>',
      '    <div class="sd-field"><label for="sd-audience">Audience</label><input id="sd-audience" type="text" placeholder="Optional audience" /></div>',
      '    <div class="sd-field"><label for="sd-detail-level">Detail level</label><select id="sd-detail-level"><option value="concise">Concise</option><option value="standard" selected>Standard</option><option value="detailed">Detailed</option></select></div>',
      '    <div class="sd-field"><label for="sd-target-size" id="sd-target-size-label">Slides</label><input id="sd-target-size" type="number" min="3" max="20" value="10" /></div>',
      '    <div class="sd-field" id="sd-include-notes-wrap"><label class="sd-toggle-inline"><input id="sd-include-notes" type="checkbox" checked /> <span>Include notes</span></label></div>',
      '  </div>',
      '</div>'
    ].join("");
    root.appendChild(panel);
  }

  window.ZHUXIN_STRUCTURED_DELIVERABLES = window.ZHUXIN_STRUCTURED_DELIVERABLES || {
    catalog: {
      deck: { key: 'deck', label: 'Slide Deck', sizeLabel: 'Slides', defaultSize: 10, minSize: 3, maxSize: 20, supportsNotes: true, summaryText: 'Creates a new slide-by-slide outline.' },
      checklist: { key: 'checklist', label: 'Checklist', sizeLabel: 'Sections', defaultSize: 5, minSize: 1, maxSize: 12, supportsNotes: true, summaryText: 'Creates a grouped action checklist.' },
      tracker: { key: 'tracker', label: 'Tracker', sizeLabel: 'Rows', defaultSize: 8, minSize: 3, maxSize: 50, supportsNotes: true, summaryText: 'Creates a status-oriented structured tracker.' },
      spreadsheet: { key: 'spreadsheet', label: 'Spreadsheet', sizeLabel: 'Rows', defaultSize: 12, minSize: 3, maxSize: 100, supportsNotes: false, summaryText: 'Creates a starter row/column sheet structure.' }
    },
    defaultState: { enabled: false, type: 'deck', title: '', audience: '', detailLevel: 'standard', targetSize: 10, includeNotes: true }
  };

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; });
  }
  function getCfg(type) { return window.ZHUXIN_STRUCTURED_DELIVERABLES.catalog[type] || window.ZHUXIN_STRUCTURED_DELIVERABLES.catalog.deck; }
  function setUiByType(type) {
    var cfg = getCfg(type);
    var label = document.getElementById('sd-target-size-label');
    var input = document.getElementById('sd-target-size');
    var helper = document.getElementById('sd-type-helper');
    var notesWrap = document.getElementById('sd-include-notes-wrap');
    var notesInput = document.getElementById('sd-include-notes');
    if (label) label.textContent = cfg.sizeLabel;
    if (helper) helper.textContent = cfg.summaryText;
    if (input) {
      input.min = cfg.minSize;
      input.max = cfg.maxSize;
      if (!input.value || Number(input.value) < cfg.minSize || Number(input.value) > cfg.maxSize) input.value = cfg.defaultSize;
    }
    if (notesWrap) notesWrap.style.display = cfg.supportsNotes ? '' : 'none';
    if (notesInput && !cfg.supportsNotes) notesInput.checked = false;
  }
  function syncPanel() {
    var enabled = document.getElementById('sd-enabled');
    var controls = document.getElementById('sd-controls');
    if (controls && enabled) controls.style.display = enabled.checked ? 'grid' : 'none';
  }
  function collectRequest(promptText) {
    var enabled = document.getElementById('sd-enabled');
    var type = document.getElementById('sd-type');
    var title = document.getElementById('sd-title');
    var audience = document.getElementById('sd-audience');
    var detail = document.getElementById('sd-detail-level');
    var size = document.getElementById('sd-target-size');
    var notes = document.getElementById('sd-include-notes');
    var cfg = getCfg(type && type.value || 'deck');
    return {
      enabled: !!(enabled && enabled.checked),
      mode: enabled && enabled.checked ? 'structuredDeliverable' : 'assistant',
      prompt: String(promptText || '').trim(),
      deliverableType: type ? type.value : 'deck',
      title: title ? title.value.trim() : '',
      audience: audience ? audience.value.trim() : '',
      detailLevel: detail ? detail.value : 'standard',
      targetSize: Math.max(cfg.minSize, Math.min(cfg.maxSize, Number(size && size.value || cfg.defaultSize))),
      includeNotes: !!(notes && notes.checked)
    };
  }
  function titleCase(text) { return String(text || '').split(/\s+/).filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
  function shorten(text, max) { text = String(text || '').trim(); return text.length <= max ? text : text.slice(0, max - 1).trim() + '…'; }
  function deriveTitle(request) { return request.title || (request.prompt ? titleCase(shorten(request.prompt, 48)) : 'Structured Deliverable'); }
  function validateRequest(request) {
    var cfg = getCfg(request.deliverableType);
    var errors = [];
    if (!request.prompt) errors.push('Prompt is required.');
    if (request.targetSize < cfg.minSize) errors.push(cfg.label + ' is below minimum size.');
    if (request.targetSize > cfg.maxSize) errors.push(cfg.label + ' is above maximum size.');
    return { ok: !errors.length, errors: errors };
  }
  function detailPointCount(level) { return level === 'concise' ? 2 : level === 'detailed' ? 4 : 3; }
  function buildDeck(request) {
    var title = deriveTitle(request), total = request.targetSize, pointCount = detailPointCount(request.detailLevel);
    var base = ['Objective','Background','Current State','Key Issues','Options','Recommended Approach','Execution Plan','Risks and Mitigations','Timeline','Next Steps','Decision Requests','Appendix'];
    var sections = [];
    for (var i=0;i<total;i++) {
      var slideTitle = base[i] || ('Additional Analysis ' + (i + 1));
      var points = [title + ' - ' + slideTitle + ' focus','Audience: ' + (request.audience || 'General'),'Prompt theme: ' + shorten(request.prompt, 80)];
      if (pointCount >= 4) points.push('Detail depth: expanded talking points for this section');
      if (pointCount === 2) points = points.slice(0,2);
      sections.push({ title: slideTitle, points: points, notes: request.includeNotes ? 'Use this slide to keep the discussion tightly tied to the requested outcome.' : '' });
    }
    return { schemaVersion:1, deliverableType:'deck', typeLabel:'Slide Deck', title:title, summary: total + '-slide structured outline generated as a new deliverable.', sections:sections, requestMeta:request };
  }
  function buildChecklist(request) {
    var title = deriveTitle(request), total = request.targetSize, pointCount = detailPointCount(request.detailLevel);
    var base = ['Scope and Objective','Inputs and Dependencies','Review Steps','Risk Checks','Quality Control','Delivery Readiness','Follow-Up'];
    var sections = [];
    for (var i=0;i<total;i++) {
      var name = base[i] || ('Checklist Section ' + (i + 1));
      var items = ['Confirm exact deliverable goal for ' + title,'Collect required inputs from prompt scope','Review completeness against requested structure'];
      if (pointCount >= 4) items.push('Run final quality and consistency check');
      if (pointCount === 2) items = items.slice(0,2);
      sections.push({ title:name, items:items, notes: request.includeNotes ? 'Keep this section concise and execution-oriented.' : '' });
    }
    return { schemaVersion:1, deliverableType:'checklist', typeLabel:'Checklist', title:title, summary: total + '-section checklist generated as a new deliverable.', sections:sections, requestMeta:request };
  }
  function buildTable(request, type) {
    var title = deriveTitle(request), total = request.targetSize;
    var columns = type === 'tracker' ? ['Workstream','Task','Owner','Status','Due Date','Notes'] : ['Item','Category','Description','Owner','Target Date'];
    var rows = [];
    for (var i=0;i<total;i++) {
      rows.push(type === 'tracker' ? [i<2?'Setup':i<5?'Execution':'Closeout','Task ' + (i+1),'',i<2?'Not Started':i<5?'In Progress':'Open','',request.includeNotes ? 'Aligned to: ' + shorten(request.prompt,50) : ''] : ['Entry ' + (i+1),i<4?'Core':'Additional',i===0?shorten(request.prompt,40):'','','']);
    }
    return { schemaVersion:1, deliverableType:type, typeLabel:type==='tracker'?'Tracker':'Spreadsheet', title:title, summary: total + '-row structured ' + type + ' generated as a new deliverable.', table:{ columns:columns, rows:rows }, requestMeta:request };
  }
  function generateStructuredDeliverable(request) {
    request = request || {};
    var valid = validateRequest(request);
    if (!valid.ok) return { ok:false, errors:valid.errors };
    var payload = request.deliverableType === 'deck' ? buildDeck(request) : request.deliverableType === 'checklist' ? buildChecklist(request) : request.deliverableType === 'tracker' ? buildTable(request, 'tracker') : buildTable(request, 'spreadsheet');
    return { ok:true, leadText:'Structured deliverable created.', payload:payload };
  }
  function renderDeck(payload) {
    return '<div class="sdg-sections">' + (payload.sections||[]).map(function (slide, i) { return '<div class="sdg-section"><div class="sdg-section-title">Slide ' + (i+1) + ': ' + esc(slide.title) + '</div><ul class="sdg-list">' + (slide.points||[]).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' + (slide.notes ? '<div class="sdg-notes"><strong>Notes:</strong> ' + esc(slide.notes) + '</div>' : '') + '</div>'; }).join('') + '</div>';
  }
  function renderChecklist(payload) {
    return '<div class="sdg-sections">' + (payload.sections||[]).map(function (section) { return '<div class="sdg-section"><div class="sdg-section-title">' + esc(section.title) + '</div><ul class="sdg-list sdg-checklist">' + (section.items||[]).map(function (item) { return '<li><input type="checkbox" disabled /> <span>' + esc(item) + '</span></li>'; }).join('') + '</ul>' + (section.notes ? '<div class="sdg-notes"><strong>Notes:</strong> ' + esc(section.notes) + '</div>' : '') + '</div>'; }).join('') + '</div>';
  }
  function renderTable(payload) {
    var table = payload.table || { columns:[], rows:[] };
    return '<div class="sdg-table-wrap"><table class="sdg-table"><thead><tr>' + (table.columns||[]).map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + (table.rows||[]).map(function (row) { return '<tr>' + row.map(function (cell) { return '<td>' + esc(cell) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function renderPayload(payload) {
    if (!payload) return '<div class="sdg-card"><div class="sdg-empty">Structured deliverable unavailable.</div></div>';
    var body = payload.deliverableType === 'deck' ? renderDeck(payload) : payload.deliverableType === 'checklist' ? renderChecklist(payload) : renderTable(payload);
    return '<div class="assistant-message assistant-message--structured"><div class="sdg-card"><div class="sdg-header"><span class="sdg-badge">' + esc(payload.typeLabel || payload.deliverableType) + '</span><h4 class="sdg-title">' + esc(payload.title || 'Untitled deliverable') + '</h4>' + (payload.summary ? '<div class="sdg-summary">' + esc(payload.summary) + '</div>' : '') + '</div>' + body + '</div></div>';
  }
  function init() {
    ensurePanel();
    var enabled = document.getElementById('sd-enabled');
    var type = document.getElementById('sd-type');
    if (!enabled || !type) return;
    enabled.addEventListener('change', syncPanel);
    type.addEventListener('change', function (e) { setUiByType(e.target.value); });
    setUiByType(type.value || 'deck');
    syncPanel();
  }
  window.StructuredDeliverableUI = { init:init, collectRequest:collectRequest, renderPayload:renderPayload };
  window.generateStructuredDeliverable = generateStructuredDeliverable;
  document.addEventListener('DOMContentLoaded', init);
})();