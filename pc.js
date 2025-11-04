(function () {
  // ====== ユーティリティ ======
  const asNumber = (v) => (v === '' || v == null ? null : Number(v));
  const asDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const isoNow = () => new Date().toISOString();

  // フィールドコード -> 画面用 type
  const COL_TYPES = {
    scan_at:      'DATETIME',
    col_prod:     'SINGLE_LINE_TEXT',
    col_width:    'NUMBER',
    col_length:   'NUMBER',
    lot_no:       'SINGLE_LINE_TEXT',
    label_no:     'SINGLE_LINE_TEXT',
    col_packs:    'NUMBER',
    col_rotation: 'NUMBER',
    result:       'SINGLE_LINE_TEXT',
    reason:       'MULTI_LINE_TEXT',
  };

  // 画面用セル
  const screenCell = (type, value) => ({ type, value });

  // 画面用の1行（サブテーブル）
  function buildScreenRow(row) {
    return {
      value: {
        scan_at:      screenCell(COL_TYPES.scan_at, row.scan_at),
        col_prod:     screenCell(COL_TYPES.col_prod, row.col_prod ?? ''),
        col_width:    screenCell(COL_TYPES.col_width, row.col_width == null ? null : Number(row.col_width)),
        col_length:   screenCell(COL_TYPES.col_length, row.col_length == null ? null : Number(row.col_length)),
        lot_no:       screenCell(COL_TYPES.lot_no, row.lot_no ?? ''),
        label_no:     screenCell(COL_TYPES.label_no, row.label_no ?? ''),
        col_packs:    screenCell(COL_TYPES.col_packs, row.col_packs == null ? null : Number(row.col_packs)),
        col_rotation: screenCell(COL_TYPES.col_rotation, row.col_rotation == null ? null : Number(row.col_rotation)),
        result:       screenCell(COL_TYPES.result, row.result ?? ''),
        reason:       screenCell(COL_TYPES.reason, row.reason ?? '')
      }
    };
  }

  // 既存行（画面 or PUT 由来）を **必ず画面用(type付き)** に正規化する
  function normalizeScreenRows(rawRows) {
    return (rawRows || []).map((r) => {
      const out = { value: {} };
      const v = r?.value || {};
      Object.keys(COL_TYPES).forEach((k) => {
        const t = COL_TYPES[k];
        const cell = v[k];

        if (cell && typeof cell === 'object' && 'type' in cell && 'value' in cell) {
          // すでに画面用 → そのまま
          out.value[k] = { type: t, value: cell.value };
        } else if (cell && typeof cell === 'object' && 'value' in cell) {
          // PUT形（型なし）→ 型を付与
          out.value[k] = { type: t, value: cell.value };
        } else if (cell != null) {
          // 万一プリミティブが入っていたら型を付け直す
          out.value[k] = { type: t, value: cell };
        } else {
          // 無い列は空値を型付きで用意
          const empty =
            t === 'NUMBER' ? null :
            t === 'DATETIME' ? '' :
            '';
          out.value[k] = { type: t, value: empty };
        }
      });
      // 既存の row.id はそのまま（あってもなくてもOK）
      if (r.id) out.id = r.id;
      return out;
    });
  }

  // PUT用の1行（サブテーブル）
  function buildPutRow(row) {
    return {
      value: {
        scan_at:      { value: row.scan_at },
        col_prod:     { value: row.col_prod ?? '' },
        col_width:    { value: row.col_width == null ? null : Number(row.col_width) },
        col_length:   { value: row.col_length == null ? null : Number(row.col_length) },
        lot_no:       { value: row.lot_no ?? '' },
        label_no:     { value: row.label_no ?? '' },
        col_packs:    { value: row.col_packs == null ? null : Number(row.col_packs) },
        col_rotation: { value: row.col_rotation == null ? null : Number(row.col_rotation) },
        result:       { value: row.result ?? '' },
        reason:       { value: row.reason ?? '' }
      }
    };
  }

  // ルール評価（A/B/C）
  function evalRules(config, recValues) {
    const rules = config.rules || [];
    const reasons = [];
    let allOk = true;

    for (const r of rules) {
      const left = recValues[r.key];
      const op = r.operator;
      const type = r.type;
      const right = r.value;
      let pass = false;

      if (type === 'text') {
        const ic = r.options?.ignoreCase;
        const L = (left ?? '').toString();
        const R = Array.isArray(right) ? right.map(String) : [String(right)];
        const Lc = ic ? L.toLowerCase() : L;
        const Rc = ic ? R.map((x) => x.toLowerCase()) : R;

        if (op === 'notContains') pass = Rc.every((x) => !Lc.includes(x));
        else if (op === 'contains') pass = Rc.some((x) => Lc.includes(x));
        else if (op === 'equals' || op === '==') pass = Rc.some((x) => Lc === x);
      } else if (type === 'number') {
        const L = Number(left);
        if (op === 'between') pass = L >= Number(right?.[0]) && L <= Number(right?.[1]);
        else if (op === '>=') pass = L >= Number(right);
        else if (op === '<=') pass = L <= Number(right);
        else if (op === '>') pass = L > Number(right);
        else if (op === '<') pass = L < Number(right);
      } else if (type === 'datetime') {
        const L = asDate(left)?.getTime();
        const R = asDate(right)?.getTime();
        if (L != null && R != null) {
          if (op === 'lte') pass = L <= R;
          else if (op === 'lt') pass = L < R;
          else if (op === 'gte') pass = L >= R;
          else if (op === 'gt') pass = L > R;
        }
      }

      if (!pass) {
        allOk = false;
        reasons.push(`key=${r.key} op=${op} val=${JSON.stringify(right)}`);
      }
    }
    return { allOk, reason: reasons.join(' / ') };
  }

  // 音声（GitHub Pages 上に置いてください）
  const sounds = {
    ok: new Audio('https://osone1988-hash.github.io/solomon-test/assets/sound_ok.mp3'),
    ng: new Audio('https://osone1988-hash.github.io/solomon-test/assets/sound_error.mp3')
  };
  function playOk(vol) { try { sounds.ok.volume = vol ?? 0.4; sounds.ok.play(); } catch(e){} }
  function playNg(vol) { try { sounds.ng.volume = vol ?? 0.4; sounds.ng.play(); } catch(e){} }

  // ====== QR（7項目） ======
  function parseSevenItems(raw) {
    const parts = (raw || '').trim().split(/\s+/);
    const [prod, width, length, lot, label, packs, rotation] = [
      parts[0] ?? '', parts[1] ?? '', parts[2] ?? '',
      parts[3] ?? '', parts[4] ?? '', parts[5] ?? '', parts[6] ?? ''
    ];
    return {
      col_prod: prod,
      col_width: asNumber(width),
      col_length: asNumber(length),
      lot_no: lot,
      label_no: label,
      col_packs: asNumber(packs),
      col_rotation: asNumber(rotation)
    };
  }

  // ====== 編集画面：SCAN UI ======
  kintone.events.on('app.record.edit.show', (event) => {
    if (document.getElementById('tana-scan-box')) return event;

    const rec = event.record;

    // 設定JSON（json_config -> json）
    const cfgStr = rec.json_config?.value || rec.json?.value || '';
    let config = {};
    try { config = cfgStr ? JSON.parse(cfgStr) : {}; }
    catch (e) { alert('設定JSONのパースに失敗しました。'); console.error(e); return event; }

    const area = document.createElement('div');
    area.id = 'tana-scan-box';
    area.style.cssText = 'padding:8px;background:#fff2b3;border:1px solid #e5d17a;margin:8px 0;border-radius:6px;';
    area.innerHTML = `
      <label style="font-weight:600;margin-right:8px;">SCAN</label>
      <input id="tana-scan-input" type="text" style="width:420px;padding:6px;" placeholder="ここにスキャン（Enterで判定）">
      <button id="tana-scan-clear" style="margin-left:8px;">クリア</button>
    `;
    const container = document.querySelector('.gaia-argoui-app-editlayout-wrapper') || document.body;
    container.prepend(area);

    const input = document.getElementById('tana-scan-input');
    document.getElementById('tana-scan-clear').onclick = () => { input.value = ''; input.focus(); };

    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const raw = input.value.trim();
      if (!raw) return;

      try {
        const parsed = parseSevenItems(raw);

        // ルール評価用 A/B/C
        const A = rec.field_a?.value ?? '';
        const B = rec.field_b?.value ?? '';
        const C = asNumber(rec.field_c?.value);
        const { allOk, reason } = evalRules(config, { A, B, C });

        const screenRowData = {
          scan_at: isoNow(),
          ...parsed,
          result: allOk ? (config.messages?.ok ?? 'OK') : (config.messages?.ng ?? 'NG'),
          reason: allOk ? '' : reason
        };

        const tableCode = config.ui?.table?.fieldCode || 'scan_table';

        // 1) 既存行を **正規化**
        const curr = rec[tableCode]?.value || [];
        const normalized = normalizeScreenRows(curr);

        // 2) 新行を画面用で追加して set
        const nextScreenRows = normalized.concat([ buildScreenRow(screenRowData) ]);
        rec[tableCode].value = nextScreenRows;
        kintone.app.record.set({ record: rec });

        // 3) PUT 用の形でサーバ反映
        const url = kintone.api.url('/k/v1/record.json', true);
        const putBody = {
          app: kintone.app.getId(),
          id: rec.$id?.value || event.recordId,
          record: {
            [tableCode]: {
              value: nextScreenRows.map(r => ({
                id: r.id, // 既存行は id を残す
                value: Object.fromEntries(
                  Object.keys(r.value).map(k => [k, { value: r.value[k].value }])
                )
              }))
            }
          }
        };
        await kintone.api(url, 'PUT', putBody);

        // 4) 音
        if (allOk) playOk(config.sounds?.ok?.volume ?? 0.4);
        else playNg(config.sounds?.ng?.volume ?? 0.4);

        input.value = '';
        input.focus();

      } catch (err) {
        console.error(err);
        alert('処理中にエラーが発生しました。');
      }
    });

    input.focus();
    return event;
  });
})();
