/* TANA-OROSHI pc.js — SCANをscan_areaに固定 / 数値判定強化 / 複数理由
   v=pc-ng-rules-2025-11-10-11 */
(function () {
  'use strict';
  const VERSION = 'pc-ng-rules-2025-11-10-11';
  try { console.log('[TANA-OROSHI] pc.js loaded:', VERSION); window.__TANA_PC_VERSION = VERSION; } catch(_) {}

  // ---- 判定フィールド ----
  const JUDGE = {
    text:   { value: 'a',  op: 'aj' },
    number: { value: 'b',  op: 'bj' },
    date:   { value: 'c',  op: 'cj' },
  };

  // ---- サブテーブル ----
  const TABLE = 'scan_table';
  const COL = {
    scanAt: 'scan_at',
    at:     'at',   // 文字列
    bt:     'bt',   // 数値（value-onlyでは文字列で投入）
    ct:     'ct',   // 日時 ISO
    result: 'result',
    reason: 'reason',
  };

  // SCAN を入れるスペースの要素ID
  const SCAN_SPACE_ID = 'scan_area';

  // ===== utils =====
  const $id = (id) => document.getElementById(id);
  const S = (v) => (v == null ? '' : String(v));
  const iso = (d) => (d ? new Date(d).toISOString() : null);

  // 全角/カンマ対応の数値正規化
  function normalizeDigitsStr(s) {
    const map = { '０':'0','１':'1','２':'2','３':'3','４':'4','５':'5','６':'6','７':'7','８':'8','９':'9','．':'.','－':'-' };
    return S(s).replace(/[０-９．－,]/g, ch => (ch === ',' ? '' : (map[ch] ?? ch))).trim();
  }
  function toNumOrNull(v) {
    const t = normalizeDigitsStr(v);
    if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function parseDateLoose(s) {
    if (!s) return null;
    const str = S(s).trim();
    if (/^\d{8}$/.test(str)) {
      const y = +str.slice(0,4), m = +str.slice(4,6)-1, d = +str.slice(6,8);
      const dt = new Date(y,m,d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const dt = new Date(str.replace(/\//g,'-'));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function normalizeOp(kind, s) {
    const t = (s || '').trim();
    if (kind === 'text') {
      if (/^(まったく同じ|完全一致|==|equals)$/u.test(t)) return 'eq';
      if (/^(含む|contains)$/u.test(t)) return 'contains';
      if (/^(含まない|notContains)$/u.test(t)) return 'notContains';
      if (/^(前部一致|前方一致|startsWith)$/u.test(t)) return 'starts';
      if (/^(後部一致|後方一致|endsWith)$/u.test(t)) return 'ends';
      return '';
    }
    if (kind === 'number') {
      if (/^(同じ|==|equals)$/u.test(t))  return 'eq';
      if (/^(異なる|!=|not)$/u.test(t))  return 'ne';
      if (/^(以上|>=|≧)$/u.test(t))      return 'gte';
      if (/^(以下|<=|≦)$/u.test(t))      return 'lte';
      if (/^(未満|<)$/u.test(t))         return 'lt';
      if (/^(より大きい|>|超)$/u.test(t))return 'gt';
      return '';
    }
    if (kind === 'date') {
      if (/^(同じ|==)$/u.test(t)) return 'eq';
      if (/^(以外|!=)$/u.test(t)) return 'ne';
      if (/^(以降|>=)$/u.test(t)) return 'gte';
      if (/^(以前|<=)$/u.test(t)) return 'lte';
      return '';
    }
    return '';
  }

  // 「OK条件」を満たさないと NG（数値は不正値もNG）
  const ok_text = (v, op, base) => {
    const s=S(v), b=S(base); if(!op || b==='') return true;
    if(op==='eq') return s===b;
    if(op==='contains') return s.includes(b);
    if(op==='notContains') return !s.includes(b);
    if(op==='starts') return s.startsWith(b);
    if(op==='ends')   return s.endsWith(b);
    return true;
  };
  const ok_number = (v, op, base) => {
    if (!op) return true;
    const s = toNumOrNull(v);
    const b = toNumOrNull(base);
    if (s == null || b == null) return false; // ★不正値はNG扱い
    if(op==='eq')  return s===b;
    if(op==='ne')  return s!==b;
    if(op==='gte') return s>=b;
    if(op==='lte') return s<=b;
    if(op==='lt')  return s< b;
    if(op==='gt')  return s> b;
    return true;
  };
  const ok_date = (v, op, base) => {
    const sv = v instanceof Date ? v : parseDateLoose(v);
    const bv = base instanceof Date ? base : parseDateLoose(base);
    if(!op || !sv || !bv) return true;
    const s = sv.getTime(), b = bv.getTime();
    if(op==='eq')  return s===b;
    if(op==='ne')  return s!==b;
    if(op==='gte') return s>=b; // 以降
    if(op==='lte') return s<=b; // 以前
    return true;
  };

  async function appendRow(appId, recId, rowValueOnly) {
    const url = kintone.api.url('/k/v1/record.json', true);
    const { record } = await kintone.api(url, 'GET', { app: appId, id: recId });
    const curr = Array.isArray(record[TABLE]?.value) ? record[TABLE].value : [];
    const next = curr.concat([{ value: rowValueOnly }]);
    await kintone.api(url, 'PUT', { app: appId, id: recId, record: { [TABLE]: { value: next } } });
  }

  function parseScan3(raw) {
    const a = S(raw).trim().split(/\s+/).filter(Boolean);
    return {
      at: a[0] || '',
      bt: a.length > 1 ? toNumOrNull(a[1]) : null,
      ct: a.length > 2 ? parseDateLoose(a[2]) : null, // 4語目が時刻なら無視（暫定仕様）
    };
  }

  // -------- SCAN UI の描画（scan_area が最優先） --------
  function ensureScanUI() {
    // 既存UIを完全除去（増殖対策）
    document.querySelectorAll('#tana-scan-root').forEach(n => n.remove());

    let anchor = null;
    let place = '';

    // 1) スペース要素（要素ID）を最優先
    try {
      anchor = kintone.app.record.getSpaceElement?.(SCAN_SPACE_ID) || null;
      if (anchor) place = 'scan_area';
    } catch (_) {}

    // 2) 取れなければ cj の直後
    if (!anchor) {
      const cjEl = kintone.app.record.getFieldElement?.(JUDGE.date.op);
      if (cjEl && cjEl.parentElement && cjEl.parentElement.parentElement) {
        const row = cjEl.parentElement.parentElement;
        anchor = document.createElement('div');
        row.parentElement.insertBefore(anchor, row.nextSibling);
        place = 'after_cj';
      }
    }

    // 3) さらにダメなら json_config の直前
    if (!anchor) {
      const jsonEl = kintone.app.record.getFieldElement?.('json_config');
      if (jsonEl && jsonEl.parentElement && jsonEl.parentElement.parentElement) {
        anchor = document.createElement('div');
        jsonEl.parentElement.parentElement.insertBefore(anchor, jsonEl.parentElement);
        place = 'before_json_config';
      }
    }

    // 4) 最後の手段：body 末尾
    if (!anchor) {
      anchor = document.createElement('div');
      document.body.appendChild(anchor);
      place = 'body_fallback';
    }

    // UI 描画
    const root = document.createElement('div');
    root.id = 'tana-scan-root';
    root.style.cssText = 'margin:8px 0;padding:8px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;';
    root.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <strong>SCAN</strong>
        <input id="tana-scan-input" type="text" autocomplete="off"
          placeholder="(文字) (数値) (日時) の順に入力 → Enter"
          style="flex:1;min-width:320px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;">
        <button id="tana-scan-clear" type="button" style="padding:6px 10px;">クリア</button>
        <span id="tana-scan-status" style="margin-left:8px;color:#64748b;">READY (${place})</span>
      </div>`;
    anchor.appendChild(root);
  }

  // -------- 画面イベント --------
  kintone.events.on('app.record.edit.show', (event) => {
    try {
      ensureScanUI();

      if (!window.__TANA_SCAN_BOUND__) {
        window.__TANA_SCAN_BOUND__ = true;

        document.addEventListener('click', (ev) => {
          const t = ev.target;
          if (!(t instanceof HTMLElement)) return;
          if (t.id === 'tana-scan-clear') {
            const ip = $id('tana-scan-input');
            if (ip) { ip.value = ''; ip.focus(); }
            const st = $id('tana-scan-status'); if (st) st.textContent = 'READY';
          }
        }, true);

        document.addEventListener('keydown', async (ev) => {
          const ip = $id('tana-scan-input');
          if (!ip || ev.target !== ip || ev.key !== 'Enter') return;
          ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();

          const st = $id('tana-scan-status');
          const appId = kintone.app.getId?.();
          const recWrap = kintone.app.record.get();
          const rec = recWrap?.record || event.record;
          const recId = rec?.$id?.value || kintone.app.record.getId?.();
          if (!appId || !rec || !recId) { if (st) st.textContent = 'ERROR: no app/record'; return; }

          try {
            const raw = ip.value;
            const parsed = parseScan3(raw);
            const atTxt = S(parsed.at);
            const btNum = parsed.bt;
            const ctIso = parsed.ct ? iso(parsed.ct) : null;

            // OK条件取得
            const aVal = rec[JUDGE.text.value ]?.value ?? '';
            const aOp  = rec[JUDGE.text.op    ]?.value ?? '';
            const bVal = rec[JUDGE.number.value]?.value ?? '';
            const bOp  = rec[JUDGE.number.op   ]?.value ?? '';
            const cVal = rec[JUDGE.date.value ]?.value ?? '';
            const cOp  = rec[JUDGE.date.op    ]?.value ?? '';

            const okA = ok_text(  atTxt,  normalizeOp('text',   aOp), aVal);
            const okB = ok_number(btNum,   normalizeOp('number', bOp), bVal);
            const okC = ok_date(  parsed.ct, normalizeOp('date',   cOp), cVal);

            const reasons = [];
            if (!okA) reasons.push(`a:${aOp||'-'}`);
            if (!okB) reasons.push(`b:${bOp||'-'}`);
            if (!okC) reasons.push(`c:${cOp||'-'}`);

            const result = reasons.length ? 'NG' : 'OK';

            const row = {};
            row[COL.scanAt] = { value: iso(new Date()) };
            row[COL.at]     = { value: atTxt };
            row[COL.bt]     = { value: btNum == null ? '' : String(btNum) };
            row[COL.ct]     = { value: ctIso };
            row[COL.result] = { value: result };
            row[COL.reason] = { value: reasons.join(' / ') };

            if (st) st.textContent = 'SAVING...';
            ip.value = '';

            await appendRow(appId, recId, row);

            if (st) st.textContent = result === 'OK' ? 'OKで記録' : `NGで記録：${reasons.join(' / ') || '不一致'}`;
            setTimeout(() => { try { location.reload(); } catch (_) {} }, 80);

          } catch (e) {
            console.error('[TANA] keydown error:', e);
            const st = $id('tana-scan-status'); if (st) st.textContent = 'ERROR: 保存失敗';
            alert('保存に失敗しました。');
          }
        }, true);
      }

      setTimeout(() => $id('tana-scan-input')?.focus(), 0);
    } catch (e) {
      console.error('[TANA] init error:', e);
    }
    return event;
  });
})();
