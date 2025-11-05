(function () {
  // ===== ユーティリティ =====
  const byId = (id) => document.getElementById(id);

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

  // kintone NUMBER は文字列が安全
  const numOrEmpty = (v) => (v === '' || v == null || isNaN(v) ? '' : String(v));
  const isoNow = () => new Date().toISOString();

  // サブテーブル1行の { value: { fieldCode: { value } } } を作る（typeを絶対に書かない）
  function buildRow(cols, data) {
    const row = {};
    row[cols.datetime] = { value: isoNow() };                 // DATETIME
    row[cols.product]  = { value: data.product_name ?? '' };  // TEXT
    row[cols.width]    = { value: numOrEmpty(data.width) };   // NUMBER(文字列)
    row[cols.length]   = { value: numOrEmpty(data.length) };  // NUMBER(文字列)
    row[cols.lot]      = { value: data.lot_no ?? '' };        // TEXT
    row[cols.label]    = { value: data.label_no ?? '' };      // TEXT
    row[cols.packs]    = { value: numOrEmpty(data.packs) };   // NUMBER(文字列)
    row[cols.rotation] = { value: numOrEmpty(data.rotation) };// NUMBER(文字列)
    // result / reason は後工程でセットする想定なので空で用意
    row[cols.result]   = { value: '' };
    row[cols.reason]   = { value: '' };
    return { value: row };
  }

  // ===== 状態 =====
  let cached = null;  // kintone.app.record.get() の結果をキャッシュ
  let cfg = null;

  // ===== 画面生成（編集画面） =====
  kintone.events.on('app.record.edit.show', (event) => {
    // record をキャッシュ
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

        const table = rec[tableCode];
        const curr = Array.isArray(table?.value) ? table.value : [];
        const newRow = buildRow(cols, parsed);
        curr.push(newRow);

        // ここで type を書かない。既存の record 構造をそのまま更新して set
        if (!rec[tableCode]) rec[tableCode] = { value: [] };
        rec[tableCode].value = curr;

        kintone.app.record.set({ record: rec });

        input.value = '';
        input.focus();
      });
    }

    return event;
  });
})();
