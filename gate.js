/* gate.js — TANA-OROSHI fixed v=gate-2025-11-06-03 */
(function () {
  'use strict';

  const GATE_VERSION = 'gate-2025-11-06-03';
  console.log('[TANA-OROSHI] gate.js loaded:', GATE_VERSION);
  window.__TANA_GATE_VERSION = GATE_VERSION;

  // --- デフォ列・ヘルパ ---
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
  const mergeCols   = (cfg) => Object.assign({}, DEFAULT_COLS, (cfg?.ui?.table?.columns || {}));
  const tableCodeOf = (cfg) => cfg?.ui?.table?.fieldCode || 'scan_table';

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

  // --- ルール判定（A=raw, B=Now, C=rawから最初の整数） ---
  const asNumber = (v) => (v === '' || v == null ? null : Number(v));
  const asDate   = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };
  const cmpNum = (L, op, R) => (L == null ? false :
    op === '>' ? L > R : op === '>=' ? L >= R : op === '<' ? L < R :
    op === '<=' ? L <= R : op === '==' ? L === R :
    op === 'between' ? Array.isArray(R) && L >= R[0] && L <= R[1] : false);
  const cmpDate = (L, op, R) => {
    if (!L) return false;
    const l = L.getTime();
    const r = Array.isArray(R) ? R.map((d) => asDate(d).getTime()) : asDate(R).getTime();
    return op === '>' ? l > r : op === '>=' ? l >= r : op === '<' ? l < r :
           op === '<=' ? l <= r : op === '==' ? l === r :
           op === 'between' ? Array.isArray(r) && l >= r[0] && l <= r[1] : false;
  };
  const cmpText = (L, op, R, opt) => {
    const lower = !!(opt && opt.ignoreCase);
    const toS = (x) => (x == null ? '' : String(x));
    const norm = (x) => (lower ? toS(x).toLowerCase() : toS(x));
    L = norm(L); R = Array.isArray(R) ? R.map(norm) : norm(R);
    return (op === 'equals' || op === '==') ? L === R :
           op === 'contains' ? L.includes(R) :
           op === 'notContains' ? !L.includes(R) :
           op === 'in' ? (Array.isArray(R) && R.includes(L)) :
           op === 'notIn' ? (Array.isArray(R) && !R.includes(L)) : false;
  };
  function evalRules(config, rec, overrideMap) {
    const key2code = {}; (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));
    const read = (key, type) => {
      if (overrideMap && key in overrideMap) {
        const v = overrideMap[key];
        if (type === 'number') return asNumber(v);
        if (type === 'datetime') return asDate(v);
        return v;
      }
      const code = key2code[key];
      const f = code && rec.record[code];
      const v = f ? f.value : null;
      if (type === 'number') return asNumber(v);
      if (type === 'datetime') return asDate(v);
      return v;
    };
    const results = [];
    for (const r of (config.rules || [])) {
      const L = read(r.key, r.type);
      const op = r.operator;
      const R = r.type === 'number'
        ? (Array.isArray(r.value) ? r.value.map(asNumber) : asNumber(r.value))
        : r.value;
      let ok = false;
      if (r.type === 'number') ok = cmpNum(L, op, R);
      else if (r.type === 'datetime') ok = cmpDate(L, op, R);
      else if (r.type === 'text') ok = cmpText(L, op, R, r.options || {});
      results.push({ ok, reason: ok ? '' : `key=${r.key} op=${op} val=${JSON.stringify(r.value)}` });
    }
    return { allOk: results.every((x) => x.ok), reason: results.filter((x) => !x.ok).map((x) => x.reason).join(' / ') };
  }

  // --- 画面反映：valueのみでPUT → 型付きでset（undefined禁止） ---
  function sanitizeSubtable(record, tableCode, cols) {
    if (!record[tableCode]) return;
    const TYPE_MAP = {
      [cols.datetime]: 'DATETIME',
      [cols.product]: 'SINGLE_LINE_TEXT',
      [cols.width]: 'NUMBER',
      [cols.length]: 'NUMBER',
      [cols.lot]: 'SINGLE_LINE_TEXT',
      [cols.label]: 'SINGLE_LINE_TEXT',
      [cols.packs]: 'NUMBER',
      [cols.rotation]: 'NUMBER',
      [cols.result]: 'SINGLE_LINE_TEXT',
      [cols.reason]: 'MULTI_LINE_TEXT',
    };
    const rows = Array.isArray(record[tableCode].value) ? record[tableCode].value : [];
    rows.forEach((row) => {
      row.value ||= {};
      const c = row.value;
      Object.keys(c).forEach((k)=>{ if(['undefined','null','NaN'].includes(k)) delete c[k]; });
      Object.keys(TYPE_MAP).forEach((code) => {
        if (!c[code]) {
          const t = TYPE_MAP[code];
          c[code] = (t === 'NUMBER' || t === 'DATETIME')
            ? { type: t, value: null }
            : { type: t, value: '' };
        }
      });
      Object.entries(c).forEach(([code, cell]) => {
        const t = TYPE_MAP[code] || cell?.type;
        let v = cell?.value;
        if (t === 'NUMBER') {
          const s = v == null ? '' : String(v).trim();
          c[code] = { type: 'NUMBER', value: (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) ? null : s };
        } else if (t === 'DATETIME') {
          c[code] = { type: 'DATETIME', value: v ? new Date(v).toISOString() : null };
        } else {
          c[code] = { type: t, value: v == null ? '' : String(v) };
        }
      });
    });
  }
  function toApiRowsTyped(rowsTyped) {
    return rowsTyped.map((row) => {
      const api = { value: {} };
      if (row.id) api.id = row.id;
      Object.entries(row.value || {}).forEach(([code, cell]) => {
        let v = cell ? cell.value : null;
        if (cell && cell.type === 'NUMBER') v = (v === '' || v == null) ? null : Number(v);
        else if (cell && cell.type === 'DATETIME') v = v || null;
        else v = v == null ? '' : v;
        api.value[code] = { value: v };
      });
      return api;
    });
  }

  async function appendRowTyped(config, rec, rowUi, cols, tableCode) {
    if (!rec.record[tableCode]) rec.record[tableCode] = { type: 'SUBTABLE', value: [] };
    if (!Array.isArray(rec.record[tableCode].value)) rec.record[tableCode].value = [];

    sanitizeSubtable(rec.record, tableCode, cols);
    const nextTyped = rec.record[tableCode].value.concat([{ value: rowUi }]);

    const apiValue = toApiRowsTyped(nextTyped);
    const url = kintone.api.url('/k/v1/record.json', true);
    const body = { app: kintone.app.getId(), id: rec.$id?.value || rec.record.$id?.value, record: { [tableCode]: { value: apiValue } } };
    await kintone.api(url, 'PUT', body);

    rec.record[tableCode].value = nextTyped;
    kintone.app.record.set({ record: rec.record });
  }

  // --- ヘッダー領域の取得（イベント終了後に呼ぶ） ---
  function getHeaderSpaceSafely() {
    try { const el = kintone.app.getHeaderMenuSpaceElement(); if (el) return el; } catch (e) {}
    try { const el = kintone.app.record.getHeaderMenuSpaceElement(); if (el) return el; } catch (e) {}
    return null;
  }

  function mountAutoScan(config, rec) {
    if (document.getElementById('tana-scan-panel')) return;

    const space = getHeaderSpaceSafely();
    if (!space) return;

    const wrap = document.createElement('div');
    wrap.id = 'tana-scan-panel';
    wrap.style.cssText = 'padding:12px;margin:8px 0;border:1px solid #e5e7eb;border-radius:10px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.06);';
    wrap.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        <div style="font-weight:600;">SCAN</div>
        <input id="tana-input" autocomplete="off" placeholder="ここにQRを入力→Enter"
               style="flex:1;min-width:280px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:16px" />
        <span id="tana-badge" style="padding:6px 10px;border-radius:999px;background:#e5e7eb;color:#111;font-weight:600;">READY</span>
      </div>
      <div id="tana-msg" style="margin-top:8px;color:#64748b;font-size:13px;">Enterで即判定し、サブテーブルへ追記します。</div>
      <audio id="tana-ok-audio"></audio>
      <audio id="tana-ng-audio"></audio>
    `;
    space.appendChild(wrap);

    const okA = document.getElementById('tana-ok-audio');
    const ngA = document.getElementById('tana-ng-audio');
    try { okA.src = (config.sounds && config.sounds.ok) || ''; } catch (e) {}
    try { ngA.src = (config.sounds && config.sounds.ng) || ''; } catch (e) {}

    const $input = document.getElementById('tana-input');
    const $badge = document.getElementById('tana-badge');
    const $msg = document.getElementById('tana-msg');
    const focusInput = () => setTimeout(() => $input.focus(), 0);

    $input.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();

      const raw = $input.value; $input.value = '';
      if (!raw) { focusInput(); return; }

      const num = String(raw).match(/-?\d+/);
      const overrideMap = { A: String(raw), B: new Date(), C: num ? Number(num[0]) : '' };
      const { allOk, reason } = evalRules(config, rec, overrideMap);

      const cols = mergeCols(config);
      const tableCode = tableCodeOf(config);

      const rowUi = {};
      rowUi[cols.datetime]  = T.dt(new Date());
      // 詳細画面側では製品分解はしない（空で記録）
      rowUi[cols.product]   = T.text('');
      rowUi[cols.width]     = T.num('');
      rowUi[cols.length]    = T.num('');
      rowUi[cols.lot]       = T.text('');
      rowUi[cols.label]     = T.text('');
      rowUi[cols.packs]     = T.num('');
      rowUi[cols.rotation]  = T.num('');
      rowUi[cols.result]    = T.text(allOk ? 'OK' : 'NG');
      rowUi[cols.reason]    = T.mtext(allOk ? '' : reason);

      try {
        await appendRowTyped(config, rec, rowUi, cols, tableCode);
        if (allOk) { $badge.style.background = '#d1fae5'; $badge.textContent = 'OK'; try { okA.currentTime = 0; okA.play(); } catch (_) {} $msg.textContent = 'OKで記録しました。'; }
        else       { $badge.style.background = '#fee2e2'; $badge.textContent = 'NG'; try { ngA.currentTime = 0; ngA.play(); } catch (_) {} $msg.textContent = `NG：${reason}`; }
      } catch (e) {
        console.error(e); $badge.style.background = '#fde68a'; $badge.textContent = 'ERR'; $msg.textContent = '保存時にエラーが発生しました。';
      }

      focusInput();
    });

    focusInput();
  }

  // --- 詳細画面：イベント中はUI作らない（setTimeoutで脱出） ---
  kintone.events.on('app.record.detail.show', (event) => {
    const cfgStr = event.record.json_config?.value;
    if (!cfgStr) return event;

    let config = {};
    try { config = JSON.parse(cfgStr); }
    catch (e) { console.error('json_config parse error', e); return event; }

    // handler 内では kintone.app.record.get() 系を呼ばない
    const rec = { record: event.record, $id: { value: event.record.$id.value } };

    // イベント終了後に UI 設置
    setTimeout(() => {
      try { mountAutoScan(config, rec); } catch (e) { console.error(e); }
    }, 0);

    return event;
  });
})();
