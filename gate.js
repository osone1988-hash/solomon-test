/* gate.js — TANA-OROSHI fixed v=gate-2025-11-06-04 */
(function () {
  'use strict';

  const GATE_VERSION = 'gate-2025-11-06-04';
  console.log('[TANA-OROSHI] gate.js loaded:', GATE_VERSION);
  try { window.__TANA_GATE_VERSION = GATE_VERSION; window.top.__TANA_GATE_VERSION = GATE_VERSION; } catch (_) {}

  // ===== デフォ列とヘルパ =====
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

  // ===== ルール（A=raw, B=Now, C=rawの最初の整数） =====
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

  // ===== サブテーブル正規化（undefined排除）& API変換 =====
  function sanitizeSubtable(record, tableCode, cols) {
    if (!record[tableCode]) return;
    const TYPE_MAP = {
      [cols.datetime]:'DATETIME',[cols.product]:'SINGLE_LINE_TEXT',[cols.width]:'NUMBER',[cols.length]:'NUMBER',
      [cols.lot]:'SINGLE_LINE_TEXT',[cols.label]:'SINGLE_LINE_TEXT',[cols.packs]:'NUMBER',[cols.rotation]:'NUMBER',
      [cols.result]:'SINGLE_LINE_TEXT',[cols.reason]:'MULTI_LINE_TEXT',
    };
    const rows = Array.isArray(record[tableCode].value) ? record[tableCode].value : [];
    rows.forEach((row) => {
      row.value ||= {};
      const c = row.value;
      Object.keys(c).forEach((k)=>{ if(['undefined','null','NaN'].includes(k)) delete c[k]; });
      Object.keys(TYPE_MAP).forEach((code) => {
        if (!c[code]) {
          const t = TYPE_MAP[code];
          c[code] = (t === 'NUMBER' || t === 'DATETIME') ? { type: t, value: null } : { type: t, value: '' };
        }
      });
      Object.entries(c).forEach(([code, cell]) => {
        const t = TYPE_MAP[code] || cell?.type; let v = cell?.value;
        if (t === 'NUMBER') { const s = v == null ? '' : String(v).trim(); c[code] = { type: 'NUMBER', value: (s===''||!/^-?\d+(\.\d+)?$/.test(s))? null : s }; }
        else if (t === 'DATETIME') { c[code] = { type: 'DATETIME', value: v ? new Date(v).toISOString() : null }; }
        else { c[code] = { type: t, value: v == null ? '' : String(v) }; }
      });
    });
  }
  function toApiRowsTyped(rows) {
    return rows.map((row) => {
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

  // ===== フローティングUI（イベント外で呼ぶ） =====
  function mountPanel(config, rec) {
    if (document.getElementById('tana-scan-panel')) return;

    const wrap = document.createElement('div');
    wrap.id = 'tana-scan-panel';
    wrap.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9999;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08);';
    wrap.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="font-weight:600;">SCAN</div>
        <input id="tana-input" autocomplete="off" placeholder="ここにQR→Enter"
               style="width:320px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;" />
        <span id="tana-badge" style="padding:6px 10px;border-radius:999px;background:#e5e7eb;color:#111;font-weight:600;">READY</span>
      </div>
      <div id="tana-msg" style="margin-top:6px;color:#64748b;font-size:12px;">Enterで即判定しサブテーブルへ追記します。</div>
      <audio id="tana-ok-audio"></audio><audio id="tana-ng-audio"></audio>
    `;
    document.body.appendChild(wrap);

    const okA = document.getElementById('tana-ok-audio');
    const ngA = document.getElementById('tana-ng-audio');
    try { okA.src = (config.sounds && config.sounds.ok) || ''; } catch (_) {}
    try { ngA.src = (config.sounds && config.sounds.ng) || ''; } catch (_) {}

    const cols = mergeCols(config);
    const tableCode = tableCodeOf(config);
    const $input = document.getElementById('tana-input');
    const $badge = document.getElementById('tana-badge');
    const $msg = document.getElementById('tana-msg');
    const focusInput = () => setTimeout(() => $input.focus(), 0);
    focusInput();

    $input.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const raw = $input.value; $input.value = '';

      const num = String(raw||'').match(/-?\d+/);
      const overrideMap = { A:String(raw||''), B:new Date(), C: num ? Number(num[0]) : '' };
      const { allOk, reason } = evalRules(config, rec, overrideMap);

      // 行（全列に type/value を埋める。製品分解は詳細画面ではしない）
      const row = {};
      row[cols.datetime]  = T.dt(new Date());
      row[cols.product]   = T.text('');
      row[cols.width]     = T.num('');
      row[cols.length]    = T.num('');
      row[cols.lot]       = T.text('');
      row[cols.label]     = T.text('');
      row[cols.packs]     = T.num('');
      row[cols.rotation]  = T.num('');
      row[cols.result]    = T.text(allOk ? 'OK' : 'NG');
      row[cols.reason]    = T.mtext(allOk ? '' : reason);

      try {
        // 現在の rows を型付きで整える → 追加 → API で保存 → 画面に型付きで反映
        if (!rec.record[tableCode]) rec.record[tableCode] = { type: 'SUBTABLE', value: [] };
        if (!Array.isArray(rec.record[tableCode].value)) rec.record[tableCode].value = [];
        sanitizeSubtable(rec.record, tableCode, cols);

        const nextTyped = rec.record[tableCode].value.concat([{ value: row }]);
        const apiValue = toApiRowsTyped(nextTyped);
        const url  = kintone.api.url('/k/v1/record.json', true);
        const body = { app: kintone.app.getId(), id: rec.$id?.value || rec.record.$id?.value, record: { [tableCode]: { value: apiValue } } };
        await kintone.api(url, 'PUT', body);

        rec.record[tableCode].value = nextTyped;
        kintone.app.record.set({ record: rec.record }); // イベント外なのでOK

        if (allOk) { $badge.style.background = '#d1fae5'; $badge.textContent = 'OK'; try { okA.currentTime=0; okA.play(); } catch(_){} $msg.textContent = 'OKで記録しました。'; }
        else       { $badge.style.background = '#fee2e2'; $badge.textContent = 'NG'; try { ngA.currentTime=0; ngA.play(); } catch(_){} $msg.textContent = `NG：${reason}`; }

      } catch (e) {
        console.error(e);
        $badge.style.background = '#fde68a'; $badge.textContent = 'ERR';
        $msg.textContent = '保存時にエラーが発生しました。';
      }

      focusInput();
    });
  }

  // ===== 詳細画面（イベント内では何もしない・参照だけ） =====
  kintone.events.on('app.record.detail.show', (event) => {
    let cfg = {};
    try { cfg = JSON.parse(event.record.json_config?.value || '{}'); } catch (_) { console.error('json_config parse error'); return event; }

    // 参照を保存（イベント内で get()/set() はしない）
    const rec = { record: event.record, $id: { value: event.record.$id.value } };
    try { window.__TANA_CFG__ = cfg; window.__TANA_REC__ = rec; } catch (_) {}

    // イベント終了後に UI を組み立てる
    setTimeout(() => { try { mountPanel(cfg, rec); } catch (e) { console.error(e); } }, 0);

    return event;
  });
})();
