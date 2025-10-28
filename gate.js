(function () {
  // ===== 起動確認（Console で window.__TANA_GATE__ を見る用） =====
  window.__TANA_GATE__ = 'ok';

  // ===== util =====
  const asNumber = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const asDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  // number 比較
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

  // datetime 比較
  const cmpDate = (L, op, R) => {
    if (!L) return false;
    const l = L.getTime();
    const r = Array.isArray(R)
      ? R.map((d) => asDate(d)?.getTime())
      : asDate(R)?.getTime();
    if (r == null || (Array.isArray(r) && (r[0] == null || r[1] == null))) return false;
    if (op === '>') return l > r;
    if (op === '>=') return l >= r;
    if (op === '<') return l < r;
    if (op === '<=') return l <= r;
    if (op === '==') return l === r;
    if (op === 'between') return Array.isArray(r) && l >= r[0] && l <= r[1];
    return false;
  };

  // text 比較（ignoreCase / regex / 配列対応）
  const cmpText = (L, op, R, opt = {}) => {
    const ic = !!opt.ignoreCase;
    const isRegex = !!opt.regex;

    // 正規表現オブジェクトにそろえる
    const toReg = (p) => {
      try {
        return new RegExp(p, ic ? 'i' : undefined);
      } catch {
        // 失敗したら文字列一致用にフォールバック
        return null;
      }
    };

    // 文字列正規化
    const toStr = (x) => (x == null ? '' : String(x));
    const norm = (x) => (ic ? toStr(x).toLowerCase() : toStr(x));

    if (isRegex) {
      const left = toStr(L);
      const arr = Array.isArray(R) ? R : [R];
      const regs = arr.map(toReg).filter(Boolean);
      if (op === 'contains' || op === 'equals') {
        // ANY マッチ
        return regs.some((re) => re.test(left));
      }
      if (op === 'notContains') {
        // ALL not
        return regs.every((re) => !re.test(left));
      }
      return false;
    }

    // 文字列一致・包含（非正規表現）
    let left = norm(L);
    if (Array.isArray(R)) {
      const rightArr = R.map(norm);
      if (op === 'contains') return rightArr.some((r) => left.includes(r));
      if (op === 'notContains') return rightArr.every((r) => !left.includes(r));
      if (op === 'in') return rightArr.includes(left);
      if (op === 'notIn') return !rightArr.includes(left);
      if (op === 'equals' || op === '==') return rightArr.includes(left);
      return false;
    } else {
      const right = norm(R);
      if (op === 'contains') return left.includes(right);
      if (op === 'notContains') return !left.includes(right);
      if (op === 'in') return left === right; // 単体 in は equals 相当
      if (op === 'notIn') return left !== right;
      if (op === 'equals' || op === '==') return left === right;
      return false;
    }
  };

  // ===== ルール評価 =====
  function evalRules(config, rec, log = false) {
    // key -> fieldCode 逆引き
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));

    // Kintone 値読み & 型変換
    const read = (key, type) => {
      const code = key2code[key];
      const f = code && rec.record[code];
      const v = f ? f.value : null;
      if (type === 'number') return asNumber(v);
      if (type === 'datetime') return asDate(v);
      return v; // text/raw
    };

    const results = [];
    for (const r of config.rules || []) {
      const left = read(r.key, r.type);
      const op = r.operator;
      let right = r.value;

      let pass = false;
      if (r.type === 'number') {
        right = Array.isArray(right) ? right.map(asNumber) : asNumber(right);
        pass = cmpNum(left, op, right);
      } else if (r.type === 'datetime') {
        pass = cmpDate(left, op, right);
      } else if (r.type === 'text') {
        pass = cmpText(left, op, right, r.options || {});
      } else {
        results.push({ ok: false, reason: `未対応type:${r.type}` });
        continue;
      }

      if (log) console.log('[RULE]', { key: r.key, type: r.type, op, raw: r.value, left, pass });
      results.push({ ok: pass, reason: pass ? '' : `key=${r.key} op=${op} val=${JSON.stringify(r.value)}` });
    }

    const allOk = results.every((x) => x.ok);
    const reason = results.filter((x) => !x.ok).map((x) => x.reason).join(' / ');
    if (log) console.log('[ALL OK?]', allOk);
    return { allOk, reason };
  }

  // ===== ボタン設置（詳細画面） =====
  kintone.events.on('app.record.detail.show', () => {
    if (document.getElementById('tana-judge-btn')) return;

    const space =
      kintone.app.record.getHeaderMenuSpaceElement?.() ||
      kintone.app.getHeaderMenuSpaceElement?.();
    if (!space) return;

    const btn = document.createElement('button');
    btn.id = 'tana-judge-btn';
    btn.textContent = '判定して記録';
    btn.style.cssText =
      'padding:8px 12px;border-radius:6px;background:#3b82f6;color:#fff;border:none;cursor:pointer;';
    space.appendChild(btn);
    console.log('[TANA] button mounted (detail.show)');

    btn.onclick = async () => {
      try {
        const rec = kintone.app.record.get();

        // 設定 JSON
        const cfgStr = rec.record.json_config?.value;
        if (!cfgStr) {
          alert('設定JSON(json_config)が見つかりません。');
          return;
        }
        let config;
        try {
          config = JSON.parse(cfgStr);
        } catch (e) {
          console.error(e);
          alert('設定JSONのパースに失敗しました。');
          return;
        }

        // ルール評価
        const { allOk, reason } = evalRules(config, rec, true);

        // サブテーブル 1行構築
        const cols = config.ui?.table?.columns || {};
        const key2code = {};
        (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));

        const vA = rec.record[key2code.A]?.value ?? '';
        const vB = rec.record[key2code.B]?.value ?? '';
        const vCraw = rec.record[key2code.C]?.value ?? '';

        const newRow = {};
        const put = (code, value) => {
          if (!code) return;
          newRow[code] = { value };
        };

        // スキャン時刻は「今」
        put(cols.datetime, new Date().toISOString());
        put(cols.A, vA);
        put(cols.B, vB ? new Date(vB).toISOString() : '');
        put(cols.C, vCraw === '' ? '' : Number(vCraw));
        put(cols.result, allOk ? 'OK' : 'NG');
        put(cols.reason, allOk ? '' : reason);

        // 既存テーブル末尾に追加
        const tableCode = config.ui?.table?.fieldCode;
        const curr = rec.record[tableCode]?.value || [];
        const next = curr.concat([{ value: newRow }]);

        // PUT
        const body = {
          app: kintone.app.getId(),
          id: kintone.app.record.getId(), // 詳細画面のレコードID
          record: { [tableCode]: { value: next } },
        };

        const url = kintone.api.url('/k/v1/record.json', true);
        const res = await kintone.api(url, 'PUT', body);
        console.log('[TANA] PUT ok', res);

        alert(allOk ? 'OK：サブテーブルに行を追加しました。' : `NG：サブテーブルに行を追加しました。\n理由：${reason}`);
        location.reload();
      } catch (e) {
        console.error(e);
        alert('処理中にエラーが発生しました。');
      }
    };
  });
})();
