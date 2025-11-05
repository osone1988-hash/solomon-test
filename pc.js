(function () {
  // ====== ユーティリティ ======
  const byId = (id) => document.getElementById(id);

  // QR -> 7項目に分解（例: "mekkiCUPET0812vc 16 6000 51104 AA 2 1"）
  function parseScan(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const t = raw.trim().replace(/\s+/g, ' ').split(' ');
    if (t.length < 7) return null;
    return {
      product_name: t.slice(0, t.length - 6).join(' '), // 製品名は可変長を許容
      width: Number(t[t.length - 6]),
      length: Number(t[t.length - 5]),
      lot_no: t[t.length - 4],
      label_no: t[t.length - 3],
      packs: Number(t[t.length - 2]),
      rotation: Number(t[t.length - 1]),
    };
  }

  // サブテーブル行を kintone 形式に整形
  function buildRow(cols, data) {
    const row = {};
    const put = (code, v) => {
      if (!code) return;
      row[code] = { value: v };
    };
    put(cols.datetime, new Date().toISOString());
    put(cols.product, data.product_name ?? '');
    put(cols.width, isNaN(data.width) ? '' : Number(data.width));
    put(cols.length, isNaN(data.length) ? '' : Number(data.length));
    put(cols.lot, data.lot_no ?? '');
    put(cols.label, data.label_no ?? '');
    put(cols.packs, isNaN(data.packs) ? '' : Number(data.packs));
    put(cols.rotation, isNaN(data.rotation) ? '' : Number(data.rotation));
    // result / reason は gate.js 判定が入れるので空でOK
    return { value: row };
  }

  // ====== 状態（edit.show で初期化） ======
  let cached;       // {record, ...} をキャッシュ
  let cfg = null;   // JSON設定（json_config）

  // ====== 画面生成（edit.show） ======
  kintone.events.on('app.record.edit.show', (event) => {
    // 1) record を一度だけ取得 → 以降は cached を触る。keydown 内で get() は呼ばない！
    cached = kintone.app.record.get();

    // 2) 設定JSONの読み込み
    try {
      cfg = JSON.parse(cached.record.json_config.value || '{}');
    } catch (e) {
      cfg = null;
      alert('設定JSONのパースに失敗しました。');
      return event;
    }

    // 3) SCAN 入力欄（既にあれば再作成しない）
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

      // JSONテキストエリアの直前あたりに差し込む
      const jsonFieldEl = kintone.app.record.getFieldElement('json_config');
      if (jsonFieldEl && jsonFieldEl.parentElement) {
        jsonFieldEl.parentElement.parentElement.insertBefore(wrap, jsonFieldEl.parentElement);
      } else {
        // 最悪フッターに
        document.body.appendChild(wrap);
      }

      // 4) Enter で登録
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;

        const parsed = parseScan(input.value);
        if (!parsed) {
          alert('スキャン形式が不正です。例: mekkiCUPET0812vc 16 6000 51104 AA 2 1');
          return;
        }

        // ---- ここからは cached を直接更新する（get() を呼ばない） ----
        const rec = cached.record;

        // サブテーブル情報
        const tableCode = cfg?.ui?.table?.fieldCode || 'scan_table';
        const cols = cfg?.ui?.table?.columns || {
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

        // 現在のテーブル配列（なければ空配列）
        const curr = Array.isArray(rec[tableCode]?.value) ? rec[tableCode].value : [];

        // 1行組み立て → 末尾に追加
        const newRow = buildRow(cols, parsed);
        curr.push(newRow);

        // レコードへ反映（正しい形で上書き）
        rec[tableCode] = { value: curr };

        // 画面へ反映（get() は使わず set() だけ）
        kintone.app.record.set({ record: rec });

        // 次スキャンに備えて
        input.value = '';
        input.focus();
      });
    }

    return event;
  });
})();
