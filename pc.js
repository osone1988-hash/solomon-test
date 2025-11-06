(function () {
  'use strict';

  const PCJS_VERSION = 'pc-2025-11-06-04';
  console.log('[TANA-OROSHI] pc.js loaded:', PCJS_VERSION);
  window.__TANA_PC_VERSION = PCJS_VERSION;

  const DEFAULT_COLS = {
    datetime: 'scan_at',
    product: 'col_prod',
    width: 'col_width',
    length: 'col_length',
    lot: 'col_lot',
    label: 'col_label',
    packs: 'col_packs',
    rotation: 'col_rotation',
    result: 'result',
    reason: 'reason',
  };

  const T = {
    text: (v) => ({ type: 'SINGLE_LINE_TEXT', value: v == null ? '' : String(v) }),
    mtext: (v) => ({ type: 'MULTI_LINE_TEXT', value: v == null ? '' : String(v) }),
    num: (v) => {
      const s = v == null ? '' : String(v).trim();
      if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return { type: 'NUMBER', value: null };
      return { type: 'NUMBER', value: s };
    },
    dt: (v) => {
      if (!v) return { type: 'DATETIME', value: null };
      const d = (v instanceof Date) ? v : new Date(v);
      return { type: 'DATETIME', value: d.toISOString() };
    },
  };

  const byId = (id) => document.getElementById(id);
  const mergeCols = (cfg) => Object.assign({}, DEFAULT_COLS, (cfg?.ui?.table?.columns || {}));
  const tableCodeOf = (cfg) => cfg?.ui?.table?.fieldCode || 'scan_table';

  function parseScan(raw) {
    const s = (raw || '').trim();
    if (!s) return null;
    const a = s.split(/\s+/);
    if (a.length < 7) return null;
    const rotation = a.pop();
    const packs = a.pop();
    const label_no = a.pop();
    const lot_no = a.pop();
    const length = a.pop();
    const width = a.pop();
    const product_name = a.join(' ');
    return { product_name, width, length, lot_no, label_no, packs, rotation };
  }

  function buildRow(cols, data) {
    const row = {};
    row[cols.datetime]  = T.dt(new Date());
    row[cols.product]   = T.text(data.product_name);
    row[cols.width]     = T.num(data.width);
    row[cols.length]    = T.num(data.length);
    row[cols.lot]       = T.text(data.lot_no);
    row[cols.label]     = T.text(data.label_no);
    row[cols.packs]     = T.num(data.packs);
    row[cols.rotation]  = T.num(data.rotation);
    row[cols.result]    = T.text('');
    row[cols.reason]    = T.mtext('');
    return { value: row };
  }

  function sanitizeSubtable(record, tableCode, cols) {
    if (!record[tableCode]) return;

    const TYPE_MAP = {
      [cols.datetime]:  'DATETIME',
      [cols.product]:   'SINGLE_LINE_TEXT',
      [cols.width]:     'NUMBER',
      [cols.length]:    'NUMBER',
      [cols.lot]:       'SINGLE_LINE_TEXT',
      [cols.label]:     'SINGLE_LINE_TEXT',
      [cols.packs]:     'NUMBER',
      [cols.rotation]:  'NUMBER',
      [cols.result]:    'SINGLE_LINE_TEXT',
      [cols.reason]:    'MULTI_LINE_TEXT',
    };

    const rows = Array.isArray(record[tableCode].value) ? record[tableCode].value : [];
    rows.forEach((row) => {
      if (!row.value) row.value = {};
      const cells = row.value;

      // remove wrong keys like "undefined", "null"
      Object.keys(cells).forEach((k) => {
        if (k === 'undefined' || k === 'null' || k === 'NaN') delete cells[k];
      });

      // fill missing cells
      Object.keys(TYPE_MAP).forEach((code) => {
        if (!cells[code]) {
          const t = TYPE_MAP[code];
          cells[code] =
            t === 'NUMBER'   ? { type: t, value: null } :
            t === 'DATETIME' ? { type: t, value: null } :
                               { type: t, value: '' };
        }
      });

      // normalize existing cells
      Object.entries(cells).forEach(([code, cell]) => {
        const t = TYPE_MAP[code] || cell?.type;
        if (!t) return;
        let v = cell ? cell.value : undefined;
        if (t === 'NUMBER') {
          const s = v == null ? '' : String(v).trim();
          v = (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) ? null : s;
          cells[code] = { type: 'NUMBER', value: v };
        } else if (t === 'DATETIME') {
          v = v ? new Date(v).toISOString() : null;
          cells[code] = { type: 'DATETIME', value: v };
        } else if (t === 'MULTI_LINE_TEXT' || t === 'SINGLE_LINE_TEXT') {
          v = v == null ? '' : String(v);
          cells[code] = { type: t, value: v };
        } else {
          v = v == null ? '' : String(v);
          cells[code] = { type: t, value: v };
        }
      });
    });
  }

  function removeOldScanUI() {
    const el = byId('tana-scan');
    if (el) {
      const wrap = el.parentElement;
      if (wrap && wrap.parentElement) { try { wrap.parentElement.removeChild(wrap); } catch (_) {} }
      try { el.remove(); } catch (_) {}
    }
  }

  kintone.events.on('app.record.edit.show', (event) => {
    const r = event.record;

    // config
    let cfg = {};
    try { cfg = JSON.parse((r.json_config && r.json_config.value) || '{}'); }
    catch (_) { alert('設定JSONのパースに失敗しました。'); return event; }

    const cols = mergeCols(cfg);
    const tableCode = tableCodeOf(cfg);

    // cleanup existing table once (念のため)
    if (r[tableCode]?.value) sanitizeSubtable(r, tableCode, cols);

    removeOldScanUI();
    if (!byId('tana-scan')) {
      const wrap = document.createElement('div');
      wrap.style.margin = '8px 0 16px';

      const label = document.createElement('span');
      label.textContent = 'SCAN';
      label.style.marginRight = '8px';

      const input = document.createElement('input');
      input.id = 'tana-scan';
      input.type = 'text';
      input.placeholder = 'ここにスキャン（Enterで追加）';
      input.autocomplete = 'off';
      input.style.cssText = 'width:420px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;';

      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'クリア';
      clearBtn.style.cssText = 'margin-left:8px;padding:6px 12px;';
      clearBtn.onclick = () => { input.value = ''; input.focus(); };

      wrap.appendChild(label);
      wrap.appendChild(input);
      wrap.appendChild(clearBtn);

      const jsonFieldEl = kintone.app.record.getFieldElement('json_config');
      if (jsonFieldEl && jsonFieldEl.parentElement) {
        jsonFieldEl.parentElement.parentElement.insertBefore(wrap, jsonFieldEl.parentElement);
      } else {
        document.body.appendChild(wrap);
      }

      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        ev.stopPropagation();

        const parsed = parseScan(input.value);
        if (!parsed) { alert('スキャン形式が不正です。例: mekkiCUPET0812vc 16 6000 51104 AA 2 1'); return; }

        if (!r[tableCode]) r[tableCode] = { type: 'SUBTABLE', value: [] };
        if (!Array.isArray(r[tableCode].value)) r[tableCode].value = [];

        r[tableCode].value.push(buildRow(cols, parsed));
        sanitizeSubtable(r, tableCode, cols);

        kintone.app.record.set({ record: r });

        input.value = '';
        input.focus();
      });
    }

    return event;
  });
})();
