/* TANA-OROSHI pc.js — SCANをscan_area内に固定 / OK条件方式・複数理由
   v=pc-ng-rules-2025-11-10-8 */
(function () {
  'use strict';
  const VERSION = 'pc-ng-rules-2025-11-10-8';
  try { console.log('[TANA-OROSHI] pc.js loaded:', VERSION); window.__TANA_PC_VERSION = VERSION; } catch(_) {}

  // ---- 判定フィールド（編集画面の上下ドロップ）----
  // 文字:a / 数値:b / 日時:c と そのオペレータ（aj,bj,cj）
  const JUDGE = {
    text:   { value: 'a',  op: 'aj' },
    number: { value: 'b',  op: 'bj' },
    date:   { value: 'c',  op: 'cj' },
  };

  // ---- サブテーブル定義 ----
  const TABLE = 'scan_table';
  const COL = {
    scanAt: 'scan_at',
    at:     'at',   // ★修正: ここが 'a' ではなく 'at'
    bt:     'bt',   // ★修正: ここが 'b' ではなく 'bt'
    ct:     'ct',
    result: 'result',
    reason: 'reason',
  };

  // SCAN を差し込むフィールド（スペーサ等）※この場所に固定表示
  const SCAN_ANCHOR = 'scan_area';

  // ===== utils =====
  const $id = (id) => document.getElementById(id);
  const iso = (d) => (d ? new Date(d).toISOString() : null);
  const S = (v) => (v==null ? '' : String(v));
  const toNumOrNull = (v)=>{
    const s = S(v).trim();
    if (!s) return null;
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  };
  function parseDateLoose(s){
    if (!s) return null;
    const str = S(s).trim();
    if (/^\d{8}$/.test(str)) {
      const y=+str.slice(0,4), m=+str.slice(4,6)-1, d=+str.slice(6,8);
      const dt=new Date(y,m,d);
      return Number.isNaN(dt.getTime())?null:dt;
    }
    const dt=new Date(str.replace(/\//g,'-'));
    return Number.isNaN(dt.getTime())?null:dt;
  }

  function normalizeOp(kind, s){
    const t=(s||'').trim();
    if (kind==='text'){
      if (['まったく同じ','完全一致','==','equals'].includes(t)) return 'eq';
      if (['含む','contains'].includes(t)) return 'contains';
      if (['含まない','notContains'].includes(t)) return 'notContains';
      if (['前部一致','前方一致','startsWith'].includes(t)) return 'starts';
      if (['後部一致','後方一致','endsWith'].includes(t)) return 'ends';
      return '';
    }
    if (kind==='number'){
      if (['同じ','==','equals'].includes(t)) return 'eq';
      if (['異なる','!=','not'].includes(t)) return 'ne';
      if (['以上','>='].includes(t)) return 'gte';
      if (['以下','<='].includes(t)) return 'lte';
      if (['未満','<'].includes(t))  return 'lt';
      if (['より大きい','>','超'].includes(t)) return 'gt';
      return '';
    }
    if (kind==='date'){
      if (['同じ','=='].includes(t)) return 'eq';
      if (['以外','!='].includes(t)) return 'ne';
      if (['以降','>='].includes(t)) return 'gte';
      if (['以前','<='].includes(t)) return 'lte';
      return '';
    }
    return '';
  }

  // 「OK条件」を満たさないとNGにする
  const ok_text=(v,op,base)=>{
    const s=S(v), b=S(base);
    if(!op||b==='') return true;
    if(op==='eq') return s===b;
    if(op==='contains') return s.includes(b);
    if(op==='notContains') return !s.includes(b);
    if(op==='starts') return s.startsWith(b);
    if(op==='ends') return s.endsWith(b);
    return true;
  };
  const ok_number=(v,op,base)=>{
    const s=toNumOrNull(v), b=toNumOrNull(base);
    if(!op||b==null||s==null) return true;
    if(op==='eq')  return s===b;
    if(op==='ne')  return s!==b;
    if(op==='gte') return s>=b;
    if(op==='lte') return s<=b;
    if(op==='lt')  return s< b;
    if(op==='gt')  return s> b;
    return true;
  };
  const ok_date=(v,op,base)=>{
    const sv = v instanceof Date ? v : parseDateLoose(v);
    const bv = base instanceof Date ? base : parseDateLoose(base);
    if(!op||!sv||!bv) return true;
    const s=sv.getTime(), b=bv.getTime();
    if(op==='eq')  return s===b;
    if(op==='ne')  return s!==b;
    if(op==='gte') return s>=b; // 以降
    if(op==='lte') return s<=b; // 以前
    return true;
  };

  // API: 現レコード取得→行追加（value-onlyでOK）
  async function appendRow(appId, recId, rowValueOnly){
    const url=kintone.api.url('/k/v1/record.json', true);
    const {record}=await kintone.api(url,'GET',{app:appId,id:recId});
    const curr=Array.isArray(record[TABLE]?.value)?record[TABLE].value:[];
    const next=curr.concat([{value:rowValueOnly}]);
    await kintone.api(url,'PUT',{app:appId,id:recId,record:{[TABLE]:{value:next}}});
  }

  // SCAN 文字列 → 3要素
  function parseScan3(raw){
    const a=S(raw).trim().split(/\s+/).filter(Boolean);
    return {
      at: a[0]||'',
      bt: a.length>1? toNumOrNull(a[1]) : null,
      ct: a.length>2? parseDateLoose(a[2]) : null,
    };
  }

  // SCAN UI を scan_area フィールド「内側」に描画
  function ensureScanUI(){
    const anchor = kintone.app.record.getFieldElement?.(SCAN_ANCHOR);
    if (!anchor) return;
    // アンカー内を置き換え（この場所に固定される）
    anchor.innerHTML = '';
    const wrap=document.createElement('div');
    wrap.id='tana-scan-wrap';
    wrap.style.cssText='padding:8px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;';
    wrap.innerHTML=`
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <strong>SCAN</strong>
        <input id="tana-scan-input" type="text" autocomplete="off"
          placeholder="(文字) (数値) (日時) の順に入力 → Enter"
          style="flex:1;min-width:320px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;">
        <button id="tana-scan-clear" type="button" style="padding:6px 10px;">クリア</button>
        <span id="tana-scan-status" style="margin-left:8px;color:#64748b;">READY</span>
      </div>`;
    anchor.appendChild(wrap);
  }

  kintone.events.on('app.record.edit.show', (event)=>{
    try{
      ensureScanUI();

      if(!window.__TANA_SCAN_BOUND__){
        window.__TANA_SCAN_BOUND__=true;

        document.addEventListener('click',(ev)=>{
          const t=ev.target;
          if(!(t instanceof HTMLElement)) return;
          if(t.id==='tana-scan-clear'){
            const ip=$id('tana-scan-input'); if(ip){ ip.value=''; ip.focus(); }
            const st=$id('tana-scan-status'); if(st) st.textContent='READY';
          }
        },true);

        document.addEventListener('keydown', async (ev)=>{
          const ip=$id('tana-scan-input');
          if(!ip || ev.target!==ip || ev.key!=='Enter') return;
          ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();

          const st=$id('tana-scan-status');
          const appId=kintone.app.getId?.();
          const recAll=kintone.app.record.get();
          const rec=recAll?.record || event.record;
          const recId=rec?.$id?.value || kintone.app.record.getId?.();
          if(!appId||!rec||!recId){ if(st) st.textContent='ERROR: no app/record'; return; }

          try{
            const raw=ip.value;
            const parsed=parseScan3(raw);
            const atTxt=S(parsed.at);
            const btNum=parsed.bt; // 数値
            const ctIso=parsed.ct? iso(parsed.ct): null;

            // OK条件を取得
            const aVal=rec[JUDGE.text.value ]?.value ?? '';
            const aOp =rec[JUDGE.text.op    ]?.value ?? '';
            const bVal=rec[JUDGE.number.value]?.value ?? '';
            const bOp =rec[JUDGE.number.op   ]?.value ?? '';
            const cVal=rec[JUDGE.date.value ]?.value ?? '';
            const cOp =rec[JUDGE.date.op    ]?.value ?? '';

            const okA=ok_text(  atTxt, normalizeOp('text',   aOp), aVal);
            const okB=ok_number(btNum, normalizeOp('number', bOp), bVal);
            const okC=ok_date(  parsed.ct, normalizeOp('date',   cOp), cVal);

            const reasons=[];
            if(!okA) reasons.push(`a:${aOp||'-'}`);
            if(!okB) reasons.push(`b:${bOp||'-'}`);
            if(!okC) reasons.push(`c:${cOp||'-'}`);

            const result=reasons.length? 'NG':'OK';

            // value-only 形式
            const row={};
            row[COL.scanAt]={ value: iso(new Date()) };
            row[COL.at]    ={ value: atTxt };
            row[COL.bt]    ={ value: btNum==null? '' : String(btNum) }; // ★数値は文字列で安定
            row[COL.ct]    ={ value: ctIso };
            row[COL.result]={ value: result };
            row[COL.reason]={ value: reasons.join(' / ') };

            if(st) st.textContent='SAVING...';
            ip.value='';

            await appendRow(appId, recId, row);

            if(st) st.textContent= result==='OK' ? 'OKで記録' : `NGで記録：${reasons.join(' / ')||'不一致'}`;
            // 表示を最新化
            setTimeout(()=>{ try{ location.reload(); }catch(_){ } }, 80);

          }catch(e){
            console.error('[TANA] keydown error:', e);
            if(st) st.textContent='ERROR: 保存失敗';
            alert('保存に失敗しました。');
          }
        },true);
      }

      setTimeout(()=> $id('tana-scan-input')?.focus(), 0);

    }catch(e){ console.error('[TANA] init error:', e); }
    return event;
  });
})();
