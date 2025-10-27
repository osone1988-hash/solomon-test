(function () {
  // 起動確認フラグ（Network/Consoleで読めたか確認用）
  window.__TANA_GATE__ = 'ok';

  // ========= util =========
  const asNumber = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const asDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  // number / datetime / text の比較
  const cmpNum = (L, op, R) => {
    if (L === null) return false;
    if (op === '>') return L > R;
    if (op === '>=') return L >= R;
    if (op === '<') return L < R;
    if (op === '<=') return L <= R;
    if (op === '==') return L === R;
    if (op === 'between') return Array.isArray(R) && L >= R[0] && L <= R[1];
    return false;
  };
  const cmpDate = (L, op, R) => {
    if (!L) return false;
    const l = L.getTime();
    const r = Array.isArray(R) ? R.map((d) => asDate(d).getTime()) : asDate(R).getTime();
    if (op === '>') return l > r;
    if (op === '>=') return l >= r;
    if (op === '<') return l < r;
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
    if (op === 'contains') return L.includes(R);
    if (op === 'notContains') return !L.includes(R);
    if (op === 'in') return Array.isArray(R) && R.includes(L);
    if (op === 'notIn') return Array.isArray(R) && !R.includes(L);
    return false;
  };

  // ========= ルール評価 =========
  function evalRules(config, rec, log = false) {
    // key -> fieldCode
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));

    const readByKey = (key, type) => {
      const code = key2code[key];
      const f = code && rec.record[code];
      const v = f ? f.value : null;
      if (type === 'number') return asNumber(v);
      if (type === 'datetime') return asDate(v);
      return v; // text/raw
    };

    const results = [];
    for (const r of config.rules || []) {
      const left = readByKey(r.key, r.type);
      const op = r.operator;
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

      if (log) console.log('[RULE]', { key: r.key, type: r.type, op, right, left, ok });
      results.push({ ok, msg: ok ? '' : `key=${r.key} op=${op} val=${JSON.stringify(r.value)}` });
    }

    return {
      allOk: results.every((x) => x.ok),
      reason: results.filter((x) => !x.ok).map((x) => x.msg).join(' / '),
    };
  }

  // ========= 1行生成してサブテーブルに追記・保存 =========
  async function judgeAndAppendRow(rec, config) {
    // recordSchema から {A,B,C,...} -> 値 を作る
    const valueMap = {};
    (config.recordSchema || []).forEach((s) => {
      const f = rec.record[s.fieldCode];
      let v = f ? f.value : null;
      if (s.type === 'number') v = asNumber(v);
      if (s.type === 'datetime') v = asDate(v);
      valueMap[s.key] = v;
    });

    // ルール評価
    const { allOk, reason } = evalRules(config, rec, true);

    // 行データ組み立て
    const cols = (config.ui && config.ui.table && config.ui.table.columns) || {};
    const row = {};
    const put = (code, value) => {
      if (code) row[code] = { value };
    };

    // サブテーブル列の割り当て
    put(cols.datetime, new Date().toISOString()); // 「今」
    put(cols.A, valueMap.A != null ? String(valueMap.A) : '');
    put(cols.B, valueMap.B ? new Date(valueMap.B).toISOString() : '');
    put(cols.C, valueMap.C == null ? '' : valueMap.C);
    put(cols.result, allOk ? 'OK' : 'NG');
    put(cols.reason, allOk ? '' : reason);

    // 既存テーブルを末尾連結してPUT
    const tableCode = config.ui && config.ui.table && config.ui.table.fieldCode;
    if (!tableCode) {
      alert('設定JSONの ui.table.fieldCode が未設定です。');
      return;
    }
    const curr = rec.record[tableCode]?.value || [];
    const next = curr.concat([{ value: row }]);

    const body = {
      app: kintone.app.getId(),
      id: rec.recordId || rec.record.$id?.value,
      record: { [tableCode]: { value: next } },
    };

    const url = kintone.api.url('/k/v1/record.json', true);
    const res = await kintone.api(url, 'PUT', body);
    console.log('[TANA] PUT ok:', res);

    alert(allOk ? 'サブテーブルに行を追加しました。' : 'NG行を追加しました（理由はテーブル列 reason を参照）');
  }

  // ========= ボタン設置 =========
  kintone.events.on('app.record.detail.show', () => {
    if (document.getElementById('tana-judge-btn')) return;

    const space =
      (kintone.app.record.getHeaderMenuSpaceElement && kintone.app.record.getHeaderMenuSpaceElement()) ||
      (kintone.app.getHeaderMenuSpaceElement && kintone.app.getHeaderMenuSpaceElement());
    if (!space) return;

    const btn = document.createElement('button');
    btn.id = 'tana-judge-btn';
    btn.textContent = '判定して記録';
    btn.style.cssText =
      'padding:8px 12px;border:none;border-radius:6px;background:#3b82f6;color:#fff;cursor:pointer;';
    space.appendChild(btn);
    console.log('[TANA] button mounted (detail.show)');

    btn.onclick = async () => {
      try {
        const rec = kintone.app.record.get();
        const cfgStr = rec.record.json_config && rec.record.json_config.value;
        if (!cfgStr) {
          alert('設定JSON(json_config)が見つかりません。');
          return;
        }
        let config;
        try {
          config = JSON.parse(cfgStr);
          alert('json_config: JSON parse OK');
        } catch (e) {
          alert('設定JSONのパースに失敗しました。');
          console.error(e);
          return;
        }

        await judgeAndAppendRow(rec, config);
        // 画面を最新化
        location.reload();
      } catch (e) {
        console.error(e);
        alert('処理中にエラーが発生しました。');
      }
    };
  });
})();
