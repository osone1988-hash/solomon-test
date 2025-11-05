(function () {
  // ---------- util ----------
  const byId = (id) => document.getElementById(id);

  // QR -> 7項目（製品名 / 幅 / 長さ / ロット / ラベル / 梱包数 / 回転数）
  function parseScan(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const t = raw.trim().replace(/\s+/g, ' ').split(' ');
    if (t.length < 7) return null;
    return {
      product_name: t.slice(0, t.length - 6).join(' '),
      width: Number(t[t.length - 6]),
      length: Number(t[t.length - 5]),
      lot_no: t[t.length - 4],
      label_no: t[t.length - 3],
      packs: Number(t[t.length - 2]),
      rotation: Number(t[t.length - 1]),
    };
  }

  // サブテーブル1セルを {type, value} で作る
  const T = {
    TEXT: (v = '') => ({ type: 'SINGLE_LINE_TEXT', value: String(v) }),
    MULTI: (v = '') => ({ type: 'MULTI_LINE_TEXT', value: String(v) }),
    NUM:  (v = '') => ({ type: 'NUMBER', value: (v === '' || isNaN(v)) ? null : Number(v) }),
    DT:   (v) => ({ type: 'DATETIME', value: v ?? '' }),
  };

  // サブテーブル行を { value: { colCode: {type, value}, ... } } に整形
  function buildRow(cols, data) {
    const nowIso = new Date().toISOString();

    const row = {};
    row[cols.datetime] = T.DT(nowIso);
    row[cols.product]  = T.TEXT(data.product_name ?? '');
    row[cols.width]    = T.NUM(data.width);
    row[cols.length]   = T.NUM(data.length);
    row[cols.lot]      = T.TEXT(data.lot_no ?? '');
    row[cols.label]    = T.TEXT(data.label_no ?? '');
    row[cols.packs]    = T.NUM(data.packs);
    row[cols.rotation] = T.NUM(data.rotation);
    // 判定結果は gate.js が書き込むので空で保持
    row[cols.result]   = T.TEXT('');
    row[cols.reason]   = T.MULTI('');

    return { value: row };
  }

  let cached = null;   // kintone.app.record.get() の結果を保持
  let cfg = null;      // json_config

  kintone.events.on('app.record.edit.show', (event) => {
    // record を一度だけ取得（keydown 内では get() を呼ばない）
    cached = kintone.app.record.get();

    // 設定 JSON
    try {
      cfg = JSON.parse(cached.record.json_config.value || '{}');
    } catch {
      cfg = null;
      alert('設定JSONのパースに失敗しました。');
      return event;
    }

    // SCAN 入力 UI（既にあれば作らない）
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

      const jsonFieldEl = kintone.app.record.getFieldElement('json_config');
      if (jsonFieldEl && jsonFieldEl.parentElement) {
        jsonFieldEl.parentElement.parentElement.insertBefore(wrap, jsonFieldEl.parentElement);
      } else {
        document.body.appendChild(wrap);
      }

      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;

        const parsed = parseScan(input.value);
        if (!parsed) {
          alert('スキャン形式が不正です。例: mekkiCUPET0812vc 16 6000 51104 AA 2 1');
          return;
        }

        // 以降は cached を直接触る
        const rec = cached.record;

        const tableCode = cfg?.ui?.table?.fieldCode || 'scan_table';
        const cols = cfg?.ui?.table?.columns || {
          datetime: 'scan_at',
          product:  'col_prod',
          width:    'col_width',
          length:   'col_length',
          lot:      'col_lot',
          label:    'col_label',
          packs:    'col_packs',
          rotation: 'col_rotation',
          result:   'result',
          reason:   'reason',
        };

        // 既存配列（なければ空）
        const curr = Array.isArray(rec[tableCode]?.value) ? rec[tableCode].value : [];

        // 新行を追加（type 付き）
        curr.push(buildRow(cols, parsed));

        // 反映
        rec[tableCode] = { value: curr };
        kintone.app.record.set({ record: rec });

        input.value = '';
        input.focus();
      });
    }

    return event;
  });
})();
