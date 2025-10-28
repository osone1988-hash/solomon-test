(function () {
  // 起動確認（Console で window.__TANA_GATE__ を見る用）
  window.__TANA_GATE__ = 'ok';

  // ---------- utils ----------
  const asNumber = (v) => (v === '' || v == null ? null : Number(v));
  const asDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  // number / datetime / text 比較
  const cmpNum = (L, op, R) => {
    if (L === null) return false;
    if (op === '>')  return L >  R;
    if (op === '>=') return L >= R;
    if (op === '<')  return L <  R;
    if (op === '<=') return L <= R;
    if (op === '==') return L === R;
    if (op === 'between') return Array.isArray(R) && L >= R[0] && L <= R[1];
    return false;
  };
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
  const cmpText = (L, op, R, opt) => {
    const lower = !!(opt && opt.ignoreCase);
    const toS = (x) => (x == null ? '' : String(x));
    const norm = (x) => (lower ? toS(x).toLowerCase() : toS(x));
    L = norm(L);
    R = Array.isArray(R) ? R.map(norm) : norm(R);
    if (op === 'equals' || op === '==') return L === R;
    if (op === 'contains')    return L.includes(R);
    if (op === 'notContains') return !L.includes(R);
    if (op === 'in')          return Array.isArray(R) && R.includes(L);
    if (op === 'notIn')       return Array.isArray(R) && !R.includes(L);
    return false;
  };

  // ---------- ルール評価 ----------
  function evalRules(config, rec, log = true) {
    // key -> fieldCode
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));

    // kintone レコードから key 指定で値を読む＆型変換
    const read = (key, type) => {
      const code = key2code[key];
      const f = code && rec.record[code];
      const v = f ? f.value : null;
      if (type === 'number')   return asNumber(v);
      if (type === 'datetime') return asDate(v);
      return v; // text
    };

    const results = [];
    for (const r of (config.rules || [])) {
      const left = read(r.key, r.type);
      const op = r.operator;
      const right =
        r.type === 'number'
          ? (Array.isArray(r.value) ? r.value.map(asNumber) : asNumber(r.value))
          : r.value;

      let pass = false;
      if (r.type === 'number')   pass = cmpNum(left, op, right);
      else if (r.type === 'datetime') pass = cmpDate(left, op, right);
      else if (r.type === 'text')     pass = cmpText(left, op, right, r.options || {});
      else {
        results.push({ ok: false, reason: `未対応type:${r.type}` });
        continue;
      }

      if (log) console.log('[RULE]', { key: r.key, type: r.type, op, code: key2code[r.key], raw: r.value, left, right, pass });
      results.push({ ok: pass, reason: pass ? '' : `key=${r.key} op=${op} val=${JSON.stringify(r.value)}` });
    }

    const allOk = results.every((x) => x.ok);
    const reason = results.filter((x) => !x.ok).map((x) => x.reason).join(' / ');
    if (log) console.log('[ALL OK?]', allOk);
    return { allOk, reason };
  }

  // ---------- ボタン設置（詳細画面） ----------
  kintone.events.on('app.record.detail.show', () => {
    if (document.getElementById('tana-judge-btn')) return;

    const space = kintone.app.record.getHeaderMenuSpaceElement?.() || kintone.app.getHeaderMenuSpaceElement?.();
    if (!space) return;

    const btn = document.createElement('button');
    btn.id = 'tana-judge-btn';
    btn.textContent = '判定して記録';
    btn.style.cssText = 'padding:8px 12px;border-radius:6px;background:#3b82f6;color:#fff;border:none;cursor:pointer;';
    space.appendChild(btn);
    console.log('[TANA] button mounted (detail.show)');

    btn.onclick = async () => {
      try {
        const rec = kintone.app.record.get();

        // 設定読み込み
        const cfgStr = rec.record.json_config?.value;
        if (!cfgStr) { alert('設定JSON(json_config)が見つかりません。'); return; }

        let config;
        try {
          config = JSON.parse(cfgStr);
        } catch (e) {
          alert('設定JSONのパースに失敗しました。');
          console.error(e);
          return;
        }

        // 1) ルール評価（ログ出力あり）
        alert('json_config: JSON parse OK');
        const { allOk, reason } = evalRules(config, rec, true);

        // 2) サブテーブル 1 行作って末尾に追加
        const cols = config.ui?.table?.columns || {};
        const putCell = (row, code, value) => { if (!code) return; row[code] = { value }; };

        // key<>code 逆引き用
        const key2code = {};
        (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));
        const vA = rec.record[key2code.A]?.value ?? '';
        const vB = rec.record[key2code.B]?.value ?? '';
        const vC = rec.record[key2code.C]?.value ?? '';

        const newRow = {};
        putCell(newRow, cols.datetime, new Date().toISOString()); // 「今」
        putCell(newRow, cols.A, vA);
        putCell(newRow, cols.B, vB ? new Date(vB).toISOString() : '');
        putCell(newRow, cols.C, vC === '' ? '' : Number(vC));
        putCell(newRow, cols.result, allOk ? 'OK' : 'NG');
        putCell(newRow, cols.reason, allOk ? '' : reason);

        const tableCode = config.ui?.table?.fieldCode;
        const curr = rec.record[tableCode]?.value || [];
        const next = curr.concat([{ value: newRow }]);

        const body = {
          app: kintone.app.getId(),
          id: rec.recordId || rec.$id?.value,
          record: { [tableCode]: { value: next } }
        };

        const url = kintone.api.url('/k/v1/record.json', true);
        const res = await kintone.api(url, 'PUT', body);
        console.log('[TANA] PUT ok', res);
        alert(allOk ? 'OK：サブテーブルに行を追加しました。'
                    : `NG：サブテーブルに行を追加しました。\n理由：${reason}`);
        location.reload();
      } catch (e) {
        console.error(e);
        alert('処理中にエラーが発生しました。');
      }
    };
  });
})();
