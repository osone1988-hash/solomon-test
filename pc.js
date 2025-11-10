(function () {
  'use strict';

  const PCJS_VERSION = 'pc-2025-11-06-10';
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

  // set() フック用のフォールバック
  let ACTIVE_COLS = { ...DEFAULT_COLS };
  let ACTIVE_TABLE = 'scan_table';

  // ---- 型付き値ユーティリティ ----
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

  // ---- typed レコードのサブテーブルを正規化（UI set()/get() 用）----
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

      // 変なキー除去（undefined/null/NaN 等）
      Object.keys(c).forEach((k) => { if (k === 'undefined' || k === 'null' || k === 'NaN') delete c[k]; });

      // 不足セル補完
      Object.keys(TYPE_MAP).forEach((code) => {
        if (!c[code]) {
          const t = TYPE_MAP[code];
          c[code] = (t === 'NUMBER' || t === 'DATETIME') ? { type: t, value: null } : { type: t, value: '' };
        }
      });

      // 既存セルの型&値を正規化（undefinedを撲滅）
      Object.entries(c).forEach(([code, cell]) => {
        const t = TYPE_MAP[code] || cell?.type;
        const raw = (cell && 'value' in cell) ? cell.value : undefined;
        if (t === 'NUMBER') {
          const s = raw == null ? '' : String(raw).trim();
          c[code] = { type: 'NUMBER', value: (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) ? null : s };
        } else if (t === 'DATETIME') {
          c[code] = { type: 'DATETIME', value: raw ? new Date(raw).toISOString() : null };
        } else {
          c[code] = { type: t, value: raw == null ? '' : String(raw) };
        }
      });
    });
  }

  // ---- event.record を「valueだけ」に矯正（イベント戻り値用）----
  function sanitizeEventRecordValueOnly(record, tableCode, cols) {
    if (!record || !tableCode || !record[tableCode]) return;
    const KIND = {
      [cols.datetime]:'DT',[cols.product]:'TXT',[cols.width]:'NUM',[cols.length]:'NUM',
      [cols.lot]:'TXT',[cols.label]:'TXT',[cols.packs]:'NUM',[cols.rotation]:'NUM',
      [cols.result]:'TXT',[cols.reason]:'MTXT',
    };
    const allowed = new Set(Object.keys(KIND));
    const rows = Array.isArray(record[tableCode].value) ? record[tableCode].value : [];
    rows.forEach((row) => {
      row.value ||= {};
      const c = row.value;

      // 余計なキーを完全に削除（←赤バナーの「undefined」元を排除）
      Object.keys(c).forEach((k) => { if (!allowed.has(k)) delete c[k]; });

      // 各セルを value-only に正規化
      Object.entries(KIND).forEach(([code, kind]) => {
        const cell = c[code];
        let v = (cell && 'value' in cell) ? cell.value : '';
        if (kind === 'NUM') {
          const s = v == null ? '' : String(v).trim();
          v = (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) ? null : Number(s);
        } else if (kind === 'DT') {
          v = v ? new Date(v).toISOString() : null;
        } else {
          v = v == null ? '' : String(v);
        }
        c[code] = { value: v }; // ← type を入れない
      });
    });
  }

  // ---- すべての set() をフック：呼ばれるたびに typed を正規化 ----
  if (!kintone.app.record.__tanaPatched10) {
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
    kintone.app.record.__tanaPatched10 = true;
  }

  // ---- QR パーサ ----
  function parseScan(raw) {
    const s = (raw || '').trim();
    if (!s) return null;
    const a = s.split(/\s+/);
    if (a.length < 7) return null;
    const rotation = a.pop(), packs = a.pop(), label_no = a.pop(), lot_no = a.pop();
    const length = a.pop(), width = a.pop(), product_name = a.join(' ');
    return { product_name, width, length, lot_no, label_no, packs, rotation };
  }

  // ---- 新規行（typed）----
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

  // ---- post-fix：他ハンドラの後書きを最終上書き（複数回）----
  function postFix(times) {
    let i = 0;
    const tick = () => {
      try {
        const cur = kintone.app.record.get();
        if (!cur) return;
        const cfg = getCfg(cur.record);
        const cols = getCols(cfg);
        const table = getTableCode(cfg);
        sanitizeSubtableTyped(cur.record, table, cols);
        kintone.app.record.set({ record: cur.record });
      } catch (e) { console.warn('[TANA-OROSHI] postFix error:', e); }
      if (++i < times) setTimeout(tick, 0);
    };
    tick();
  }

  // ---- 古いUI撤去 ----
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

    // (B) イベント戻り値は「valueだけ」に矯正（type混入や余計キーを排除）
    try { sanitizeEventRecordValueOnly(r, tableCode, cols); } catch (_) {}

    // 画面描画後、現状データを typed で1回正規化→反映
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

    // SCAN 入力UI
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

        const parsed = parseScan(input.value);
        if (!parsed) { alert('スキャン形式が不正です。例: mekkiCUPET0812vc 16 6000 51104 AA 2 1'); return; }

        if (!r[tableCode]) r[tableCode] = { type: 'SUBTABLE', value: [] };
        if (!Array.isArray(r[tableCode].value)) r[tableCode].value = [];

        // 先に正しい行を push → set() フックで一度サニタイズ
        r[tableCode].value.push(buildRow(cols, parsed));
        kintone.app.record.set({ record: r });

        // (C) 最終サニタイズを数回繰り返して他ハンドラの後書きを打ち消す
        postFix(5);

        input.value = ''; input.focus();
      }, { capture: true });
    }

    return event; // ← event.record は value-only で返す
  });

})();
