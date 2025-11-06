(function () {
  'use strict';

  const PCJS_VERSION = 'pc-2025-11-06-09';
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

  // 直近の列/テーブル（set() フックのフォールバック用）
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

  // ---- サブテーブル正規化（kintone.app.record.get()/set で使う typed 版）----
  function sanitizeSubtableTyped(record, tableCode, cols) {
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

      // 変なキー除去
      Object.keys(c).forEach((k)=>{ if (k === 'undefined' || k === 'null' || k === 'NaN') delete c[k]; });

      // 足りないセル補完
      Object.keys(TYPE_MAP).forEach((code)=>{
        if (!c[code]) {
          const t = TYPE_MAP[code];
          c[code] = (t==='NUMBER' || t==='DATETIME') ? { type:t, value:null } : { type:t, value:'' };
        }
      });

      // 値の正規化
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

  // ---- event.record を正規化（イベント戻り値用：type無し / value だけ）----
  function sanitizeEventRecordValueOnly(record, tableCode, cols) {
    if (!record || !tableCode || !record[tableCode]) return;
    const TYPE_KIND = {
      [cols.datetime]:'DT',[cols.product]:'TXT',
      [cols.width]:'NUM',[cols.length]:'NUM',
      [cols.lot]:'TXT',[cols.label]:'TXT',
      [cols.packs]:'NUM',[cols.rotation]:'NUM',
      [cols.result]:'TXT',[cols.reason]:'MTXT',
    };
    const rows = Array.isArray(record[tableCode].value) ? record[tableCode].value : [];
    rows.forEach((row) => {
      row.value ||= {};
      const c = row.value;

      // 変なキー削除
      Object.keys(c).forEach((k)=>{ if (k === 'undefined' || k === 'null' || k === 'NaN') delete c[k]; });

      // 既存セルを value のみに落とす
      Object.entries(TYPE_KIND).forEach(([code, kind])=>{
        const cell = c[code];
        let v = (cell && ('value' in cell)) ? cell.value : '';
        if (kind === 'NUM') {
          const s = v==null ? '' : String(v).trim();
          v = (s===''||!/^-?\d+(\.\d+)?$/.test(s)) ? null : Number(s);
        } else if (kind === 'DT') {
          v = v ? new Date(v).toISOString() : null;
        } else { // TXT / MTXT
          v = v==null ? '' : String(v);
        }
        c[code] = { value: v }; // ← type を絶対に付けない
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
          let cfg = {};
          try { cfg = JSON.parse(rec?.json_config?.value || '{}'); } catch (_) {}
          const cols = Object.keys(cfg).length ? getCols(cfg) : ACTIVE_COLS;
          const tableCode = (cfg?.ui?.table?.fieldCode) || ACTIVE_TABLE;
          sanitizeSubtableTyped(rec, tableCode, cols);
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

  // ---- 1行構築（typed）----
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
    row[cols.result]    = T.text('');     // 判定は詳細側で付与する想定
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

    const cfg = getCfg(r);
    const cols = getCols(cfg);
    const tableCode = getTableCode(cfg);
    ACTIVE_COLS = cols; ACTIVE_TABLE = tableCode;

    // （重要）event.record は「value だけ」に正規化して返す
    try { sanitizeEventRecordValueOnly(r, tableCode, cols); } catch (e) {}

    // 描画完了後に、現在の画面データを typed で一度サニタイズ → 反映
    setTimeout(() => {
      try {
        const cur = kintone.app.record.get();
        if (!cur) return;
        const cfg2 = getCfg(cur.record);
        const cols2 = getCols(cfg2);
        const table2 = getTableCode(cfg2);
        sanitizeSubtableTyped(cur.record, table2, cols2);
        kintone.app.record.set({ record: cur.record });
      } catch (e) { console.warn('[TANA-OROSHI] initial sanitize failed:', e); }
    }, 0);

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

      // 他ハンドラの keydown を遮断
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

        const parsed = (parseScan(input.value));
        if (!parsed) { alert('スキャン形式が不正です。例: mekkiCUPET0812vc 16 6000 51104 AA 2 1'); return; }

        if (!r[tableCode]) r[tableCode] = { type: 'SUBTABLE', value: [] };
        if (!Array.isArray(r[tableCode].value)) r[tableCode].value = [];

        // 先に正しい行を push → set() フックで一度サニタイズ
        r[tableCode].value.push(buildRow(cols, parsed));
        kintone.app.record.set({ record: r });

        // ---- 最終サニタイズ（他ハンドラが上書きしても直す）----
        setTimeout(() => {
          try {
            const cur = kintone.app.record.get();
            if (!cur) return;
            const cfg2 = getCfg(cur.record);
            const cols2 = getCols(cfg2);
            const table2 = getTableCode(cfg2);
            // 1) typed でサニタイズして画面反映
            sanitizeSubtableTyped(cur.record, table2, cols2);
            kintone.app.record.set({ record: cur.record });
            // 2) event 側の構造も値形式に矯正（赤バナー抑止）
            kintone.events.on('app.record.edit.change.' + table2, function(e){ 
              try { sanitizeEventRecordValueOnly(e.record, table2, cols2); } catch (_){}
              return e;
            });
          } catch (e) { console.warn('[TANA-OROSHI] post-fix sanitize failed:', e); }
        }, 0);

        input.value = ''; input.focus();
      }, { capture: true });
    }

    return event; // ← event.record は value だけで返す
  });

  // 予防：サブテーブルに変化が入ったら event.record を値形式に矯正
  kintone.events.on(['app.record.edit.change.' + (DEFAULT_COLS.reason), 'app.record.edit.change.' + (DEFAULT_COLS.result)], function(e){
    try {
      const cfg = getCfg(e.record);
      const cols = getCols(cfg);
      const tbl = getTableCode(cfg);
      sanitizeEventRecordValueOnly(e.record, tbl, cols);
    } catch (_) {}
    return e;
  });

})();
