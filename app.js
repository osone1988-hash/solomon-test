// app.js
// 単純区切り型の「JS自動生成ツール」
// - フィールド型は日本語表示（kintone 表記ベース）
// - 型に応じて tokens は自動決定（日時=2、それ以外=1）
// - 生成されるJSは「1項目=最大5条件」対応の汎用スキャナ:contentReference[oaicite:1]{index=1}

(function () {
  'use strict';

  function $(selector) {
    return document.querySelector(selector);
  }

  function downloadJs(filename, source) {
    if (!source || !source.trim()) {
      alert('先に JSコードを生成してください。');
      return;
    }
    const blob = new Blob([source], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- 項目UIの生成 ----
  function setupSimpleFieldsUI() {
    const fieldCountInput = $('#simple-field-count');
    const container = $('#simple-fields-container');

    // a〜e 用のプリセット（任意）
    const presets = {
      1: { name: 'a', label: 'a', type: 'text',     tableField: 'at', value1: 'a',  op1: 'aj',  value2: 'a2', op2: 'aj2', join1: 'as1' },
      2: { name: 'b', label: 'b', type: 'number',   tableField: 'bt', value1: 'b',  op1: 'bj',  value2: 'b2', op2: 'bj2', join1: 'bs1' },
      3: { name: 'c', label: 'c', type: 'datetime', tableField: 'ct', value1: 'c',  op1: 'cj',  value2: 'c2', op2: 'cj2', join1: 'cs1' },
      4: { name: 'd', label: 'd', type: 'date',     tableField: 'dt', value1: 'd',  op1: 'dj',  value2: 'd2', op2: 'dj2', join1: 'ds1' },
      5: { name: 'e', label: 'e', type: 'time',     tableField: 'et', value1: 'e',  op1: 'ej',  value2: 'e2', op2: 'ej2', join1: 'es1' }
    };

    // UIに見せる型（表示ラベルと値）
    const TYPE_OPTIONS = [
      { value: 'text',      label: '文字列 (1行)' },
      { value: 'number',    label: '数値' },
      { value: 'datetime',  label: '日時' },
      { value: 'date',      label: '日付' },
      { value: 'time',      label: '時刻' },
      { value: 'dropdown',  label: 'ドロップダウン' },
      { value: 'radio',     label: 'ラジオボタン' },
      { value: 'checkbox',  label: 'チェックボックス' }
    ];

    function renderFields() {
      let count = parseInt(fieldCountInput.value, 10);
      if (Number.isNaN(count) || count < 1) count = 1;
      if (count > 20) count = 20;
      fieldCountInput.value = String(count);

      container.innerHTML = '';

      for (let i = 1; i <= count; i++) {
        const preset = presets[i] || {};
        const group = document.createElement('div');
        group.className = 'field-group';

        const title = document.createElement('div');
        title.className = 'field-group-title';
        title.textContent = '項目 ' + i;
        group.appendChild(title);

        const grid1 = document.createElement('div');
        grid1.className = 'field-group-grid';

        // 論理名 (name)
        const fName = document.createElement('div');
        fName.className = 'mini-field';
        const lblName = document.createElement('span');
        lblName.className = 'mini-label';
        lblName.textContent = '論理名 (name)';
        const inputName = document.createElement('input');
        inputName.type = 'text';
        inputName.id = 'simple-field-' + i + '-name';
        inputName.value = preset.name || '';
        fName.appendChild(lblName);
        fName.appendChild(inputName);
        grid1.appendChild(fName);

        // ラベル（エラー表示などに使用）
        const fLabel = document.createElement('div');
        fLabel.className = 'mini-field';
        const lblLabel = document.createElement('span');
        lblLabel.className = 'mini-label';
        lblLabel.textContent = 'ラベル (エラー表示用)';
        const inputLabel = document.createElement('input');
        inputLabel.type = 'text';
        inputLabel.id = 'simple-field-' + i + '-label';
        inputLabel.value = preset.label || '';
        fLabel.appendChild(lblLabel);
        fLabel.appendChild(inputLabel);
        grid1.appendChild(fLabel);

        // 型（日本語ラベル）
        const fType = document.createElement('div');
        fType.className = 'mini-field';
        const lblType = document.createElement('span');
        lblType.className = 'mini-label';
        lblType.textContent = '型（kintone フィールド種別）';
        const selType = document.createElement('select');
        selType.id = 'simple-field-' + i + '-type';
        TYPE_OPTIONS.forEach((optDef) => {
          const opt = document.createElement('option');
          opt.value = optDef.value;
          opt.textContent = optDef.label;
          // プリセット型にマッチさせる（text/number/datetime/date/time）
          if (preset.type && preset.type === optDef.value) {
            opt.selected = true;
          }
          selType.appendChild(opt);
        });
        fType.appendChild(lblType);
        fType.appendChild(selType);
        grid1.appendChild(fType);

        // テーブル転記先
        const fTable = document.createElement('div');
        fTable.className = 'mini-field';
        const lblTable = document.createElement('span');
        lblTable.className = 'mini-label';
        lblTable.textContent = 'テーブル列フィールドコード';
        const inputTable = document.createElement('input');
        inputTable.type = 'text';
        inputTable.id = 'simple-field-' + i + '-tableField';
        inputTable.value = preset.tableField || '';
        fTable.appendChild(lblTable);
        fTable.appendChild(inputTable);
        grid1.appendChild(fTable);

        group.appendChild(grid1);

        // 判定フィールド（とりあえず2条件分）
        const subtitle = document.createElement('div');
        subtitle.style.marginTop = '6px';
        subtitle.style.fontSize = '12px';
        subtitle.style.color = '#4b5563';
        subtitle.textContent = '判定用フィールド (現在は2条件まで使用。内部的には5条件まで拡張可)';
        group.appendChild(subtitle);

        const grid2 = document.createElement('div');
        grid2.className = 'field-group-grid';

        // 値1
        const v1 = document.createElement('div');
        v1.className = 'mini-field';
        const lblV1 = document.createElement('span');
        lblV1.className = 'mini-label';
        lblV1.textContent = '値1フィールドコード';
        const inputV1 = document.createElement('input');
        inputV1.type = 'text';
        inputV1.id = 'simple-field-' + i + '-value1';
        inputV1.value = preset.value1 || '';
        v1.appendChild(lblV1);
        v1.appendChild(inputV1);
        grid2.appendChild(v1);

        // 条件1
        const o1 = document.createElement('div');
        o1.className = 'mini-field';
        const lblO1 = document.createElement('span');
        lblO1.className = 'mini-label';
        lblO1.textContent = '条件1フィールドコード';
        const inputO1 = document.createElement('input');
        inputO1.type = 'text';
        inputO1.id = 'simple-field-' + i + '-op1';
        inputO1.value = preset.op1 || '';
        o1.appendChild(lblO1);
        o1.appendChild(inputO1);
        grid2.appendChild(o1);

        // 値2
        const v2 = document.createElement('div');
        v2.className = 'mini-field';
        const lblV2 = document.createElement('span');
        lblV2.className = 'mini-label';
        lblV2.textContent = '値2フィールドコード';
        const inputV2 = document.createElement('input');
        inputV2.type = 'text';
        inputV2.id = 'simple-field-' + i + '-value2';
        inputV2.value = preset.value2 || '';
        v2.appendChild(lblV2);
        v2.appendChild(inputV2);
        grid2.appendChild(v2);

        // 条件2
        const o2 = document.createElement('div');
        o2.className = 'mini-field';
        const lblO2 = document.createElement('span');
        lblO2.className = 'mini-label';
        lblO2.textContent = '条件2フィールドコード';
        const inputO2 = document.createElement('input');
        inputO2.type = 'text';
        inputO2.id = 'simple-field-' + i + '-op2';
        inputO2.value = preset.op2 || '';
        o2.appendChild(lblO2);
        o2.appendChild(inputO2);
        grid2.appendChild(o2);

        // AND/OR フィールド
        const j1 = document.createElement('div');
        j1.className = 'mini-field';
        const lblJ1 = document.createElement('span');
        lblJ1.className = 'mini-label';
        lblJ1.textContent = 'AND/OR フィールドコード';
        const inputJ1 = document.createElement('input');
        inputJ1.type = 'text';
        inputJ1.id = 'simple-field-' + i + '-join1';
        inputJ1.value = preset.join1 || '';
        j1.appendChild(lblJ1);
        j1.appendChild(inputJ1);
        grid2.appendChild(j1);

        group.appendChild(grid2);

        container.appendChild(group);
      }
    }

    fieldCountInput.addEventListener('change', renderFields);
    renderFields();
  }

  // ---- JS 生成（単純区切り 汎用エンジン版） ----
  function buildSimpleJs(config) {
    // delimiter 行
    let delimiterLine;
    if (config.delimiterIsRegex) {
      delimiterLine = '    delimiter: ' + config.delimiterRaw + ',';
    } else {
      delimiterLine = '    delimiter: ' + JSON.stringify(config.delimiterRaw) + ',';
    }

    // fields 部分
    const fieldsLines = config.fields.map((f) => {
      return [
        '      {',
        '        name: ' + JSON.stringify(f.name) + ',',
        '        label: ' + JSON.stringify(f.label) + ',',
        '        type: ' + JSON.stringify(f.type) + ',',
        '        tokens: ' + f.tokens + ',',
        '        tableField: ' + JSON.stringify(f.tableField) + ',',
        '        judge: {',
        '          valueFields: ' + JSON.stringify(f.judge.valueFields) + ',',
        '          opFields: ' + JSON.stringify(f.judge.opFields) + ',',
        '          joinFields: ' + JSON.stringify(f.judge.joinFields) + ',',
        '        },',
        '      }'
      ].join('\n');
    }).join(',\n');

    const tableLines = [
      '    table: {',
      '      code: ' + JSON.stringify(config.table.code) + ',',
      '      scanAtField: ' + JSON.stringify(config.table.scanAtField) + ',',
      '      resultField: ' + JSON.stringify(config.table.resultField) + ',',
      '      reasonField: ' + JSON.stringify(config.table.reasonField) + ',',
      '    },'
    ].join('\n');

    const header = [
      '// Generated by QR Config Tool',
      '// Mode: simple-delimiter (flex fields, max 20 fields, each up to 5 conditions)',
      '// Generated at: ' + new Date().toISOString(),
      ''
    ].join('\n');

    const cfgBlock = [
      '(function () {',
      "  'use strict';",
      '',
      '  const CFG = {',
      '    spaceId: ' + JSON.stringify(config.spaceId) + ',',
      delimiterLine,
      '    fields: [',
      fieldsLines,
      '    ],',
      tableLines,
      '  };',
      ''
    ].join('\n');

    // 汎用エンジン本体（前回と同じ）:contentReference[oaicite:2]{index=2}
    const engine = `  const val = (rec, code) => (code && rec[code] ? rec[code].value : '');
  const nz  = (s) => String(s === undefined || s === null ? '' : s).trim() !== '';

  function nowIso() { return new Date().toISOString(); }

  function parseTimeToMin(hhmmOrHHmm) {
    if (!hhmmOrHHmm) return null;
    const s = String(hhmmOrHHmm);
    let h, m;
    if (/^\\d{2}:\\d{2}$/.test(s)) {
      h = Number(s.slice(0, 2));
      m = Number(s.slice(3, 5));
    } else if (/^\\d{4}$/.test(s)) {
      h = Number(s.slice(0, 2));
      m = Number(s.slice(2, 4));
    } else {
      return null;
    }
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }

  function parseDateLocal(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00+09:00');
    return Number.isNaN(d.getTime()) ? null : d;
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

  function toIsoFromDateTimeParts(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const dt = new Date(dateStr + 'T' + timeStr + ':00+09:00');
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  function tokenizeScan(text) {
    const delim = CFG.delimiter;
    if (delim instanceof RegExp) {
      return text.split(delim).filter(function (t) { return t.length > 0; });
    }
    if (typeof delim === 'string' && delim.length > 0) {
      return text.split(delim).filter(function (t) { return t.length > 0; });
    }
    return text.split(/\\s+/).filter(function (t) { return t.length > 0; });
  }

  function judgeText(scan, base, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified || base === null || base === undefined || base === '') {
      return { specified: specified, ok: true, reason: null };
    }
    const s = String(scan === undefined || scan === null ? '' : scan);
    const b = String(base);
    let ok = true;
    switch (op) {
      case 'まったく同じ': ok = (s === b); break;
      case '含む':         ok = s.indexOf(b) !== -1; break;
      case '含まない':     ok = s.indexOf(b) === -1; break;
      case '前方一致':
      case '前部一致':     ok = s.indexOf(b) === 0; break;
      case '後方一致':
      case '後部一致':     ok = s.lastIndexOf(b) === s.length - b.length; break;
      default: return { specified: specified, ok: true, reason: null };
    }
    return { specified: specified, ok: ok, reason: ok ? null : (label + ':' + op) };
  }

  function judgeNumber(scanNum, baseNum, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified || baseNum === null || baseNum === undefined || baseNum === '' || Number.isNaN(Number(baseNum))) {
      return { specified: specified, ok: true, reason: null };
    }
    const s = Number(scanNum);
    const b = Number(baseNum);
    if (Number.isNaN(s)) {
      return { specified: specified, ok: false, reason: label + ':' + op + ' (scan:NaN, base:' + b + ')' };
    }
    let ok = true;
    switch (op) {
      case '同じ': ok = (s === b); break;
      case '異なる': ok = (s !== b); break;
      case '以上': ok = (s >= b); break;
      case '以下': ok = (s <= b); break;
      case 'より大きい': ok = (s > b); break;
      case '未満': ok = (s < b); break;
      default: return { specified: specified, ok: true, reason: null };
    }
    return { specified: specified, ok: ok, reason: ok ? null : (label + ':' + op + ' (scan:' + s + ', base:' + b + ')') };
  }

  function judgeDateTime(scanIso, baseIso, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified) return { specified: specified, ok: true, reason: null };

    const s = scanIso ? new Date(scanIso) : null;
    const b = baseIso ? new Date(baseIso) : null;
    if (!s || !b) {
      return { specified: specified, ok: false, reason: label + ':' + op + ' (scan:' + (s ? s.toISOString() : 'NaN') + ', base:' + (b ? b.toISOString() : 'NaN') + ')' };
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
      default: return { specified: specified, ok: true, reason: null };
    }
    return { specified: specified, ok: ok, reason: ok ? null : (label + ':' + op) };
  }

  function judgeDate(scanDateStr, baseDateStr, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified) return { specified: specified, ok: true, reason: null };

    const s = scanDateStr ? parseDateLocal(scanDateStr) : null;
    const b = baseDateStr ? parseDateLocal(baseDateStr) : null;
    if (!s || !b) {
      return { specified: specified, ok: false, reason: label + ':' + op + ' (scan:' + (s ? s.toISOString() : 'NaN') + ', base:' + (b ? b.toISOString() : 'NaN') + ')' };
    }
    const ss = s.getTime();
    const bb = b.getTime();
    let ok = true;
    switch (op) {
      case '同じ': ok = (ss === bb); break;
      case '以外': ok = (ss !== bb); break;
      case '以降': ok = (ss >= bb); break;
      case '以前': ok = (ss <= bb); break;
      default: return { specified: specified, ok: true, reason: null };
    }
    return { specified: specified, ok: ok, reason: ok ? null : (label + ':' + op) };
  }

  function judgeTime(scanMin, baseTimeStr, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified) return { specified: specified, ok: true, reason: null };

    const s = (scanMin === undefined || scanMin === null) ? null : scanMin;
    const b = baseTimeStr ? parseTimeToMin(baseTimeStr) : null;
    if (s === null || b === null) {
      return { specified: specified, ok: false, reason: label + ':' + op + ' (scan:' + s + ', base:' + b + ')' };
    }
    let ok = true;
    switch (op) {
      case '同じ': ok = (s === b); break;
      case '以外': ok = (s !== b); break;
      case '以降': ok = (s >= b); break;
      case '以前': ok = (s <= b); break;
      default: return { specified: specified, ok: true, reason: null };
    }
    return { specified: specified, ok: ok, reason: ok ? null : (label + ':' + op + ' (scan:' + s + ', base:' + b + ')') };
  }

  function evaluateFieldConditions(rec, parsed, fieldDef) {
    const judgeCfg = fieldDef.judge || {};
    const valueFields = judgeCfg.valueFields || [];
    const opFields    = judgeCfg.opFields || [];
    const joinFields  = judgeCfg.joinFields || [];
    const baseLabel   = judgeCfg.label || fieldDef.label || fieldDef.name;

    const infoMap = parsed.values || {};
    const scanInfo = infoMap[fieldDef.name] || {};

    const conds = [];
    const joins = [];
    const reasons = [];
    let configError = false;

    const maxConds = 5;

    for (let i = 0; i < maxConds; i++) {
      const vCode = valueFields[i] || null;
      const oCode = opFields[i] || null;
      const baseVal = vCode ? val(rec, vCode) : '';
      const opRaw   = oCode ? val(rec, oCode) : '';
      const label   = baseLabel + (i + 1);

      if (i > 0) {
        const hasValue = nz(baseVal);
        const hasOp    = !!opRaw && opRaw !== '指定なし';
        if (hasValue && !hasOp) {
          configError = true;
          reasons.push('設定エラー: ' + label + ' の条件を選択してください');
        }
      }

      let cond;
      switch (fieldDef.type) {
        case 'text':
          cond = judgeText(scanInfo.text, baseVal, opRaw, label);
          break;
        case 'number':
          cond = judgeNumber(scanInfo.number, baseVal, opRaw, label);
          break;
        case 'datetime':
          cond = judgeDateTime(scanInfo.datetimeIso, baseVal, opRaw, label);
          break;
        case 'date':
          cond = judgeDate(scanInfo.date, baseVal, opRaw, label);
          break;
        case 'time':
          cond = judgeTime(scanInfo.minutes, baseVal, opRaw, label);
          break;
        default:
          cond = { specified: false, ok: true, reason: null };
      }
      conds.push(cond);
    }

    for (let i = 0; i < maxConds - 1; i++) {
      const joinCode = joinFields[i] || null;
      const joinRaw  = joinCode ? String(val(rec, joinCode) || '').trim().toLowerCase() : '';
      const nextCond = conds[i + 1];

      if (nextCond && nextCond.specified) {
        if (joinRaw !== 'and' && joinRaw !== 'or') {
          configError = true;
          reasons.push('設定エラー: ' + baseLabel + ' の連結条件(' + (i + 1) + ')を選択してください');
          joins[i] = 'and';
        } else {
          joins[i] = joinRaw;
        }
      } else {
        joins[i] = null;
      }
    }

    let agg = null;
    for (let i = 0; i < conds.length; i++) {
      const c = conds[i];
      if (!c.specified) continue;

      if (agg === null) {
        agg = c.ok;
      } else {
        const join = joins[i - 1] || 'and';
        if (join === 'or') {
          agg = agg || c.ok;
        } else {
          agg = agg && c.ok;
        }
      }

      if (!c.ok && c.reason) {
        reasons.push(c.reason);
      }
    }

    if (agg === null) {
      agg = true;
    }

    return {
      ok: !configError && agg,
      reasons: reasons,
      configError: configError
    };
  }

  function evaluateAll(rec, parsed) {
    const reasons = [];
    let configError = false;
    let allOk = true;

    const fields = CFG.fields || [];
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const res = evaluateFieldConditions(rec, parsed, field);
      if (!res.ok) allOk = false;
      if (res.configError) configError = true;
      if (res.reasons && res.reasons.length) {
        for (let k = 0; k < res.reasons.length; k++) {
          reasons.push(res.reasons[k]);
        }
      }
    }

    if (configError) {
      return { ok: false, reasons: reasons, configError: true };
    }
    return { ok: allOk, reasons: reasons, configError: false };
  }

  function parseScan(raw) {
    const text = String(raw || '').trim();
    if (!text) throw new Error('SCAN が空です');

    const tokens = tokenizeScan(text);
    const fields = CFG.fields || [];

    let minTokens = 0;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      minTokens += f.tokens || 1;
    }
    if (tokens.length < minTokens) {
      throw new Error('SCAN トークン数が不足しています（必要:' + minTokens + '個 / 実際:' + tokens.length + '個）');
    }

    let idx = 0;
    const parsed = {
      raw: text,
      values: {}
    };

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const n = field.tokens || 1;
      const slice = tokens.slice(idx, idx + n);
      idx += n;
      const joined = slice.join(' ');

      const info = {};
      const name = field.name;

      switch (field.type) {
        case 'text':
          info.text = joined;
          break;
        case 'number': {
          const num = Number(joined);
          if (Number.isNaN(num)) {
            throw new Error('数値トークンが不正です (' + name + '="' + joined + '")');
          }
          info.number = num;
          break;
        }
        case 'datetime': {
          let dateStr, timeStr;
          if (slice.length === 2) {
            dateStr = slice[0];
            timeStr = slice[1];
          } else {
            const m = /^([0-9]{4}-[0-9]{2}-[0-9]{2})\\s+([0-9]{2}:[0-9]{2})$/.exec(joined);
            if (!m) {
              throw new Error('日時トークンが不正です (' + name + '="' + joined + '")');
            }
            dateStr = m[1];
            timeStr = m[2];
          }
          const iso = toIsoFromDateTimeParts(dateStr, timeStr);
          if (!iso) {
            throw new Error('日時トークンが不正です (' + name + '="' + joined + '")');
          }
          info.datetimeIso = iso;
          info.date = dateStr;
          info.time = timeStr;
          info.minutes = parseTimeToMin(timeStr);
          break;
        }
        case 'date': {
          const d = joined;
          if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(d)) {
            throw new Error('日付トークンが不正です (' + name + '="' + d + '")');
          }
          info.date = d;
          break;
        }
        case 'time': {
          let t = joined;
          if (/^\\d{4}$/.test(t)) {
            t = t.slice(0, 2) + ':' + t.slice(2, 4);
          }
          if (!/^\\d{2}:\\d{2}$/.test(t)) {
            throw new Error('時刻トークンが不正です (' + name + '="' + t + '")');
          }
          const min = parseTimeToMin(t);
          if (min === null) {
            throw new Error('時刻トークンが不正です (' + name + '="' + t + '")');
          }
          info.time = t;
          info.minutes = min;
          break;
        }
        default:
          info.raw = joined;
      }

      parsed.values[name] = info;
    }

    return parsed;
  }

  function kintoneCellTypeFromFieldType(fieldType) {
    switch (fieldType) {
      case 'number':   return 'NUMBER';
      case 'datetime': return 'DATETIME';
      case 'date':     return 'DATE';
      case 'time':     return 'TIME';
      case 'text':
      default:
        return 'SINGLE_LINE_TEXT';
    }
  }

  function extractValueForTable(fieldDef, info) {
    if (!info) return '';
    switch (fieldDef.type) {
      case 'text':
        return info.text || '';
      case 'number':
        return (info.number === undefined || info.number === null) ? '' : String(info.number);
      case 'datetime':
        return info.datetimeIso || null;
      case 'date':
        return info.date || null;
      case 'time':
        return info.time || null;
      default:
        return info.raw || '';
    }
  }

  function appendRow(appRec, parsed, evalRes) {
    const rec = appRec.record;
    const tblCfg = CFG.table;

    if (!rec[tblCfg.code]) rec[tblCfg.code] = { type: 'SUBTABLE', value: [] };
    const table = rec[tblCfg.code];

    const row = { value: {} };

    row.value[tblCfg.scanAtField] = { type: 'DATETIME', value: nowIso() };

    const fields = CFG.fields || [];
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (!field.tableField) continue;
      const infoMap = parsed.values || {};
      const info = infoMap[field.name];
      const cellType = kintoneCellTypeFromFieldType(field.type);
      const v = extractValueForTable(field, info);
      row.value[field.tableField] = { type: cellType, value: v };
    }

    const resultStr = evalRes.configError ? 'ERR' : (evalRes.ok ? 'OK' : 'NG');
    row.value[tblCfg.resultField] = {
      type: 'SINGLE_LINE_TEXT',
      value: resultStr
    };
    row.value[tblCfg.reasonField] = {
      type: 'MULTI_LINE_TEXT',
      value: (evalRes.reasons || []).join(' / ')
    };

    table.value.push(row);
  }

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
    row2.textContent = 'SCAN 文字列を入力して Enter';

    wrap.appendChild(row1);
    wrap.appendChild(row2);
    mount.appendChild(wrap);

    clearBtn.addEventListener('click', function () {
      input.value = '';
      status.textContent = 'READY';
      input.focus();
    });

    input.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();

      const appRec = kintone.app.record.get();
      let parsed;
      try {
        parsed = parseScan(input.value);
      } catch (e) {
        status.textContent = 'NG: ' + e.message;
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

  kintone.events.on(['app.record.create.show', 'app.record.edit.show'], function (event) {
    buildScanUI();
    return event;
  });

})();`;

    return header + '\n' + cfgBlock + engine + '\n';
  }

  // ---- 単純区切りウィザード ----
  function setupSimpleWizard() {
    const spaceIdInput = $('#simple-space-id');
    const delimiterInput = $('#simple-delimiter');
    const fieldCountInput = $('#simple-field-count');
    const tableCodeInput = $('#simple-table-code');
    const tableScanAtInput = $('#simple-table-scanat');
    const tableResultInput = $('#simple-table-result');
    const tableReasonInput = $('#simple-table-reason');

    const generateBtn = $('#simple-generate-btn');
    const downloadBtn = $('#simple-download-btn');
    const status = $('#simple-status');
    const output = $('#simple-code-output');

    setupSimpleFieldsUI();

    generateBtn.addEventListener('click', function () {
      const spaceId = (spaceIdInput.value || '').trim() || 'scan_area';

      let delimiterRaw = (delimiterInput.value || '').trim();
      if (!delimiterRaw) delimiterRaw = '/\\s+/';
      let delimiterIsRegex = false;
      if (delimiterRaw.length >= 2 && delimiterRaw.charAt(0) === '/' && delimiterRaw.lastIndexOf('/') > 0) {
        delimiterIsRegex = true;
      }

      let fieldCount = parseInt(fieldCountInput.value, 10);
      if (Number.isNaN(fieldCount) || fieldCount < 1) fieldCount = 1;
      if (fieldCount > 20) fieldCount = 20;

      const fields = [];
      for (let i = 1; i <= fieldCount; i++) {
        let name = ($('#simple-field-' + i + '-name').value || '').trim();
        let label = ($('#simple-field-' + i + '-label').value || '').trim();
        const uiType = ($('#simple-field-' + i + '-type').value || 'text').trim();
        const tableField = ($('#simple-field-' + i + '-tableField').value || '').trim();
        const value1 = ($('#simple-field-' + i + '-value1').value || '').trim();
        const op1    = ($('#simple-field-' + i + '-op1').value || '').trim();
        const value2 = ($('#simple-field-' + i + '-value2').value || '').trim();
        const op2    = ($('#simple-field-' + i + '-op2').value || '').trim();
        const join1  = ($('#simple-field-' + i + '-join1').value || '').trim();

        if (!name) name = 'f' + i;
        if (!label) label = name;

        // UIの型 → 内部型へのマッピング
        let internalType;
        switch (uiType) {
          case 'number':
          case 'datetime':
          case 'date':
          case 'time':
            internalType = uiType;
            break;
          default:
            // text / dropdown / radio / checkbox → text として扱う
            internalType = 'text';
        }

        // tokens は内部型に応じて自動決定（日時=2、それ以外=1）
        const tokens = internalType === 'datetime' ? 2 : 1;

        fields.push({
          name: name,
          label: label,
          type: internalType,
          tokens: tokens,
          tableField: tableField,
          judge: {
            valueFields: [value1, value2, '', '', ''],
            opFields:    [op1,    op2,    '', '', ''],
            joinFields:  [join1,  '',     '', '', '']
          }
        });
      }

      const cfg = {
        spaceId: spaceId,
        delimiterRaw: delimiterRaw,
        delimiterIsRegex: delimiterIsRegex,
        fields: fields,
        table: {
          code: (tableCodeInput.value || '').trim() || 'scan_table',
          scanAtField: (tableScanAtInput.value || '').trim() || 'scan_at',
          resultField: (tableResultInput.value || '').trim() || 'result',
          reasonField: (tableReasonInput.value || '').trim() || 'reason'
        }
      };

      const js = buildSimpleJs(cfg);
      output.value = js;
      status.textContent = 'JSコードを生成しました。';
      downloadBtn.disabled = false;
    });

    downloadBtn.addEventListener('click', function () {
      downloadJs('pc-simple-flex.js', output.value);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupSimpleWizard();
  });
})();
