(function () {
  'use strict';

  const PCJS_VERSION = 'pc-2025-11-06-06';
  console.log('[TANA-OROSHI] pc.js loaded:', PCJS_VERSION);
  try { window.__TANA_PC_VERSION = PCJS_VERSION; } catch (_) {}

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

  const byId = (id) => document.getElementById(id);

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

  const parseScan = (raw) => {
    const s = (raw || '').trim();
    if (!s) return null;
    const a = s.split(/\s+/);
    if (a.length < 7) return null;
    const rotation = a.pop(), packs = a.pop(), label_no = a.pop(), lot_no = a.pop();
    const length = a.pop(), width = a.pop(), product_name = a.join(' ');
    return { product_name, width, length, lot_no, label_no, packs, rotation };
  };

  const getCfg = (rec) => {
    try { return JSON.parse(rec?.json_config?.value || '{}'); }
    catch (_) { return {}; }
  };
  const getCols = (cfg) => Object.assign({}, DEFAULT_COLS, (cfg?.ui?.table?.columns || {}));
  const getTableCode = (cfg) => cfg?.ui?.table?.fieldCode || 'scan_table';

  function sanitizeSubtable(record, tableCode, cols) {
    if (!record[tableCode]) return;
    const TYPE_MAP = {
      [cols.datetime]:'DATETIME',[cols.product]:'SINGLE_LINE_TEXT',
      [cols.width]:'NUMBER',[cols.length]:'NUMBER',
      [cols.lot]:'SINGLE_LINE_TEXT',[cols.label]:'SINGLE_LINE_TEXT',
      [cols.packs]:'NUMBER',[cols.rotation]:'NUMBER',
      [cols.result]:'SINGLE_LINE_TEXT',[cols.reason]:'MULTI_LINE_TEXT',
    };
    const rows = Array.isArray(record[tableCode].value) ? record[tableCode].value : [];
    rows.forEach((row) => {
      if (!row.value) row.value = {};
      const c = row.value;

      // 変なキー掃除
      Object.keys(c).forEach((k)=>{ if (['undefined','null','NaN'].includes(k)) delete c[k]; });

      // 足りないセル補完
      Object.keys(TYPE_MAP).forEach((code)=>{
        if (!c[code]) {
          const t = TYPE_MAP[code];
          c[code] = (t==='NUMBER' || t==='DATETIME') ? { type:t, value:null } : { type:t, value:'' };
        }
      });

      // 値の正規化（undefined 撲滅）
      Object.entries(c).forEach(([code, cell])=>{
        const t = TYPE_MAP[code] || cell?.type;
        let v = cell?.value;
        if (t==='NUMBER') {
          const s = v==null ? '' : String(v).trim();
          c[code] = { type:'NUMBER', value: (s===''||!/^-?\d+(\.\d+)?$/.test(s)) ? null : s };
        } else if (t==='DATETIME') {
          c[code] = { type:'DATETIME', value: v ? new Date(v).toISOString() : null };
        } else {
          c[code] = { type:t, value: v==null ? '' : String(v) };
        }
      });
    });
  }

  // --- すべての set() をフックしてサニタイズしてから反映（外部ハンドラ対策の決定打） ---
  const __origSet = kintone.app.record.set;
  kintone.app.record.set = function(payload) {
    try {
      if (payload && payload.record) {
        const cfg = getCfg(payload.record);
        const cols = getCols(cfg);
        const tableCode = getTableCode(cfg);
        sanitizeSubtable(payload.record, tableCode, cols);
      }
    } catch (e) {
      console.warn('[TANA-OROSHI] sanitize in set() failed:', e);
    }
    return __origSet.call(kintone.app.record, payload);
  };

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
    const cfg = getCfg(r);
    const cols = getCols(cfg);
    const tableCode = getTableCode(cfg);

    // 初期サニタイズ（既存の壊れた行を画面上で直す）
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
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();

        const parsed = parseScan(input.value);
        if (!parsed) { alert('スキャン形式が不正です。例: mekkiCUPET0812vc 16 6000 51104 AA 2 1'); return; }

        if (!r[tableCode]) r[tableCode] = { type: 'SUBTABLE', value: [] };
        if (!Array.isArray(r[tableCode].value)) r[tableCode].value = [];

        r[tableCode].value.push(buildRow(cols, parsed));

        // set() フックで再サニタイズされてから画面反映されます
        kintone.app.record.set({ record: r });

        input.value = ''; input.focus();
      }, { capture: true });
    }

    return event;
  });
})();
