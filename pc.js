(function () {
  'use strict';

  // ==========================
  // util
  // ==========================
  const asNumber = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const asDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  };

  const cmpText = (L, op, R, opt) => {
    const lower = !!(opt && opt.ignoreCase);
    const toS = (x) => (x == null ? '' : String(x));
    const norm = (x) => (lower ? toS(x).toLowerCase() : toS(x));
    L = norm(L);
    if (Array.isArray(R)) R = R.map(norm); else R = norm(R);
    if (op === 'equals' || op === '==') return L === R;
    if (op === 'contains') return L.includes(R);
    if (op === 'notContains') return !L.includes(R);
    if (op === 'in') return Array.isArray(R) && R.includes(L);
    if (op === 'notIn') return Array.isArray(R) && !R.includes(L);
    return false;
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
    if (op === '>') return l > r;
    if (op === '>=') return l >= r;
    if (op === '<') return l < r;
    if (op === '<=') return l <= r;
    if (op === '==') return l === r;
    if (op === 'between') return Array.isArray(r) && l >= r[0] && l <= r[1];
    return false;
  };

  function evalRules(config, rec) {
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
      const op = r.operator;
      const right =
        r.type === 'number'
          ? Array.isArray(r.value) ? r.value.map(asNumber) : asNumber(r.value)
          : r.value;

      let pass = false;
      if (r.type === 'text') pass = cmpText(left, op, right, r.options || {});
      else if (r.type === 'number') pass = cmpNum(left, op, right);
      else if (r.type === 'datetime') pass = cmpDate(left, op, right);
      results.push({ ok: pass, reason: pass ? '' : `key=${r.key} op=${op} val=${JSON.stringify(r.value)}` });
    }
    return { allOk: results.every((x) => x.ok), reason: results.filter((x) => !x.ok).map((x) => x.reason).join(' / ') };
  }

  // ==========================
  // 編集画面 UI（SCAN）
  // ==========================
  kintone.events.on('app.record.edit.show', () => {
    if (document.getElementById('tana-scan-box')) return;

    const wrap = document.createElement('div');
    wrap.id = 'tana-scan-box';
    wrap.style.cssText = 'margin:8px 0;padding:6px;border-radius:6px;border:1px solid #e5e7eb;background:#fffbdd;';
    const label = document.createElement('span');
    label.textContent = 'SCAN ';
    label.style.marginRight = '8px';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'ここにスキャン（Enterで判定）';
    input.style.width = '360px';
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'クリア';
    clearBtn.style.marginLeft = '8px';
    wrap.append(label, input, clearBtn);

    (document.querySelector('.record-gaia') || document.body).prepend(wrap);

    clearBtn.onclick = () => { input.value = ''; input.focus(); };

    // QR -> 7項目（あなたの会社の形式）
    const parseQR = (s) => {
      const a = String(s || '').trim().split(/\s+/);
      if (a.length < 7) return null;
      return {
        product_name: a[0],
        width: asNumber(a[1]),
        length: asNumber(a[2]),
        lot_no: a[3],
        label_no: a[4],
        packs: asNumber(a[5]),
        rotation: asNumber(a[6])
      };
    };

    // Enterで処理
    input.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;

      const qr = parseQR(input.value);
      if (!qr) { alert('読み取り形式が不正です（7要素必要）'); return; }

      const rec = kintone.app.record.get();

      // 設定 JSON
      let cfg;
      try { cfg = JSON.parse(rec.record.json_config.value || '{}'); }
      catch { alert('設定JSONのパースに失敗しました。'); return; }

      // ルール評価（A/B/C はヘッダの field_a/field_b/field_c）
      const { allOk, reason } = evalRules(cfg, rec);

      // ===== サブテーブル行を作る =====
      const tableCode = cfg.ui?.table?.fieldCode || 'scan_table';
      const cols = cfg.ui?.table?.columns || {
        datetime: 'scan_at',
        product: 'col_prod',
        width: 'col_width',
        length: 'col_length',
        lot: 'col_lot',
        label: 'col_label',
        packs: 'col_packs',
        rotation: 'col_rotation',
        result: 'result',
        reason: 'reason'
      };

      // サブテーブルの型マップ（kintone は数値も文字列で渡す！）
      const TYPE = {
        [cols.datetime]: 'DATETIME',
        [cols.product]:  'TEXT',
        [cols.width]:    'NUMBER',
        [cols.length]:   'NUMBER',
        [cols.lot]:      'TEXT',
        [cols.label]:    'TEXT',
        [cols.packs]:    'NUMBER',
        [cols.rotation]: 'NUMBER',
        [cols.result]:   'TEXT',
        [cols.reason]:   'TEXT'
      };

      const formatForKintone = (code, v) => {
        if (v === null || v === undefined) return '';
        const t = TYPE[code];
        if (t === 'NUMBER') return String(v);                   // ← ここがポイント
        if (t === 'DATETIME') return new Date(v).toISOString(); // 例: 2025-11-05T07:00:00.000Z
        return String(v);
      };

      const put = (row, code, v) => { if (!code) return; row[code] = { value: formatForKintone(code, v) }; };

      const newRowValue = {};
      put(newRowValue, cols.datetime, new Date());
      put(newRowValue, cols.product,  qr.product_name);
      put(newRowValue, cols.width,    qr.width);
      put(newRowValue, cols.length,   qr.length);
      put(newRowValue, cols.lot,      qr.lot_no);
      put(newRowValue, cols.label,    qr.label_no);
      put(newRowValue, cols.packs,    qr.packs);
      put(newRowValue, cols.rotation, qr.rotation);
      put(newRowValue, cols.result,   allOk ? 'OK' : 'NG');
      put(newRowValue, cols.reason,   allOk ? '' : reason);

      // デバッグ（必要なら有効化）
      // console.log('[DEBUG newRowValue]', JSON.parse(JSON.stringify(newRowValue)));

      const curr = Array.isArray(rec.record[tableCode]?.value) ? rec.record[tableCode].value : [];
      curr.push({ value: newRowValue });
      rec.record[tableCode] = { value: curr };
      kintone.app.record.set({ record: rec.record });

      input.value = '';
      input.focus();
    });
  });
})();
