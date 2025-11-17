// TANA-OROSHI / 単純区切り型スキャナ
// version:
window.__TANA_PC_VERSION = 'pc-ng-rules-2025-11-10-20';

(function () {
  'use strict';

  // ===== 設定 =====
  const CFG = {
    spaceId: 'scan_area',
    tableCode: 'scan_table',
    tableFields: {
      scanAt: 'scan_at',
      a: 'at',
      b: 'bt',
      c: 'ct',   // DATETIME
      d: 'dt',   // DATE
      e: 'et',   // TIME
      result: 'result',
      reason: 'reason',
    },
    ruleFields: {
      a: 'a',
      aj: 'aj',
      b: 'b',
      bj: 'bj',
      c: 'c',
      cj: 'cj',
      d: 'd',
      dj: 'dj',
      e: 'e',
      ej: 'ej',
    },
    delimiter: /\s+/, // 半角スペース（連続もOK）
  };

  // ===== ユーティリティ =====

  function nowAsKintoneDateTime() {
    // ブラウザローカル → ISO (kintone形式)
    return new Date().toISOString();
  }

  function toKintoneDateTime(dateStr, timeStr) {
    // 'YYYY-MM-DD' + 'HH:mm' → ISO文字列（JST前提）
    if (!dateStr || !timeStr) return null;
    const dt = new Date(`${dateStr}T${timeStr}:00+09:00`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
  }

  function parseDateToLocal(dateStr) {
    if (!dateStr) return null;
    const dt = new Date(`${dateStr}T00:00:00+09:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    const m = /^(\d{2}):(\d{2})$/.exec(timeStr);
    if (!m) return null;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (
      Number.isNaN(h) ||
      Number.isNaN(mm) ||
      h < 0 ||
      h > 23 ||
      mm < 0 ||
      mm > 59
    ) {
      return null;
    }
    return h * 60 + mm;
  }

  function sameYMD(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function sameHM(a, b) {
    return a.getHours() === b.getHours() && a.getMinutes() === b.getMinutes();
  }

  function field(record, code) {
    return record[code] || { value: '' };
  }

  // ===== 判定ロジック =====

  function checkText(scanText, baseText, op) {
    if (!op || op === '指定なし') return null;
    if (!baseText) return null;

    const s = String(scanText ?? '');
    const b = String(baseText ?? '');
    let ok = true;

    switch (op) {
      case 'まったく同じ':
        ok = s === b;
        break;
      case '含む':
        ok = s.includes(b);
        break;
      case '含まない':
        ok = !s.includes(b);
        break;
      case '前部一致':
      case '前方一致':
        ok = s.startsWith(b);
        break;
      case '後部一致':
      case '後方一致':
        ok = s.endsWith(b);
        break;
      default:
        return null;
    }

    return ok ? null : `a:${op}`;
  }

  function checkNumber(scanNum, baseNum, op) {
    if (!op || op === '指定なし') return null;
    if (baseNum == null || Number.isNaN(baseNum)) return null;
    if (scanNum == null || Number.isNaN(scanNum)) {
      return `b:${op} (scan:NaN, base:${baseNum})`;
    }

    let ok = true;
    switch (op) {
      case '同じ':
        ok = scanNum === baseNum;
        break;
      case '異なる':
        ok = scanNum !== baseNum;
        break;
      case '以上':
        ok = scanNum >= baseNum;
        break;
      case '以下':
        ok = scanNum <= baseNum;
        break;
      case 'より大きい':
        ok = scanNum > baseNum;
        break;
      case '未満':
        ok = scanNum < baseNum;
        break;
      default:
        return null;
    }

    return ok ? null : `b:${op} (scan:${scanNum}, base:${baseNum})`;
  }

  function checkDateTime(scanDt, baseDt, op, label) {
    if (!op || op === '指定なし') return null;
    if (!baseDt || !scanDt) {
      return `${label}:${op} (scan:${scanDt ? scanDt.toISOString() : 'NaN'}, base:${baseDt ? baseDt.toISOString() : 'NaN'})`;
    }

    let ok = true;
    switch (op) {
      case '同じ':
        ok = scanDt.getTime() === baseDt.getTime();
        break;
      case '以外':
        ok = scanDt.getTime() !== baseDt.getTime();
        break;
      case '以降':
        ok = scanDt.getTime() >= baseDt.getTime();
        break;
      case '以前':
        ok = scanDt.getTime() <= baseDt.getTime();
        break;
      case '日付が同じ':
        ok = sameYMD(scanDt, baseDt);
        break;
      case '日付が異なる':
        ok = !sameYMD(scanDt, baseDt);
        break;
      case '時間が同じ':
        ok = sameHM(scanDt, baseDt);
        break;
      case '時間が異なる':
        ok = !sameHM(scanDt, baseDt);
        break;
      default:
        return null;
    }

    if (ok) return null;
    return `${label}:${op}`;
  }

  function checkDate(scanDate, baseDate, op, label) {
    if (!op || op === '指定なし') return null;
    if (!baseDate || !scanDate) {
      return `${label}:${op} (scan:${scanDate ? scanDate.toISOString() : 'NaN'}, base:${baseDate ? baseDate.toISOString() : 'NaN'})`;
    }

    let ok = true;
    const s = scanDate.getTime();
    const b = baseDate.getTime();

    switch (op) {
      case '同じ':
        ok = s === b;
        break;
      case '以外':
        ok = s !== b;
        break;
      case '以降':
        ok = s >= b;
        break;
      case '以前':
        ok = s <= b;
        break;
      default:
        return null;
    }

    if (ok) return null;
    return `${label}:${op}`;
  }

  function checkTime(scanMinutes, baseMinutes, op, label) {
    if (!op || op === '指定なし') return null;
    if (baseMinutes == null || scanMinutes == null) {
      return `${label}:${op} (scan:${scanMinutes}, base:${baseMinutes})`;
    }

    let ok = true;
    const s = scanMinutes;
    const b = baseMinutes;

    switch (op) {
      case '同じ':
        ok = s === b;
        break;
      case '以外':
        ok = s !== b;
        break;
      case '以降':
        ok = s >= b;
        break;
      case '以前':
        ok = s <= b;
        break;
      default:
        return null;
    }

    if (ok) return null;
    return `${label}:${op} (scan:${s}, base:${b})`;
  }

  function evaluateAll(record, parsed) {
    const rf = CFG.ruleFields;

    const aBase = field(record, rf.a).value;
    const ajVal = field(record, rf.aj).value;
    const bBase =
      field(record, rf.b).value === ''
        ? null
        : Number(field(record, rf.b).value);
    const bjVal = field(record, rf.bj).value;

    const cBaseRaw = field(record, rf.c).value;
    const cjVal = field(record, rf.cj).value;

    const dBaseRaw = field(record, rf.d).value; // 'YYYY-MM-DD'
    const djVal = field(record, rf.dj).value;

    const eBaseRaw = field(record, rf.e).value; // 'HH:mm'
    const ejVal = field(record, rf.ej).value;

    const reasons = [];

    // a: 文字列
    const rText = checkText(parsed.aText, aBase, ajVal);
    if (rText) reasons.push(rText);

    // b: 数値
    const rNum = checkNumber(parsed.bNumber, bBase, bjVal);
    if (rNum) reasons.push(rNum);

    // c: 日時
    let scanC = null;
    let baseC = null;
    if (parsed.cDateTimeIso) {
      scanC = new Date(parsed.cDateTimeIso);
    }
    if (cBaseRaw) {
      baseC = new Date(cBaseRaw);
    }
    const rC = checkDateTime(scanC, baseC, cjVal, 'c');
    if (rC) reasons.push(rC);

    // d: DATE
    const scanDDate = parsed.dDateStr ? parseDateToLocal(parsed.dDateStr) : null;
    const baseDDate = dBaseRaw ? parseDateToLocal(dBaseRaw) : null;
    const rD = checkDate(scanDDate, baseDDate, djVal, 'd');
    if (rD) reasons.push(rD);

    // e: TIME
    const scanE = parsed.eMinutes;
    const baseE = parseTimeToMinutes(eBaseRaw);
    const rE = checkTime(scanE, baseE, ejVal, 'e');
    if (rE) reasons.push(rE);

    return {
      ok: reasons.length === 0,
      reasons,
    };
  }

  // ===== SCAN パース =====

  function parseScanText(raw) {
    const text = (raw || '').trim();
    if (!text) {
      throw new Error('SCAN が空です');
    }

    const tokens = text.split(CFG.delimiter);
    if (tokens.length < 6) {
      throw new Error('SCAN のトークン数が足りません（最低6個必要）');
    }

    const [aText, bToken, cDateStr, cTimeStr, dDateStr, eTimeStr] = tokens;

    const bNumber = Number(bToken);
    if (Number.isNaN(bNumber)) {
      throw new Error(`数値トークンが不正です (b="${bToken}")`);
    }

    const cDateTimeIso = toKintoneDateTime(cDateStr, cTimeStr);
    if (!cDateTimeIso) {
      throw new Error(
        `日時トークンが不正です (c="${cDateStr} ${cTimeStr}")`
      );
    }

    // DATE 形式ざっくりチェック
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dDateStr)) {
      throw new Error(`日付トークンが不正です (d="${dDateStr}")`);
    }

    // TIME 形式ざっくりチェック
    if (!/^\d{2}:\d{2}$/.test(eTimeStr)) {
      throw new Error(`時刻トークンが不正です (e="${eTimeStr}")`);
    }
    const eMinutes = parseTimeToMinutes(eTimeStr);
    if (eMinutes == null) {
      throw new Error(`時刻トークンが不正です (e="${eTimeStr}")`);
    }

    return {
      raw,
      aText,
      bNumber,
      cDateStr,
      cTimeStr,
      cDateTimeIso,
      dDateStr,
      eTimeStr,
      eMinutes,
    };
  }

  // ===== サブテーブル行 追加 =====

  function appendRow(record, parsed, evalResult) {
    const tf = CFG.tableFields;
    const table = field(record, CFG.tableCode);
    if (!table.value) table.value = [];

    const scanAtIso = nowAsKintoneDateTime();

    const row = {
      value: {},
    };

    row.value[tf.scanAt] = {
      type: 'DATETIME',
      value: scanAtIso,
    };
    row.value[tf.a] = {
      type: 'SINGLE_LINE_TEXT',
      value: parsed.aText,
    };
    row.value[tf.b] = {
      type: 'NUMBER',
      value:
        parsed.bNumber == null || Number.isNaN(parsed.bNumber)
          ? ''
          : String(parsed.bNumber),
    };
    row.value[tf.c] = {
      type: 'DATETIME',
      value: parsed.cDateTimeIso,
    };
    row.value[tf.d] = {
      type: 'DATE',
      value: parsed.dDateStr,
    };
    row.value[tf.e] = {
      type: 'TIME',
      value: parsed.eTimeStr,
    };
    row.value[tf.result] = {
      type: 'SINGLE_LINE_TEXT',
      value: evalResult.ok ? 'OK' : 'NG',
    };
    row.value[tf.reason] = {
      type: 'MULTI_LINE_TEXT',
      value: evalResult.reasons.join(' / '),
    };

    table.value.push(row);
  }

  // ===== UI =====

  function buildScanArea(event) {
    const space = kintone.app.record.getSpaceElement(CFG.spaceId);
    if (!space) return;

    // 2回目以降の表示で重複しないようにクリア
    while (space.firstChild) {
      space.removeChild(space.firstChild);
    }

    const wrapper = document.createElement('div');

    const label = document.createElement('span');
    label.textContent = 'SCAN　(文字) (数値) (日時) (DATE) (時間) の順に入力 → Enter　';
    wrapper.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.style.width = '60%';
    wrapper.appendChild(input);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'クリア';
    clearBtn.style.marginLeft = '8px';
    wrapper.appendChild(clearBtn);

    const status = document.createElement('span');
    status.style.marginLeft = '8px';
    status.textContent = `READY (space:${CFG.spaceId})`;
    wrapper.appendChild(status);

    space.appendChild(wrapper);

    clearBtn.addEventListener('click', () => {
      input.value = '';
      status.textContent = `READY (space:${CFG.spaceId})`;
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();

      const raw = input.value;
      const appRec = kintone.app.record.get();
      const record = appRec.record;

      let parsed;
      try {
        parsed = parseScanText(raw);
      } catch (e) {
        status.textContent = `NG: ${e.message}`;
        return;
      }

      const evalResult = evaluateAll(record, parsed);
      appendRow(record, parsed, evalResult);

      kintone.app.record.set(appRec);

      status.textContent = evalResult.ok ? 'OK' : 'NG';
      input.value = '';
    });
  }

  // ===== イベント登録 =====

  kintone.events.on(
    ['app.record.create.show', 'app.record.edit.show'],
    function (event) {
      buildScanArea(event);
      return event;
    }
  );
})();
