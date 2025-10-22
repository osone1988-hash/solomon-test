(function () {
  // 起動確認フラグ（Network/Console確認用）
  window.__TANA_GATE__ = 'ok';

  // ---- util -------------------------------------------------
  const asNumber = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const asDate = (v) => {
    if (!v) return null;
    // kintoneの日時は 'YYYY-MM-DDTHH:mm:ssZ(+09:00)' 形式
    // Safari対策で「-」→「/」置換は不要なことが多いが、許容する
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const cmpNum = (left, op, right) => {
    if (left === null) return false;
    if (op === '>') return left > right;
    if (op === '>=') return left >= right;
    if (op === '<') return left < right;
    if (op === '<=') return left <= right;
    if (op === 'between') return left >= right[0] && left <= right[1];
    if (op === '==') return left === right;
    return false;
  };
  const cmpDate = (left, op, right) => {
    if (!left) return false;
    const L = left.getTime();
    const R = Array.isArray(right) ? right.map((d) => asDate(d).getTime()) : asDate(right).getTime();
    if (op === '>') return L > R;
    if (op === '>=') return L >= R;
    if (op === '<') return L < R;
    if (op === '<=') return L <= R;
    if (op === 'between') return L >= R[0] && L <= R[1];
    if (op === '==') return L === R;
    return false;
  };
  const cmpText = (left, op, right, opt) => {
    if (left == null) left = '';
    if (opt && opt.ignoreCase) {
      left = String(left).toLowerCase();
      if (Array.isArray(right)) right = right.map((r) => String(r).toLowerCase());
      else right = String(right).toLowerCase();
    } else {
      left = String(left);
      if (Array.isArray(right)) right = right.map((r) => String(r));
      else right = String(right);
    }
    if (op === 'equals' || op === '==') return left === right;
    if (op === 'contains') return left.includes(right);
    if (op === 'notContains') return !left.includes(right);
    // 一応配列右辺もサポート（any）
    if (op === 'in') return Array.isArray(right) && right.includes(left);
    if (op === 'notIn') return Array.isArray(right) && !right.includes(left);
    return false;
  };

  // ---- ルール評価 -------------------------------------------
  function evalRules(config, rec, log = false) {
    // recordSchema から key -> fieldCode のマップを作成
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));

    function readValueByKey(key, type) {
      const code = key2code[key];
      if (!code || !rec.record[code]) return null;
      const raw = rec.record[code].value;
      if (type === 'number') return asNumber(raw);
      if (type === 'datetime') return asDate(raw);
      return raw; // text
    }

    const results = [];
    for (const r of config.rules || []) {
      const left = readValueByKey(r.key, r.type);
      const op = r.operator;
      const right = r.value;
      let ok = false;

      if (r.type === 'number') {
        if (op === 'between' && !Array.isArray(right)) {
          // { "value": [min, max] } 期待
          results.push({ ok: false, reason: `C${r.key}: betweenの右辺は配列[min,max]` });
          continue;
        }
        ok = cmpNum(left, op, right);
      } else if (r.type === 'datetime') {
        if (op === 'between' && !Array.isArray(right)) {
          results.push({ ok: false, reason: `C${r.key}: betweenの右辺は配列[from,to]` });
          continue;
        }
        ok = cmpDate(left, op, right);
      } else if (r.type === 'text') {
        ok = cmpText(left, op, right, r.options || {});
      } else {
        results.push({ ok: false, reason: `未対応type: ${r.type}` });
        continue;
      }

      if (log) console.log('[TANA] rule', r, 'left=', left, '=>', ok);
      results.push({ ok, reason: ok ? '' : `NG: key=${r.key} op=${op}` });
    }

    const allOk = results.every((x) => x.ok);
    const reason = results.filter((x) => !x.ok).map((x) => x.reason).join(' / ');
    return { allOk, reason };
  }

  // ---- ボタン設置（詳細画面） -------------------------------
  kintone.events.on(['app.record.detail.show'], (event) => {
    // 重複設置防止
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
      try {
        const rec = kintone.app.record.get();
        // 設定JSONを json_config から取得
        const cfgStr = rec.record.json_config?.value;
        if (!cfgStr) {
          alert('設定JSON(json_config)が見つかりません。');
          return;
        }
        let config;
        try {
          config = JSON.parse(cfgStr);
        } catch (e) {
          alert('設定JSONのパースに失敗しました。');
          console.error(e);
          return;
        }

        // ルール判定
        const { allOk, reason } = evalRules(config, rec, true);
        const messages = config.messages || { ok: 'OK', ng: 'NG' };
        const verdict = allOk ? 'OK' : 'NG';

        // サブテーブル行を組み立て
        const tblCode = config.table?.fieldCode || 'scan_table';
        const col = config.table?.columns || {
          datetime: 'scan_at',
          A: 'col_a',
          B: 'col_b',
          C: 'col_c',
          result: 'result',
          reason: 'reason'
        };

        const row = {
          value: {}
        };
        // 表示用列
        row.value[col.datetime] = { value: new Date().toISOString() };                  // いまの時刻（必要に応じて field_b にしたいならここを rec.record[field_b].value に）
        row.value[col.A]        = { value: rec.record[(config.recordSchema.find(s=>s.key==='A')||{}).fieldCode]?.value ?? '' };
        row.value[col.B]        = { value: rec.record[(config.recordSchema.find(s=>s.key==='B')||{}).fieldCode]?.value ?? '' };
        row.value[col.C]        = { value: rec.record[(config.recordSchema.find(s=>s.key==='C')||{}).fieldCode]?.value ?? '' };
        row.value[col.result]   = { value: verdict };
        row.value[col.reason]   = { value: reason };

        // 既存テーブルを取得して push
        const app = kintone.app.getId();
        const recordId = rec.recordId || rec.record.$id.value;
        const current = rec.record[tblCode]?.value || [];

        const body = {
          app,
          id: recordId,
          record: {}
        };
        body.record[tblCode] = { value: [...current, row] };

        // PUT（revision:-1 で楽観ロック回避）
        const url = kintone.api.url('/k/v1/record.json', true);
        const res = await kintone.api(url, 'PUT', { ...body, revision: -1 });
        console.log('PUT ok:', res);

        // 画面反映
        kintone.app.record.set({ record: Object.assign({}, rec.record, body.record) });
        alert(allOk ? messages.ok : messages.ng);
        location.reload();
      } catch (e) {
        console.error(e);
        alert('処理中にエラーが発生しました。');
      }
    };
  });
})();
