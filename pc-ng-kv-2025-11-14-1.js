// TANA-OROSHI / キー型スキャナ（トークン別に前後文字を指定して抽出）
//  - 例: "a=TEST; b=10; c=2025-11-14 00:00; d=2025-11-14; e=00:00;"
//  - 各トークン（a,b,c,d,e）ごとに {before, after, type} を設定（大小文字は無視）
//  - 単純区切り型の judge / evaluate / ERR判定ロジックは踏襲
//  - 仕様（本サンプルの反映点）:
//     * キー大小文字: 無視
//     * 未知キー: 無視（将来 warn/err に拡張可）
//     * キー重複: ERR（"aの読み取り結果が不正です" などを reason に出力）
//     * 必須キー: a,b,c,d,e は原則必須。ただし欠落しても判定は継続し、
//                 reason に「読み取れない、文字列があります」を記録（ERRにはしない）
//     * DATETIME と DATE/TIME の優先順位: なし（指定type通りに扱う／合成しない）
//     * TZ: JST(+09:00)固定
//
// version:
window.__TANA_PC_VERSION = 'pc-key-token-2025-11-18-01';

(function () {
  'use strict';

  // ===== 設定 =====
  const CFG = {
    spaceId: 'scan_area',               // SCAN UI の設置スペース（kintoneのスペースコード）

    // トークン定義: { target:'a'|'b'|'c'|'d'|'e', label:'a'など, type:'text'|'number'|'datetime'|'date'|'time',
    //                before:'a=', after:';' } の形で設定
    // ★サービスの管理画面からこの配列を生成／差し替えする想定★
    tokenDefs: [
      { target: 'a', label: 'a', type: 'text',     before: 'a=', after: ';' },
      { target: 'b', label: 'b', type: 'number',   before: 'b=', after: ';' },
      { target: 'c', label: 'c', type: 'datetime', before: 'c=', after: ';' },
      { target: 'd', label: 'd', type: 'date',     before: 'd=', after: ';' },
      { target: 'e', label: 'e', type: 'time',     before: 'e=', after: ';' },
    ],

    caseInsensitiveTokens: true,        // before/after のマッチは大小文字を無視
    duplicatePolicy: 'error',           // 'error' 固定（重複はERR）
    missingKeyNote: '読み取れない、文字列があります', // 欠落時にreasonへ記録する文言（ERRにはしない）

    // JST固定
    timezoneOffset: '+09:00',

    // 受け付ける日時/日付/時刻のフォーマット（最低限）
    // DATETIME: "YYYY-MM-DD HH:mm" or "YYYY-MM-DDTHH:mm"
    // DATE:     "YYYY-MM-DD"
    // TIME:     "HH:mm"
    // （必要に応じて正規表現を追加可能）
    // ---- サブテーブル・判定用フィールド ----
    tableCode: 'scan_table',
    tableFields: {
      scanAt: 'scan_at',                // DATETIME: スキャン時刻
      a: 'at',                          // TEXT
      b: 'bt',                          // NUMBER
      c: 'ct',                          // DATETIME
      d: 'dt',                          // DATE
      e: 'et',                          // TIME
      result: 'result',                 // TEXT (OK/NG/ERR)
      reason: 'reason',                 // MULTI_LINE_TEXT
    },

    // 判定条件フィールド（単純区切り版を踏襲）
    ruleFields: {
      a: 'a',   aj: 'aj',   a2: 'a2', aj2: 'aj2', as1: 'as1',
      b: 'b',   bj: 'bj',   b2: 'b2', bj2: 'bj2', bs1: 'bs1',
      c: 'c',   cj: 'cj',   c2: 'c2', cj2: 'cj2', cs1: 'cs1',
      d: 'd',   dj: 'dj',   d2: 'd2', dj2: 'dj2', ds1: 'ds1',
      e: 'e',   ej: 'ej',   e2: 'e2', ej2: 'ej2', es1: 'es1',
    },

    // すべて必須（ただし欠落はERRではなく注意書きのみにするため、評価は継続）
    requiredTargets: ['a','b','c','d','e'],
  };

  // ===== 小ユーティリティ =====
  const val = (rec, code) => (rec[code] ? rec[code].value : '');

  function nowIso() { return new Date().toISOString(); }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

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
    return a && b && a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }
  function sameHM(a, b) {
    return a && b && a.getHours() === b.getHours() && a.getMinutes() === b.getMinutes();
  }

  function parseFlexibleDateTime(dtRaw) {
    const s = String(dtRaw || '').trim();
    let m = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/.exec(s);          // YYYY-MM-DD HH:mm
    if (m) return { date: m[1], time: m[2] };
    m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(s);                // YYYY-MM-DDTHH:mm
    if (m) return { date: m[1], time: m[2] };
    return null;
  }

  // ===== 判定関数（「スキャン値が欠落」の場合は判定から除外 = OK扱い） =====
  function judgeText(scan, base, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified || base == null || base === '' || scan == null || scan === '') {
      return { specified, ok: true, reason: null };
    }
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
    if (!specified || baseNum == null || baseNum === '' || scanNum == null || scanNum === '') {
      return { specified, ok: true, reason: null };
    }
    const s = Number(scanNum), b = Number(baseNum);
    if (Number.isNaN(s)) return { specified, ok: true, reason: null }; // 欠落相当としてスキップ
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
    if (!specified || !scanIso || !baseIso) return { specified, ok: true, reason: null };
    const s = new Date(scanIso), b = new Date(baseIso);
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
    if (!specified || !scanDateStr || !baseDateStr) return { specified, ok: true, reason: null };
    const s = parseDateLocal(scanDateStr), b = parseDateLocal(baseDateStr);
    if (!s || !b) return { specified, ok: true, reason: null };
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
    if (!specified || scanMin == null || !baseTimeStr) return { specified, ok: true, reason: null };
    const b = parseTimeToMin(baseTimeStr);
    if (b == null) return { specified, ok: true, reason: null };
    let ok = true;
    switch (op) {
      case '同じ': ok = (scanMin === b); break;
      case '以外': ok = (scanMin !== b); break;
      case '以降': ok = (scanMin >= b); break;
      case '以前': ok = (scanMin <= b); break;
      default: return { specified, ok: true, reason: null };
    }
    return { specified, ok, reason: ok ? null : `${label}:${op} (scan:${scanMin}, base:${b})` };
  }

  // conds: [{specified, ok, reason}], join:'and'|'or'
  function combineConds(conds, join) {
    const specified = conds.filter(c => c.specified);
    if (specified.length === 0) return { ok: true, reasons: [] }; // 未設定は通す
    const oks = specified.map(c => c.ok);
    const ok = (join === 'or') ? oks.some(Boolean) : oks.every(Boolean);
    const reasons = specified.filter(c => !c.ok).map(c => c.reason);
    return { ok, reasons };
  }

  function resolveJoinOrConfigError(joinRaw, cond2, label) {
    const hasSecond = cond2.specified;
    const t = String(joinRaw || '').trim().toLowerCase();
    if (hasSecond && t !== 'and' && t !== 'or') {
      return { isError: true, join: 'and', message: `設定エラー: ${label} の連結条件を選択してください` };
    }
    const join = (t === 'or') ? 'or' : 'and';
    return { isError: false, join, message: null };
  }

  function checkSecondFieldConfig(base2, op2, label) {
    const hasValue = String(base2 ?? '').trim() !== '';
    const hasOp = !!op2 && op2 !== '指定なし';
    if (hasValue && !hasOp) {
      return { isError: true, message: `設定エラー: ${label} の条件を選択してください` };
    }
    return { isError: false, message: null };
  }

  // ===== グループ評価 =====
  const RF = CFG.ruleFields;

  function evalGroupA(rec, parsed) {
    const base2 = val(rec, RF.a2);
    const op2   = val(rec, RF.aj2);
    const secondCheck = checkSecondFieldConfig(base2, op2, 'a2(aj2)');
    if (secondCheck.isError) return { ok: false, reasons: [secondCheck.message], configError: true };

    const c1 = judgeText(parsed.aText, val(rec, RF.a),  val(rec, RF.aj),  'a1');
    const c2 = judgeText(parsed.aText, base2, op2, 'a2');

    const joinCheck = resolveJoinOrConfigError(val(rec, RF.as1), c2, 'a(as1)');
    if (joinCheck.isError) return { ok: false, reasons: [joinCheck.message], configError: true };

    const comb = combineConds([c1, c2], joinCheck.join);
    return { ok: comb.ok, reasons: comb.reasons, configError: false };
  }

  function evalGroupB(rec, parsed) {
    const base2 = val(rec, RF.b2);
    const op2   = val(rec, RF.bj2);
    const secondCheck = checkSecondFieldConfig(base2, op2, 'b2(bj2)');
    if (secondCheck.isError) return { ok: false, reasons: [secondCheck.message], configError: true };

    const c1 = judgeNumber(parsed.bNumber, val(rec, RF.b),  val(rec, RF.bj),  'b1');
    const c2 = judgeNumber(parsed.bNumber, base2, op2, 'b2');

    const joinCheck = resolveJoinOrConfigError(val(rec, RF.bs1), c2, 'b(bs1)');
    if (joinCheck.isError) return { ok: false, reasons: [joinCheck.message], configError: true };

    const comb = combineConds([c1, c2], joinCheck.join);
    return { ok: comb.ok, reasons: comb.reasons, configError: false };
  }

  function evalGroupC(rec, parsed) {
    const base2 = val(rec, RF.c2);
    const op2   = val(rec, RF.cj2);
    const secondCheck = checkSecondFieldConfig(base2, op2, 'c2(cj2)');
    if (secondCheck.isError) return { ok: false, reasons: [secondCheck.message], configError: true };

    const c1 = judgeDateTime(parsed.cDateTimeIso, val(rec, RF.c),  val(rec, RF.cj),  'c1');
    const c2 = judgeDateTime(parsed.cDateTimeIso, base2, op2, 'c2');

    const joinCheck = resolveJoinOrConfigError(val(rec, RF.cs1), c2, 'c(cs1)');
    if (joinCheck.isError) return { ok: false, reasons: [joinCheck.message], configError: true };

    const comb = combineConds([c1, c2], joinCheck.join);
    return { ok: comb.ok, reasons: comb.reasons, configError: false };
  }

  function evalGroupD(rec, parsed) {
    const base2 = val(rec, RF.d2);
    const op2   = val(rec, RF.dj2);
    const secondCheck = checkSecondFieldConfig(base2, op2, 'd2(dj2)');
    if (secondCheck.isError) return { ok: false, reasons: [secondCheck.message], configError: true };

    const c1 = judgeDate(parsed.dDateStr, val(rec, RF.d),  val(rec, RF.dj),  'd1');
    const c2 = judgeDate(parsed.dDateStr, base2, op2, 'd2');

    const joinCheck = resolveJoinOrConfigError(val(rec, RF.ds1), c2, 'd(ds1)');
    if (joinCheck.isError) return { ok: false, reasons: [joinCheck.message], configError: true };

    const comb = combineConds([c1, c2], joinCheck.join);
    return { ok: comb.ok, reasons: comb.reasons, configError: false };
  }

  function evalGroupE(rec, parsed) {
    const base2 = val(rec, RF.e2);
    const op2   = val(rec, RF.ej2);
    const secondCheck = checkSecondFieldConfig(base2, op2, 'e2(ej2)');
    if (secondCheck.isError) return { ok: false, reasons: [secondCheck.message], configError: true };

    const c1 = judgeTime(parsed.eMinutes, val(rec, RF.e),  val(rec, RF.ej),  'e1');
    const c2 = judgeTime(parsed.eMinutes, base2, op2, 'e2');

    const joinCheck = resolveJoinOrConfigError(val(rec, RF.es1), c2, 'e(es1)');
    if (joinCheck.isError) return { ok: false, reasons: [joinCheck.message], configError: true };

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

    return { ok: reasons.length === 0, reasons, configError };
  }

  // ===== 文字列からトークン抽出（各トークンの before/after で非貪欲に抽出） =====
  function collectTokenValues(text, before, after, caseInsensitive) {
    const b = escapeRegExp(before);
    const a = escapeRegExp(after);
    const flags = 'g' + (caseInsensitive ? 'i' : '');
    const re = new RegExp(b + '([\\s\\S]*?)' + a, flags);
    const found = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      found.push(String(m[1]).trim());
    }
    return found;
  }

  // ===== SCAN パース（重複はERR、欠落は注意メモとしてreasonへ） =====
  function parseScan(raw) {
    const text = String(raw || '').trim();
    if (!text) return { parsed: null, parseErr: 'SCAN が空です' };

    const parsed = {
      aText: null, bNumber: null, cDateTimeIso: null, dDateStr: null, eTimeStr: null, eMinutes: null,
      raw: text,
      reasons: [],       // 注意や重複等のメッセージ
      configError: false // 重複や値形式不正などは ERR 扱いにする
    };

    const missingTargets = [];

    for (const tok of CFG.tokenDefs) {
      const hits = collectTokenValues(text, tok.before, tok.after, CFG.caseInsensitiveTokens);

      if (hits.length === 0) {
        if (CFG.requiredTargets.includes(tok.target)) {
          missingTargets.push(tok.label || tok.target);
        }
        continue;
      }
      if (hits.length > 1 && CFG.duplicatePolicy === 'error') {
        parsed.configError = true;
        parsed.reasons.push(`${tok.label || tok.target}の読み取り結果が不正です（重複）`);
        // 重複時は評価値をセットしない（nullのまま）
        continue;
      }

      const value = hits[0];

      try {
        switch (tok.type) {
          case 'text': {
            if (tok.target === 'a') parsed.aText = value;
            break;
          }
          case 'number': {
            const n = Number(value);
            if (Number.isNaN(n)) throw new Error('数値ではありません');
            if (tok.target === 'b') parsed.bNumber = n;
            break;
          }
          case 'datetime': {
            const parts = parseFlexibleDateTime(value);
            if (!parts) throw new Error('日時フォーマットが不正です');
            const iso = toIsoFromDateTimeParts(parts.date, parts.time);
            if (!iso) throw new Error('日時に変換できません');
            if (tok.target === 'c') parsed.cDateTimeIso = iso;
            break;
          }
          case 'date': {
            const d = String(value).trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('日付フォーマットが不正です');
            if (tok.target === 'd') parsed.dDateStr = d;
            break;
          }
          case 'time': {
            const t = String(value).trim();
            if (!/^\d{2}:\d{2}$/.test(t)) throw new Error('時刻フォーマットが不正です');
            const min = parseTimeToMin(t);
            if (min == null) throw new Error('時刻に変換できません');
            if (tok.target === 'e') { parsed.eTimeStr = t; parsed.eMinutes = min; }
            break;
          }
          default:
            // 将来拡張用: type未対応は無視
            break;
        }
      } catch (err) {
        parsed.configError = true;
        parsed.reasons.push(`${tok.label || tok.target}の読み取り結果が不正です`);
      }
    }

    // 欠落があれば注意書きを reason に追記（ERRにはしない）
    if (missingTargets.length > 0) {
      parsed.reasons.push(CFG.missingKeyNote);
    }

    return { parsed, parseErr: null };
  }

  // ===== サブテーブル追記（parse/eval の両結果をマージして記録） =====
  function appendRow(appRec, parsed, evalRes) {
    const rec = appRec.record;
    const tf = CFG.tableFields;
    if (!rec[CFG.tableCode]) rec[CFG.tableCode] = { type: 'SUBTABLE', value: [] };
    const table = rec[CFG.tableCode];

    const combinedConfigError = evalRes.configError || parsed.configError;
    const reasonsText = [...(evalRes.reasons || []), ...(parsed.reasons || [])].join(' / ');

    const row = { value: {} };
    row.value[tf.scanAt] = { type: 'DATETIME', value: nowIso() };
    row.value[tf.a]      = { type: 'SINGLE_LINE_TEXT', value: parsed.aText ?? '' };
    row.value[tf.b]      = { type: 'NUMBER', value: parsed.bNumber == null ? '' : String(parsed.bNumber) };
    row.value[tf.c]      = { type: 'DATETIME', value: parsed.cDateTimeIso };
    row.value[tf.d]      = { type: 'DATE', value: parsed.dDateStr };
    row.value[tf.e]      = { type: 'TIME', value: parsed.eTimeStr };

    const resultStr = combinedConfigError ? 'ERR' : (evalRes.ok ? 'OK' : 'NG');
    row.value[tf.result] = { type: 'SINGLE_LINE_TEXT', value: resultStr };
    row.value[tf.reason] = { type: 'MULTI_LINE_TEXT', value: reasonsText };

    table.value.push(row);
  }

  // ===== UI（scan_area に設置） =====
  function buildScanUI() {
    const space = kintone.app.record.getSpaceElement(CFG.spaceId);
    let mount = space;
    if (!mount) {
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
    status.style.minWidth = '120px';
    row1.appendChild(status);

    const row2 = document.createElement('div');
    row2.style.marginTop = '4px';
    row2.style.fontSize = '12px';
    row2.style.color = '#666';
    row2.textContent = '例: a=TEST; b=10; c=2025-11-14 00:00; d=2025-11-14; e=00:00; → Enter';

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

      // 1) 解析
      const { parsed, parseErr } = parseScan(input.value);
      if (parseErr) {
        status.textContent = `NG: ${parseErr}`;
        return;
      }

      // 2) 評価
      const evalRes = evaluateAll(appRec.record, parsed);

      // 3) 転記
      appendRow(appRec, parsed, evalRes);
      kintone.app.record.set(appRec);

      // 4) ステータス
      const combinedConfigError = evalRes.configError || parsed.configError;
      status.textContent = combinedConfigError ? 'ERR (読み取り)' : (evalRes.ok ? 'OK' : 'NG');

      // 5) クリア
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
