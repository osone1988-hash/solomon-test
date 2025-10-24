(function () {
  // ---- 起動確認フラグ（Network / Console 確認用） ----
  window.__TANA_GATE__ = 'ok';

  // ---- util ------------------------------------------------
  const asNumber = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const asDate   = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  // number compare
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

  // datetime compare
  const cmpDate = (L, op, R) => {
    if (!L) return false;
    const l = L.getTime();
    const r = Array.isArray(R)
      ? R.map((d) => asDate(d)?.getTime())
      : asDate(R)?.getTime();
    if (r == null || (Array.isArray(r) && (r[0] == null || r[1] == null))) return false;
    if (op === 'gt')  return l >  r;
    if (op === 'gte') return l >= r;
    if (op === 'lt')  return l <  r;
    if (op === 'lte') return l <= r;
    if (op === '==') return l === r;
    if (op === 'between') return Array.isArray(r) && l >= r[0] && l <= r[1];
    return false;
  };

  // text compare
  const cmpText = (L, op, R, opt) => {
    const lower = !!(opt && opt.ignoreCase);
    const toS = (x) => (x == null ? '' : String(x));
    const norm = (x) => (lower ? toS(x).toLowerCase() : toS(x));
    L = norm(L);
    if (Array.isArray(R)) R = R.map(norm); else R = norm(R);

    if (op === 'equals' || op === '==') return L === R;
    if (op === 'contains')    return L.includes(R);
    if (op === 'notContains') return !L.includes(R);
    if (op === 'in')          return Array.isArray(R) && R.includes(L);
    if (op === 'notIn')       return Array.isArray(R) && !R.includes(L);
    return false;
  };

  // ---- ルール評価（record は kintone のレコードオブジェクトの record 部分） ----
  function evaluateAllRules(config, record) {
    // key -> fieldCode
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));

    const readByKey = (key, type) => {
      const code = key2code[key];
      const f = code && record[code];
      const v = f ? f.value : null;
      if (type === 'number')   return asNumber(v);
      if (type === 'datetime') return asDate(v);
      return v; // text/raw
    };

    const results = [];
    for (const r of config.rules || []) {
      const left  = readByKey(r.key, r.type);
      const op    = r.operator;
      const right = r.value;
      let ok = false;

      if (r.type === 'number') {
        const R = Array.isArray(right) ? right.map(asNumber) : asNumber(right);
        ok = cmpNum(left, op, R);
      } else if (r.type === 'datetime') {
        ok = cmpDate(left, op, right);
      } else if (r.type === 'text') {
        ok = cmpText(left, op, right, r.options || {});
      } else {
        ok = false;
      }
      results.push({ ok, reason: ok ? '' : `key=${r.key} op=${op} val=${JSON.stringify(r.value)}` });
    }

    const allOk  = results.every((x) => x.ok);
    const reason = results.filter((x) => !x.ok).map((x) => x.reason).join(' / ');
    return { allOk, reason };
  }

  // ---- 判定 → 1行生成 → サブテーブルへ保存 -----------------
  async function judgeAndAppendRow(record, cfg) {
    // 1) ルール評価
    const { allOk, reason } = evaluateAllRules(cfg, record);

    // 2) 行データを組み立て
    const cols = (cfg.ui?.table?.columns) || {};
    const row  = {};
    const put  = (code, value) => { if (code) row[code] = { value }; };

    // recordSchema から A/B/C フィールドコードを引く
    const key2code = {};
    (cfg.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));

    const vA = record[key2code.A]?.value ?? '';
    const vB = record[key2code.B]?.value ?? '';
    const vC = record[key2code.C]?.value ?? '';

    // サブテーブル列へ詰める
    put(cols.datetime, new Date().toISOString());                     // 取込時刻
    put(cols.A, vA);
    put(cols.B, vB ? new Date(vB).toISOString() : '');
    put(cols.C, vC === '' ? '' : Number(vC));
    put(cols.result, allOk ? 'OK' : 'NG');
    put(cols.reason, allOk ? '' : reason);

    // 3) 既存テーブルを取得して末尾に追加
    const tableCode = cfg.ui?.table?.fieldCode;
    const current   = record[tableCode]?.value || [];
    const next      = current.concat([{ value: row }]);

    // 4) PUT
    const body = {
      app: kintone.app.getId(),
      id : record.$id?.value, // detail 画面なので $id あり
      record: { [tableCode]: { value: next } },
    };
    const url = kintone.api.url('/k/v1/record.json', true);
    const res = await kintone.api(url, 'PUT', body);
    console.log('[TANA] PUT ok', res);

    alert(allOk ? 'サブテーブルに行を追加しました。' : 'NG行を追加しました（理由はテーブル参照）');
    // 画面更新（行がすぐ見えるように）
    location.reload();
  }

  // ---- ボタン設置（詳細画面） -------------------------------
  kintone.events.on('app.record.detail.show', () => {
    if (document.getElementById('tana-judge-btn')) return;

    const space = kintone.app.record.getHeaderMenuSpaceElement?.()
               || kintone.app.getHeaderMenuSpaceElement?.();
    if (!space) return;

    const btn = document.createElement('button');
    btn.id = 'tana-judge-btn';
    btn.textContent = '判定して記録';
    btn.style.cssText = 'padding:8px 12px; border-radius:6px; background:#3b82f6; color:#fff; border:none; cursor:pointer;';
    space.appendChild(btn);
    console.log('[TANA] button mounted (detail.show)');

    btn.onclick = async () => {
      try {
        const rec = kintone.app.record.get();              // { record, recordId, ... }
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

        // ルール判定 → 1行生成 → 保存
        await judgeAndAppendRow(rec.record, config);
        return;
      } catch (e) {
        console.error(e);
        alert('処理中にエラーが発生しました。');
      }
    };
  });
})();
