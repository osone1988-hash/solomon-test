// app-kv.js
// キー型 (key=value) QR 読み取り JS 生成ツール
// - UI で key → 論理フィールド / 型 / 判定フィールド を設定
// - それを元に「1項目=最大5条件」対応のキー型スキャナJSを生成

(function () {
  'use strict';

  function $(sel) { return document.querySelector(sel); }

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

  // ---- UI: キーごとの設定エリア ----
  function setupKvFieldsUI() {
    const fieldCountInput = $('#kv-field-count');
    const container = $('#kv-fields-container');

    const typeOptions = [
      { value: 'text',     label: '文字列（1行・選択型）' },
      { value: 'number',   label: '数値' },
      { value: 'date',     label: '日付' },
      { value: 'time',     label: '時刻' },
      { value: 'datetime', label: '日時' }
    ];

    // a〜e 用の軽いプリセット（お好みで変更可能）
    const presets = {
      1: { key: 'A', name: 'a', label: 'a', type: 'text',     tableField: 'at', value1: 'a',  op1: 'aj',  value2: 'a2', op2: 'aj2', join1: 'as1' },
      2: { key: 'B', name: 'b', label: 'b', type: 'number',   tableField: 'bt', value1: 'b',  op1: 'bj',  value2: 'b2', op2: 'bj2', join1: 'bs1' },
      3: { key: 'C', name: 'c', label: 'c', type: 'datetime', tableField: 'ct', value1: 'c',  op1: 'cj',  value2: 'c2', op2: 'cj2', join1: 'cs1' },
      4: { key: 'D', name: 'd', label: 'd', type: 'date',     tableField: 'dt', value1: 'd',  op1: 'dj',  value2: 'd2', op2: 'dj2', join1: 'ds1' },
      5: { key: 'E', name: 'e', label: 'e', type: 'time',     tableField: 'et', value1: 'e',  op1: 'ej',  value2: 'e2', op2: 'ej2', join1: 'es1' }
    };

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

        // QRキー文字列
        const keyField = document.createElement('div');
        keyField.className = 'mini-field';
        const lblKey = document.createElement('span');
        lblKey.className = 'mini-label';
        lblKey.textContent = 'QRキー文字列（例: PRODUCT）';
        const inputKey = document.createElement('input');
        inputKey.type = 'text';
        inputKey.id = 'kv-field-' + i + '-key';
        inputKey.value = preset.key || '';
        keyField.appendChild(lblKey);
        keyField.appendChild(inputKey);
        grid1.appendChild(keyField);

        // 論理名
        const nameField = document.createElement('div');
        nameField.className = 'mini-field';
        const lblName = document.createElement('span');
        lblName.className = 'mini-label';
        lblName.textContent = '論理名 (name)';
        const inputName = document.createElement('input');
        inputName.type = 'text';
        inputName.id = 'kv-field-' + i + '-name';
        inputName.value = preset.name || '';
        nameField.appendChild(lblName);
        nameField.appendChild(inputName);
        grid1.appendChild(nameField);

        // ラベル
        const labelField = document.createElement('div');
        labelField.className = 'mini-field';
        const lblLabel = document.createElement('span');
        lblLabel.className = 'mini-label';
        lblLabel.textContent = 'ラベル (エラー表示用)';
        const inputLabel = document.createElement('input');
        inputLabel.type = 'text';
        inputLabel.id = 'kv-field-' + i + '-label';
        inputLabel.value = preset.label || '';
        labelField.appendChild(lblLabel);
        labelField.appendChild(inputLabel);
        grid1.appendChild(labelField);

        // 型
        const typeField = document.createElement('div');
        typeField.className = 'mini-field';
        const lblType = document.createElement('span');
        lblType.className = 'mini-label';
        lblType.textContent = '型（kintone のフィールド型）';
        const selType = document.createElement('select');
        selType.id = 'kv-field-' + i + '-type';
        const presetType = preset.type || 'text';
        typeOptions.forEach((optDef) => {
          const opt = document.createElement('option');
          opt.value = optDef.value;
          opt.textContent = optDef.label;
          if (optDef.value === presetType) opt.selected = true;
          selType.appendChild(opt);
        });
        typeField.appendChild(lblType);
        typeField.appendChild(selType);
        grid1.appendChild(typeField);

        // テーブル転記先
        const tableField = document.createElement('div');
        tableField.className = 'mini-field';
        const lblTable = document.createElement('span');
        lblTable.className = 'mini-label';
        lblTable.textContent = 'テーブル列フィールドコード';
        const inputTable = document.createElement('input');
        inputTable.type = 'text';
        inputTable.id = 'kv-field-' + i + '-tableField';
        inputTable.value = preset.tableField || '';
        tableField.appendChild(lblTable);
        tableField.appendChild(inputTable);
        grid1.appendChild(tableField);

        group.appendChild(grid1);

        // 判定フィールド（2条件分）
        const subTitle = document.createElement('div');
        subTitle.style.marginTop = '6px';
        subTitle.style.fontSize = '12px';
        subTitle.style.color = '#4b5563';
        subTitle.textContent = '判定用フィールド (現在は最大2条件。内部的には5条件まで拡張可能)';
        group.appendChild(subTitle);

        const grid2 = document.createElement('div');
        grid2.className = 'field-group-grid';

        function mini(labelText, id, presetVal) {
          const wrap = document.createElement('div');
          wrap.className = 'mini-field';
          const lbl = document.createElement('span');
          lbl.className = 'mini-label';
          lbl.textContent = labelText;
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.id = id;
          inp.value = presetVal || '';
          wrap.appendChild(lbl);
          wrap.appendChild(inp);
          return wrap;
        }

        grid2.appendChild(mini('値1フィールドコード',     'kv-field-' + i + '-value1', preset.value1));
        grid2.appendChild(mini('条件1フィールドコード',   'kv-field-' + i + '-op1',    preset.op1));
        grid2.appendChild(mini('値2フィールドコード',     'kv-field-' + i + '-value2', preset.value2));
        grid2.appendChild(mini('条件2フィールドコード',   'kv-field-' + i + '-op2',    preset.op2));
        grid2.appendChild(mini('AND/OR フィールドコード', 'kv-field-' + i + '-join1',  preset.join1));

        group.appendChild(grid2);
        container.appendChild(group);
      }
    }

    fieldCountInput.addEventListener('change', renderFields);
    renderFields();
  }

  // ---- JS 生成 ----

  function buildKvJs(config) {
    // assignOp / pairDelimiter / pairDelimiterMode を CFG に埋め込む
    const headerLines = [
      '// Generated by QR Config Tool',
      '// Mode: key-value (flex fields, max 20 fields, each up to 5 conditions)',
      '// Generated at: ' + new Date().toISOString(),
      ''
    ].join('\n');

    const fieldsLines = config.fields.map((f) => {
      return [
        '      {',
        '        key: ' + JSON.stringify(f.key) + ',',
        '        name: ' + JSON.stringify(f.name) + ',',
        '        label: ' + JSON.stringify(f.label) + ',',
        '        type: ' + JSON.stringify(f.type) + ',',
        '        tableField: ' + JSON.stringify(f.tableField) + ',',
        '        judge: {',
        '          valueFields: ' + JSON.stringify(f.judge.valueFields) + ',',
        '          opFields: ' + JSON.stringify(f.judge.opFields) + ',',
        '          joinFields: ' + JSON.stringify(f.judge.joinFields) + ',',
        '        },',
        '      }'
      ].join('\n');
    }).join(',\n');

    const cfg = [
      '(function () {',
      "  'use strict';",
      '',
      '  const CFG = {',
      '    spaceId: ' + JSON.stringify(config.spaceId) + ',',
      '    keyAssignOp: ' + JSON.stringify(config.assignOp) + ',',
      '    pairDelimiterMode: ' + JSON.stringify(config.pairDelimiterMode) + ',',
      '    pairDelimiterChar: ' + JSON.stringify(config.pairDelimiterChar) + ',',
      '    fields: [',
      fieldsLines,
      '    ],',
      '    table: {',
      '      code: ' + JSON.stringify(config.table.code) + ',',
      '      scanAtField: ' + JSON.stringify(config.table.scanAtField) + ',',
      '      resultField: ' + JSON.stringify(config.table.resultField) + ',',
      '      reasonField: ' + JSON.stringify(config.table.reasonField) + ',',
      '    },',
      '  };',
      ''
    ].join('\n');

    // エンジン部：単純区切り型のロジックをベースに、「parseScan」をキー型用にしたもの
    const engine = String.raw`  const val = (rec, code) => (code && rec[code] ? rec[code].value : '');
  const nz  = (s) => String(s === undefined || s === null ? '' : s).trim() !== '';

  function nowIso() { return new Date().toISOString(); }

  function parseTimeToMin(hhmmOrHHmm) {
    if (!hhmmOrHHmm) return null;
    const s = String(hhmmOrHHmm);
    let h, m;
    if (/^\d{2}:\d{2}$/.test(s)) {
      h = Number(s.slice(0, 2));
      m = Number(s.slice(3, 5));
    } else if (/^\d{4}$/.test(s)) {
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

  // ===== 判定関数（単一条件） =====
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

  // ===== キー型 SCAN パース =====
  function parseScan(raw) {
    const text = String(raw || '').trim();
    if (!text) throw new Error('SCAN が空です');

    const assignOp = CFG.keyAssignOp || '=';
    const fields = CFG.fields || [];

    const keyMap = {};
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (!f.key) continue;
      keyMap[String(f.key).toLowerCase()] = f;
    }

    let pairs = [];
    if (CFG.pairDelimiterMode === 'newline') {
      pairs = text.split(/\r?\n/).filter((s) => s.trim().length > 0);
    } else {
      const ch = CFG.pairDelimiterChar || ';';
      pairs = text.split(ch).map((s) => s.trim()).filter((s) => s.length > 0);
    }

    const values = {};

    for (let i = 0; i < pairs.length; i++) {
      const line = pairs[i];
      const idx = line.indexOf(assignOp);
      if (idx < 0) {
        // 区切りが見つからない場合は無視（将来 warn にしてもよい）
        continue;
      }
      const keyRaw = line.slice(0, idx).trim();
      const valRaw = line.slice(idx + assignOp.length).trim();

      if (!keyRaw) continue;

      const keyLower = keyRaw.toLowerCase();
      const fieldDef = keyMap[keyLower];
      if (!fieldDef) {
        // 未知キーは無視（将来 WARN/ERR にするモード追加も可）
        continue;
      }

      // 重複キーは ERR にしたい場合はここで判定することも可能（今回は「最後を採用」ではなく、配列に保持）
      if (!values[fieldDef.name]) {
        values[fieldDef.name] = { raw: valRaw };
      } else {
        // とりあえず上書きせず、既存 raw に追記（将来 ERR モードにしてもOK）
        values[fieldDef.name].raw += '|' + valRaw;
      }
    }

    // 型ごとにパース
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const info = values[f.name];
      if (!info) continue;

      const rawVal = info.raw;

      switch (f.type) {
        case 'text':
          info.text = rawVal;
          break;
        case 'number': {
          const num = Number(rawVal);
          if (Number.isNaN(num)) {
            throw new Error('数値キー "' + f.key + '" の値が不正です: ' + rawVal);
          }
          info.number = num;
          break;
        }
        case 'date': {
          const d = rawVal;
          if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(d)) {
            throw new Error('日付キー "' + f.key + '" の値が不正です: ' + d);
          }
          info.date = d;
          break;
        }
        case 'time': {
          let t = rawVal;
          if (/^\\d{4}$/.test(t)) {
            t = t.slice(0, 2) + ':' + t.slice(2, 4);
          }
          if (!/^\\d{2}:\\d{2}$/.test(t)) {
            throw new Error('時刻キー "' + f.key + '" の値が不正です: ' + t);
          }
          const min = parseTimeToMin(t);
          if (min === null) {
            throw new Error('時刻キー "' + f.key + '" の値が不正です: ' + t);
          }
          info.time = t;
          info.minutes = min;
          break;
        }
        case 'datetime': {
          // 想定: "YYYY-MM-DD HH:mm" or "YYYY/MM/DD HH:mm" or "YYYYMMDDHHmm"
          let dateStr, timeStr;
          const v = rawVal;
          if (/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$/.test(v)) {
            dateStr = v.slice(0, 10);
            timeStr = v.slice(11, 16);
          } else if (/^\\d{4}\\/\\d{2}\\/\\d{2} \\d{2}:\\d{2}$/.test(v)) {
            dateStr = v.slice(0, 10).replace(/\\//g, '-');
            timeStr = v.slice(11, 16);
          } else if (/^[0-9]{12}$/.test(v)) {
            dateStr = v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8);
            timeStr = v.slice(8, 10) + ':' + v.slice(10, 12);
          } else {
            throw new Error('日時キー "' + f.key + '" の値が不正です: ' + v);
          }
          const iso = toIsoFromDateTimeParts(dateStr, timeStr);
          if (!iso) {
            throw new Error('日時キー "' + f.key + '" の値が不正です: ' + v);
          }
          info.datetimeIso = iso;
          info.date = dateStr;
          info.time = timeStr;
          info.minutes = parseTimeToMin(timeStr);
          break;
        }
        default:
          // 未知 type は raw のまま
          break;
      }
    }

    return {
      raw: text,
      values: values
    };
  }

  // ===== サブテーブル転記 =====
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
      const info = (parsed.values || {})[field.name];
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

  // ===== UI描画 =====
  function buildScanUI() {
    const space = kintone.app.record.getSpaceElement(CFG.spaceId);
    let mount = space;
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'tana-scan-kv-fallback';
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
    row2.textContent = '例: PRODUCT=TEST;SIZE=10;DATE=2025-11-14;TIME=12:00';

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

    return headerLines + '\n' + cfg + engine + '\n';
  }

  // ---- ウィザードのセットアップ ----
  function setupKvWizard() {
    const spaceIdInput = $('#kv-space-id');
    const pairDelimInput = $('#kv-pair-delimiter');
    const pairDelimModeSelect = $('#kv-pair-delimiter-mode');
    const assignOpSelect = $('#kv-assign-op');
    const fieldCountInput = $('#kv-field-count');
    const tableCodeInput = $('#kv-table-code');
    const tableScanAtInput = $('#kv-table-scanat');
    const tableResultInput = $('#kv-table-result');
    const tableReasonInput = $('#kv-table-reason');

    const generateBtn = $('#kv-generate-btn');
    const downloadBtn = $('#kv-download-btn');
    const status = $('#kv-status');
    const output = $('#kv-code-output');

    setupKvFieldsUI();

    generateBtn.addEventListener('click', function () {
      const spaceId = (spaceIdInput.value || '').trim() || 'scan_area';
      let pairDelimiterMode = pairDelimModeSelect.value || 'char';
      let pairDelimiterChar = (pairDelimInput.value || '').trim();
      if (pairDelimiterMode === 'char' && !pairDelimiterChar) {
        pairDelimiterChar = ';';
      }
      const assignOp = assignOpSelect.value || '=';

      let fieldCount = parseInt(fieldCountInput.value, 10);
      if (Number.isNaN(fieldCount) || fieldCount < 1) fieldCount = 1;
      if (fieldCount > 20) fieldCount = 20;

      const fields = [];
      for (let i = 1; i <= fieldCount; i++) {
        let key = ($('#kv-field-' + i + '-key').value || '').trim();
        let name = ($('#kv-field-' + i + '-name').value || '').trim();
        let label = ($('#kv-field-' + i + '-label').value || '').trim();
        const type = ($('#kv-field-' + i + '-type').value || 'text').trim();
        const tableField = ($('#kv-field-' + i + '-tableField').value || '').trim();
        const value1 = ($('#kv-field-' + i + '-value1').value || '').trim();
        const op1    = ($('#kv-field-' + i + '-op1').value || '').trim();
        const value2 = ($('#kv-field-' + i + '-value2').value || '').trim();
        const op2    = ($('#kv-field-' + i + '-op2').value || '').trim();
        const join1  = ($('#kv-field-' + i + '-join1').value || '').trim();

        if (!name) name = 'f' + i;
        if (!label) label = name;

        fields.push({
          key: key,
          name: name,
          label: label,
          type: type,
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
        assignOp: assignOp,
        pairDelimiterMode: pairDelimiterMode,
        pairDelimiterChar: pairDelimiterChar,
        fields: fields,
        table: {
          code: (tableCodeInput.value || '').trim() || 'scan_table',
          scanAtField: (tableScanAtInput.value || '').trim() || 'scan_at',
          resultField: (tableResultInput.value || '').trim() || 'result',
          reasonField: (tableReasonInput.value || '').trim() || 'reason'
        }
      };

      const js = buildKvJs(cfg);
      output.value = js;
      status.textContent = 'JSコードを生成しました。';
      downloadBtn.disabled = false;
    });

    downloadBtn.addEventListener('click', function () {
      downloadJs('pc-kv-flex.js', output.value);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupKvWizard();
  });
})();
