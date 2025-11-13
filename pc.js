/* TANA-OROSHI pc.js — scan_area固定（全レコード）/ 未保存ルールを上書きしない / 数値の全角・負数対応
   v=pc-ng-rules-2025-11-10-15 */
(function () {
  'use strict';
  const VERSION = 'pc-ng-rules-2025-11-10-15';
  try { console.log('[TANA-OROSHI] pc.js loaded:', VERSION); window.__TANA_PC_VERSION = VERSION; } catch(_) {}

  // ---- 判定フィールドコード（必要に応じてここだけ変更）----
  const JUDGE = {
    text:   { value: 'a',  op: 'aj' }, // 文字
    number: { value: 'b',  op: 'bj' }, // 数値
    date:   { value: 'c',  op: 'cj' }, // 日時
  };

  // ---- サブテーブル ----
  const TABLE = 'scan_table';
  const COL   = { scanAt:'scan_at', at:'at', bt:'bt', ct:'ct', result:'result', reason:'reason' };

  // ---- サブテーブル列のタイプ（画面反映用・ローカル構築に使用）----
  const FIELD_TYPES = {
    [COL.scanAt]: 'DATETIME',
    [COL.at]:     'SINGLE_LINE_TEXT',
    [COL.bt]:     'NUMBER',
    [COL.ct]:     'DATETIME',
    [COL.result]: 'SINGLE_LINE_TEXT',
    [COL.reason]: 'MULTI_LINE_TEXT',
  };

  // ---- SCAN を表示する Space の要素ID ----
  const SCAN_SPACE_ID = 'scan_area';

  // ===== Utils =====
  const $id = (id) => document.getElementById(id);
  const S   = (v) => (v == null ? '' : String(v));
  const iso = (d) => (d ? new Date(d).toISOString() : null);

  // 全角→半角・カンマ除去・各種マイナス正規化（－ U+FF0D, − U+2212 → ASCII '-'）
  function normalizeNumberString(v) {
    const map = { '０':'0','１':'1','２':'2','３':'3','４':'4','５':'5','６':'6','７':'7','８':'8','９':'9','．':'.','－':'-','−':'-' };
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
    if (s==null || b==null) return false; // 値が取れない場合はNG
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

  // サーバーへ value-only で1行追加（画面は上書きしない）
  async function appendRowServer(appId, recId, rowValueOnly){
    const url = kintone.api.url('/k/v1/record.json', true);
    const { record } = await kintone.api(url,'GET',{ app:appId, id:recId });
    const curr = Array.isArray(record[TABLE]?.value) ? record[TABLE].value : [];
    const next = curr.concat([{ value: rowValueOnly }]);
    await kintone.api(url,'PUT',{ app:appId, id:recId, record: { [TABLE]: { value: next } } });
  }

  // ローカル（画面）に型付きで1行追加（未保存の既存編集を温存）
  function appendRowLocal(rowValueOnly){
    const appRec = kintone.app.record.get(); if(!appRec||!appRec.record) return;
    const rec = appRec.record;
    const curr = Array.isArray(rec[TABLE]?.value) ? rec[TABLE].value : [];

    // 型付き行を構築
    const clientRow = {};
    Object.keys(rowValueOnly).forEach(code=>{
      const type = FIELD_TYPES[code] || 'SINGLE_LINE_TEXT';
      let val = rowValueOnly[code];
      if (type==='NUMBER' && val!=='') val = String(val);
      if (type==='DATETIME' && val)    val = String(val);
      clientRow[code] = { type, value: val };
    });

    const next = curr.concat([{ value: clientRow }]);
    rec[TABLE] = { type: 'SUBTABLE', value: next };
    kintone.app.record.set({ record: rec });
  }

  // 入力: 文字 数値 日時…以降は結合（例: "2025-11-09 09:00"）
  function parseScan3(raw){
    const a = S(raw).trim().split(/\s+/).filter(Boolean);
    const at = a.shift() || '';
    const bt = a.length ? toNumOrNull(a.shift()) : null;
    const ct = a.length ? parseDateLoose(a.join(' ')) : null;
    return { at, bt, ct };
  }

  // ---- SCAN UI（全レコードで確実に表示：scan_area最優先 + リトライ）----
  function mountScanUI(targetEl, placeTag){
    // 既存UIを除去（増殖防止）
    document.querySelectorAll('#tana-scan-wrap').forEach(n=>n.remove());

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

    // フォールバック1: c判定行の直後
    const cjEl = kintone.app.record.getFieldElement?.(JUDGE.date.op);
    if (cjEl && cjEl.parentElement && cjEl.parentElement.parentElement) {
      const row=cjEl.parentElement.parentElement;
      const div=document.createElement('div');
      row.parentElement.insertBefore(div,row.nextSibling);
      place='after_cj';
      mountScanUI(div, place);
      return;
    }
    // フォールバック2: テーブルの直前
    const tableEl = kintone.app.record.getFieldElement?.(TABLE);
    if (tableEl && tableEl.parentElement && tableEl.parentElement.parentElement) {
      const block=tableEl.parentElement.parentElement;
      const div=document.createElement('div');
      block.parentElement.insertBefore(div, block);
      place='before_table';
      mountScanUI(div, place);
      return;
    }
    // 最終手段
    const div=document.createElement('div');
    document.body.appendChild(div);
    place='body_fallback';
    mountScanUI(div, place);
  }

  // ---- 画面イベント ----
  kintone.events.on('app.record.edit.show', (event)=>{
    try{
      ensureScanUI(); // ← 各レコードで必ず実行

      // クリック/Enter は一度だけバインド（UIは毎回描画）
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
          const recId=rec?.$id?.value || kintone.app.record.getId?.();
          if (!appId || !rec || !recId) { if (st) st.textContent='ERROR: no app/record'; return; }

          try{
            const { at, bt, ct } = parseScan3(ip.value);
            const atTxt=S(at);
            const btNum=bt;
            const ctIso=ct? iso(ct): null;

            // 画面上の条件値（未保存の編集を含む）
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
            if(!okB) reasons.push(`b:${bOp||'-'} (scan:${btNum==null?'null':String(btNum)}, base:${bVal==null?'null':normalizeNumberString(bVal)})`);
            if(!okC) reasons.push(`c:${cOp||'-'}`);

            const result=reasons.length? 'NG':'OK';

            // 保存前に画面へ型付きで追記（未保存の他項目は温存）
            const rowValueOnly = {
              [COL.scanAt]: iso(new Date()),
              [COL.at]:     atTxt,
              [COL.bt]:     btNum==null? '' : String(btNum),
              [COL.ct]:     ctIso,
              [COL.result]: result,
              [COL.reason]: reasons.join(' / ')
            };
            appendRowLocal(rowValueOnly);

            if(st) st.textContent = `判定→保存中…`;
            ip.value='';

            // サーバーへも反映（value-only）。失敗時はアラート。
            try {
              await appendRowServer(appId, recId, rowValueOnly);
              if(st) st.textContent = result==='OK'
                ? 'OKで記録'
                : `NGで記録：${reasons.join(' / ')||'不一致'}`;
            } catch(e) {
              console.error('[TANA] put error:', e);
              if(st) st.textContent = 'ERROR: サーバー保存失敗（画面の行は仮表示）';
              alert('サーバー保存に失敗しました。通信状況をご確認ください。');
            } finally {
              setTimeout(()=>{ const s=$id('tana-scan-status'); if(s) s.textContent='READY'; }, 1500);
            }

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
