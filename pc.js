/* TANA-OROSHI pc.js — SCANを Space(scan_area) へ固定 / OK条件方式・複数理由 / 重複防止
   数値(b)の値取得をフォールバックで強化
   v=pc-ng-rules-2025-11-10-12 */
(function () {
  'use strict';
  const VERSION = 'pc-ng-rules-2025-11-10-12';
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
  const iso = (d) => (d ? new Date(d).toISOString() : null);
  const S   = (v) => (v==null ? '' : String(v).trim());

  function toNumOrNull(v){
    const s=S(v);
    if (!s) return null;
    if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function parseDateLoose(s){
    if (!s) return null;
    const str=S(s);
    if (/^\d{8}$/.test(str)) { // 20251109
      const y=+str.slice(0,4), m=+str.slice(4,6)-1, d=+str.slice(6,8);
      const dt=new Date(y,m,d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const dt=new Date(str.replace(/\//g,'-'));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // ---- 演算子の正規化（日本語/記号/英語コード 全対応）----
  function normalizeOp(kind, raw){
    const t0 = (raw || '').trim();
    const t  = t0.toLowerCase().replace(/\s+/g,'');
    if (kind==='text'){
      const map = {
        '==':'eq','equals':'eq','まったく同じ':'eq','完全一致':'eq',
        'contains':'contains','含む':'contains',
        'notcontains':'notContains','含まない':'notContains',
        'startswith':'starts','前方一致':'starts','前部一致':'starts',
        'endswith':'ends','後方一致':'ends','後部一致':'ends'
      };
      return map[t] || '';
    }
    if (kind==='number'){
      const map = {
        '==':'eq','equals':'eq','eq':'eq','同じ':'eq',
        '!=':'ne','notequals':'ne','ne':'ne','異なる':'ne',
        '>=':'gte','≧':'gte','gte':'gte','以上':'gte',
        '<=':'lte','≦':'lte','lte':'lte','以下':'lte',
        '<':'lt','lt':'lt','未満':'lt',
        '>':'gt','gt':'gt','より大きい':'gt'
      };
      return map[t] || '';
    }
    if (kind==='date'){
      const map = {
        '==':'eq','eq':'eq','同じ':'eq',
        '!=':'ne','ne':'ne','以外':'ne',
        '>=':'gte','gte':'gte','以降':'gte',
        '<=':'lte','lte':'lte','以前':'lte'
      };
      return map[t] || '';
    }
    return '';
  }

  // 「OK条件」を満たさなければ NG
  const ok_text=(v,op,base)=>{
    const s=S(v), b=S(base);
    if(!op||b==='') return true;
    if(op==='eq') return s===b;
    if(op==='contains') return s.includes(b);
    if(op==='notContains') return !s.includes(b);
    if(op==='starts') return s.startsWith(b);
    if(op==='ends')   return s.endsWith(b);
    return true;
  };
  const ok_number=(v,op,base)=>{
    const s=toNumOrNull(v), b=toNumOrNull(base);
    if(!op) return true;
    if(b==null || s==null) return false; // ★ どちらか欠落は NG とする（設定漏れや取得失敗を顕在化）
    if(op==='eq')  return s===b;
    if(op==='ne')  return s!==b;
    if(op==='gte') return s>=b; // 以上
    if(op==='lte') return s<=b; // 以下
    if(op==='lt')  return s< b; // 未満
    if(op==='gt')  return s> b; // より大きい
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

  // ---- b の値を堅牢に取得（rec.b → 無ければ最初の NUMBER フィールド）----
  function resolveRuleNumberValue(rec){
    // 1) 指定コード
    const direct = rec[JUDGE.number.value]?.value;
    if (S(direct) !== '') return { code: JUDGE.number.value, value: direct };

    // 2) フォールバック：トップレベルの NUMBER を走査（サブテーブル除外）
    for (const [code, f] of Object.entries(rec)) {
      if (!f || code === TABLE) continue; // サブテーブル避け
      if (f.type === 'NUMBER' && S(f.value) !== '') {
        return { code, value: f.value };
      }
    }
    return { code: JUDGE.number.value, value: '' }; // 取得失敗
  }

  async function appendRow(appId, recId, rowValueOnly){
    const url=kintone.api.url('/k/v1/record.json', true);
    const {record}=await kintone.api(url,'GET',{app:appId,id:recId});
    const curr=Array.isArray(record[TABLE]?.value)?record[TABLE].value:[];
    const next=curr.concat([{value:rowValueOnly}]);
    await kintone.api(url,'PUT',{app:appId,id:recId,record:{[TABLE]:{value:next}}});
  }

  // 入力: 文字 数値 日時…以降は結合
  function parseScan3(raw){
    const a=S(raw).split(/\s+/).filter(Boolean);
    const at=a[0]||'';
    const bt=a.length>1? toNumOrNull(a[1]) : null;
    const dt=a.length>2? parseDateLoose(a.slice(2).join(' ')) : null;
    return {at, bt, ct:dt};
  }

  // ---- SCAN UI（scan_area 最優先）----
  function ensureScanUI(){
    document.querySelectorAll('#tana-scan-wrap').forEach(n=>n.remove()); // 重複防止

    let anchor = kintone.app.record.getSpaceElement?.(SCAN_SPACE_ID);
    let place = 'space:'+SCAN_SPACE_ID;

    if (!anchor) {
      const cjEl = kintone.app.record.getFieldElement?.(JUDGE.date.op);
      if (cjEl && cjEl.parentElement && cjEl.parentElement.parentElement) {
        const row=cjEl.parentElement.parentElement;
        anchor=document.getElementById('tana-scan-anchor')||document.createElement('div');
        anchor.id='tana-scan-anchor';
        row.parentElement.insertBefore(anchor,row.nextSibling);
        place='after_cj';
      }
    }
    if (!anchor) {
      const jsonEl=kintone.app.record.getFieldElement?.('json_config');
      if (jsonEl && jsonEl.parentElement && jsonEl.parentElement.parentElement) {
        anchor=document.getElementById('tana-scan-anchor')||document.createElement('div');
        anchor.id='tana-scan-anchor';
        jsonEl.parentElement.parentElement.insertBefore(anchor,jsonEl.parentElement);
        place='before_json';
      }
    }
    if (!anchor) {
      anchor=document.getElementById('tana-scan-anchor')||document.createElement('div');
      anchor.id='tana-scan-anchor';
      document.body.appendChild(anchor);
      place='body';
    }

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
        <span id="tana-scan-status" style="margin-left:8px;color:#64748b;">READY (${place})</span>
      </div>`;
    anchor.appendChild(wrap);
  }

  // ---- 画面イベント ----
  kintone.events.on('app.record.edit.show', (event)=>{
    try{
      ensureScanUI();

      if(!window.__TANA_SCAN_BOUND__){
        window.__TANA_SCAN_BOUND__=true;

        document.addEventListener('click',(ev)=>{
          const t=ev.target; if(!(t instanceof HTMLElement)) return;
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
            const {at, bt, ct}=parseScan3(raw);
            const atTxt=S(at);
            const btNum=bt;
            const ctIso=ct? iso(ct): null;

            // ルール値の解決（b はフォールバック付き）
            const aVal=rec[JUDGE.text.value ]?.value ?? '';
            const aOpR=rec[JUDGE.text.op    ]?.value ?? '';
            const cVal=rec[JUDGE.date.value ]?.value ?? '';
            const cOpR=rec[JUDGE.date.op    ]?.value ?? '';

            const { code: bCodeResolved, value: bValResolved } = resolveRuleNumberValue(rec);
            const bOpR=rec[JUDGE.number.op]?.value ?? '';

            const aOp=normalizeOp('text',   aOpR);
            const bOp=normalizeOp('number', bOpR);
            const cOp=normalizeOp('date',   cOpR);

            // デバッグ出力：b の取得状況
            try{ console.debug('[TANA][B-resolve]', { bCodeResolved, bValResolved, bOpRaw:bOpR, bOpNorm:bOp, scanBt:btNum }); }catch(_){}

            const okA=ok_text(atTxt, aOp, aVal);
            const okB=ok_number(btNum, bOp, bValResolved);
            const okC=ok_date(ct, cOp, cVal);

            const reasons=[];
            if(!okA) reasons.push(`a:${aOpR||'-'}`);
            if(!okB) reasons.push(`b:${bOpR||'-'}`);
            if(!okC) reasons.push(`c:${cOpR||'-'}`);

            const result=reasons.length? 'NG':'OK';

            const row={};
            row[COL.scanAt]={ value: iso(new Date()) };
            row[COL.at]    ={ value: atTxt };
            row[COL.bt]    ={ value: btNum==null? '' : String(btNum) };
            row[COL.ct]    ={ value: ctIso };
            row[COL.result]={ value: result };
            row[COL.reason]={ value: reasons.join(' / ') };

            if(st) st.textContent='SAVING...';
            ip.value='';

            await appendRow(appId, recId, row);

            if(st) st.textContent= result==='OK' ? 'OKで記録' : `NGで記録：${reasons.join(' / ')||'不一致'}`;
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
