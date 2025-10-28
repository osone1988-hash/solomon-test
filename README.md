(function () {
  // ====== 共通 util ======
  const asNumber = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const asDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

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
    if (op === 'contains') return L.includes(R);
    if (op === 'notContains') return !L.includes(R);
    if (op === 'in') return Array.isArray(R) && R.includes(L);
    if (op === 'notIn') return Array.isArray(R) && !R.includes(L);
    return false;
  };

  // ルール評価（gate.jsと同等）
  function evalRules(config, rec, log = false) {
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));

    const readByKey = (key, type) => {
      const code = key2code[key];
      const f = code && rec.record[code];
      const v = f ? f.value : null;
      if (type === 'number') return asNumber(v);
      if (type === 'datetime') return asDate(v);
      return v;
    };

    const results = [];
    for (const r of config.rules || []) {
      const left = readByKey(r.key, r.type);
      const op = r.operator;
      const right = r.type === 'number'
        ? (Array.isArray(r.value) ? r.value.map(asNumber) : asNumber(r.value))
        : r.value;

      let ok = false;
      if (r.type === 'number') ok = cmpNum(left, op, right);
      else if (r.type === 'datetime') ok = cmpDate(left, op, right);
      else if (r.type === 'text') ok = cmpText(left, op, right, r.options || {});
      else { results.push({ ok: false, reason: `未対応type:${r.type}` }); continue; }

      results.push({ ok, reason: ok ? '' : `key=${r.key} op=${op} val=${JSON.stringify(r.value)}` });
    }
    const allOk = results.every((x) => x.ok);
    const reason = results.filter((x) => !x.ok).map((x) => x.reason).join(' / ');
    return { allOk, reason };
  }

  // サウンド
  function playSound(src, vol = 0.4) {
    try {
      const a = new Audio(src);
      a.volume = vol;
      a.play();
    } catch (e) { /* no-op */ }
  }

  // サブテーブル追記
  async function appendTableRow(rec, config, allOk, reason) {
    const cols = config.ui?.table?.columns || {};
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));
    const vA = rec.record[key2code.A]?.value ?? '';
    const vB = rec.record[key2code.B]?.value ?? '';
    const vC = rec.record[key2code.C]?.value ?? '';

    const row = {};
    const put = (code, value) => { if (code) row[code] = { value }; };

    put(cols.datetime, new Date().toISOString()); // 「今」
    put(cols.A, vA);
    put(cols.B, vB ? new Date(vB).toISOString() : '');
    put(cols.C, vC === '' ? '' : Number(vC));
    put(cols.result, allOk ? 'OK' : 'NG');
    put(cols.reason, allOk ? '' : reason);

    const tableCode = config.ui?.table?.fieldCode;
    const curr = rec.record[tableCode]?.value || [];
    const next = curr.concat([{ value: row }]);

    const body = {
      app: kintone.app.getId(),
      id : rec.recordId || rec.$id?.value,
      record: { [tableCode]: { value: next } }
    };
    const url = kintone.api.url('/k/v1/record.json', true);
    await kintone.api(url, 'PUT', body);
  }

  // SCAN値の適用（必要に応じてここでQRパース → 各フィールドに反映）
  function applyScanValue(rec, scanText, config) {
    // ★とりあえずサンプル：全部 field_a に入れる例（必要ならここでパースロジックを追加）
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));
    rec.record[key2code.A].value = scanText;
    return rec;
  }

  // ====== 編集画面に UI を出して動かす ======
  const editEvents = ['app.record.edit.show'];
  kintone.events.on(editEvents, (event) => {
    const rec = event.record;
    const spaceEl = kintone.app.record.getSpaceElement('scan_area');
    if (!spaceEl) return event;

    // 二重設置防止
    if (spaceEl.querySelector('#scan-input')) return event;

    // UI
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#fffbe6;border:1px solid #e5d17f;padding:8px 10px;border-radius:6px;display:flex;gap:8px;align-items:center;';
    wrap.innerHTML = `
      <strong>SCAN</strong>
      <input id="scan-input" type="text" style="flex:1;padding:8px;border:1px solid #ccc;border-radius:6px;" placeholder="ここにスキャン（Enterで判定）" />
      <button id="scan-clear" type="button" style="padding:8px 10px;border-radius:6px;border:1px solid #ddd;background:#f7f7f7;">クリア</button>
    `;
    spaceEl.appendChild(wrap);

    const input = wrap.querySelector('#scan-input');
    const clearBtn = wrap.querySelector('#scan-clear');

    clearBtn.onclick = () => { input.value = ''; input.focus(); };

    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const txt = input.value.trim();
      if (!txt) return;

      try {
        // 設定取得
        const cfgStr = rec.json_config?.value;
        if (!cfgStr) { alert('設定JSON(json_config)が見つかりません。'); return; }
        let config;
        try { config = JSON.parse(cfgStr); }
        catch (err) { alert('設定JSONのパースに失敗しました。'); return; }

        // SCAN適用（必要に応じてパースし、A/B/Cへ割り当てる）
        const tmpRec = { record: JSON.parse(JSON.stringify(rec)), recordId: event.recordId };
        applyScanValue(tmpRec, txt, config);

        // 判定
        const { allOk, reason } = evalRules(config, tmpRec, false);

        // 音
        if (allOk) playSound('assets/sound_ok.mp3', config.sounds?.ok?.volume ?? 0.4);
        else       playSound('assets/sound_error.mp3', config.sounds?.ng?.volume ?? 0.4);

        // サブテーブル追記（PUT）
        await appendTableRow({ record: rec, recordId: event.recordId }, config, allOk, reason);

        // 画面の見た目だけも更新（サブテーブルはPUT済みだが、目視用に差し替え）
        const tableCode = config.ui?.table?.fieldCode;
        const curr = rec[tableCode].value || [];
        const showRow = {
          [config.ui.table.columns.datetime]: { value: new Date().toISOString() },
          [config.ui.table.columns.A]: { value: tmpRec.record[config.recordSchema[0].fieldCode]?.value ?? '' },
          [config.ui.table.columns.B]: { value: tmpRec.record[config.recordSchema[1].fieldCode]?.value ?? '' },
          [config.ui.table.columns.C]: { value: tmpRec.record[config.recordSchema[2].fieldCode]?.value ?? '' },
          [config.ui.table.columns.result]: { value: allOk ? 'OK' : 'NG' },
          [config.ui.table.columns.reason]: { value: allOk ? '' : reason },
        };
        curr.push({ value: showRow });
        rec[tableCode].value = curr;
        kintone.app.record.set({ record: rec });

        // 次のスキャンへ
        input.value = '';
        input.focus();

      } catch (err) {
        console.error(err);
        alert('処理中にエラーが発生しました。');
      }
    });

    // 初期フォーカス
    setTimeout(() => input.focus(), 0);
    return event;
  });
})();
