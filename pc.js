(function () {
  // ====== ユーティリティ ======
  const asNumber = (v) => (v === '' || v == null ? null : Number(v));
  const asDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const isoNow = () => new Date().toISOString();

  // 画面用セルオブジェクト（type 付き）
  const screenCell = (type, value) => ({ type, value });

  // 画面用の1行（サブテーブル）
  function buildScreenRow(row) {
    // row はプリミティブ値（画面表示用）を入れて渡す
    return {
      value: {
        scan_at:      screenCell('DATETIME', row.scan_at),
        col_prod:     screenCell('SINGLE_LINE_TEXT', row.col_prod ?? ''),
        col_width:    screenCell('NUMBER', row.col_width == null ? null : Number(row.col_width)),
        col_length:   screenCell('NUMBER', row.col_length == null ? null : Number(row.col_length)),
        lot_no:       screenCell('SINGLE_LINE_TEXT', row.lot_no ?? ''),
        label_no:     screenCell('SINGLE_LINE_TEXT', row.label_no ?? ''),
        col_packs:    screenCell('NUMBER', row.col_packs == null ? null : Number(row.col_packs)),
        col_rotation: screenCell('NUMBER', row.col_rotation == null ? null : Number(row.col_rotation)),
        result:       screenCell('SINGLE_LINE_TEXT', row.result ?? ''),
        reason:       screenCell('MULTI_LINE_TEXT', row.reason ?? '')
      }
    };
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
    // recValues は次の形を想定： { A:'...', B:'YYYY-...', C:number }
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

  // 音声
  const sounds = {
    ok: new Audio('https://osone1988-hash.github.io/solomon-test/assets/sound_ok.mp3'),
    ng: new Audio('https://osone1988-hash.github.io/solomon-test/assets/sound_error.mp3')
  };

  function playOk(vol) { try { sounds.ok.volume = vol ?? 0.4; sounds.ok.play(); } catch(e){} }
  function playNg(vol) { try { sounds.ng.volume = vol ?? 0.4; sounds.ng.play(); } catch(e){} }

  // ====== QRパース（7項目） ======
  // 例： "mekkiCUPET0812vc 16 6000 51104 AA 2 1"
  function parseSevenItems(raw) {
    // 区切りは空白・タブを許容
    const parts = (raw || '').trim().split(/\s+/);
    // 7個より長ければ先頭7つ、短ければ不足分は空文字に
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

  // ====== 編集画面に SCAN UI を設置 ======
  kintone.events.on('app.record.edit.show', (event) => {
    // 既に設置済みならスキップ
    if (document.getElementById('tana-scan-box')) return event;

    const rec = event.record;

    // 1) JSON設定読み込み（json_config -> json の順に）
    let cfgStr = rec.json_config?.value || rec.json?.value || '';
    let config = {};
    try {
      config = cfgStr ? JSON.parse(cfgStr) : {};
    } catch (e) {
      alert('設定JSONのパースに失敗しました。');
      console.error(e);
      return event;
    }

    // 2) UI設置
    const area = document.createElement('div');
    area.id = 'tana-scan-box';
    area.style.cssText = 'padding:8px;background:#fff2b3;border:1px solid #e5d17a;margin:8px 0;border-radius:6px;';
    area.innerHTML = `
      <label style="font-weight:600;margin-right:8px;">SCAN</label>
      <input id="tana-scan-input" type="text" style="width:420px;padding:6px;" placeholder="ここにスキャン（Enterで判定）">
      <button id="tana-scan-clear" style="margin-left:8px;">クリア</button>
    `;

    // 先頭のフィールドの上に差し込む（見やすい位置に）
    const root = kintone.app.record.getSpaceElement?.('') || document.querySelector('.gaia-argoui-app-editlayout-body');
    const target = document.querySelector('.gaia-argoui-app-editlayout-wrapper') || root || document.body;
    target.prepend(area);

    // ハンドラ
    const input = document.getElementById('tana-scan-input');
    const btnClear = document.getElementById('tana-scan-clear');
    btnClear.onclick = () => { input.value = ''; input.focus(); };

    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;

      const raw = input.value.trim();
      if (!raw) return;

      try {
        // 2-1) QR分解（7項目）
        const parsed = parseSevenItems(raw);

        // 2-2) ルール判定のための A/B/C を、現在のレコードから取得
        // A: field_a(text), B: field_b(datetime), C: field_c(number)
        const A = rec.field_a?.value ?? '';
        const B = rec.field_b?.value ?? '';
        const C = asNumber(rec.field_c?.value);

        const { allOk, reason } = evalRules(config, { A, B, C });

        // 2-3) 行データ（画面表示用のプリミティブ値）
        const screenRowData = {
          scan_at: isoNow(),
          ...parsed,
          result: allOk ? (config.messages?.ok ?? 'OK') : (config.messages?.ng ?? 'NG'),
          reason: allOk ? '' : reason
        };

        // 2-4) 画面に反映（type付き）
        const tableCode = config.ui?.table?.fieldCode || 'scan_table';
        const curr = rec[tableCode]?.value || [];
        const nextScreenRows = curr.concat([ buildScreenRow(screenRowData) ]);
        rec[tableCode].value = nextScreenRows;
        kintone.app.record.set({ record: rec });

        // 2-5) サーバにPUT（typeなし）
        const url = kintone.api.url('/k/v1/record.json', true);
        const putBody = {
          app: kintone.app.getId(),
          id: rec.$id?.value || event.recordId,
          record: {
            [tableCode]: {
              value: (curr.map(r => ({ id: r.id, value: Object.fromEntries(
                Object.keys(r.value).map(k => [k, { value: r.value[k].value }])
              )}))).concat([ buildPutRow(screenRowData) ])
            }
          }
        };
        await kintone.api(url, 'PUT', putBody);

        // 2-6) 音（最後に）
        if (allOk) playOk(config.sounds?.ok?.volume ?? 0.4);
        else playNg(config.sounds?.ng?.volume ?? 0.4);

        // 次のスキャンへ
        input.value = '';
        input.focus();

      } catch (err) {
        console.error(err);
        alert('処理中にエラーが発生しました。');
      }
    });

    // 初回フォーカス
    input.focus();
    return event;
  });
})();
