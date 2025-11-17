// TANA-OROSHI / 単純区切り型スキャナ（条件2本 + AND/OR、a〜eグループ）
// SCANは [文字 数値 日時DATE 日時TIME DATE TIME] の6トークン
// UIは space: scan_area に固定描画（無ければ最下部フォールバック）
// version:
window.__TANA_PC_VERSION = 'pc-ng-rules-2025-11-10-22';

(function () {
  'use strict';

  // ===== 設定 =====
  const CFG = {
    spaceId: 'scan_area',               // SCAN UI を置くスペース
    delimiter: /\s+/,                   // 半角スペース区切り（連続OK）

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
  const byId = (id) => document.getElementById(id);
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

  function normalizeJoin(s) {
    const t = String(s || '').trim().toLowerCase();
    return t === 'or' ? 'or' : 'and';
  }

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

  function judgeDate(scanDate, baseDateStr, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified) return { specified, ok: true, reason: null };

    const s = scanDate ? parseDateLocal(scanDate) : null; // scanDate は 'YYYY-MM-DD'
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

  // ===== グループ（a〜e）評価 =====
  function evalGroupA(rec, parsed) {
    const rf = CFG.ruleFields;
    const join = normalizeJoin(val(rec, rf.as1));
    const c1 = judgeText(parsed.aText, val(rec, rf.a),  val(rec, rf.aj),  'a1');
    const c2 = judgeText(parsed.aText, val(rec, rf.a2), val(rec, rf.aj2), 'a2');
    return combineConds([c1, c2], join);
  }

  function evalGroupB(rec, parsed) {
    const rf = CFG.ruleFields;
    const join = normalizeJoin(val(rec, rf.bs1));
    const c1 = judgeNumber(parsed.bNumber, val(rec, rf.b),  val(rec, rf.bj),  'b1');
    const c2 = judgeNumber(parsed.bNumber, val(rec, rf.b2), val(rec, rf.bj2), 'b2');
    return combineConds([c1, c2], join);
  }

  function evalGroupC(rec, parsed) {
    const rf = CFG.ruleFields;
    const join = normalizeJoin(val(rec, rf.cs1));
    const c1 = judgeDateTime(parsed.cDateTimeIso, val(rec, rf.c),  val(rec, rf.cj),  'c1');
    const c2 = judgeDateTime(parsed.cDateTimeIso, val(rec, rf.c2), val(rec, rf.cj2), 'c2');
    return combineConds([c1, c2], join);
  }

  function evalGroupD(rec, parsed) {
    const rf = CFG.ruleFields;
    const join = normalizeJoin(val(rec, rf.ds1));
    const c1 = judgeDate(parsed.dDateStr, val(rec, rf.d),  val(rec, rf.dj),  'd1');
    const c2 = judgeDate(parsed.dDateStr, val(rec, rf.d2), val(rec, rf.dj2), 'd2');
    return combineConds([c1, c2], join);
  }

  function evalGroupE(rec, parsed) {
    const rf = CFG.ruleFields;
    const join = normalizeJoin(val(rec, rf.es1));
    const c1 = judgeTime(parsed.eMinutes, val(rec, rf.e),  val(rec, rf.ej),  'e1');
    const c2 = judgeTime(parsed.eMinutes, val(rec, rf.e2), val(rec, rf.ej2), 'e2');
    return combineConds([c1, c2], join);
  }

  function evaluateAll(rec, parsed) {
    const reasons = [];
    const ga = evalGroupA(rec, parsed); if (!ga.ok) reasons.push(...ga.reasons);
    const gb = evalGroupB(rec, parsed); if (!gb.ok) reasons.push(...gb.reasons);
    const gc = evalGroupC(rec, parsed); if (!gc.ok) reasons.push(...gc.reasons);
    const gd = evalGroupD(rec, parsed); if (!gd.ok) reasons.push(...gd.reasons);
    const ge = evalGroupE(rec, parsed); if (!ge.ok) reasons.push(...ge.reasons);
    return { ok: reasons.length === 0, reasons };
  }

  // ===== SCAN パース（6トークン） =====
  // aText bNumber cDate cTime dDate eTime
  function parseScan(raw) {
    const text = String(raw || '').trim();
    if (!text) throw new Error('SCAN が空です');

    const t = text.split(CFG.delimiter);
    if (t.length < 6) throw new Error('SCAN トークンは「文字 数値 日時DATE 日時TIME DATE TIME」の最低6個が必要です');

    const [aText, bTok, cDateStr, cTimeStr, dDateStr, eTimeStr] = t;

    const bNumber = Number(bTok);
    if (Number.isNaN(bNumber)) throw new Error(`数値トークンが不正です (b="${bTok}")`);

    const cIso = toIsoFromDateTimeParts(cDateStr, cTimeStr);
    if (!cIso) throw new Error(`日時トークンが不正です (c="${cDateStr} ${cTimeStr}")`);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dDateStr)) {
      throw new Error(`日付トークンが不正です (d="${dDateStr}")`);
    }

    if (!/^\d{2}:\d{2}$/.test(eTimeStr)) {
      throw new Error(`時刻トークンが不正です (e="${eTimeStr}")`);
    }
    const eMinutes = parseTimeToMin(eTimeStr);
    if (eMinutes == null) throw new Error(`時刻トークンが不正です (e="${eTimeStr}")`);

    return {
      aText,
      bNumber,
      cDateTimeIso: cIso,
      dDateStr,
      eTimeStr,
      eMinutes,
      raw: text,
    };
  }

  // ===== サブテーブル追記 =====
  function appendRow(appRec, parsed, evalRes) {
    const rec = appRec.record;
    const tf = CFG.tableFields;

    if (!rec[CFG.tableCode]) rec[CFG.tableCode] = { type: 'SUBTABLE', value: [] };
    const table = rec[CFG.tableCode];

    const row = { value: {} };
    row.value[tf.scanAt] = { type: 'DATETIME', value: nowIso() };
    row.value[tf.a]      = { type: 'SINGLE_LINE_TEXT', value: parsed.aText };
    row.value[tf.b]      = { type: 'NUMBER', value: String(parsed.bNumber) };
    row.value[tf.c]      = { type: 'DATETIME', value: parsed.cDateTimeIso };
    row.value[tf.d]      = { type: 'DATE', value: parsed.dDateStr };
    row.value[tf.e]      = { type: 'TIME', value: parsed.eTimeStr };
    row.value[tf.result] = { type: 'SINGLE_LINE_TEXT', value: evalRes.ok ? 'OK' : 'NG' };
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
    status.style.minWidth = '64px';
    row1.appendChild(status);

    const row2 = document.createElement('div');
    row2.style.marginTop = '4px';
    row2.style.fontSize = '12px';
    row2.style.color = '#666';
    row2.textContent = 'SCAN （文字） （数値） （日時） （DATE） （時間） の順に入力 → Enter';

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

      status.textContent = evalRes.ok ? 'OK' : 'NG';
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
