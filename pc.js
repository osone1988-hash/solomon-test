(function () {
  // =========================
  //  ユーティリティ
  // =========================
  const asNumber = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const asDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  // 数値比較
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
  // 日時比較
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
  // テキスト比較
  const cmpText = (L, op, R, opt) => {
    const lower = !!(opt && opt.ignoreCase);
    const toS = (x) => (x == null ? '' : String(x));
    const norm = (x) => (lower ? toS(x).toLowerCase() : toS(x));
    L = norm(L);
    if (Array.isArray(R)) R = R.map(norm);
    else R = norm(R);

    if (op === 'equals' || op === '==') return L === R;
    if (op === 'contains') return L.includes(R);
    if (op === 'notContains') return !L.includes(R);
    if (op === 'in') return Array.isArray(R) && R.includes(L);
    if (op === 'notIn') return Array.isArray(R) && !R.includes(L);
    return false;
  };

  // ルール評価（json_config.rules を使用）
  function evalRules(config, rec, log = false) {
    // key -> fieldCode の辞書（A/B/C を field_a/field_b/field_c に割当）
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));

    const readByKey = (key, type) => {
      const code = key2code[key];
      const f = code && rec.record[code];
      const v = f ? f.value : null;
      if (type === 'number') return asNumber(v);
      if (type === 'datetime') return asDate(v);
      return v;
    };

    const results = [];
    for (const r of config.rules || []) {
      const left = readByKey(r.key, r.type);
      const op = r.operator;
      const right =
        r.type === 'number'
          ? Array.isArray(r.value)
            ? r.value.map(asNumber)
            : asNumber(r.value)
          : r.value;

      let ok = false;
      if (r.type === 'number') ok = cmpNum(left, op, right);
      else if (r.type === 'datetime') ok = cmpDate(left, op, right);
      else if (r.type === 'text') ok = cmpText(left, op, right, r.options || {});
      else results.push({ ok: false, reason: `未対応type:${r.type}` });

      if (log) console.log('[RULE]', { key: r.key, type: r.type, op, left, right, pass: ok });
      results.push({ ok, reason: ok ? '' : `key=${r.key} op=${op} val=${JSON.stringify(r.value)}` });
    }

    const allOk = results.every((x) => x.ok);
    const reason = results.filter((x) => !x.ok).map((x) => x.reason).join(' / ');
    return { allOk, reason };
  }

  // 効果音（OK/NG）
  function playSound(url, volume = 0.5) {
    if (!url) return;
    try {
      const a = new Audio(url);
      a.volume = Math.min(Math.max(volume, 0), 1);
      a.play();
    } catch (e) {
      console.warn('sound error', e);
    }
  }

  // =========================
  //  QR パーサ（M2）
  // =========================
  // 仕様：末尾6トークンを固定として分解
  //   product_name  width  length  lot_no  label_no  packs  rotation
  //   例) "mekkiCUPET0812vc 16 6000 51104 AA 2 1"
  //   → product_name="mekkiCUPET0812vc", width=16, length=6000, lot_no="51104",
  //      label_no="AA", packs=2, rotation=1
  function parseQR(raw) {
    if (!raw || !raw.trim()) throw new Error('空文字です');
    const parts = raw.trim().split(/\s+/);
    if (parts.length < 7) throw new Error('要素数が足りません（7要素必要）');

    const rotation = parts.pop();
    const packs = parts.pop();
    const label_no = parts.pop();
    const lot_no = parts.pop();
    const length = parts.pop();
    const width = parts.pop();
    const product_name = parts.join(' '); // 残り全部

    const data = {
      product_name: product_name || '',
      width: asNumber(width),
      length: asNumber(length),
      lot_no: String(lot_no),
      label_no: String(label_no),
      packs: asNumber(packs),
      rotation: asNumber(rotation),
    };

    // 軽いバリデーション
    if (data.width === null || data.length === null) throw new Error('幅/長さが数値ではありません');
    if (data.packs === null || data.rotation === null) throw new Error('梱包数/回転数が数値ではありません');

    return data;
  }

  // =========================
  //  画面：編集 show（M1）
  // =========================
  kintone.events.on('app.record.edit.show', (event) => {
    // SCAN UI 既に設置済みならスキップ
    if (document.getElementById('tana-scan-row')) return event;

    const rec = event.record;

    // JSON設定の既定（無い場合も動くように）
    let config = {};
    try {
      config = JSON.parse(rec.json_config?.value || '{}');
    } catch (e) {
      console.warn('json_config parse error', e);
      config = {};
    }

    // サウンド & NGアクションの既定
    const okSound = config.sounds?.ok || 'https://assets.mixkit.co/sfx/preview/mixkit-correct-answer-tone-2870.mp3';
    const ngSound = config.sounds?.ng || 'https://assets.mixkit.co/sfx/preview/mixkit-system-beep-buzzer-fail-2964.mp3';
    const okVolume = config.sounds?.okVolume ?? 0.4;
    const ngVolume = config.sounds?.ngVolume ?? 0.4;
    const ngAction = config.ngAction || 'pause'; // 'pause' | 'continue'

    // A/B/C のスキーマ既定（ルール用）
    if (!config.recordSchema) {
      config.recordSchema = [
        { key: 'A', fieldCode: 'field_a', type: 'text' },
        { key: 'B', fieldCode: 'field_b', type: 'datetime' },
        { key: 'C', fieldCode: 'field_c', type: 'number' },
      ];
    }

    // 画面に SCAN 一式を生やす
    const host = kintone.app.record.getSpaceElement?.('') || document.querySelector('.record-gaia'); // 安全のため
    const wrap = document.createElement('div');
    wrap.id = 'tana-scan-row';
    wrap.style.padding = '10px 0';

    wrap.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center">
        <label style="min-width:64px;font-weight:600;">SCAN</label>
        <input id="tana-scan-input" type="text" placeholder="ここにスキャン（Enterで判定）"
          style="flex:1;padding:8px;border:2px solid #facc15;border-radius:8px;outline:none"/>
        <button id="tana-scan-clear" type="button" style="padding:8px 12px;border-radius:8px;border:1px solid #ddd;">クリア</button>
      </div>
    `;
    // JSONエリアの上あたりへ
    const jsonField = document.querySelector('[data-test-id="field-json_config"]') || document.querySelector('.subtable-gaia') || host;
    jsonField.parentNode.insertBefore(wrap, jsonField);

    const input = document.getElementById('tana-scan-input');
    const btnClear = document.getElementById('tana-scan-clear');
    setTimeout(() => input?.focus(), 0);

    // 重複抑止（同一QR を同画面で2回入れない）
    const seen = new Set();

    // サブテーブル現在値
    const tableCode = 'scan_table';

    async function appendRowAndPut(showRow, allOk, reason) {
      const recordId = event.recordId;
      const table = rec[tableCode];
      const curr = table?.value || [];
      const next = curr.concat([{ value: showRow }]);

      const body = {
        app: kintone.app.getId(),
        id: recordId,
        record: { [tableCode]: { value: next } },
      };
      const url = kintone.api.url('/k/v1/record.json', true);
      await kintone.api(url, 'PUT', body);
      // 画面反映
      rec[tableCode].value = next;
      kintone.app.record.set({ record: rec });
    }

    function setABCForRules(parsed) {
      // 任意：A/B/C にも値を入れてルール可（必要に応じて変更）
      rec.field_a.value = parsed.product_name;
      rec.field_b.value = new Date().toISOString();
      rec.field_c.value = parsed.packs; // 例：梱包数をCに
      kintone.app.record.set({ record: rec });
    }

    async function handleScan(raw) {
      // 入力ロック（誤連打防止）
      input.disabled = true;

      try {
        // 重複チェック
        if (seen.has(raw)) throw new Error('同じ内容を短時間にスキャンしています');
        seen.add(raw);
        setTimeout(() => seen.delete(raw), 10_000); // 10秒で忘れる

        // 1) パース
        const p = parseQR(raw);

        // 2) A/B/C を反映（ルール評価用）
        setABCForRules(p);

        // 3) ルール評価
        const { allOk, reason } = evalRules(config, { record: rec }, false);

        // 4) サブテーブルに表示用行を組み立て
        const showRow = {};
        const put = (code, value) => (showRow[code] = { value });

        put('scan_at', new Date().toISOString());
        put('col_prod', p.product_name);
        put('col_width', p.width);
        put('col_length', p.length);
        put('col_lot', p.lot_no);
        put('col_label', p.label_no);
        put('col_packs', p.packs);
        put('col_rotation', p.rotation);
        put('result', allOk ? 'OK' : 'NG');
        put('reason', allOk ? '' : reason);

        // 5) 効果音
        playSound(allOk ? okSound : ngSound, allOk ? okVolume : ngVolume);

        // 6) 保存（PUT）
        await appendRowAndPut(showRow, allOk, reason);

        // 7) NGポリシー
        if (!allOk && ngAction === 'pause') {
          alert(`NG：${reason}\n続けるには OK を押してください。`);
        }
      } catch (e) {
        playSound(ngSound, ngVolume);
        alert(`スキャン処理エラー：${e.message || e}`);
        console.error(e);
      } finally {
        // 次のスキャン待機
        input.value = '';
        input.disabled = false;
        input.focus();
      }
    }

    // Enterで確定
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        const raw = input.value.trim();
        if (!raw) return;
        handleScan(raw);
      }
    });
    btnClear.addEventListener('click', () => {
      input.value = '';
      input.focus();
    });

    return event;
  });
})();
