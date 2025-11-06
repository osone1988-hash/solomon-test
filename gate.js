/* gate.js — TANA-OROSHI fixed v2025-11-06-01 */
(function () {
  'use strict';

  const GATE_VERSION = 'gate-2025-11-06-01';
  try { console.info('[TANA-OROSHI] gate.js loaded:', GATE_VERSION); } catch (_) {}
  window.__TANA_GATE_VERSION = GATE_VERSION;

  // ===== デフォルト列マッピング（設定JSONに無ければこれ） =====
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

  // ===== 型付き値（undefined を出さない） =====
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

  // ===== REST API 用に型付き → API形式へ変換 =====
  function toApiRowsTyped(rowsTyped) {
    return rowsTyped.map((row) => {
      const api = { value: {} };
      if (row.id) api.id = row.id;
      Object.entries(row.value || {}).forEach(([code, cell]) => {
        let v = cell ? cell.value : null;
        if (cell && cell.type === 'NUMBER') {
          v = (v === '' || v == null) ? null : Number(v);
        } else if (cell && cell.type === 'DATETIME') {
          v = v || null; // 既に ISO
        } else {
          v = v == null ? '' : v;
        }
        api.value[code] = { value: v };
      });
      return api;
    });
  }

  // ===== 既存行も含めサブテーブルを正規化（undefined 排除） =====
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
      if (!row.value) row.value = {};
      const cells = row.value;
      // 無いセルを空で補完
      Object.keys(TYPE_MAP).forEach((code) => {
        if (!cells[code]) {
          const t = TYPE_MAP[code];
          cells[code] =
            t === 'NUMBER' ? { type: t, value: null } :
            t === 'DATETIME' ? { type: t, value: null } :
            { type: t, value: '' };
        }
      });
      // 値の正規化
      Object.entries(cells).forEach(([code, cell]) => {
        const t = TYPE_MAP[code] || cell.type;
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

  // ===== QR を右詰めで分解（製品名は可変長） =====
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

  // ===== ルール評価（元の gate.js と同等） =====
  const asNumber = (v) => (v === '' || v == null ? null : Number(v));
  const asDate   = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };
  const iso      = (d) => (d ? new Date(d).toISOString() : '');
  const numStrOrEmpty = (v) => (v === '' || v == null ? '' : String(v));
  const cmpNum = (L, op, R) => {
    if (L == null) return false;
    if (op === '>') return L > R;
    if (op === '>=') return L >= R;
    if (op === '<') return L < R;
    if (op === '<=') return L <= R;
    if (op === '==') return L === R;
    if (op === 'between') return Array.isArray(R) && L >= R[0] && L <= R[1];
    return false;
  };
  const cmpDate = (L, op, R) => {
    if (!L) return false;
    const l = L.getTime();
    const r = Array.isArray(R) ? R.map((d) => asDate(d).getTime()) : asDate(R).getTime();
    if (op === '>') return l > r;
    if (op === '>=') return l >= r;
    if (op === '<') return l < r;
    if (op === '<=') return l <= r;
    if (op === '==') return l === r;
    if (op === 'between') return Array.isArray(r) && l >= r[0] && l <= r[1];
    return false;
  };
  const cmpText = (L, op, R, opt) => {
    const lower = !!(opt && opt.ignoreCase);
    const toS = (x) => (x == null ? '' : String(x));
    const norm = (x) => (lower ? toS(x).toLowerCase() : toS(x));
    L = norm(L);
    R = Array.isArray(R) ? R.map(norm) : norm(R);
    if (op === 'equals' || op === '==') return L === R;
    if (op === 'contains') return L.includes(R);
    if (op === 'notContains') return !L.includes(R);
    if (op === 'in') return Array.isArray(R) && R.includes(L);
    if (op === 'notIn') return Array.isArray(R) && !R.includes(L);
    return false;
  };
  function evalRules(config, rec, overrideMap, log = false) {
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));
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
    for (const r of config.rules || []) {
      const L = read(r.key, r.type);
      const op = r.operator;
      const R = r.type === 'number'
        ? (Array.isArray(r.value) ? r.value.map(asNumber) : asNumber(r.value))
        : r.value;
      let ok = false;
      if (r.type === 'number') ok = cmpNum(L, op, R);
      else if (r.type === 'datetime') ok = cmpDate(L, op, R);
      else if (r.type === 'text') ok = cmpText(L, op, R, r.options || {});
      else { results.push({ ok: false, reason: `未対応type:${r.type}` }); continue; }
      if (log) console.log('[RULE]', { key: r.key, type: r.type, op, L, R, ok });
      results.push({ ok, reason: ok ? '' : `key=${r.key} op=${op} val=${JSON.stringify(r.value)}` });
    }
    return {
      allOk: results.every((x) => x.ok),
      reason: results.filter((x) => !x.ok).map((x) => x.reason).join(' / ')
    };
  }

  // ===== サブテーブルに 1 行追加（API + 画面反映：いずれも type 付きで安全） =====
  async function appendRowTyped(config, rec, rowUi, cols, tableCode) {
    // 現在の型付き rows
    if (!rec.record[tableCode]) rec.record[tableCode] = { type: 'SUBTABLE', value: [] };
    if (!Array.isArray(rec.record[tableCode].value)) rec.record[tableCode].value = [];

    // 既存行もまずサニタイズ（undefined を潰す）
    sanitizeSubtable(rec.record, tableCode, cols);

    const currTyped = rec.record[tableCode].value;
    const nextTyped = currTyped.concat([{ value: rowUi }]);

    // API 形式へ変換して PUT
    const apiValue = toApiRowsTyped(nextTyped);
    const body = {
      app: kintone.app.getId(),
      id: rec.recordId || rec.$id?.value || rec.record.$id?.value,
      record: { [tableCode]: { value: apiValue } }
    };
    const url = kintone.api.url('/k/v1/record.json', true);
    await kintone.api(url, 'PUT', body);

    // 画面反映（型付きで set する）
    rec.record[tableCode].value = nextTyped;
    kintone.app.record.set({ record: rec.record });
  }

  // ===== 自動スキャン UI（詳細画面） =====
  function mountAutoScan(config, rec) {
    if (document.getElementById('tana-scan-panel')) return;

    const space = kintone.app.record.getHeaderMenuSpaceElement?.() || kintone.app.getHeaderMenuSpaceElement?.();
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
    // 音源は無くても動作する
    try { okA.src = config.ui?.sound?.ok?.file || ''; } catch (_) {}
    try { ngA.src = config.ui?.sound?.error?.file || ''; } catch (_) {}

    const $input = document.getElementById('tana-input');
    const $badge = document.getElementById('tana-badge');
    const $msg = document.getElementById('tana-msg');
    const focusInput = () => setTimeout(() => $input.focus(), 0);
    focusInput();

    $input.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const raw = $input.value;
      $input.value = '';

      const parsed = parseScan(raw);
      if (!parsed) { $msg.textContent = 'QR形式が不正です（7要素不足）'; focusInput(); return; }

      // 判定（既存の A/B/C ルール互換：A=raw, B=Now, C=raw 内の最初の整数）
      const num = String(raw).match(/-?\d+/);
      const overrideMap = { A: String(raw), B: new Date(), C: num ? Number(num[0]) : '' };
      const { allOk, reason } = evalRules(config, rec, overrideMap, false);

      const cols = (config && config.ui && config.ui.table && config.ui.table.columns) || DEFAULT_COLS;
      const tableCode = (config && config.ui && config.ui.table && config.ui.table.fieldCode) || 'scan_table';

      // 型付きの 1 行
      const rowUi = {};
      rowUi[cols.datetime]  = T.dt(new Date());
      rowUi[cols.product]   = T.text(parsed.product_name);
      rowUi[cols.width]     = T.num(parsed.width);
      rowUi[cols.length]    = T.num(parsed.length);
      rowUi[cols.lot]       = T.text(parsed.lot_no);
      rowUi[cols.label]     = T.text(parsed.label_no);
      rowUi[cols.packs]     = T.num(parsed.packs);
      rowUi[cols.rotation]  = T.num(parsed.rotation);
      rowUi[cols.result]    = T.text(allOk ? 'OK' : 'NG');
      rowUi[cols.reason]    = T.mtext(allOk ? '' : reason);

      try {
        await appendRowTyped(config, rec, rowUi, cols, tableCode);
        if (allOk) {
          $badge.style.background = '#d1fae5'; $badge.textContent = 'OK';
          try { okA.currentTime = 0; okA.play(); } catch (_) {}
          $msg.textContent = 'OKで記録しました。';
        } else {
          $badge.style.background = '#fee2e2'; $badge.textContent = 'NG';
          try { ngA.currentTime = 0; ngA.play(); } catch (_) {}
          $msg.textContent = `NG：${reason}`;
        }
      } catch (e) {
        console.error(e);
        $badge.style.background = '#fde68a'; $badge.textContent = 'ERR';
        $msg.textContent = '保存時にエラーが発生しました。';
      }

      focusInput();
    });
  }

  // ===== 詳細画面 =====
  kintone.events.on('app.record.detail.show', (event) => {
    const rec = { record: event.record, $id: { value: event.record.$id.value } };

    // 設定 JSON
    const cfgStr = event.record.json_config && event.record.json_config.value;
    if (!cfgStr) return;

    let config = {};
    try { config = JSON.parse(cfgStr); }
    catch (e) { console.error('json_config parse error', e); return; }

    // 自動スキャン UI を設置
    const autoOn = config.ui?.autoScan?.enabled !== false;
    if (autoOn) mountAutoScan(config, rec);
  });
})();
