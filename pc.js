(function () {
  'use strict';

  const PCJS_VERSION = 'pc-2025-11-06-07';
  console.log('[TANA-OROSHI] pc.js loaded:', PCJS_VERSION);
  try { window.__TANA_PC_VERSION = PCJS_VERSION; } catch (_) {}

  // ---- デフォ列 ----
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

  // 直近の列/テーブルを保持（set() フック用のフォールバック）
  let ACTIVE_COLS = { ...DEFAULT_COLS };
  let ACTIVE_TABLE = 'scan_table';

  // ---- 型付き値 ----
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

  // ---- JSON設定 → 列/テーブル ----
  const getCfg = (rec) => { try { return JSON.parse(rec?.json_config?.value || '{}'); } catch (_) { return {}; } };
  const getCols = (cfg) => Object.assign({}, DEFAULT_COLS, (cfg?.ui?.table?.columns || {}));
  const getTableCode = (cfg) => cfg?.ui?.table?.fieldCode || 'scan_table';

  // ---- サブテーブル正規化（undefined を撲滅）----
  function sanitizeSubtable(record, tableCode, cols) {
    if (!record || !tableCode || !record[tableCode]) return;
    const TYPE_MAP = {
      [cols.datetime]:'DATETIME',[cols.product]:'SINGLE_LINE_TEXT',
      [cols.width]:'NUMBER',[cols.length]:'NUMBER',
      [cols.lot]:'SINGLE_LINE_TEXT',[cols.label]:'SINGLE_LINE_TEXT',
      [cols.packs]:'NUMBER',[cols.rotation]:'NUMBER',
      [cols.result]:'SINGLE_LINE_TEXT',[cols.reason]:'MULTI_LINE_TEXT',
    };
    const rows = Array.isArray(record[tableCode].value) ? record[tableCode].value : [];
    rows.forEach((row) => {
      row.value ||= {};
      const c = row.value;

      // 変なキーを除去
      Object.keys(c).forEach((k)=>{ if (k === 'undefined' || k === 'null' || k === 'NaN') delete c[k]; });

      // 足りないセルを補完
      Object.keys(TYPE_MAP).forEach((code)=>{
        if (!c[code]) {
          const t = TYPE_MAP[code];
          c[code] = (t==='NUMBER' || t==='DATETIME') ? { type:t, value:null } : { type:t, value:'' };
        }
      });

      // 既存セルを正規化
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

  // ---- すべての set() をフック：渡された payload を強制サニタイズ ----
  if (!kintone.app.record.__tanaPatched) {
    const __origSet = kintone.app.record.set.bind(kintone.app.record);
    kintone.app.record.set = function (payload) {
      try {
        const rec = payload && payload.record;
        if (rec) {
          // 設定JSON → 列/テーブル（payload 内に無ければ直近 or デフォルトで）
          let cfg = {};
          try { cfg = JSON.parse(rec?.json_config?.value || '{}'); } catch (_) {}
          const cols = Object.keys(cfg).length ? getCols(cfg) : ACTIVE_COLS;
          const tableCode = (cfg?.ui?.table?.fieldCode) || ACTIVE_TABLE;
          sanitizeSubtable(rec, tableCode, cols);
        }
      } catch (e) {
        console.warn('[TANA-OROSHI] sanitize in set() failed:', e);
      }
      return __origSet(payload);
    };
    kintone.app.record.__tanaPatched = true;
  }

  // ---- QR パーサ ----
  const parseScan = (raw) => {
    const s = (raw || '').trim();
    if (!s) return null;
    const a = s.split(/\s+/);
    if (a.length < 7) return null;
    const rotation = a.pop(), packs = a.pop(), label_no = a.pop(), lot_no = a.pop();
    const length = a.pop(), width = a.pop(), product_name = a.join(' ');
    return { product_name, width, length, lot_no, label_no, packs, rotation };
  };

  // ---- 1行構築 ----
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
    row[cols.result]    = T.text('');     // 判定は詳細側で付与
    row[cols.reason]    = T.mtext('');
    return { value: row };
  }

  // ---- 旧UI除去 ----
  function removeOldScanUI() {
    const el = byId('tana-scan');
    if (el) {
      const wrap = el.parentElement;
      if (wrap && wrap.parentElement) { try { wrap.parentElement.removeChild(wrap); } catch (_) {} }
      try { el.remove(); } catch (_) {}
    }
  }

  // ---- 編集画面 ----
  kintone.events.on('app.record.edit.show', (event) => {
    const r = event.record;

    // 設定JSON
    const cfg = getCfg(r);
    const cols = getCols(cfg);
    const tableCode = getTableCode(cfg);
    ACTIVE_COLS = cols; ACTIVE_TABLE = tableCode; // set() フック用

    // 初回：既存行をサニタイズ（画面上の赤バナーを消す）
    if (r[tableCode]?.value) sanitizeSubtable(r, tableCode, cols);

    // SCAN UI 再生成
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

      // ドキュメント捕捉（他ハンドラを遮断）
      document.addEventListener('keydown', (ev) => {
        if (ev.target === input && ev.key === 'Enter') {
          ev.stopPropagation();
          ev.stopImmediatePropagation();
        }
      }, true);

      // Enter で 1 行追加
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();

        const parsed = parseScan(input.value);
        if (!parsed) { alert('スキャン形式が不正です。例: mekkiCUPET0812vc 16 6000 51104 AA 2 1'); return; }

        if (!r[tableCode]) r[tableCode] = { type: 'SUBTABLE', value: [] };
        if (!Array.isArray(r[tableCode].value)) r[tableCode].value = [];

        // 新規行を push → set() フックで最終サニタイズ
        r[tableCode].value.push(buildRow(cols, parsed));
        kintone.app.record.set({ record: r });

        input.value = ''; input.focus();
      }, { capture: true });
    }

    return event;
  });
})();
