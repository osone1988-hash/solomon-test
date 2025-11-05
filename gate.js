/* gate.js unified v2 — fixed (typeを一切書かず、valueのみ更新) */
(function () {
  // 起動確認（Console で window.__TANA_GATE__ を見る用）
  window.__TANA_GATE__ = 'ok';

  // ---------- utils ----------
  const asNumber = (v) => (v === '' || v == null ? null : Number(v));
  const asDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const iso = (d) => (d ? new Date(d).toISOString() : '');
  const numStrOrEmpty = (v) => (v === '' || v == null ? '' : String(v));

  // number
  const cmpNum = (L, op, R) => {
    if (L == null) return false;
    if (op === '>') return L > R;
    if (op === '>=') return L >= R;
    if (op === '<') return L < R;
    if (op === '<=') return L <= R;
    if (op === '==') return L === R;
    if (op === 'between') return Array.isArray(R) && L >= R[0] && L <= R[1];
    return false;
  };
  // datetime
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
  // text
  const cmpText = (L, op, R, opt) => {
    const lower = !!(opt && opt.ignoreCase);
    const toS = (x) => (x == null ? '' : String(x));
    const norm = (x) => (lower ? toS(x).toLowerCase() : toS(x));
    L = norm(L);
    R = Array.isArray(R) ? R.map(norm) : norm(R);
    if (op === 'equals' || op === '==') return L === R;
    if (op === 'contains') return L.includes(R);
    if (op === 'notContains') return !L.includes(R);
    if (op === 'in') return Array.isArray(R) && R.includes(L);
    if (op === 'notIn') return Array.isArray(R) && !R.includes(L);
    return false;
  };

  // ルール評価（recordSchema / rules 使用）
  function evalRules(config, rec, overrideMap, log = false) {
    const key2code = {};
    (config.recordSchema || []).forEach((s) => (key2code[s.key] = s.fieldCode));
    const read = (key, type) => {
      if (overrideMap && key in overrideMap) {
        const v = overrideMap[key];
        if (type === 'number') return asNumber(v);
        if (type === 'datetime') return asDate(v);
        return v;
      }
      const code = key2code[key];
      const f = code && rec.record[code];
      const v = f ? f.value : null;
      if (type === 'number') return asNumber(v);
      if (type === 'datetime') return asDate(v);
      return v;
    };

    const results = [];
    for (const r of config.rules || []) {
      const L = read(r.key, r.type);
      const op = r.operator;
      const R = r.type === 'number'
        ? (Array.isArray(r.value) ? r.value.map(asNumber) : asNumber(r.value))
        : r.value;
      let ok = false;
      if (r.type === 'number') ok = cmpNum(L, op, R);
      else if (r.type === 'datetime') ok = cmpDate(L, op, R);
      else if (r.type === 'text') ok = cmpText(L, op, R, r.options || {});
      else { results.push({ ok: false, reason: `未対応type:${r.type}` }); continue; }
      if (log) console.log('[RULE]', { key: r.key, type: r.type, op, L, R, ok });
      results.push({ ok, reason: ok ? '' : `key=${r.key} op=${op} val=${JSON.stringify(r.value)}` });
    }
    return {
      allOk: results.every((x) => x.ok),
      reason: results.filter((x) => !x.ok).map((x) => x.reason).join(' / ')
    };
  }

  // サブテーブルに1行追加（PUT+画面反映）— value のみ送る
  async function appendRow(config, rec, row) {
    const tableCode = config.ui?.table?.fieldCode;
    const curr = rec.record[tableCode]?.value || [];
    const next = curr.concat([{ value: row }]);
    const body = {
      app: kintone.app.getId(),
      id: rec.recordId || rec.$id?.value,
      record: { [tableCode]: { value: next } } // type は送らない
    };
    const url = kintone.api.url('/k/v1/record.json', true);
    const res = await kintone.api(url, 'PUT', body);
    // 画面反映
    rec.record[tableCode].value = next;
    kintone.app.record.set({ record: rec.record });
    return res;
  }

  // ---------- ボタン運用（従来互換） ----------
  async function judgeAndAppendByButton(rec) {
    const cfgStr = rec.record.json_config?.value;
    if (!cfgStr) { alert('設定JSON(json_config)が見つかりません。'); return; }
    let config;
    try { config = JSON.parse(cfgStr); } catch (e) { alert('設定JSONのパースに失敗しました。'); console.error(e); return; }

    // A/B/C は既存レコード値で評価
    const { allOk, reason } = evalRules(config, rec, null, true);

    // 行を作る
    const cols = config.ui?.table?.columns || {};
    const key2code = {}; (config.recordSchema || []).forEach(s => key2code[s.key] = s.fieldCode);
    const vA = rec.record[key2code.A]?.value ?? '';
    const vB = rec.record[key2code.B]?.value ?? '';
    const vC = rec.record[key2code.C]?.value ?? '';

    const row = {};
    row[cols.datetime] = { value: iso(new Date()) };
    row[cols.A] = { value: vA };
    row[cols.B] = { value: vB ? iso(vB) : '' };
    row[cols.C] = { value: vC === '' ? '' : numStrOrEmpty(vC) };
    row[cols.result] = { value: allOk ? 'OK' : 'NG' };
    row[cols.reason] = { value: allOk ? '' : reason };

    try {
      await appendRow(config, rec, row);
      alert(allOk ? 'OK：サブテーブルに行を追加しました。' : `NG：サブテーブルに行を追加しました。\n理由：${reason}`);
    } catch (e) {
      console.error(e); alert('保存時にエラーが発生しました。');
    }
  }

  // ---------- 自動スキャンUI ----------
  function mountAutoScan(config, rec) {
    if (document.getElementById('tana-scan-panel')) return;

    const space = kintone.app.record.getHeaderMenuSpaceElement?.() || kintone.app.getHeaderMenuSpaceElement?.();
    if (!space) return;

    const wrap = document.createElement('div');
    wrap.id = 'tana-scan-panel';
    wrap.style.cssText = 'padding:12px;margin:8px 0;border:1px solid #e5e7eb;border-radius:10px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.06);';
    wrap.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        <div style="font-weight:600;">SCAN</div>
        <input id="tana-input" autocomplete="off" placeholder="ここにQRをかざす／入力→Enter"
               style="flex:1;min-width:280px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:16px" />
        <label style="display:flex;align-items:center;gap:6px;">
          NG時の動作
          <select id="tana-ng-mode" style="padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;">
            <option value="hold">保留して続行</option>
            <option value="stop">停止する</option>
          </select>
        </label>
        <span id="tana-badge" style="padding:6px 10px;border-radius:999px;background:#e5e7eb;color:#111;font-weight:600;">READY</span>
      </div>
      <div id="tana-msg" style="margin-top:8px;color:#64748b;font-size:13px;">Enterで即判定します。結果は下のサブテーブルに自動追加。</div>
      <audio id="tana-ok-audio"></audio>
      <audio id="tana-ng-audio"></audio>
    `;
    space.appendChild(wrap);

    const okA = document.getElementById('tana-ok-audio');
    const ngA = document.getElementById('tana-ng-audio');
    okA.src = config.ui?.sound?.ok?.file || '';
    ngA.src = config.ui?.sound?.error?.file || '';

    const $input = document.getElementById('tana-input');
    const $badge = document.getElementById('tana-badge');
    const $msg = document.getElementById('tana-msg');

    const ngSel = document.getElementById('tana-ng-mode');
    ngSel.value = localStorage.getItem('TANA_NG_MODE') || 'hold';
    ngSel.onchange = () => localStorage.setItem('TANA_NG_MODE', ngSel.value);
    const focusInput = () => setTimeout(() => $input.focus(), 0);
    focusInput();

    async function handleScan(raw) {
      if (!raw) return;

      // MVPマッピング：A=raw、B=Now、C=raw内の最初の整数（なければ空）
      const num = String(raw).match(/-?\d+/);
      const map = { A: String(raw), B: new Date(), C: num ? Number(num[0]) : '' };

      const { allOk, reason } = evalRules(config, rec, map, false);

      const cols = config.ui?.table?.columns || {};
      const row = {};
      row[cols.datetime] = { value: iso(new Date()) };
      row[cols.A] = { value: map.A };
      row[cols.B] = { value: iso(map.B) };
      row[cols.C] = { value: map.C === '' ? '' : numStrOrEmpty(map.C) };
      row[cols.result] = { value: allOk ? 'OK' : 'NG' };
      row[cols.reason] = { value: allOk ? '' : reason };

      try {
        await appendRow(config, rec, row);
        if (allOk) {
          $badge.style.background = '#d1fae5'; $badge.textContent = 'OK';
          try { okA.currentTime = 0; okA.play(); } catch (e) {}
          $msg.textContent = 'OKで記録しました。';
        } else {
          $badge.style.background = '#fee2e2'; $badge.textContent = 'NG';
          try { ngA.currentTime = 0; ngA.play(); } catch (e) {}
          $msg.textContent = `NG：${reason}`;
          if (ngSel.value === 'stop') {
            $input.disabled = true;
            const btn = document.createElement('button');
            btn.textContent = '再開する';
            btn.style.cssText = 'margin-left:8px;padding:6px 10px;border:1px solid #94a3b8;border-radius:8px;background:#fff;';
            btn.onclick = () => { $input.disabled = false; btn.remove(); focusInput(); };
            $msg.appendChild(btn);
          }
        }
      } catch (e) {
        console.error(e);
        $badge.style.background = '#fde68a'; $badge.textContent = 'ERR';
        $msg.textContent = '保存時にエラーが発生しました。';
      }
    }

    $input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        const raw = $input.value;
        $input.value = '';
        handleScan(raw);
        focusInput();
      }
    });
  }

  // ---------- 画面イベント ----------
  kintone.events.on('app.record.detail.show', () => {
    const rec = kintone.app.record.get();
    const cfgStr = rec.record.json_config?.value;
    if (!cfgStr) return; // 設定ないと何もしない

    let config = {};
    try { config = JSON.parse(cfgStr); } catch (e) { console.error('json_config parse error', e); return; }

    // ボタン（互換）
    if (!document.getElementById('tana-judge-btn')) {
      const space = kintone.app.record.getHeaderMenuSpaceElement?.() || kintone.app.getHeaderMenuSpaceElement?.();
      if (space) {
        const btn = document.createElement('button');
        btn.id = 'tana-judge-btn';
        btn.textContent = '判定して記録';
        btn.style.cssText = 'padding:8px 12px;border-radius:6px;background:#3b82f6;color:#fff;border:none;cursor:pointer;margin-right:8px;';
        btn.onclick = () => judgeAndAppendByButton(rec);
        space.appendChild(btn);
      }
    }

    // 自動スキャン（既定ON）
    const autoOn = config.ui?.autoScan?.enabled !== false;
    if (autoOn) mountAutoScan(config, rec);
  });
})();
