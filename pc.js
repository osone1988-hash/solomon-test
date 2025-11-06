(function () {
  'use strict';

  // ===== ユーティリティ =====
  const byId = (id) => document.getElementById(id);

  // サブテーブル列のデフォルト対応
  const DEFAULT_COLS = {
    datetime: 'scan_at',
    product: 'col_prod',
    width: 'col_width',
    length: 'col_length',
    lot: 'col_lot',
    label: 'col_label',
    packs: 'col_packs',
    rotation: 'col_rotation',
    result: 'result',
    reason: 'reason',
  };

  // 型付き値ファクトリ（undefined を出さない）
  const T = {
    text: (v) => ({ type: 'SINGLE_LINE_TEXT', value: v == null ? '' : String(v) }),
    mtext: (v) => ({ type: 'MULTI_LINE_TEXT', value: v == null ? '' : String(v) }),
    num: (v) => {
      const s = v == null ? '' : String(v).trim();
      // 空・非数は null（kintone NUMBER は null か「数値の文字列」）
      if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) {
        return { type: 'NUMBER', value: null };
      }
      return { type: 'NUMBER', value: s };
    },
    dt: (v) => {
      if (!v) return { type: 'DATETIME', value: null };
      const d = (v instanceof Date) ? v : new Date(v);
      return { type: 'DATETIME', value: d.toISOString() };
    },
  };

  // QR -> 7項目に分解（右詰め。製品名は先頭～残り全部）
  function parseScan(raw) {
    const s = (raw || '').trim();
    if (!s) return null;
    const a = s.split(/\s+/);
    if (a.length < 7) return null;

    const rotation = a.pop();
    const packs = a.pop();
    const label_no = a.pop();
    const lot_no = a.pop();
    const length = a.pop();
    const width = a.pop();
    const product_name = a.join(' ');

    return { product_name, width, length, lot_no, label_no, packs, rotation };
  }

  // サブテーブル行（type/value 完備・undefined を出さない）
  function buildRow(cols, data) {
    const v = {};
    v[cols.datetime] = T.dt(new Date());
    v[cols.product] = T.text(data.product_name);
    v[cols.width] = T.num(data.width);
    v[cols.length] = T.num(data.length);
    v[cols.lot] = T.text(data.lot_no);
    v[cols.label] = T.text(data.label_no);
    v[cols.packs] = T.num(data.packs);
    v[cols.rotation] = T.num(data.rotation);
    // 判定は別処理想定なので空で作成
    v[cols.result] = T.text('');
    v[cols.reason] = T.mtext('');

    return { value: v };
  }

  // ===== 画面生成（編集画面） =====
  kintone.events.on('app.record.edit.show', (event) => {
    const r = event.record;

    // 設定 JSON
    let cfg = {};
    try {
      cfg = JSON.parse((r.json_config && r.json_config.value) || '{}');
    } catch (e) {
      alert('設定JSONのパースに失敗しました。json_config を確認してください。');
      return event; // return true は使わない
    }

    // SCAN 入力 UI（重複生成しない）
    if (!byId('tana-scan')) {
      const wrap = document.createElement('div');
      wrap.style.margin = '8px 0 16px';

      const label = document.createElement('span');
      label.textContent = 'SCAN';
      label.style.marginRight = '8px';

      const input = document.createElement('input');
      input.id = 'tana-scan';
      input.type = 'text';
      input.placeholder = 'ここにスキャン（Enterで追加）';
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

      // Enter でサブテーブルへ 1 行追加
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();

        const parsed = parseScan(input.value);
        if (!parsed) {
          alert('スキャン形式が不正です。例: mekkiCUPET0812vc 16 6000 51104 AA 2 1');
          return;
        }

        const tableCode = (cfg && cfg.ui && cfg.ui.table && cfg.ui.table.fieldCode) || 'scan_table';
        const cols = (cfg && cfg.ui && cfg.ui.table && cfg.ui.table.columns) || DEFAULT_COLS;

        if (!r[tableCode]) r[tableCode] = { type: 'SUBTABLE', value: [] };
        if (!Array.isArray(r[tableCode].value)) r[tableCode].value = [];

        r[tableCode].value.push(buildRow(cols, parsed));

        // set は { record: ... } で呼ぶ
        kintone.app.record.set({ record: r });

        input.value = '';
        input.focus();
      });
    }

    return event;
  });
})();
