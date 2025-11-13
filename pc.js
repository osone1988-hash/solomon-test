/* TANA-OROSHI pc.js — scan_area固定 / 数値ラベル直判定 / 理由に値併記 / 自動リロード廃止
   v=pc-ng-rules-2025-11-10-13 */
(function () {
  'use strict';
  const VERSION = 'pc-ng-rules-2025-11-10-13';
  try { console.log('[TANA-OROSHI] pc.js loaded:', VERSION); window.__TANA_PC_VERSION = VERSION; } catch(_) {}

  // ---- 判定フィールド ----
  const JUDGE = {
    text:   { value: 'a',  op: 'aj' }, // 文字
    number: { value: 'b',  op: 'bj' }, // 数値
    date:   { value: 'c',  op: 'cj' }, // 日時
  };

  // ---- サブテーブル ----
  const TABLE = 'scan_table';
  const COL   = { scanAt:'scan_at', at:'at', bt:'bt', ct:'ct', result:'result', reason:'reason' };

  // ---- SCAN を表示する Space の要素ID ----
  const SCAN_SPACE_ID = 'scan_area';

  // ===== Utils =====
  const $id = (id) => document.getElementById(id);
  const S   = (v) => (v == null ? '' : String(v));
  const iso = (d) => (d ? new Date(d).toISOString() : null);

  function toNumOrNull(v){
    const s = S(v).trim();
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

  // 「OK条件」を満たさなければ NG（テキスト/数値/日時）
  const ok_text = (v, label, base) => {
    const s=S(v), b=S(base);
    if (!label || b==='') return true;
    if (label.includes('まったく同じ') || label.includes('完全一致') || label==='==' || label==='equals') return s===b;
    if (label.includes('含む'))      return s.includes(b);
    if (label.includes('含まない'))  return !s.includes(b);
    if ((label.includes('前')&&label.includes('一致'))) return s.startsWith(b);
    if ((label.includes('後')&&label.includes('一致'))) return s.endsWith(b);
    return true;
  };
  const ok_number = (scan, label, base) => {
    const s=toNumOrNull(scan), b=toNumOrNull(base);
    if (!label) return true;
    if (s==null || b==null) return false; // ★値取れない時はNG
    if (label.includes('同じ') || label==='==' || label==='equals') return s===b;
    if (label.includes('異なる') || label==='!=')                    return s!==b;
    if (label.includes('以上') || label.includes('>='))               return s>=b;
    if (label.includes('以下') || label.includes('<='))               return s<=b;
    if (label.includes('未満') || label==='<')                        return s< b;
    if (label.includes('より大き') || label==='>')                    return s> b;
    return true;
  };
  const ok_date = (v, label, base) => {
    const sv = v instanceof Date ? v : parseDateLoose(v);
    const bv = base instanceof Date ? base : parseDateLoose(base);
    if (!label || !sv || !bv) return true;
    const s=sv.getTime(), b=bv.getTime();
    if (label.includes('同じ') || label==='==') return s===b;
    if (label.includes('以外') || label==='!=') return s!==b;
    if (label.includes('以降') || label.includes('>=')) return s>=b;
    if (label.includes('以前') || label.includes('<=')) return s<=b;
    return true;
  };

  async function putRowAndRefreshView(appId, recId, rowValueOnly){
    // 現在のレコード取得
    const url = kintone.api.url('/k/v1/record.json', true);
    const { record } = await kintone.api(url,'GET',{ app:appId, id:recId });

    // 1行追加（value-only）
    const curr = Array.isArray(record[TABLE]?.value) ? record[TABLE].value : [];
    const next = curr.concat([{ value: rowValueOnly }]);
    await kintone.api(url,'PUT',{ app:appId, id:recId, record: { [TABLE]: { value: next } } });

    // 反映用に再取得 → 画面へ反映（ページリロードなし）
    const res2 = await kintone.api(url,'GET',{ app:appId, id:recId });
    kintone.app.record.set({ record: res2.record });
  }

  // 入力: 文字 数値 日時…以降は結合（例: "2025-11-09 09:00"）
  function parseScan3(raw){
    const a = S(raw).trim().split(/\s+/).filter(Boolean);
    const at = a.shift() || '';
    const bt = toNumOrNull(a[0]); if (a.length) a.shift();
    const ct = a.length ? parseDateLoose(a.join(' ')) : null;
    return { at, bt, ct };
  }

  // ---- SCAN UI（scan_area 最優先）----
  function ensureScanUI(){
    document.querySelectorAll('#tana-scan-wrap').forEach(n=>n.remove()); // 複製防止
    const wrap=document.createElement('div');
    wrap.id='tana-scan-wrap';
    wrap.style.cssText='margin:8px 0;padding:8px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;';
    wrap.innerHTML=`
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <strong>SCAN</strong>
        <input id="tana-scan-input" type="text" autocomplete="off"
               placeholder="(文字) (数値) (日時) の順に入力 → Enter"
               style="flex:1;min-width:320px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;">
        <button id="tana-scan-clear" type="button" style="padding:6px 10px;">クリア</button>
        <span id="tana-scan-status" style="margin-left:8px;color:#64748b;">READY</span>
      </div>`;

    const space = kintone.app.record.getSpaceElement?.(SCAN_SPACE_ID);
    if (space) { space.innerHTML=''; space.appendChild(wrap); return 'space:'+SCAN_SPACE_ID; }

    const cjEl = kintone.app.record.getFieldElement?.(JUDGE.date.op);
    if (cjEl && cjEl.parentElement && cjEl.parentElement.parentElement) {
      const row=cjEl.parentElement.parentElement;
      row.parentElement.insertBefore(wrap,row.nextSibling);
      return 'after_cj';
    }

    const tableEl = kintone.app.record.getFieldElement?.(TABLE);
    if (tableEl && tableEl.parentElement && tableEl.parentElement.parentElement) {
      const block = tableEl.parentElement.parentElement;
      block.parentElement.insertBefore(wrap, block);
      return 'before_table';
    }

    document.body.appendChild(wrap);
    return 'body_fallback';
  }

  kintone.events.on('app.record.edit.show', (event)=>{
    try{
      const where = ensureScanUI();
      const st0 = $id('tana-scan-status'); if (st0) st0.textContent = `READY (${where})`;

      if (!window.__TANA_SCAN_BOUND__){
        window.__TANA_SCAN_BOUND__ = true;

        document.addEventListener('click',(ev)=>{
          const t=ev.target; if(!(t instanceof HTMLElement)) return;
          if (t.id==='tana-scan-clear'){
            const ip=$id('tana-scan-input'); if (ip) { ip.value=''; ip.focus(); }
            const st=$id('tana-scan-status'); if (st) st.textContent='READY';
          }
        },true);

        document.addEventListener('keydown', async (ev)=>{
          const ip=$id('tana-scan-input');
          if (!ip || ev.target!==ip || ev.key!=='Enter') return;
          ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();

          const st=$id('tana-scan-status');
          const appId=kintone.app.getId?.();
          const recWrap=kintone.app.record.get();
          const rec=recWrap?.record || event.record;
          const recId=rec?.$id?.value || kintone.app.record.getId?.();
          if (!appId || !rec || !recId) { if (st) st.textContent='ERROR: no app/record'; return; }

          try{
            const { at, bt, ct } = parseScan3(ip.value);
            const atTxt=S(at);
            const btNum=bt;
            const ctIso=ct? iso(ct): null;

            // 画面上の条件値
            const aVal = rec[JUDGE.text.value ]?.value ?? '';
            const aOp  = rec[JUDGE.text.op    ]?.value ?? '';
            const bVal = rec[JUDGE.number.value]?.value ?? '';
            const bOp  = rec[JUDGE.number.op   ]?.value ?? '';
            const cVal = rec[JUDGE.date.value ]?.value ?? '';
            const cOp  = rec[JUDGE.date.op    ]?.value ?? '';

            // 判定
            const okA = ok_text(atTxt, aOp, aVal);
            const okB = ok_number(btNum, bOp, bVal);
            const okC = ok_date(ct, cOp, cVal);

            const reasons=[];
            if(!okA) reasons.push(`a:${aOp||'-'}`);
            if(!okB) reasons.push(`b:${bOp||'-'} (scan:${btNum==null?'null':String(btNum)}, base:${bVal==null?'null':String(bVal)})`);
            if(!okC) reasons.push(`c:${cOp||'-'}`);

            const result=reasons.length? 'NG':'OK';

            // value-only 行
            const row={};
            row[COL.scanAt]={ value: iso(new Date()) };
            row[COL.at]    ={ value: atTxt };
            row[COL.bt]    ={ value: btNum==null? '' : String(btNum) };
            row[COL.ct]    ={ value: ctIso };
            row[COL.result]={ value: result };
            row[COL.reason]={ value: reasons.join(' / ') };

            if(st) st.textContent = `判定中…  a:[${aOp}] b:[${bOp}] c:[${cOp}]`;

            ip.value='';

            // 保存 → 画面データを差し替え（ページリロードなし）
            await putRowAndRefreshView(appId, recId, row);

            if(st) st.textContent = result==='OK'
              ? 'OKで記録'
              : `NGで記録：${reasons.join(' / ')||'不一致'}`;
            setTimeout(()=>{ const s=$id('tana-scan-status'); if(s) s.textContent=`READY (${where})`; }, 1500);

          }catch(e){
            console.error('[TANA] keydown error:', e);
            const st=$id('tana-scan-status'); if(st) st.textContent='ERROR: 保存失敗';
            alert('保存に失敗しました。');
          }
        }, true);
      }

      setTimeout(()=> $id('tana-scan-input')?.focus(), 0);

    }catch(e){ console.error('[TANA] init error:', e); }
    return event;
  });
})();
