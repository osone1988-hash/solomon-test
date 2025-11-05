(function () {
  // ===== ユーティリティ =====
  const byId = (id) => document.getElementById(id);

  // フィールドコード -> type（app.record の type 名）対応
  const FIELD_TYPES = {
    scan_at:     'DATETIME',
    col_prod:    'SINGLE_LINE_TEXT',
    col_width:   'NUMBER',
    col_length:  'NUMBER',
    col_lot:     'SINGLE_LINE_TEXT',
    col_label:   'SINGLE_LINE_TEXT',
    col_packs:   'NUMBER',
    col_rotation:'NUMBER',
    result:      'SINGLE_LINE_TEXT',
    reason:      'MULTI_LINE_TEXT',
  };

  // QR -> 7項目に分解（例: "mekkiCUPET0812vc 16 6000 51104 AA 2 1"）
  function parseScan(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const t = raw.trim().replace(/\s+/g, ' ').split(' ');
    if (t.length < 7) return null;
    return {
      product_name: t.slice(0, t.length - 6).join(' '), // 製品名は可変長
      width:   Number(t[t.length - 6]),
      length:  Number(t[t.length - 5]),
      lot_no:  t[t.length - 4],
      label_no:t[t.length - 3],
      packs:   Number(t[t.length - 2]),
      rotation:Number(t[t.length - 1]),
    };
  }

  // サブテーブル行を app.record.set 互換の形に整形
  function buildRow(cols, data) {
    const row = {};

    // 値セット（type を必ず付ける。NUMBER は文字列化しておくと安定）
    const put = (code, v) => {
      if (!code) return;
      const t = FIELD_TYPES[code] || 'SINGLE_LINE_TEXT';
      let value = v;
      if (t === 'NUMBER' && v !== '' && v != null) value = String(v);
      if (t === 'DATETIME' && v instanceof Date) value = v.toISOString();
      row[code] = { type: t, value };
    };

    put(cols.datetime, new Date());                        // DATETIME
    put(cols.product,  data.product_name ?? '');           // TEXT
    put(cols.width,    isNaN(data.width) ? '' : data.width);         // NUMBER
    put(cols.length,   isNaN(data.length) ? '' : data.length);       // NUMBER
    put(cols.lot,      data.lot_no ?? '');                 // TEXT
    put(cols.label,    data.label_no ?? '');               // TEXT
    put(cols.packs,    isNaN(data.packs) ? '' : data.packs);         // NUMBER
    put(cols.rotation, isNaN(data.rotation) ? '' : data.rotation);   // NUMBER
    // result / reason は gate.js が後で入れるので空で作っておく
    put(cols.result,   '');
    put(cols.reason,   '');

    return { value: row };
  }

  // ===== 状態 =====
  let cached = null;
  let cfg = null;

  // ===== 画面生成（編集画面） =====
  kintone.events.on('app.record.edit.show', (event) => {
    // record をキャッシュ（以降は get を繰り返さない）
    cached = kintone.app.record.get();

    // 設定 JSON
    try {
      cfg = JSON.parse(cached.record.json_config.value || '{}');
    } catch (e) {
      cfg = null;
      alert('設定JSONのパースに失敗しました。');
      return event;
    }

    // SCAN 入力 UI（既にあれば再生成しない）
    if (!byId('tana-scan')) {
      const wrap = document.createElement('div');
      wrap.style.margin = '8px 0 16px';
      const label = document.createElement('span');
      label.textContent = 'SCAN';
      label.style.marginRight = '8px';
      const input = document.createElement('input');
      input.id = 'tana-scan';
      input.type = 'text';
      input.placeholder = 'ここにスキャン（Enterで判定）';
      input.style.cssText = 'width:420px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;';
      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'クリア';
      clearBtn.style.cssText = 'margin-left:8px;padding:6px 12px;';
      clearBtn.onclick = () => { input.value = ''; input.focus(); };

      wrap.appendChild(label);
      wrap.appendChild(input);
      wrap.appendChild(clearBtn);

      // JSON フィールドの直前に差し込む
      const jsonFieldEl = kintone.app.record.getFieldElement('json_config');
      if (jsonFieldEl && jsonFieldEl.parentElement) {
        jsonFieldEl.parentElement.parentElement.insertBefore(wrap, jsonFieldEl.parentElement);
      } else {
        document.body.appendChild(wrap);
      }

      // Enter で 1 行追加
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;

        const parsed = parseScan(input.value);
        if (!parsed) {
          alert('スキャン形式が不正です。例: mekkiCUPET0812vc 16 6000 51104 AA 2 1');
          return;
        }

        const rec = cached.record;
        const tableCode = cfg?.ui?.table?.fieldCode || 'scan_table';
        const cols = cfg?.ui?.table?.columns || {
          datetime: 'scan_at', product: 'col_prod', width: 'col_width', length: 'col_length',
          lot: 'col_lot', label: 'col_label', packs: 'col_packs', rotation: 'col_rotation',
          result: 'result', reason: 'reason',
        };

        const curr = Array.isArray(rec[tableCode]?.value) ? rec[tableCode].value : [];
        const newRow = buildRow(cols, parsed);
        curr.push(newRow);

        // set には「type を含む完全構造」を渡す
        rec[tableCode] = { type: 'SUBTABLE', value: curr };
        kintone.app.record.set({ record: rec });

        input.value = '';
        input.focus();
      });
    }

    return event;
  });
})();
