/* TANA-OROSHI pc.js
   - scan_area に SCAN UI を表示（全レコード / 新規・編集両対応）
   - SCAN → サブテーブルに追記（複数理由を reason に出力）
   - 数値：全角/カンマ/負数 対応
   - 編集レコード：サーバーにも即反映＋$revision を更新して GAIA_UN03 防止
   - 新規レコード：画面だけに反映（保存時にまとめて登録）
   - DATEルール(d/dj)、TIMEルール(e/ej)、DATETIME(c/cj)の追加4条件対応
   - ルール用日付 d → dt（DATE 型）、ルール用時間 e → et（TIME 型）に転記
   - NEW: SCAN から「c 用日時」「d/e 用日時」を分離（1つ目と2つ目で使い分け）
   v=pc-ng-rules-2025-11-14-2
*/
(function () {
  'use strict';
  const VERSION = 'pc-ng-rules-2025-11-14-2';
  try {
    console.log('[TANA-OROSHI] pc.js loaded:', VERSION);
    window.__TANA_PC_VERSION = VERSION;
  } catch (_) {}

  // ---- 判定用フィールドコード ----
  const JUDGE = {
    text:   { value: 'a',  op: 'aj' },  // 文字
    number: { value: 'b',  op: 'bj' },  // 数値
    date:   { value: 'c',  op: 'cj' },  // 日時(DATETIME)
    // d/dj, e/ej は直接フィールドコードで参照
  };

  // ---- サブテーブル ----
  const TABLE = 'scan_table';
  const COL   = {
    scanAt: 'scan_at',
    at:     'at',
    bt:     'bt',
    ct:     'ct',   // c用の日時
    dt:     'dt',   // ルール用日付 d を転記
    et:     'et',   // ルール用時間 e を転記
    result: 'result',
    reason: 'reason'
  };

  // ---- サブテーブル列タイプ ----
  const FIELD_TYPES = {
    [COL.scanAt]: 'DATETIME',
    [COL.at]:     'SINGLE_LINE_TEXT',
    [COL.bt]:     'NUMBER',
    [COL.ct]:     'DATETIME',
    [COL.dt]:     'DATE',
    [COL.et]:     'TIME',
    [COL.result]: 'SINGLE_LINE_TEXT',
    [COL.reason]: 'MULTI_LINE_TEXT',
  };

  const SCAN_SPACE_ID = 'scan_area';

  // ===== Utils =====
  const $id = (id) => document.getElementById(id);
  const S   = (v) => (v == null ? '' : String(v));
  const iso = (d) => (d ? new Date(d).toISOString() : null);

  function normalizeNumberString(v) {
    const map = {
      '０':'0','１':'1','２':'2','３':'3','４':'4',
      '５':'5','６':'6','７':'7','８':'8','９':'9',
      '．':'.','－':'-','−':'-'
    };
    return S(v).replace(/[０-９．－−,]/g, ch => ch === ',' ? '' : (map[ch] ?? ch)).trim();
  }
  function toNumOrNull(v){
    const s = normalizeNumberString(v);
    if (!s || !/^-?\d+(?:\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function parseDateLoose(s){
    if (!s) return null;
    const t = S(s).trim();
    if (/^\d{8}$/.test(t)) { // 20251109
      const y=+t.slice(0,4), m=+t.slice(4,6)-1, d=+t.slice(6,8);
      const dt=new Date(y,m,d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const dt=new Date(t.replace(/\//g,'-'));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function dateKey(d) {
    const y = d.getFullYear();
    const m = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    return `${y}-${m}-${day}`;
  }
  function timeKey(d) {
    const h = ('0' + d.getHours()).slice(-2);
    const m = ('0' + d.getMinutes()).slice(-2);
    return `${h}:${m}`;
  }
  function timeToMinutes(str) {
    if (!str) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(S(str).trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    return h * 60 + min;
  }

  // ---- 判定ロジック ----
  const ok_text = (v, label, base) => {
    const s=S(v), b=S(base);
    if (!label || b==='') return true;
    const mode = String(label);
    if (mode.includes('まったく同じ') || mode.includes('完全一致') || mode==='==' || mode==='equals') return s===b;
    if (mode.includes('含む'))      return s.includes(b);
    if (mode.includes('含まない'))  return !s.includes(b);
    if ((mode.includes('前')&&mode.includes('一致'))) return s.startsWith(b);
    if ((mode.includes('後')&&mode.includes('一致'))) return s.endsWith(b);
    return true;
  };

  const ok_number = (scan, label, base) => {
    const s=toNumOrNull(scan), b=toNumOrNull(base);
    if (!label) return true;
    if (s==null || b==null) return false;
    const mode = String(label);
    if (mode.includes('同じ') || mode==='==' || mode==='equals') return s===b;
    if (mode.includes('異なる') || mode==='!=')                    return s!==b;
    if (mode.includes('以上') || mode.includes('>='))               return s>=b;
    if (mode.includes('以下') || mode.includes('<='))               return s<=b;
    if (mode.includes('未満') || mode==='<')                        return s< b;
    if (mode.includes('より大き') || mode==='>')                    return s> b;
    return true;
  };

  // c/cj 用（DATETIME）。追加4条件もここ
  const ok_date = (v, label, base) => {
    const sv = v instanceof Date ? v : parseDateLoose(v);
    const bv = base instanceof Date ? base : parseDateLoose(base);
    if (!label || !sv || !bv) return true;
    const mode = String(label).trim();

    const sd = dateKey(sv);
    const bd = dateKey(bv);
    const st = timeKey(sv);
    const bt = timeKey(bv);

    if (mode.includes('日付が同じ'))   return sd === bd;
    if (mode.includes('日付が異なる')) return sd !== bd;
    if (mode.includes('時間が同じ'))   return st === bt;
    if (mode.includes('時間が異なる')) return st !== bt;

    const s=sv.getTime(), b=bv.getTime();
    if (mode.includes('同じ') || mode==='==') return s===b;
    if (mode.includes('以外') || mode==='!=') return s!==b;
    if (mode.includes('以降') || mode.includes('>=')) return s>=b;
    if (mode.includes('以前') || mode.includes('<=')) return s<=b;
    return true;
  };

  // d/dj 用（DATE）
  function checkDateRule(scanDt, ruleDateStr, mode) {
    const res = { ok: true, reason: '' };
    if (!scanDt || !ruleDateStr || !mode) return res;

    const scanKey = dateKey(scanDt);
    const baseKey = S(ruleDateStr).trim();

    switch (mode) {
      case '同じ':
        res.ok = (scanKey === baseKey);
        break;
      case '以外':
        res.ok = (scanKey !== baseKey);
        break;
      case '以降':
        res.ok = (scanKey >= baseKey);
        break;
      case '以前':
        res.ok = (scanKey <= baseKey);
        break;
      default:
        return res;
    }
    if (!res.ok) {
      res.reason = `d:${mode} (scan:${scanKey}, base:${baseKey})`;
    }
    return res;
  }

  // e/ej 用（TIME）
  function checkTimeRule(scanDt, ruleTimeStr, mode) {
    const res = { ok: true, reason: '' };
    if (!scanDt || !ruleTimeStr || !mode) return res;

    const scanMinutes = timeToMinutes(timeKey(scanDt));
    const baseMinutes = timeToMinutes(S(ruleTimeStr).trim());
    if (scanMinutes == null || baseMinutes == null) return res;

    switch (mode) {
      case '同じ':
        res.ok = (scanMinutes === baseMinutes);
        break;
      case '以外':
        res.ok = (scanMinutes !== baseMinutes);
        break;
      case '以降':
        res.ok = (scanMinutes >= baseMinutes);
        break;
      case '以前':
        res.ok = (scanMinutes <= baseMinutes);
        break;
      default:
        return res;
    }
    if (!res.ok) {
      res.reason = `e:${mode} (scan:${timeKey(scanDt)}, base:${S(ruleTimeStr).trim()})`;
    }
    return res;
  }

  // ---- サーバーに1行追記 + $revision 更新 ----
  async function appendRowServer(appId, recId, rowValueOnly){
    const url = kintone.api.url('/k/v1/record.json', true);
    const { record } = await kintone.api(url,'GET',{ app:appId, id:recId });
    const curr = Array.isArray(record[TABLE]?.value) ? record[TABLE].value : [];
    const next = curr.concat([{ value: rowValueOnly }]);
    const putRes = await kintone.api(url,'PUT',{
      app: appId,
      id:  recId,
      record: { [TABLE]: { value: next } }
    });
    try {
      const appRec = kintone.app.record.get();
      if (appRec && appRec.record && appRec.record.$revision) {
        appRec.record.$revision.value = putRes.revision;
        kintone.app.record.set(appRec);
      }
    } catch (e) {
      console.warn('[TANA] failed to update revision:', e);
    }
  }

  // ---- 画面側サブテーブルに1行追加 ----
  function appendRowLocal(rowValueOnly){
    const appRec = kintone.app.record.get(); if(!appRec||!appRec.record) return;
    const rec = appRec.record;
    const curr = Array.isArray(rec[TABLE]?.value) ? rec[TABLE].value : [];

    const clientRow = {};
    Object.keys(rowValueOnly).forEach(code=>{
      const type = FIELD_TYPES[code] || 'SINGLE_LINE_TEXT';
      let val = rowValueOnly[code];
      if (type==='NUMBER'   && val!=='') val = String(val);
      if (type==='DATETIME' && val)      val = String(val);
      if (type==='DATE'     && val)      val = String(val);
      if (type==='TIME'     && val)      val = String(val);
      clientRow[code] = { type, value: val };
    });

    const next = curr.concat([{ value: clientRow }]);
    rec[TABLE] = { type: 'SUBTABLE', value: next };
    kintone.app.record.set({ record: rec });
  }

  // ---- SCAN を「文字 / 数値 / c用日時 / d,e用日時」に分解 ----
  function parseScan3(raw){
    const tokens = S(raw).trim().split(/\s+/).filter(Boolean);
    const at = tokens.shift() || '';
    const bt = tokens.length ? toNumOrNull(tokens.shift()) : null;

    let ct = null;   // c 用日時
    let ct2 = null;  // d,e 用日時（なければ null）

    const rest = tokens.slice();

    if (rest.length >= 4) {
      // パターン: ... YYYY-MM-DD HH:MM YYYY-MM-DD HH:MM
      const first  = rest[0] + ' ' + rest[1];
      const second = rest[2] + ' ' + rest[3];
      ct  = parseDateLoose(first);
      ct2 = parseDateLoose(second) || null;
    } else if (rest.length >= 2) {
      // パターン: ... YYYY-MM-DD HH:MM
      const first = rest[0] + ' ' + rest[1];
      ct = parseDateLoose(first);
    } else if (rest.length === 1) {
      // パターン: ... YYYY-MM-DD
      ct = parseDateLoose(rest[0]);
    }

    // 念のためのフォールバック（どれも取れなかった場合）
    if (!ct && rest.length > 0) {
      const all = rest.join(' ');
      const dAll = parseDateLoose(all);
      if (dAll) ct = dAll;
    }

    return { at, bt, ct, ct2 };
  }

  // ---- SCAN UI ----
  function mountScanUI(targetEl, placeTag){
    document.querySelectorAll('#tana-scan-wrap').forEach(n=>n.remove());
    const wrap=document.createElement('div');
    wrap.id='tana-scan-wrap';
    wrap.style.cssText='margin:8px 0;padding:8px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;';
    wrap.innerHTML=`
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <strong>SCAN</strong>
        <input id="tana-scan-input" type="text" autocomplete="off"
               placeholder="(文字) (数値) (日時c) (日時d/e) の順に入力 → Enter"
               style="flex:1;min-width:320px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;">
        <button id="tana-scan-clear" type="button" style="padding:6px 10px;">クリア</button>
        <span id="tana-scan-status" style="margin-left:8px;color:#64748b;">READY (${placeTag})</span>
      </div>`;
    targetEl.appendChild(wrap);
  }

  async function ensureScanUI() {
    const tryGetSpace = () => kintone.app.record.getSpaceElement?.(SCAN_SPACE_ID) || null;
    let anchor = tryGetSpace();
    let place = '';

    if (!anchor) {
      const start = performance.now();
      while (!anchor && performance.now() - start < 3000) {
        await new Promise(r => setTimeout(r, 50));
        anchor = tryGetSpace();
      }
    }
    if (anchor) { place='space:'+SCAN_SPACE_ID; mountScanUI(anchor, place); return; }

    const cjEl = kintone.app.record.getFieldElement?.(JUDGE.date.op);
    if (cjEl && cjEl.parentElement && cjEl.parentElement.parentElement) {
      const row=cjEl.parentElement.parentElement;
      const div=document.createElement('div');
      row.parentElement.insertBefore(div,row.nextSibling);
      place='after_cj';
      mountScanUI(div, place);
      return;
    }
    const tableEl = kintone.app.record.getFieldElement?.(TABLE);
    if (tableEl && tableEl.parentElement && tableEl.parentElement.parentElement) {
      const block=tableEl.parentElement.parentElement;
      const div=document.createElement('div');
      block.parentElement.insertBefore(div, block);
      place='before_table';
      mountScanUI(div, place);
      return;
    }
    const div=document.createElement('div');
    document.body.appendChild(div);
    place='body_fallback';
    mountScanUI(div, place);
  }

  const SHOW_EVENTS = ['app.record.edit.show', 'app.record.create.show'];

  kintone.events.on(SHOW_EVENTS, (event)=>{
    try{
      ensureScanUI();

      if (!window.__TANA_SCAN_BOUND__){
        window.__TANA_SCAN_BOUND__ = true;

        document.addEventListener('click',(ev)=>{
          const t=ev.target; if(!(t instanceof HTMLElement)) return;
          if (t.id==='tana-scan-clear'){
            const ip=$id('tana-scan-input'); if (ip) { ip.value=''; ip.focus(); }
            const st=$id('tana-scan-status'); if (st) st.textContent='READY';
          }
        }, true);

        document.addEventListener('keydown', async (ev)=>{
          const ip=$id('tana-scan-input');
          if (!ip || ev.target!==ip || ev.key!=='Enter') return;
          ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();

          const st=$id('tana-scan-status');
          const appId=kintone.app.getId?.();
          const recWrap=kintone.app.record.get();
          const rec=recWrap?.record || event.record;
          const recId = rec?.$id?.value;

          if (!appId || !rec) { if (st) st.textContent='ERROR: no app/record'; return; }

          try{
            const { at, bt, ct, ct2 } = parseScan3(ip.value);
            const scanDtForC  = ct;
            const scanDtForDE = ct2 || ct; // d/e 用は2つ目があればそちら、なければ c と同じ

            const atTxt=S(at);
            const btNum=bt;
            const ctIso=scanDtForC? iso(scanDtForC): null;

            const aVal = rec[JUDGE.text.value ]?.value ?? '';
            const aOp  = rec[JUDGE.text.op    ]?.value ?? '';
            const bVal = rec[JUDGE.number.value]?.value ?? '';
            const bOp  = rec[JUDGE.number.op   ]?.value ?? '';
            const cVal = rec[JUDGE.date.value ]?.value ?? '';
            const cOp  = rec[JUDGE.date.op    ]?.value ?? '';

            const dVal = rec.d?.value  ?? '';
            const dOp  = rec.dj?.value ?? '';
            const eVal = rec.e?.value  ?? '';
            const eOp  = rec.ej?.value ?? '';

            const okA = ok_text(atTxt, aOp, aVal);
            const okB = ok_number(btNum, bOp, bVal);
            const okC = ok_date(scanDtForC, cOp, cVal);

            const dResult = scanDtForDE ? checkDateRule(scanDtForDE, dVal, dOp) : { ok: true, reason: '' };
            const eResult = scanDtForDE ? checkTimeRule(scanDtForDE, eVal, eOp) : { ok: true, reason: '' };

            const reasons=[];
            if(!okA) reasons.push(`a:${aOp||'-'}`);
            if(!okB) reasons.push(`b:${bOp||'-'} (scan:${btNum==null?'null':String(btNum)}, base:${bVal==null?'null':normalizeNumberString(bVal)})`);
            if(!okC) reasons.push(`c:${cOp||'-'}`);
            if(!dResult.ok && dResult.reason) reasons.push(dResult.reason);
            if(!eResult.ok && eResult.reason) reasons.push(eResult.reason);

            const result = reasons.length ? 'NG' : 'OK';

            const rowValueOnly = {
              [COL.scanAt]: iso(new Date()),
              [COL.at]:     atTxt,
              [COL.bt]:     btNum==null? '' : String(btNum),
              [COL.ct]:     ctIso,
              [COL.dt]:     dVal || '',
              [COL.et]:     eVal || '',
              [COL.result]: result,
              [COL.reason]: reasons.join(' / ')
            };

            appendRowLocal(rowValueOnly);

            if (st) st.textContent = recId
              ? '判定→サーバー保存中…'
              : '判定→画面に仮保存（新規レコード）';

            ip.value='';

            if (recId) {
              try {
                await appendRowServer(appId, recId, rowValueOnly);
                if(st) st.textContent = result==='OK'
                  ? 'OKで記録'
                  : `NGで記録：${reasons.join(' / ')||'不一致'}`;
              } catch(e) {
                console.error('[TANA] put error:', e);
                if(st) st.textContent='ERROR: サーバー保存失敗（画面は仮表示）';
                alert('サーバー保存に失敗しました。通信状況をご確認ください。');
              }
            }

            setTimeout(()=>{ const s=$id('tana-scan-status'); if(s) s.textContent='READY'; }, 1500);

          }catch(e){
            console.error('[TANA] keydown error:', e);
            const st=$id('tana-scan-status'); if(st) st.textContent='ERROR: 処理失敗';
            alert('処理に失敗しました。');
          }
        }, true);
      }

      setTimeout(()=> $id('tana-scan-input')?.focus(), 0);

    }catch(e){ console.error('[TANA] init error:', e); }
    return event;
  });
})();
