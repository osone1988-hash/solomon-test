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

// ========= ここから差し替え（判定→1行生成→保存） =========
async function judgeAndAppendRow(rec) {
  const cfg = JSON.parse(rec.json_config.value || '{}');

  // 値マップ {A,B,C,...}
  const valueMap = {};
  (cfg.recordSchema || []).forEach(s => {
    const f = rec[s.fieldCode];
    let v = f ? f.value : null;
    if (s.type === 'number')   v = (v === '' || v == null) ? null : Number(v);
    if (s.type === 'datetime') v = v ? new Date(v) : null;
    valueMap[s.key] = v;
  });

  // ルール評価
  const reasons = [];
  const ok = (cfg.rules || []).every(r => {
    const left = valueMap[r.key];
    const op   = r.operator;
    const right = r.value;

    const str = (x) => (x ?? '').toString().toLowerCase();
    const num = (x) => Number(x);
    const d   = (x) => (x ? new Date(x).getTime() : null);

    if (r.type === 'text') {
      if (op === 'equals')      return str(left) === str(right);
      if (op === 'contains')    return str(left).includes(str(right));
      if (op === 'notContains') return !str(left).includes(str(right));
      reasons.push(`text未対応op:${op}`); return false;
    }
    if (r.type === 'number') {
      const L = num(left);
      if (op === '>=') return L >= num(right);
      if (op === '>')  return L >  num(right);
      if (op === '<=') return L <= num(right);
      if (op === '<')  return L <  num(right);
      if (op === 'between') {
        const [min, max] = right || [];
        return L >= num(min) && L <= num(max);
      }
      reasons.push(`number未対応op:${op}`); return false;
    }
    if (r.type === 'datetime') {
      const L = d(left), R = d(right);
      if (L == null || R == null) { reasons.push('datetime欠落'); return false; }
      if (op === 'lte') return L <= R;
      if (op === 'lt')  return L <  R;
      if (op === 'gte') return L >= R;
      if (op === 'gt')  return L >  R;
      reasons.push(`datetime未対応op:${op}`); return false;
    }
    reasons.push(`未知type:${r.type}`); return false;
  });

  // テーブル1行を構築
  const cols = (cfg.ui?.table?.columns) || {};
  const row = {};
  const setCell = (fieldCode, value) => {
    if (!fieldCode) return;
    row[fieldCode] = { value };
  };

  // 日時列は「今」を入れる（field_b をコピーしたい場合は valueMap.B を使う）
  setCell(cols.datetime, new Date().toISOString());
  setCell(cols.A, valueMap.A);
  setCell(cols.B, valueMap.B ? new Date(valueMap.B).toISOString() : '');
  setCell(cols.C, valueMap.C);
  setCell(cols.result, ok ? 'OK' : 'NG');
  setCell(cols.reason, ok ? '' : reasons.join(' / '));

  // 既存テーブル値を取得→末尾にpush
  const tableCode = cfg.ui?.table?.fieldCode;
  const table = rec[tableCode];
  const newTable = (table?.value || []).concat([{ value: row }]);

  // PUT
  const body = {
    app: kintone.app.getId(),
    id: (rec.recordId || rec.$id?.value),
    record: { [tableCode]: { value: newTable } }
  };

  const url = kintone.api.url('/k/v1/record.json', true);
  const res = await kintone.api(url, 'PUT', body);
  console.log('[TANA] PUT ok:', res);
  alert(ok ? 'サブテーブルに行追加しました。' : 'NG行を追加しました（理由はテーブル参照）');
}
// ========= 差し替えここまで =========


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

