(function () {
  // ===== ユーティリティ =====
  const byId = (id) => document.getElementById(id);
  const numOrEmpty = (v) => (v === '' || v == null || isNaN(v) ? '' : String(v));
  const isoNow = () => new Date().toISOString();

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

  // サブテーブルの1行（valueのみ・typeは書かない）
  function buildRow(cols, data) {
    const row = {};
    row[cols.datetime] = { value: isoNow() };
    row[cols.product]  = { value: data.product_name ?? '' };
    row[cols.width]    = { value: numOrEmpty(data.width) };
    row[cols.length]   = { value: numOrEmpty(data.length) };
    row[cols.lot]      = { value: data.lot_no ?? '' };
    row[cols.label]    = { value: data.label_no ?? '' };
    row[cols.packs]    = { value: numOrEmpty(data.packs) };
    row[cols.rotation] = { value: numOrEmpty(data.rotation) };
    row[cols.result]   = { value: '' };
    row[cols.reason]   = { value: '' };
    return { value: row };
  }

  // サブテーブルの既存セルから誤って保存された "type" を除去
  function sanitizeSubtable(record, tableCode) {
    const t = record[tableCode];
    if (!t || !Array.isArray(t.value)) return;
    for (const row of t.value) {
      const cells = row.value || {};
      for (const k of Object.keys(cells)) {
        const cell = cells[k];
        if (cell && typeof cell === 'object' && 'type' in cell) {
          delete cell.type; // ←これが赤バナーの根本原因
        }
      }
    }
  }

  // ===== 状態 =====
  let cfg = null; // JSON設定
  let tableCode = 'scan_table';
  let cols = {
    datetime: 'scan_at',
    product:  'col_prod',
    width:    'col_width',
    length:   'col_length',
    lot:      'col_lot',
    label:    'col_label',
    packs:    'col_packs',
    rotation: 'col_rotation',
    result:   'result',
    reason:   'reason'
  };

  // ===== 編集画面 =====
  kintone.events.on('app.record.edit.show', (event) => {
    // 1) 設定JSON（event.recordから直接読む：ハンドラ内で get() は使わない）
    try {
      cfg = JSON.parse(event.record.json_config.value || '{}');
    } catch (e) {
      cfg = null;
      alert('設定JSONのパースに失敗しました。');
      return event;
    }
    // 2) テーブル設定を適用
    if (cfg?.ui?.table?.fieldCode) tableCode = cfg.ui.table.fieldCode;
    if (cfg?.ui?.table?.columns) cols = { ...cols, ...cfg.ui.table.columns };

    // 3) 既存データから誤った "type" を除去（表示時バナー対策）
    sanitizeSubtable(event.record, tableCode);

    // 4) SCAN UI（既にあれば再生成しない）
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

        // 最新の画面値を取得（ここはハンドラ外なので get() でOK）
        const recWrap = kintone.app.record.get();
        const rec = recWrap.record;
        const table = rec[tableCode];
        const curr = Array.isArray(table?.value) ? table.value : [];

        const newRow = buildRow(cols, parsed);
        curr.push(newRow);

        // type を書かずに value だけ更新
        if (!rec[tableCode]) rec[tableCode] = { value: [] };
        rec[tableCode].value = curr;

        kintone.app.record.set({ record: rec });

        input.value = '';
        input.focus();
      });
    }

    // show ハンドラの戻り値として**サニタイズ済み event**を返す
    return event;
  });
})();
