(function () {
  // ===== util =====
  const byId = (id) => document.getElementById(id);

  // QR -> 7要素分解
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

  // サブテーブル行を組み立て
  function buildRow(cols, data) {
    const row = {};
    const put = (code, v) => { if (code) row[code] = { value: v }; };
    put(cols.datetime, new Date().toISOString());
    put(cols.product,  data.product_name ?? '');
    put(cols.width,    isNaN(data.width)    ? '' : Number(data.width));
    put(cols.length,   isNaN(data.length)   ? '' : Number(data.length));
    put(cols.lot,      data.lot_no ?? '');
    put(cols.label,    data.label_no ?? '');
    put(cols.packs,    isNaN(data.packs)    ? '' : Number(data.packs));
    put(cols.rotation, isNaN(data.rotation) ? '' : Number(data.rotation));
    put(cols.result,   '');       // gate.js が後で入れる
    put(cols.reason,   '');
    return { value: row };
  }

  // ===== state =====
  let cached = null;
  let cfg = null;

  // ===== edit.show =====
  kintone.events.on('app.record.edit.show', (event) => {
    cached = kintone.app.record.get();

    // 設定JSON
    try {
      cfg = JSON.parse(cached.record.json_config.value || '{}');
    } catch (_) {
      cfg = null;
      alert('設定JSONのパースに失敗しました。');
      return event;
    }

    // 列コード定義（JSONに無ければ既定を使用）
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

    // 既存行を normalize（不足列をすべて補完）
    const ALL = [
      cols.datetime, cols.product, cols.width, cols.length, cols.lot,
      cols.label, cols.packs, cols.rotation, cols.result, cols.reason
    ];
    const normalize = (row) => {
      const v = row?.value || {};
      const out = {};
      for (const c of ALL) out[c] = { value: (v[c]?.value ?? '') };
      return { value: out };
    };

    const rec = cached.record;
    const exists = Array.isArray(rec[tableCode]?.value) ? rec[tableCode].value : [];
    rec[tableCode] = { value: exists.map(normalize) };
    kintone.app.record.set({ record: rec });   // ここで赤バナーの元を除去
    cached = kintone.app.record.get();         // 以降も常に cached を使う

    // SCAN UI（重複作成しない）
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
      wrap.appendChild(label); wrap.appendChild(input); wrap.appendChild(clearBtn);

      const jsonEl = kintone.app.record.getFieldElement('json_config');
      (jsonEl?.parentElement?.parentElement || document.body).insertBefore(wrap, jsonEl?.parentElement || null);

      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;

        const parsed = parseScan(input.value);
        if (!parsed) { alert('スキャン形式が不正です。例: mekkiCUPET0812vc 16 6000 51104 AA 2 1'); return; }

        const r = kintone.app.record.get().record;   // 最新を取得（get はここならOK）
        const curr = Array.isArray(r[tableCode]?.value) ? r[tableCode].value : [];
        curr.push(buildRow(cols, parsed));
        r[tableCode] = { value: curr };
        kintone.app.record.set({ record: r });

        input.value = '';
        input.focus();
      });
    }

    return event;
  });
})();
