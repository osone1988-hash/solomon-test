(function () {
  'use strict';

  // ==========================
  // 小ユーティリティ
  // ==========================
  const asNumber = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const asDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  };

  // text 比較
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
    const r = Array.isArray(R) ? R.map((d) => asDate(d).getTime()) : asDate(R).getTime();
    if (op === '>') return l > r;
    if (op === '>=') return l >= r;
    if (op === '<') return l < r;
    if (op === '<=') return l <= r;
    if (op === '==') return l === r;
    if (op === 'between') return Array.isArray(r) && l >= r[0] && l <= r[1];
    return false;
  };

  // ルール評価
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
  // SCAN UI（編集画面）
  // ==========================
  kintone.events.on('app.record.edit.show', () => {
    // 既に作っていたら何もしない
    if (document.getElementById('tana-scan-box')) return;

    // 入力ボックス
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

    const space = kintone.app.record.getSpaceElement
      ? kintone.app.record.getSpaceElement('') // スペース未使用ならヘッダ下に追加
      : null;
    (space || document.querySelector('.record-gaia') || document.body).prepend(wrap);

    clearBtn.onclick = () => { input.value = ''; input.focus(); };

    // QR -> 7項目を切り出し
    const parseQR = (s) => {
      // サンプル: "mekkiCUPET0812vc 16 6000 51104 AA 2 1"
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

    // Enterで実行
    input.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;

      const qr = parseQR(input.value);
      if (!qr) { alert('読み取り形式が不正です（7要素必要）'); return; }

      // 設定JSON取得＆パース
      const rec = kintone.app.record.get();
      let cfg;
      try {
        cfg = JSON.parse(rec.record.json_config.value || '{}');
      } catch (e) {
        alert('設定JSONのパースに失敗しました。'); return;
      }

      // ヘッダのフィールドにも反映（任意）
      if (rec.record.product_name) rec.record.product_name.value = qr.product_name || '';
      if (rec.record.width)        rec.record.width.value        = qr.width ?? '';
      if (rec.record.length)       rec.record.length.value       = qr.length ?? '';
      if (rec.record.lot_no)       rec.record.lot_no.value       = qr.lot_no || '';
      if (rec.record.label_no)     rec.record.label_no.value     = qr.label_no || '';
      if (rec.record.packs)        rec.record.packs.value        = qr.packs ?? '';
      if (rec.record.rotation)     rec.record.rotation.value     = qr.rotation ?? '';

      // ルール判定（A/B/C）
      const { allOk, reason } = evalRules(cfg, rec);

      // サブテーブル行の作成（ここが今回の型エラーの元になっていた部分）
      const tableCode = cfg.ui?.table?.fieldCode || 'scan_table';
      const cols = cfg.ui?.table?.columns || {
        datetime: 'scan_at', product: 'col_prod', width: 'col_width', length: 'col_length',
        lot: 'col_lot', label: 'col_label', packs: 'col_packs', rotation: 'col_rotation',
        result: 'result', reason: 'reason'
      };

      // 既存配列を確実に配列で用意
      const curr = Array.isArray(rec.record[tableCode]?.value) ? rec.record[tableCode].value : [];

      // 1セル書き込みヘルパ（kintone サブテーブルは { value: { code: { value } } } 形式）
      const put = (row, code, v) => { if (!code) return; row[code] = { value: v }; };

      const newRowValue = {};
      put(newRowValue, cols.datetime, new Date().toISOString());
      put(newRowValue, cols.product,  qr.product_name || '');
      put(newRowValue, cols.width,    qr.width ?? null);
      put(newRowValue, cols.length,   qr.length ?? null);
      put(newRowValue, cols.lot,      qr.lot_no || '');
      put(newRowValue, cols.label,    qr.label_no || '');
      put(newRowValue, cols.packs,    qr.packs ?? null);
      put(newRowValue, cols.rotation, qr.rotation ?? null);
      put(newRowValue, cols.result,   allOk ? 'OK' : 'NG');
      put(newRowValue, cols.reason,   allOk ? '' : reason);

      // デバッグ: 送る直前の形を確認したい時
      // console.log('[DEBUG newRowValue]', JSON.parse(JSON.stringify(newRowValue)));

      // 画面に反映（ここでは API は叩かず、edit 画面の値を書き換えるだけ）
      curr.push({ value: newRowValue });
      rec.record[tableCode] = { value: curr };
      kintone.app.record.set({ record: rec.record });

      // 次のスキャンに備えて
      input.value = '';
      input.focus();
    });
  });
})();
