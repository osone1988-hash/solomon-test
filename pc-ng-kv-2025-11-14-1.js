// TANA-OROSHI / キー型スキャナ（key=value 形式 強化版）
// - SCAN例: "A=TEST B=10 C=2025-11-14T00:00 D=2025-11-14 E=00:00"
//   ※ 空白入りDATETIMEも可: "C=2025-11-14 00:00"（& や ; 区切り混在も可）
// - キー名 → a,b,c,d,e へのマッピングは CFG.keyMap で定義
// - 判定ロジック・テーブル構造・フィールドコードは単純区切り型と同じ
// - 2本目条件の設定漏れや連結子未設定は ERR で検出
//
// version:
window.__TANA_PC_VERSION = 'pc-key-2025-11-18-01';

(function () {
  'use strict';

  // ===== 設定 =====
  const CFG = {
    spaceId: 'scan_area',               // SCAN UI を置くスペース

    // ペア区切り（複数混在OK）: スペース/タブ/改行/&/; に対応
    pairSeparators: /[\s&;]+/,

    // キーと値の連結記号（現在は = : => をサポート）
    // 例: "key=value" / "key:value" / "key=>value"
    kvDelimiters: ['=', ':', '=>'],

    // キーの大/小文字無視（推奨）
    caseInsensitiveKeys: true,

    // 未知キーの扱い: 'ignore' | 'warn' | 'error'
    unknownKeyPolicy: 'ignore',

    // c(=DATETIME)が無いとき d(=DATE) と e(=TIME) から合成するか
    composeCFromDandE: true,

    // タイムゾーン（DATETIME の ISO 化時に使用）
    timezoneOffset: '+09:00',

    // 受け付ける日時/日付のフォーマット
    // DATETIME: 2025-11-14 00:00 / 2025-11-14T00:00 / 2025/11/14 00:00 / 202511140000
    // DATE:     2025-11-14 / 2025/11/14 / 20251114
    datetimeFormats: ['YYYY-MM-DD HH:mm', 'YYYY-MM-DDTHH:mm', 'YYYY/MM/DD HH:mm', 'YYYYMMDDHHmm'],
    dateFormats: ['YYYY-MM-DD', 'YYYY/MM/DD', 'YYYYMMDD'],

    // key → 論理スロット(a,b,c,d,e)へのマッピング
    // type: text / number / datetime / date / time
    keyMap: {
      'A': { target: 'a', type: 'text' },      // 文字列 → a
      'PRODUCT': { target: 'a', type: 'text' },

      'B': { target: 'b', type: 'number' },    // 数値 → b
      'QTY': { target: 'b', type: 'number' },

      'C': { target: 'c', type: 'datetime' },  // 日時 → c
      'DATETIME': { target: 'c', type: 'datetime' },

      'D': { target: 'd', type: 'date' },      // 日付 → d
      'DATE': { target: 'd', type: 'date' },

      'E': { target: 'e', type: 'time' },      // 時刻 → e
      'TIME': { target: 'e', type: 'time' },
    },

    // 必須スロット（1つも埋まらなかったらERR）
    // ※ 運用に合わせて調整してください
    requiredTargets: ['a', 'b', 'c', 'd', 'e'],

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
      a: 'a',   aj: 'aj',
      a2: 'a2', aj2: 'aj2',
      as1: 'as1',           // or / and

      b: 'b',   bj: 'bj',
      b2: 'b2', bj2: 'bj2',
      bs1: 'bs1',

      c: 'c',   cj: 'cj',
      c2: 'c2', cj2: 'cj2',
      cs1: 'cs1',

      d: 'd',   dj: 'dj',
      d2: 'd2', dj2: 'dj2',
      ds1: 'ds1',

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
    const dt = new Date(`${dateStr}T${timeStr}:00${CFG.timezoneOffset}`);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  function parseDateLocal(dateStr) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00${CFG.timezoneOffset}`);
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
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }
  function sameHM(a, b) {
    return a.getHours() === b.getHours() && a.getMinutes() === b.getMinutes();
  }

  function normalizeKey(k) {
    const s = String(k || '');
    return CFG.caseInsensitiveKeys ? s.toUpperCase() : s;
  }

  function parseFlexibleDate(dateRaw) {
    const s = String(dateRaw || '').trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // YYYY/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, '-');
    // YYYYMMDD
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }

  function parseFlexibleDateTime(dtRaw) {
    const s = String(dtRaw || '').trim();

    // 1) YYYY-MM-DD HH:mm
    let m = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/.exec(s);
    if (m) return { date: m[1], time: m[2] };

    // 2) YYYY-MM-DDTHH:mm
    m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(s);
    if (m) return { date: m[1], time: m[2] };

    // 3) YYYY/MM/DD HH:mm
    m = /^(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})$/.exec(s);
    if (m) return { date: m[1].replace(/\//g, '-'), time: m[2] };

    // 4) YYYYMMDDHHmm
    m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
    if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };

    return null;
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
    if (!s || !b) {
      return {
        specified,
        ok: false,
        reason: `${label}:${op} (scan:${s ? s.toISOString() : 'NaN'}, base:${b ? b.toISOString() : 'NaN'})`,
      };
    }

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
    if (!s || !b) {
      return {
        specified,
        ok: false,
        reason: `${label}:${op} (scan:${s ? s.toISOString() : 'NaN'}, base:${b ? b.toISOString() : 'NaN'})`,
      };
    }

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
    if (s == null || b == null) {
      return { specified, ok: false, reason: `${label}:${op} (scan:${s}, base:${b})` };
    }

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

  // ===== SCAN パース（キー型: key=value / key:value / key=>value 形式 + 空白値対応） =====
  function parseScan(raw) {
    const text = String(raw || '').trim();
    if (!text) throw new Error('SCAN が空です');

    /** 例: "A=TEST B=10 C=2025-11-14 00:00; D=2025/11/14 & E=00:00" を安全に抽出する正規表現
     *  - ペアの区切りは [空白/&/;] を想定
     *  - 値は「次のキーの出現 or 終端」までを非貪欲で取得（空白含む）
     */
    const pairRe = /(?:^|[\s&;]+)([^\s=;:><&]+)\s*(=|:|=>)\s*([\s\S]*?)(?=(?:[\s&;]+[^\s=;:><&]+\s*(?:=|:|=>)|\s*$))/g;

    /** key → value（文字列）の一次マップ（重複キーは最後を採用） */
    const kv = {};
    const unknowns = [];
    let m;
    while ((m = pairRe.exec(text)) !== null) {
      let keyRaw = m[1];
      let valueRaw = m[3];

      if (!keyRaw) continue;
      // 末尾の区切りを削る
      const keyNorm = normalizeKey(keyRaw.trim());
      const valStr = String(valueRaw || '').trim();

      kv[keyNorm] = valStr; // 最後を採用
    }

    const keyMap = CFG.keyMap;

    // パース結果（評価に使う論理値）
    const parsed = {
      aText: null,
      bNumber: null,
      cDateTimeIso: null,
      dDateStr: null,
      eTimeStr: null,
      eMinutes: null,
      raw: text,
      warnings: [],
    };

    // keyMap に従って kv を論理スロットに詰める
    for (const [kNorm, value] of Object.entries(kv)) {
      const cfg = keyMap[kNorm];
      if (!cfg) {
        if (CFG.unknownKeyPolicy === 'warn') parsed.warnings.push(`未知キーを無視: ${kNorm}`);
        if (CFG.unknownKeyPolicy === 'error') throw new Error(`未知キー: ${kNorm}`);
        continue; // ignore
      }

      switch (cfg.type) {
        case 'text': {
          if (cfg.target === 'a') parsed.aText = value;
          break;
        }
        case 'number': {
          const num = Number(value);
          if (Number.isNaN(num)) {
            throw new Error(`数値キー "${kNorm}" の値が不正です (value="${value}")`);
          }
          if (cfg.target === 'b') parsed.bNumber = num;
          break;
        }
        case 'datetime': {
          const parts = parseFlexibleDateTime(value);
          if (!parts) {
            throw new Error(`日時キー "${kNorm}" の値が不正です (value="${value}")`);
          }
          const iso = toIsoFromDateTimeParts(parts.date, parts.time);
          if (!iso) {
            throw new Error(`日時キー "${kNorm}" の値が不正です (value="${value}")`);
          }
          if (cfg.target === 'c') parsed.cDateTimeIso = iso;
          break;
        }
        case 'date': {
          const d = parseFlexibleDate(value);
          if (!d) throw new Error(`日付キー "${kNorm}" の値が不正です (value="${value}")`);
          if (cfg.target === 'd') parsed.dDateStr = d;
          break;
        }
        case 'time': {
          const t = String(value || '').trim();
          // HH:mm のみ受付（必要なら HHmm の拡張も可）
          if (!/^\d{2}:\d{2}$/.test(t)) {
            throw new Error(`時刻キー "${kNorm}" の値が不正です (value="${t}")`);
          }
          const min = parseTimeToMin(t);
          if (min == null) {
            throw new Error(`時刻キー "${kNorm}" の値が不正です (value="${t}")`);
          }
          if (cfg.target === 'e') {
            parsed.eTimeStr = t;
            parsed.eMinutes = min;
          }
          break;
        }
        default:
          // 未知typeは無視（将来拡張用）
          break;
      }
    }

    // c が無い場合、d + e から c を合成（オプション）
    if (CFG.composeCFromDandE && !parsed.cDateTimeIso && parsed.dDateStr && parsed.eTimeStr) {
      const iso = toIsoFromDateTimeParts(parsed.dDateStr, parsed.eTimeStr);
      if (iso) parsed.cDateTimeIso = iso;
    }

    // 必須ターゲットの埋まりチェック
    for (const target of CFG.requiredTargets) {
      if (target === 'a' && (parsed.aText == null || parsed.aText === '')) {
        throw new Error(`必須キー(${target})が見つかりません`);
      }
      if (target === 'b' && parsed.bNumber == null) {
        throw new Error(`必須キー(${target})が見つかりません`);
      }
      if (target === 'c' && !parsed.cDateTimeIso) {
        throw new Error(`必須キー(${target})が見つかりません`);
      }
      if (target === 'd' && !parsed.dDateStr) {
        throw new Error(`必須キー(${target})が見つかりません`);
      }
      if (target === 'e' && !parsed.eTimeStr) {
        throw new Error(`必須キー(${target})が見つかりません`);
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

    // ルールNG理由 + 未知キー警告などもまとめて格納
    const reasonsText = [...(evalRes.reasons || []), ...(parsed.warnings || [])].join(' / ');
    row.value[tf.reason] = { type: 'MULTI_LINE_TEXT', value: reasonsText };

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
    status.style.minWidth = '110px';
    row1.appendChild(status);

    const row2 = document.createElement('div');
    row2.style.marginTop = '4px';
    row2.style.fontSize = '12px';
    row2.style.color = '#666';
    row2.textContent = 'SCAN 例: A=TEST B=10 C=2025-11-14T00:00 D=2025-11-14 E=00:00（&や;での区切りも可） → Enter';

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
