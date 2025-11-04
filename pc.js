(function () {
  // ===== util =====
  const asNumber = (v) => (v === '' || v == null ? null : Number(v));
  const asDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  // 比較
  const cmpNum = (L, op, R) => {
    if (L == null) return false;
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

  // ルール評価（A/B/C = field_a/field_b/field_c を使う）
  function evalRules(config, rec, log = false) {
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));

    const read = (key, type) => {
      const code = key2code[key];
      const f = code && rec.record[code];
      const v = f ? f.value : null;
      if (type === 'number') return asNumber(v);
      if (type === 'datetime') return asDate(v);
      return v;
    };

    const results = [];
    for (const r of config.rules || []) {
      const left = read(r.key, r.type);
      const right =
        r.type === 'number'
          ? Array.isArray(r.value)
            ? r.value.map(asNumber)
            : asNumber(r.value)
          : r.value;
      let pass = false;
      if (r.type === 'number') pass = cmpNum(left, r.operator, right);
      else if (r.type === 'datetime') pass = cmpDate(left, r.operator, right);
      else if (r.type === 'text') pass = cmpText(left, r.operator, right, r.options || {});
      else results.push({ ok: false, reason: `未対応type:${r.type}` });

      results.push({ ok: pass, reason: pass ? '' : `key=${r.key} op=${r.operator} val=${JSON.stringify(r.value)}` });
      if (log) console.log('[RULE]', { key: r.key, type: r.type, op: r.operator, left, pass });
    }
    const allOk = results.every((x) => x.ok);
    const reason = results.filter((x) => !x.ok).map((x) => x.reason).join(' / ');
    return { allOk, reason };
  }

  // 効果音（任意設定）
  async function play(url, vol) {
    try {
      if (!url) return;
      const a = new Audio(url);
      if (typeof vol === 'number') a.volume = Math.max(0, Math.min(1, vol));
      await a.play();
    } catch (e) {
      // 無視
    }
  }

  // SCAN UI を編集画面に挿入
  kintone.events.on('app.record.edit.show', (event) => {
    const rec = event.record;

    // 既に設置済みなら何もしない
    if (document.getElementById('tana-scan-wrap')) return;

    // ヘッダ下の1カラムにシンプルなボックスを置く
    const wrap = document.createElement('div');
    wrap.id = 'tana-scan-wrap';
    wrap.style.cssText =
      'padding:10px;background:#fffbcc;border:1px solid #eedc82;border-radius:6px;margin:10px 0;display:flex;gap:8px;align-items:center;';
    const label = document.createElement('span');
    label.textContent = 'SCAN';
    label.style.cssText = 'font-weight:600;margin-right:8px;';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'tana-scan-input';
    input.placeholder = 'ここにスキャン（Enterで判定）';
    input.style.cssText =
      'flex:1; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:14px;';
    const clr = document.createElement('button');
    clr.textContent = 'クリア';
    clr.style.cssText =
      'padding:8px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;';
    wrap.appendChild(label);
    wrap.appendChild(input);
    wrap.appendChild(clr);

    // kintone の上部フォームの先頭に挿入
    const root = document.querySelector('.gaia-argoui-app-edit-toolbar ~ div') || document.body;
    root.insertBefore(wrap, root.firstChild);

    clr.onclick = () => {
      input.value = '';
      input.focus();
    };
    setTimeout(() => input.focus(), 0);

    // スキャン → 解析 → 追記 → PUT
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const text = (input.value || '').trim();
      if (!text) return;

      // 設定読み込み
      let cfgStr = rec.json_config?.value || '';
      let config = {};
      try {
        config = JSON.parse(cfgStr || '{}');
      } catch (err) {
        alert('設定JSON(json_config)のパースに失敗しました。');
        console.error(err);
        return;
      }

      // ルール評価
      const { allOk, reason } = evalRules(config, { record: rec }, true);

      // 7項目パース：製品名 幅 長さ ロット ラベル 梱包数 回転数
      const parts = text.split(/\s+/);
      if (parts.length < 7) {
        await play(config.sounds?.ng, config.sounds?.volume ?? 0.4);
        alert('読み取り形式エラー：必要項目(7)に不足があります。');
        return;
      }
      const [prod, width, length, lot, labelCode, packs, rotation] = parts;

      // サブテーブル現値
      const tableCode = config.ui?.table?.fieldCode;
      const cols = config.ui?.table?.columns || {};
      const curr = (rec[tableCode]?.value || []).slice();

      // 1行生成
      const newRow = {};
      const put = (code, value) => {
        if (!code) return;
        newRow[code] = { value };
      };

      put(cols.datetime, new Date().toISOString());
      put(cols.result, allOk ? 'OK' : 'NG');
      put(cols.reason, allOk ? '' : reason);

      put(cols.A, prod);
      put(cols.B, asNumber(width));
      put(cols.C, asNumber(length));
      put(cols.D, lot);
      put(cols.E, labelCode);
      put(cols.F, asNumber(packs));
      put(cols.G, asNumber(rotation));

      const next = curr.concat([{ value: newRow }]);

      // PUT
      const body = {
        app: kintone.app.getId(),
        id: kintone.app.record.getId(),
        record: { [tableCode]: { value: next } }
      };

      try {
        const url = kintone.api.url('/k/v1/record.json', true);
        await kintone.api(url, 'PUT', body);

        // 画面に即時反映
        rec[tableCode].value = next;
        kintone.app.record.set({ record: rec });

        // サウンド
        if (allOk) await play(config.sounds?.ok, config.sounds?.volume ?? 0.4);
        else await play(config.sounds?.ng, config.sounds?.volume ?? 0.4);

        // 次のスキャンに備える
        input.value = '';
        input.focus();

        if (!allOk) {
          alert(`NG：サブテーブルに行を追加しました。\n理由：${reason}`);
        }
      } catch (err) {
        console.error(err);
        alert('保存時にエラーが発生しました。');
      }
    });
  });

  // （参考）詳細画面のボタンは gate.js 側に任せるのでここでは何もしない
})();
