/* TANA-OROSHI pc.js — fix-on-show + server-write v=pc-2025-11-10-13 */
(function () {
  'use strict';

  const PCJS_VERSION = 'pc-2025-11-10-13';
  console.log('[TANA-OROSHI] pc.js loaded:', PCJS_VERSION);
  try { window.__TANA_PC_VERSION = PCJS_VERSION; } catch (_) {}

  // ---- デフォ列（json_config の ui.table.columns で上書き可）----
  const DEFAULT_COLS = {
    datetime: 'scan_at',
    product:  'col_prod',
    width:    'col_width',
    length:   'col_length',
    lot:      'col_lot',
    label:    'col_label',
    packs:    'col_packs',
    rotation: 'col_rotation',
    result:   'result',
    reason:   'reason',
  };

  const byId = (id) => document.getElementById(id);
  const iso = (d) => (d ? new Date(d).toISOString() : null);
  const asNumOrNull = (v) => {
    const s = v == null ? '' : String(v).trim();
    return (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) ? null : Number(s);
  };
  const asTxt = (v) => (v == null ? '' : String(v));

  // ---- QR パース（例: "mekkiCUPET0812vc 16 6000 51104 AA 2 1"）----
  function parseScan(raw) {
    const s = (raw || '').trim();
    if (!s) return null;
    const a = s.split(/\s+/);
    if (a.length < 7) return null;
    const rotation = a.pop(), packs = a.pop(), label_no = a.pop(), lot_no = a.pop();
    const length = a.pop(), width = a.pop(), product_name = a.join(' ');
    return { product_name, width, length, lot_no, label_no, packs, rotation };
  }

  // ---- サーバーの typed 行 → value-only 行 へ再構築 ----
  function toValueOnlyRow(rowTyped, cols) {
    const numberCodes = new Set([cols.width, cols.length, cols.packs, cols.rotation]);
    const out = {};
    const rv = rowTyped?.value || {};

    // この10列だけを厳密に構築（余計なキーを作らない）
    out[cols.datetime] = { value: iso(rv[cols.datetime]?.value) };
    out[cols.product]  = { value: asTxt(rv[cols.product]?.value) };
    out[cols.width]    = { value: asNumOrNull(rv[cols.width]?.value) };
    out[cols.length]   = { value: asNumOrNull(rv[cols.length]?.value) };
    out[cols.lot]      = { value: asTxt(rv[cols.lot]?.value) };
    out[cols.label]    = { value: asTxt(rv[cols.label]?.value) };
    out[cols.packs]    = { value: asNumOrNull(rv[cols.packs]?.value) };
    out[cols.rotation] = { value: asNumOrNull(rv[cols.rotation]?.value) };
    out[cols.result]   = { value: asTxt(rv[cols.result]?.value) };
    out[cols.reason]   = { value: asTxt(rv[cols.reason]?.value) };

    // number は null / text は '' / datetime は ISO or null
    for (const [code, cell] of Object.entries(out)) {
      if (numberCodes.has(code)) {
        if (cell.value === '') cell.value = null;
      } else if (code === cols.datetime) {
        if (!cell.value) cell.value = null;
      } else {
        if (cell.value == null) cell.value = '';
      }
    }
    return { value: out };
  }

  // ---- サーバーに 1 行追記（GET→PUT、UI には set() しない）----
  async function appendRowToServer(appId, recId, cols, tableCode, data) {
    const url = kintone.api.url('/k/v1/record.json', true);

    // GET：最新のサブテーブル（typed）
    const { record } = await kintone.api(url, 'GET', { app: appId, id: recId });
    const curr = Array.isArray(record[tableCode]?.value) ? record[tableCode].value : [];

    // value-only 新規行
    const nextRow = {
      value: {
        [cols.datetime]: { value: iso(new Date()) },
        [cols.product]:  { value: asTxt(data.product_name) },
        [cols.width]:    { value: asNumOrNull(data.width) },
        [cols.length]:   { value: asNumOrNull(data.length) },
        [cols.lot]:      { value: asTxt(data.lot_no) },
        [cols.label]:    { value: asTxt(data.label_no) },
        [cols.packs]:    { value: asNumOrNull(data.packs) },
        [cols.rotation]: { value: asNumOrNull(data.rotation) },
        [cols.result]:   { value: '' },
        [cols.reason]:   { value: '' },
      }
    };

    // PUT：value-only で丸ごと保存
    const body = { app: appId, id: recId, record: { [tableCode]: { value: curr.concat([nextRow]) } } };
    await kintone.api(url, 'PUT', body);
  }

  // ---- 編集画面（表示）— 赤バナー対策：サーバーから取り直して value-only で返す ----
  kintone.events.on('app.record.edit.show', async (event) => {
    const r = event.record;

    // config
    let cfg = {};
    try { cfg = JSON.parse(r?.json_config?.value || '{}'); } catch (_) { cfg = {}; }
    const cols = Object.assign({}, DEFAULT_COLS, (cfg?.ui?.table?.columns || {}));
    const tableCode = cfg?.ui?.table?.fieldCode || 'scan_table';

    // サーバーの “正” データを取得（typed）→ value-only に再構築して event に適用
    const appId = kintone.app.getId();
    const recId = r.$id?.value;
    if (appId && recId) {
      const url = kintone.api.url('/k/v1/record.json', true);
      const { record } = await kintone.api(url, 'GET', { app: appId, id: recId });
      const typedRows = Array.isArray(record[tableCode]?.value) ? record[tableCode].value : [];
      event.record[tableCode].value = typedRows.map(row => toValueOnlyRow(row, cols));
    }

    // SCAN UI（サーバー直書き＋リロード）
    if (!byId('tana-scan')) {
      const wrap = document.createElement('div');
      wrap.style.margin = '8px 0 16px';
      const label = document.createElement('span');
      label.textContent = 'SCAN';
      label.style.marginRight = '8px';
      const input = document.createElement('input');
      input.id = 'tana-scan';
      input.type = 'text';
      input.placeholder = 'ここにスキャン（Enterで追記→自動更新）';
      input.autocomplete = 'off';
      input.style.cssText = 'width:420px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;';
      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'クリア';
      clearBtn.style.cssText = 'margin-left:8px;padding:6px 12px;';
      clearBtn.onclick = () => { input.value = ''; input.focus(); };

      wrap.appendChild(label); wrap.appendChild(input); wrap.appendChild(clearBtn);

      const jsonFieldEl = kintone.app.record.getFieldElement('json_config');
      if (jsonFieldEl && jsonFieldEl.parentElement) {
        jsonFieldEl.parentElement.parentElement.insertBefore(wrap, jsonFieldEl.parentElement);
      } else {
        document.body.appendChild(wrap);
      }

      input.addEventListener('keydown', async (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();

        const parsed = parseScan(input.value);
        if (!parsed) { alert('スキャン形式が不正です。例: mekkiCUPET0812vc 16 6000 51104 AA 2 1'); return; }

        try {
          await appendRowToServer(appId, recId, cols, tableCode, parsed);
          location.reload(); // 上書きが反映された画面を再読込
        } catch (e) {
          console.error(e);
          alert('保存に失敗しました。ネットワークまたは権限をご確認ください。');
        }
      }, { capture: true });
    }

    return event; // ← value-only で返すため、赤バナーが出ません
  });
})();
