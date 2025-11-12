/* TANA-OROSHI pc.js — 編集画面SCAN + ドロップ判定 + サーバー保存（GET→PUT, value-only）
   v=pc-ng-rules-2025-11-10-4 */
(function () {
  'use strict';

  const VERSION = 'pc-ng-rules-2025-11-10-4';
  try { console.log('[TANA-OROSHI] pc.js loaded:', VERSION); window.__TANA_PC_VERSION = VERSION; } catch (_) {}

  // 判定フィールド（3項目テスト）
  const JUDGE = {
    text:   { value: 'a',  op: 'aj' },
    number: { value: 'b',  op: 'bj' },
    date:   { value: 'c',  op: 'cj' },
  };
  // サブテーブル
  const TABLE = 'scan_table';
  const COL = { scanAt:'scan_at', at:'at', bt:'bt', ct:'ct', result:'result', reason:'reason' };

  // ===== Utils =====
  const $ = (id) => document.getElementById(id);
  const iso = (d) => (d ? new Date(d).toISOString() : null);
  const toText = (v) => (v == null ? '' : String(v));
  const toNumOrNull = (v) => {
    const s = v == null ? '' : String(v).trim();
    return (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) ? null : Number(s);
  };
  function parseDateLoose(s) {
    if (!s) return null;
    const str = String(s).trim();
    if (/^\d{8}$/.test(str)) { const y=+str.slice(0,4), m=+str.slice(4,6)-1, d=+str.slice(6,8); const dt=new Date(y,m,d); return Number.isNaN(dt.getTime())?null:dt; }
    const dt = new Date(str.replace(/\//g, '-'));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  function normalizeOp(kind, s) {
    const t = (s || '').trim();
    if (kind === 'text') {
      if (['まったく同じ','完全一致','==','equals'].includes(t)) return 'eq';
      if (['含む','contains'].includes(t)) return 'contains';
      if (['含まない','notContains'].includes(t)) return 'notContains';
      if (['前方一致','前部一致','startsWith'].includes(t)) return 'starts';
      if (['後方一致','endsWith'].includes(t)) return 'ends';
      return '';
    }
    if (kind === 'number') {
      if (['同じ','==','equals'].includes(t)) return 'eq';
      if (['異なる','!=','not'].includes(t)) return 'ne';
      if (['以上','>='].includes(t)) return 'gte';
      if (['以下','<='].includes(t)) return 'lte';
      if (['未満','<'].includes(t)) return 'lt';
      if (['より大きい','>','超'].includes(t)) return 'gt';
      return '';
    }
    if (kind === 'date') {
      if (['同じ','=='].includes(t)) return 'eq';
      if (['以外','!='].includes(t)) return 'ne';
      if (['以降','>='].includes(t)) return 'gte';
      if (['以前','<='].includes(t)) return 'lte';
      return '';
    }
    return '';
  }
  function isNG_text(v, op, base) {
    if (!op || base === '') return false;
    const s = toText(v), b = toText(base);
    if (op === 'eq') return s === b;
    if (op === 'contains') return s.includes(b);
    if (op === 'notContains') return !s.includes(b);
    if (op === 'starts') return s.startsWith(b);
    if (op === 'ends') return s.endsWith(b);
    return false;
  }
  function isNG_number(v, op, base) {
    const s = toNumOrNull(v), b = toNumOrNull(base);
    if (!op || b == null || s == null) return false;
    if (op === 'eq')  return s === b;
    if (op === 'ne')  return s !== b;
    if (op === 'gte') return s >= b;
    if (op === 'lte') return s <= b;
    if (op === 'lt')  return s <  b;
    if (op === 'gt')  return s >  b;
    return false;
  }
  function isNG_date(v, op, base) {
    const s = v instanceof Date ? v : parseDateLoose(v);
    const b = base instanceof Date ? base : parseDateLoose(base);
    if (!op || !s || !b) return false;
    const sv = s.getTime(), bv = b.getTime();
    if (op === 'eq')  return sv === bv;
    if (op === 'ne')  return sv !== bv;
    if (op === 'gte') return sv >= bv; // 以降
    if (op === 'lte') return sv <= bv; // 以前
    return false;
  }

  async function appendRow(appId, recId, rowValueOnly) {
    const url = kintone.api.url('/k/v1/record.json', true);
    const { record } = await kintone.api(url, 'GET', { app: appId, id: recId });
    const curr = Array.isArray(record[TABLE]?.value) ? record[TABLE].value : [];
    const next = curr.concat([{ value: rowValueOnly }]);
    await kintone.api(url, 'PUT', { app: appId, id: recId, record: { [TABLE]: { value: next } } });
  }

  function parseScan3(raw) {
    const a = String(raw || '').trim().split(/\s+/).filter(Boolean);
    const text = a[0] || '';
    const num  = a.length > 1 ? toNumOrNull(a[1]) : null;
    const date = a.length > 2 ? parseDateLoose(a[2]) : null;
    return { at: text, bt: num, ct: date };
  }

  // === イベント本体（全面try/catchで保護） ===
  kintone.events.on('app.record.edit.show', (event) => {
    try {
      const rec = event.record;
      const appId = kintone.app.getId?.();
      const recId = rec.$id?.value || kintone.app.record.getId?.();
      if (!appId || !recId) return event;

      if (!$('#tana-scan-wrap')) {
        const wrap = document.createElement('div');
        wrap.id = 'tana-scan-wrap';
        wrap.style.cssText = 'margin:10px 0 16px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;';
        wrap.innerHTML = `
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <strong>SCAN</strong>
            <input id="tana-scan-input" type="text" autocomplete="off"
              placeholder="(文字) (数値) (日時) の順に入力 → Enter"
              style="flex:1;min-width:320px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;">
            <button id="tana-scan-clear" type="button" style="padding:6px 10px;">クリア</button>
            <span id="tana-scan-status" style="margin-left:8px;color:#64748b;">READY</span>
          </div>
          <div style="margin-top:6px;color:#64748b;font-size:12px">
            NG条件：a/aj・b/bj・c/cj。未選択や基準空は判定対象外。NGでも常に記録します。
          </div>
        `;
        const anchor = kintone.app.record.getFieldElement?.('json_config');
        if (anchor?.parentElement?.parentElement) {
          anchor.parentElement.parentElement.insertBefore(wrap, anchor.parentElement);
        } else {
          document.body.appendChild(wrap);
        }

        const $in = $('#tana-scan-input');
        const $clear = $('#tana-scan-clear');
        const $st = $('#tana-scan-status');

        let busy = false;

        $clear?.addEventListener('click', () => { if ($in) { $in.value = ''; $in.focus(); } });
        setTimeout(() => $in?.focus(), 0);

        $in?.addEventListener('keydown', async (ev) => {
          if (ev.key !== 'Enter') return;
          ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
          if (busy) return; busy = true;

          try {
            const raw = $in?.value ?? '';
            const { at, bt, ct } = parseScan3(raw);
            const atTxt = toText(at);
            const ctIso = ct ? iso(ct) : null;

            const aVal = rec[JUDGE.text.value ]?.value ?? '';
            const aOp  = rec[JUDGE.text.op    ]?.value ?? '';
            const bVal = rec[JUDGE.number.value]?.value ?? '';
            const bOp  = rec[JUDGE.number.op   ]?.value ?? '';
            const cVal = rec[JUDGE.date.value ]?.value ?? '';
            const cOp  = rec[JUDGE.date.op    ]?.value ?? '';

            const ngA = isNG_text(  atTxt,  normalizeOp('text',   aOp), aVal);
            const ngB = isNG_number(bt,     normalizeOp('number', bOp), bVal);
            const ngC = isNG_date(  ct,     normalizeOp('date',   cOp), cVal);

            const reasons = [];
            if (ngA) reasons.push(`a:${aOp}`);
            if (ngB) reasons.push(`b:${bOp}`);
            if (ngC) reasons.push(`c:${cOp}`);

            const result = (ngA || ngB || ngC) ? 'NG' : 'OK';
            const reason = reasons.join(' / ');

            const row = {};
            row[COL.scanAt] = { value: iso(new Date()) };
            row[COL.at]     = { value: atTxt };
            row[COL.bt]     = { value: bt };
            row[COL.ct]     = { value: ctIso };
            row[COL.result] = { value: result };
            row[COL.reason] = { value: reason };

            if ($st) $st.textContent = 'SAVING...';
            if ($in) $in.value = ''; // 先にクリア

            await appendRow(appId, recId, row);

            if ($st) $st.textContent = result === 'OK' ? 'OKで記録' : `NGで記録：${reason || '一致'}`;
            // すぐにはリロードせず、少し待ってから（拡張機能の干渉を避ける）
            setTimeout(() => { try { location.reload(); } catch (_) {} }, 80);

          } catch (e) {
            console.error('[TANA] keydown error:', e);
            if ($st) $st.textContent = 'ERROR: 保存失敗';
            alert('保存に失敗しました。ネットワークまたは権限をご確認ください。');
          } finally {
            busy = false;
          }
        }, { capture: true });
      }

    } catch (e) {
      console.error('[TANA] init error:', e);
      // ここで例外を飲み込み、必ず画面表示を継続
    }
    return event;
  });
})();
