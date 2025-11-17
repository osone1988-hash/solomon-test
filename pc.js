// TANA-OROSHI / 単純区切り型スキャナ（条件2本 + AND/OR、a〜eグループ）
// ✅ トークン順は CFG.slots に従って解釈（決め打ちしない）
// ✅ SCANは「slotsの定義」に従ってパース
// ✅ UIは space: scan_area に固定描画（無ければ最下部フォールバック）
// ✅ 連結子(as1,bs1,...)未設定 + 2本目条件あり → 設定エラー（ERR）
// ✅ 2本目の値(a2,b2,...)だけ入っていて条件(aj2,bj2,...)が未選択 → 設定エラー（ERR）
//
// version:
window.__TANA_PC_VERSION = 'pc-ng-rules-2025-11-10-25';

(function () {
  'use strict';

  // ===== 設定 =====
  const CFG = {
    spaceId: 'scan_area',               // SCAN UI を置くスペース
    delimiter: /\s+/,                   // トークン区切り（将来ここを差し替えればOK）

    // ★★★ トークン解釈ルール（将来サービス側でここを書き換えてJS生成する想定）★★★
    // name: 論理名, type: text/number/datetime/date/time, tokens: 消費トークン数
    slots: [
      { name: 'a', type: 'text',     tokens: 1 }, // 文字列
      { name: 'b', type: 'number',   tokens: 1 }, // 数値
      { name: 'c', type: 'datetime', tokens: 2 }, // 日時（date + time）
      { name: 'd', type: 'date',     tokens: 1 }, // DATE
      { name: 'e', type: 'time',     tokens: 1 }, // TIME
    ],

    // サブテーブル
    tableCode: 'scan_table',
    tableFields: {
      scanAt: 'scan_at',                // DATETIME
      a: 'at',                          // TEXT
      b: 'bt',                          // NUMBER
      c: 'ct',                          // DATETIME
      d: 'dt',                          // DATE
      e: 'et',                          // TIME
      result: 'result',                 // TEXT
      reason: 'reason',                 // MULTI_LINE_TEXT
    },

    // ルール用フィールド（条件×2 + 連結子）
    ruleFields: {
      // a: TEXT
      a: 'a',   aj: 'aj',
      a2: 'a2', aj2: 'aj2',
      as1: 'as1',           // or / and

      // b: NUMBER
      b: 'b',   bj: 'bj',
      b2: 'b2', bj2: 'bj2',
      bs1: 'bs1',

      // c: DATETIME
      c: 'c',   cj: 'cj',
      c2: 'c2', cj2: 'cj2',
      cs1: 'cs1',

      // d: DATE
      d: 'd',   dj: 'dj',
      d2: 'd2', dj2: 'dj2',
      ds1: 'ds1',

      // e: TIME
      e: 'e',   ej: 'ej',
      e2: 'e2', ej2: 'ej2',
      es1: 'es1',
    },
  };

  // ===== 小ユーティリティ =====
  const val = (rec, code) => (rec[code] ? rec[code].value : '');

  function nowIso() { return new Date().toISOString(); }

  function toIsoFromDateTimeParts(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const dt = new Date(`${dateStr}T${timeStr}:00+09:00`);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  function parseDateLocal(dateStr) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function parseTimeToMin(hhmm) {
    if (!hhmm) return null;
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    if (Number.isNaN(h) || Number.isNaN(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return h * 60 + mi;
  }

  function sameYMD(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function sameHM(a, b) { return a.getHours() === b.getHours() && a.getMinutes() === b.getMinutes(); }

  // ===== 判定関数（単一条件 → {specified, ok, reason}） =====
  function judgeText(scan, base, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified || base == null || base === '') return { specified, ok: true, reason: null };

    const s = String(scan ?? ''), b = String(base ?? '');
    let ok = true;
    switch (op) {
      case 'まったく同じ': ok = (s === b); break;
      case '含む':         ok = s.includes(b); break;
      case '含まない':     ok = !s.includes(b); break;
      case '前方一致':
      case '前部一致':     ok = s.startsWith(b); break;
      case '後方一致':
      case '後部一致':     ok = s.endsWith(b); break;
      default: return { specified, ok: true, reason: null };
    }
    return { specified, ok, reason: ok ? null : `${label}:${op}` };
  }

  function judgeNumber(scanNum, baseNum, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified || baseNum == null || baseNum === '' || Number.isNaN(Number(baseNum))) {
      return { specified, ok: true, reason: null };
    }
    const s = Number(scanNum), b = Number(baseNum);
    if (Number.isNaN(s)) return { specified, ok: false, reason: `${label}:${op} (scan:NaN, base:${b})` };

    let ok = true;
    switch (op) {
      case '同じ': ok = (s === b); break;
      case '異なる': ok = (s !== b); break;
      case '以上': ok = (s >= b); break;
      case '以下': ok = (s <= b); break;
      case 'より大きい': ok = (s > b); break;
      case '未満': ok = (s < b); break;
      default: return { specified, ok: true, reason: null };
    }
    return { specified, ok, reason: ok ? null : `${label}:${op} (scan:${s}, base:${b})` };
  }

  function judgeDateTime(scanIso, baseIso, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified) return { specified, ok: true, reason: null };

    const s = scanIso ? new Date(scanIso) : null;
    const b = baseIso ? new Date(baseIso) : null;
    if (!s || !b) return { specified, ok: false, reason: `${label}:${op} (scan:${s ? s.toISOString() : 'NaN'}, base:${b ? b.toISOString() : 'NaN'})` };

    let ok = true;
    switch (op) {
      case '同じ':           ok = s.getTime() === b.getTime(); break;
      case '以外':           ok = s.getTime() !== b.getTime(); break;
      case '以降':           ok = s.getTime() >= b.getTime(); break;
      case '以前':           ok = s.getTime() <= b.getTime(); break;
      case '日付が同じ':     ok = sameYMD(s, b); break;
      case '日付が異なる':   ok = !sameYMD(s, b); break;
      case '時間が同じ':     ok = sameHM(s, b); break;
      case '時間が異なる':   ok = !sameHM(s, b); break;
      default: return { specified, ok: true, reason: null };
    }
    return { specified, ok, reason: ok ? null : `${label}:${op}` };
  }

  function judgeDate(scanDateStr, baseDateStr, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified) return { specified, ok: true, reason: null };

    const s = scanDateStr ? parseDateLocal(scanDateStr) : null;
    const b = baseDateStr ? parseDateLocal(baseDateStr) : null;
    if (!s || !b) return { specified, ok: false, reason: `${label}:${op} (scan:${s ? s.toISOString() : 'NaN'}, base:${b ? b.toISOString() : 'NaN'})` };

    let ok = true;
    const ss = s.getTime(), bb = b.getTime();
    switch (op) {
      case '同じ': ok = (ss === bb); break;
      case '以外': ok = (ss !== bb); break;
      case '以降': ok = (ss >= bb); break;
      case '以前': ok = (ss <= bb); break;
      default: return { specified, ok: true, reason: null };
    }
    return { specified, ok, reason: ok ? null : `${label}:${op}` };
  }

  function judgeTime(scanMin, baseTimeStr, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified) return { specified, ok: true, reason: null };

    const s = scanMin ?? null;
    const b = baseTimeStr ? parseTimeToMin(baseTimeStr) : null;
    if (s == null || b == null) return { specified, ok: false, reason: `${label}:${op} (scan:${s}, base:${b})` };

    let ok = true;
    switch (op) {
      case '同じ': ok = (s === b); break;
      case '以外': ok = (s !== b); break;
      case '以降': ok = (s >= b); break;
      case '以前': ok = (s <= b); break;
      default: return { specified, ok: true, reason: null };
    }
    return { specified, ok, reason: ok ? null : `${label}:${op} (scan:${s}, base:${b})` };
  }

  // conds: [{specified, ok, reason}], join:'and'|'or'
  function combineConds(conds, join) {
    const specified = conds.filter(c => c.specified);
    if (specified.length === 0) return { ok: true, reasons: [] };       // 未設定は通す
    const oks = specified.map(c => c.ok);
    const ok = (join === 'or') ? oks.some(Boolean) : oks.every(Boolean);
    const reasons = specified.filter(c => !c.ok).map(c => c.reason);
    return { ok, reasons };
  }

  function resolveJoinOrConfigError(joinRaw, cond2, label) {
    const hasSecond = cond2.specified;
    const t = String(joinRaw || '').trim().toLowerCase();

    if (hasSecond && t !== 'and' && t !== 'or') {
      return {
        isError: true,
        join: 'and', // ダミー
        message: `設定エラー: ${label} の連結条件を選択してください`,
      };
    }
    const join = (t === 'or') ? 'or' : 'and'; // cond2無し or 未指定 → and
    return { isError: false, join, message: null };
  }

  // 2本目: 「値はあるのに条件が空」のチェック
  function checkSecondFieldConfig(base2, op2, label) {
    const hasValue = String(base2 ?? '').trim() !== '';
    const hasOp = !!op2 && op2 !== '指定なし';
    if (hasValue && !hasOp) {
      return {
        isError: true,
        message: `設定エラー: ${label} の条件を選択してください`,
      };
    }
    return { isError: false, message: null };
  }

  // ===== グループ（a〜e）評価 =====
  const RF = CFG.ruleFields;

  function evalGroupA(rec, parsed) {
    const base2 = val(rec, RF.a2);
    const op2   = val(rec, RF.aj2);

    // 2本目の値だけ入っていて op が空 → 設定エラー
    const secondCheck = checkSecondFieldConfig(base2, op2, 'a2(aj2)');
    if (secondCheck.isError) {
      return { ok: false, reasons: [secondCheck.message], configError: true };
    }

    const c1 = judgeText(parsed.aText, val(rec, RF.a),  val(rec, RF.aj),  'a1');
    const c2 = judgeText(parsed.aText, base2, op2, 'a2');

    const joinCheck = resolveJoinOrConfigError(val(rec, RF.as1), c2, 'a(as1)');
    if (joinCheck.isError) {
      return { ok: false, reasons: [joinCheck.message], configError: true };
    }

    const comb = combineConds([c1, c2], joinCheck.join);
    return { ok: comb.ok, reasons: comb.reasons, configError: false };
  }

  function evalGroupB(rec, parsed) {
    const base2 = val(rec, RF.b2);
    const op2   = val(rec, RF.bj2);

    const secondCheck = checkSecondFieldConfig(base2, op2, 'b2(bj2)');
    if (secondCheck.isError) {
      return { ok: false, reasons: [secondCheck.message], configError: true };
    }

    const c1 = judgeNumber(parsed.bNumber, val(rec, RF.b),  val(rec, RF.bj),  'b1');
    const c2 = judgeNumber(parsed.bNumber, base2, op2, 'b2');

    const joinCheck = resolveJoinOrConfigError(val(rec, RF.bs1), c2, 'b(bs1)');
    if (joinCheck.isError) {
      return { ok: false, reasons: [joinCheck.message], configError: true };
    }

    const comb = combineConds([c1, c2], joinCheck.join);
    return { ok: comb.ok, reasons: comb.reasons, configError: false };
  }

  function evalGroupC(rec, parsed) {
    const base2 = val(rec, RF.c2);
    const op2   = val(rec, RF.cj2);

    const secondCheck = checkSecondFieldConfig(base2, op2, 'c2(cj2)');
    if (secondCheck.isError) {
      return { ok: false, reasons: [secondCheck.message], configError: true };
    }

    const c1 = judgeDateTime(parsed.cDateTimeIso, val(rec, RF.c),  val(rec, RF.cj),  'c1');
    const c2 = judgeDateTime(parsed.cDateTimeIso, base2, op2, 'c2');

    const joinCheck = resolveJoinOrConfigError(val(rec, RF.cs1), c2, 'c(cs1)');
    if (joinCheck.isError) {
      return { ok: false, reasons: [joinCheck.message], configError: true };
    }

    const comb = combineConds([c1, c2], joinCheck.join);
    return { ok: comb.ok, reasons: comb.reasons, configError: false };
  }

  function evalGroupD(rec, parsed) {
    const base2 = val(rec, RF.d2);
    const op2   = val(rec, RF.dj2);

    const secondCheck = checkSecondFieldConfig(base2, op2, 'd2(dj2)');
    if (secondCheck.isError) {
      return { ok: false, reasons: [secondCheck.message], configError: true };
    }

    const c1 = judgeDate(parsed.dDateStr, val(rec, RF.d),  val(rec, RF.dj),  'd1');
    const c2 = judgeDate(parsed.dDateStr, base2, op2, 'd2');

    const joinCheck = resolveJoinOrConfigError(val(rec, RF.ds1), c2, 'd(ds1)');
    if (joinCheck.isError) {
      return { ok: false, reasons: [joinCheck.message], configError: true };
    }

    const comb = combineConds([c1, c2], joinCheck.join);
    return { ok: comb.ok, reasons: comb.reasons, configError: false };
  }

  function evalGroupE(rec, parsed) {
    const base2 = val(rec, RF.e2);
    const op2   = val(rec, RF.ej2);

    const secondCheck = checkSecondFieldConfig(base2, op2, 'e2(ej2)');
    if (secondCheck.isError) {
      return { ok: false, reasons: [secondCheck.message], configError: true };
    }

    const c1 = judgeTime(parsed.eMinutes, val(rec, RF.e),  val(rec, RF.ej),  'e1');
    const c2 = judgeTime(parsed.eMinutes, base2, op2, 'e2');

    const joinCheck = resolveJoinOrConfigError(val(rec, RF.es1), c2, 'e(es1)');
    if (joinCheck.isError) {
      return { ok: false, reasons: [joinCheck.message], configError: true };
    }

    const comb = combineConds([c1, c2], joinCheck.join);
    return { ok: comb.ok, reasons: comb.reasons, configError: false };
  }

  function evaluateAll(rec, parsed) {
    const reasons = [];
    let configError = false;

    const ga = evalGroupA(rec, parsed); if (!ga.ok) reasons.push(...ga.reasons); if (ga.configError) configError = true;
    const gb = evalGroupB(rec, parsed); if (!gb.ok) reasons.push(...gb.reasons); if (gb.configError) configError = true;
    const gc = evalGroupC(rec, parsed); if (!gc.ok) reasons.push(...gc.reasons); if (gc.configError) configError = true;
    const gd = evalGroupD(rec, parsed); if (!gd.ok) reasons.push(...gd.reasons); if (gd.configError) configError = true;
    const ge = evalGroupE(rec, parsed); if (!ge.ok) reasons.push(...ge.reasons); if (ge.configError) configError = true;

    if (configError) {
      return { ok: false, reasons, configError: true };
    }
    return { ok: reasons.length === 0, reasons, configError: false };
  }

  // ===== SCAN パース（★slots に従って柔軟に解釈★） =====
  function parseScan(raw) {
    const text = String(raw || '').trim();
    if (!text) throw new Error('SCAN が空です');

    const tokens = text.split(CFG.delimiter).filter(t => t.length > 0);
    const slots = CFG.slots;
    const minTokens = slots.reduce((sum, s) => sum + (s.tokens || 1), 0);

    if (tokens.length < minTokens) {
      throw new Error(`SCAN トークン数が不足しています（必要:${minTokens}個 / 実際:${tokens.length}個）`);
    }
    // 余ったトークンは今は無視（将来ログに残したければここで残せる）

    let idx = 0;

    // パース結果（評価に使う論理値）
    const parsed = {
      aText: null,
      bNumber: null,
      cDateTimeIso: null,
      dDateStr: null,
      eTimeStr: null,
      eMinutes: null,
      raw: text,
    };

    for (const slot of slots) {
      const n = slot.tokens || 1;
      const slice = tokens.slice(idx, idx + n);
      idx += n;
      const joined = slice.join(' ');

      switch (slot.type) {
        case 'text': {
          if (slot.name === 'a') parsed.aText = joined;
          break;
        }
        case 'number': {
          const num = Number(joined);
          if (Number.isNaN(num)) {
            throw new Error(`数値トークンが不正です (${slot.name}="${joined}")`);
          }
          if (slot.name === 'b') parsed.bNumber = num;
          break;
        }
        case 'datetime': {
          // 想定: tokens=2 → [date, time]
          let dateStr, timeStr;
          if (slice.length === 2) {
            [dateStr, timeStr] = slice;
          } else {
            const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/.exec(joined);
            if (!m) {
              throw new Error(`日時トークンが不正です (${slot.name}="${joined}")`);
            }
            dateStr = m[1];
            timeStr = m[2];
          }
          const iso = toIsoFromDateTimeParts(dateStr, timeStr);
          if (!iso) {
            throw new Error(`日時トークンが不正です (${slot.name}="${joined}")`);
          }
          if (slot.name === 'c') parsed.cDateTimeIso = iso;
          break;
        }
        case 'date': {
          const d = joined;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            throw new Error(`日付トークンが不正です (${slot.name}="${d}")`);
          }
          if (slot.name === 'd') parsed.dDateStr = d;
          break;
        }
        case 'time': {
          const t = joined;
          if (!/^\d{2}:\d{2}$/.test(t)) {
            throw new Error(`時刻トークンが不正です (${slot.name}="${t}")`);
          }
          const min = parseTimeToMin(t);
          if (min == null) throw new Error(`時刻トークンが不正です (${slot.name}="${t}")`);
          if (slot.name === 'e') {
            parsed.eTimeStr = t;
            parsed.eMinutes = min;
          }
          break;
        }
        default:
          // 未知typeは今は無視（将来拡張用）
          break;
      }
    }

    return parsed;
  }

  // ===== サブテーブル追記 =====
  function appendRow(appRec, parsed, evalRes) {
    const rec = appRec.record;
    const tf = CFG.tableFields;

    if (!rec[CFG.tableCode]) rec[CFG.tableCode] = { type: 'SUBTABLE', value: [] };
    const table = rec[CFG.tableCode];

    const row = { value: {} };
    row.value[tf.scanAt] = { type: 'DATETIME', value: nowIso() };
    row.value[tf.a]      = { type: 'SINGLE_LINE_TEXT', value: parsed.aText ?? '' };
    row.value[tf.b]      = { type: 'NUMBER', value: parsed.bNumber == null ? '' : String(parsed.bNumber) };
    row.value[tf.c]      = { type: 'DATETIME', value: parsed.cDateTimeIso };
    row.value[tf.d]      = { type: 'DATE', value: parsed.dDateStr };
    row.value[tf.e]      = { type: 'TIME', value: parsed.eTimeStr };

    const resultStr = evalRes.configError ? 'ERR' : (evalRes.ok ? 'OK' : 'NG');
    row.value[tf.result] = { type: 'SINGLE_LINE_TEXT', value: resultStr };
    row.value[tf.reason] = { type: 'MULTI_LINE_TEXT', value: evalRes.reasons.join(' / ') };

    table.value.push(row);
  }

  // ===== UI描画（scan_area に固定、ヘルプは入力の「下」） =====
  function buildScanUI() {
    const space = kintone.app.record.getSpaceElement(CFG.spaceId);
    let mount = space;
    if (!mount) {
      // フォールバック
      mount = document.createElement('div');
      mount.id = 'tana-scan-fallback';
      document.body.appendChild(mount);
    }
    while (mount.firstChild) mount.removeChild(mount.firstChild);

    const wrap = document.createElement('div');
    wrap.style.margin = '8px 0';

    const row1 = document.createElement('div');
    row1.style.display = 'flex';
    row1.style.alignItems = 'center';
    row1.style.gap = '8px';

    const input = document.createElement('input');
    input.type = 'text';
    input.style.cssText = 'flex:1 1 auto; padding:6px 8px; border:1px solid #ccc; border-radius:6px;';
    row1.appendChild(input);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'クリア';
    row1.appendChild(clearBtn);

    const status = document.createElement('span');
    status.textContent = 'READY';
    status.style.minWidth = '80px';
    row1.appendChild(status);

    const row2 = document.createElement('div');
    row2.style.marginTop = '4px';
    row2.style.fontSize = '12px';
    row2.style.color = '#666';
    row2.textContent = 'SCAN （slots設定に従った形式）で入力 → Enter';

    wrap.appendChild(row1);
    wrap.appendChild(row2);
    mount.appendChild(wrap);

    clearBtn.addEventListener('click', () => {
      input.value = '';
      status.textContent = 'READY';
      input.focus();
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();

      const appRec = kintone.app.record.get();

      let parsed;
      try {
        parsed = parseScan(input.value);
      } catch (e) {
        status.textContent = `NG: ${e.message}`;
        return;
      }

      const evalRes = evaluateAll(appRec.record, parsed);
      appendRow(appRec, parsed, evalRes);
      kintone.app.record.set(appRec);

      if (evalRes.configError) {
        status.textContent = 'ERR (設定エラー)';
      } else {
        status.textContent = evalRes.ok ? 'OK' : 'NG';
      }

      input.value = '';
      input.focus();
    });
  }

  // ===== イベント =====
  kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {
    buildScanUI();
    return event;
  });

})();
