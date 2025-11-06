(function () {
  'use strict';

  // ===== 版数（読み込み確認用） =====
  const PCJS_VERSION = 'pc-2025-11-06-02';
  console.info('[TANA-OROSHI] pc.js loaded:', PCJS_VERSION);
  window.__TANA_PC_VERSION = PCJS_VERSION;

  // ===== UI ユーティリティ =====
  const byId = (id) => document.getElementById(id);

  // ===== デフォルト列コード（設定JSONが無い場合のフォールバック） =====
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

  // ===== 型付き値ファクトリ（undefined を出さない） =====
  const T = {
    text: (v) => ({ type: 'SINGLE_LINE_TEXT', value: v == null ? '' : String(v) }),
    mtext: (v) => ({ type: 'MULTI_LINE_TEXT', value: v == null ? '' : String(v) }),
    num: (v) => {
      const s = v == null ? '' : String(v).trim();
      // 空・非数は null、数値は “数値の文字列”
      if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) {
        return { type: 'NUMBER', value: null };
      }
      return { type: 'NUMBER', value: s };
    },
    dt: (v) => {
      if (!v) return { type: 'DATETIME', value: null };
      const d = (v instanceof Date) ? v : new Date(v);
      return { type: 'DATETIME', value: d.toISOString() };
    },
  };

  // ===== QR を右詰めで 7 要素に分解（製品名は可変長） =====
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

  // ===== 新規行を構築（type/value 完備） =====
  function buildRow(cols, data) {
    const v = {};
    v[cols.datetime]  = T.dt(new Date());
    v[cols.product]   = T.text(data.product_name);
    v[cols.width]     = T.num(data.width);
    v[cols.length]    = T.num(data.length);
    v[cols.lot]       = T.text(data.lot_no);
    v[cols.label]     = T.text(data.label_no);
    v[cols.packs]     = T.num(data.packs);
    v[cols.rotation]  = T.num(data.rotation);
    v[cols.result]    = T.text('');   // 判定は後段で付与
    v[cols.reason]    = T.mtext('');  // 理由は必要時に付与
    return { value: v };
  }

  // ===== 既存行も含めサブテーブル全体をサニタイズ =====
  function sanitizeSubtable(record, tableCode, cols) {
    if (!record[tableCode]) return;

    // 想定型マップ（列コード → kintone 型）
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

      // 足りないセルを補完（空デフォルト）
      Object.keys(TYPE_MAP).forEach((code) => {
        if (!cells[code]) {
          const t = TYPE_MAP[code];
          cells[code] =
            t === 'NUMBER'   ? { type: t, value: null } :
            t === 'DATETIME' ? { type: t, value: null } :
                               { type: t, value: '' };
        }
      });

      // 既存セルを型・値ともに正規化（undefined を除去）
      Object.entries(cells).forEach(([code, cell]) => {
        const t = TYPE_MAP[code] || cell.type;
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
          // その他型は文字列化しておく（念のため）
          v = v == null ? '' : String(v);
          cells[code] = { type: t, value: v };
        }
      });
    });
  }

  // ===== 編集画面 =====
  kintone.events.on('app.record.edit.show', (event) => {
    const r = event.record;

    // 設定 JSON 読み込み
    let cfg = {};
    try {
      cfg = JSON.parse((r.json_config && r.json_config.value) || '{}');
    } catch (e) {
      alert('設定JSONのパースに失敗しました。json_config を確認してください。');
      return event; // return true は使用しない
    }

    // UI（多重生成防止）
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
      input.style.cssText = 'width:420px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;';

      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'クリア';
      clearBtn.style.cssText = 'margin-left:8px;padding:6px 12px;';
      clearBtn.onclick = () => { input.value = ''; input.focus(); };

      wrap.appendChild(label);
      wrap.appendChild(input);
      wrap.appendChild(clearBtn);

      // JSON フィールド直前に挿入
      const jsonFieldEl = kintone.app.record.getFieldElement('json_config');
      if (jsonFieldEl && jsonFieldEl.parentElement) {
        jsonFieldEl.parentElement.parentElement.insertBefore(wrap, jsonFieldEl.parentElement);
      } else {
        document.body.appendChild(wrap);
      }

      // Enter で 1 行追加
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();

        const parsed = parseScan(input.value);
        if (!parsed) {
          alert('スキャン形式が不正です。例: mekkiCUPET0812vc 16 6000 51104 AA 2 1');
          return;
        }

        const tableCode = (cfg && cfg.ui && cfg.ui.table && cfg.ui.table.fieldCode) || 'scan_table';
        const cols = (cfg && cfg.ui && cfg.ui.table && cfg.ui.table.columns) || DEFAULT_COLS;

        // サブテーブルの器を用意
        if (!r[tableCode]) r[tableCode] = { type: 'SUBTABLE', value: [] };
        if (!Array.isArray(r[tableCode].value)) r[tableCode].value = [];

        // 新規行を push
        r[tableCode].value.push(buildRow(cols, parsed));

        // 既存行も含めて最後に必ずサニタイズ
        sanitizeSubtable(r, tableCode, cols);

        // 反映
        kintone.app.record.set({ record: r });

        // 入力欄をリセット
        input.value = '';
        input.focus();
      });
    }

    return event;
  });
})();
