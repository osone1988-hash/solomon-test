(function () {
  // --- 起動確認フラグ（Network/Console確認用） ---
  window.__TANA_GATE__ = 'ok';

  // --- util -------------------------------------------------
  const asNumber = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const asDate   = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; };

  // 比較（number）
  const cmpNum = (L, op, R) => {
    if (L === null) return false;
    if (op === '>') return L >  R;
    if (op === '>=') return L >= R;
    if (op === '<') return L <  R;
    if (op === '<=') return L <= R;
    if (op === '==') return L === R;
    if (op === 'between') return Array.isArray(R) && L >= R[0] && L <= R[1];
    return false;
  };
  // 比較（datetime）
  const cmpDate = (L, op, R) => {
    if (!L) return false;
    const l = L.getTime();
    const r = Array.isArray(R) ? R.map((d) => asDate(d).getTime()) : asDate(R).getTime();
    if (op === '>')  return l >  r;
    if (op === '>=') return l >= r;
    if (op === '<')  return l <  r;
    if (op === '<=') return l <= r;
    if (op === '==') return l === r;
    if (op === 'between') return Array.isArray(r) && l >= r[0] && l <= r[1];
    return false;
  };
  // 比較（text）
  const cmpText = (L, op, R, opt) => {
    const lower = !!(opt && opt.ignoreCase);
    const toS = (x) => (x == null ? '' : String(x));
    const norm = (x) => lower ? toS(x).toLowerCase() : toS(x);
    L = norm(L);
    if (Array.isArray(R)) R = R.map(norm); else R = norm(R);
    if (op === 'equals' || op === '==') return L === R;
    if (op === 'contains')    return L.includes(R);
    if (op === 'notContains') return !L.includes(R);
    if (op === 'in')     return Array.isArray(R) && R.includes(L);
    if (op === 'notIn')  return Array.isArray(R) && !R.includes(L);
    return false;
  };

  // --- ルール評価本体 ----------------------------------------
  function evalRules(config, rec, log = false) {
    // key -> fieldCode
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));

    const readByKey = (key, type) => {
      const code = key2code[key];
      const f = code && rec.record[code];
      const v = f ? f.value : null;
      if (type === 'number')   return asNumber(v);
      if (type === 'datetime') return asDate(v);
      return v; // text/raw
    };

    const results = [];
    for (const r of (config.rules || [])) {
      const left = readByKey(r.key, r.type);
      const op   = r.operator;
      const right= r.value;
      let ok = false;

      if (r.type === 'number')   ok = cmpNum(left, op, Array.isArray(right)? right.map(asNumber) : asNumber(right));
      else if (r.type === 'datetime') ok = cmpDate(left, op, right);
      else if (r.type === 'text')     ok = cmpText(left, op, right, r.options || {});
      else { results.push({ ok:false, reason:`未対応type:${r.type}` }); continue; }

      if (log) console.log('[TANA] rule', r, 'left=', left, '=>', ok);
      results.push({ ok, reason: ok ? '' : `key=${r.key} op=${op} val=${JSON.stringify(r.value)}` });
    }

    const allOk = results.every(x => x.ok);
    const reason= results.filter(x => !x.ok).map(x => x.reason).join(' / ');
    return { allOk, reason };
  }

  // --- ボタン設置（詳細画面） --------------------------------
  kintone.events.on('app.record.detail.show', () => {
    if (document.getElementById('tana-judge-btn')) return;

    const space = kintone.app.record.getHeaderMenuSpaceElement?.() || kintone.app.getHeaderMenuSpaceElement?.();
    if (!space) return;

    const btn = document.createElement('button');
    btn.id = 'tana-judge-btn';
    btn.textContent = '判定して記録';
    btn.style.cssText = 'padding:8px 12px; border-radius:6px; background:#3b82f6; color:#fff; border:none; cursor:pointer;';
    space.appendChild(btn);
    console.log('[TANA] button mounted (detail.show)');

    btn.onclick = async () => {
      const rec = kintone.app.record.get();
      const cfgStr = rec.record.json_config?.value;
      if (!cfgStr) { alert('設定JSON(json_config)が見つかりません。'); return; }

      let config;
      try { config = JSON.parse(cfgStr); }
      catch (e) { alert('設定JSONのパースに失敗しました。'); console.error(e); return; }

      // 1) ルール評価
      const { allOk, reason } = evalRules(config, rec, true);

      // 2) サブテーブル1行を組み立て
      const cols = config.ui?.table?.columns || {};
      const key2code = {};
      (config.recordSchema || []).forEach(s => key2code[s.key] = s.fieldCode);
      const vA = rec.record[key2code.A]?.value ?? '';
      const vB = rec.record[key2code.B]?.value ?? '';
      const vC = rec.record[key2code.C]?.value ?? '';

      const row = {};
      const put = (code, value) => { if (code) row[code] = { value }; };

      // scan_at は「今」を入れる（B を使いたければ vB に変更可）
      put(cols.datetime, new Date().toISOString());
      put(cols.A, vA);
      put(cols.B, vB ? new Date(vB).toISOString() : '');
      put(cols.C, vC === '' ? '' : Number(vC));
      put(cols.result, allOk ? 'OK' : 'NG');
      put(cols.reason, allOk ? '' : reason);

      // 3) 既存テーブル末尾に追加して PUT
      const tableCode = config.ui?.table?.fieldCode;
      const curr = rec.record[tableCode]?.value || [];
      const next = curr.concat([{ value: row }]);

      const body = {
        app: kintone.app.getId(),
        id : rec.recordId || rec.$id?.value,
        record: { [tableCode]: { value: next } }
      };

      const url = kintone.api.url('/k/v1/record.json', true);
      try {
        const res = await kintone.api(url, 'PUT', body);
        console.log('[TANA] PUT ok', res);
        alert(allOk ? 'OK：サブテーブルに行を追加しました。' : `NG：サブテーブルに行を追加しました。\n理由：${reason}`);
        location.reload();
      } catch (e) {
        console.error(e);
        alert('保存時にエラーが発生しました。');
      }
    };
  });
})();
