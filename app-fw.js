// app-fw.js
// 文字数区切り型（固定長） QR 読み取り JS 生成ツール
// - 1行の QR 文字列を左から順に「文字数」で区切る
// - 各項目は「型 + 文字数 + 判定フィールド（最大5条件）」で定義
// - 生成される JS は単純区切り型・キー型と同じ評価ロジックを使用

(function () {
  'use strict';

  function $(sel) {
    return document.querySelector(sel);
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

  // ---- 項目UI ----
  function setupFwFieldsUI() {
    const fieldCountInput = $('#fw-field-count');
    const container = $('#fw-fields-container');

    // サンプル用プリセット（a〜e）
    const presets = {
      1: { name: 'a', label: 'a', uiType: 'text',     length: 4,  tableField: 'at', value1: 'a',  op1: 'aj',  value2: 'a2', op2: 'aj2', join1: 'as1' },
      2: { name: 'b', label: 'b', uiType: 'number',   length: 3,  tableField: 'bt', value1: 'b',  op1: 'bj',  value2: 'b2', op2: 'bj2', join1: 'bs1' },
      3: { name: 'c', label: 'c', uiType: 'datetime', length: 16, tableField: 'ct', value1: 'c',  op1: 'cj',  value2: 'c2', op2: 'cj2', join1: 'cs1' },
      4: { name: 'd', label: 'd', uiType: 'date',     length: 10, tableField: 'dt', value1: 'd',  op1: 'dj',  value2: 'd2', op2: 'dj2', join1: 'ds1' },
      5: { name: 'e', label: 'e', uiType: 'time',     length: 5,  tableField: 'et', value1: 'e',  op1: 'ej',  value2: 'e2', op2: 'ej2', join1: 'es1' }
    };

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

        // 論理名
        const fName = document.createElement('div');
        fName.className = 'mini-field';
        const lblName = document.createElement('span');
        lblName.className = 'mini-label';
        lblName.textContent = '論理名 (name)';
        const inputName = document.createElement('input');
        inputName.type = 'text';
        inputName.id = 'fw-field-' + i + '-name';
        inputName.value = preset.name || '';
        fName.appendChild(lblName);
        fName.appendChild(inputName);
        grid1.appendChild(fName);

        // ラベル
        const fLabel = document.createElement('div');
        fLabel.className = 'mini-field';
        const lblLabel = document.createElement('span');
        lblLabel.className = 'mini-label';
        lblLabel.textContent = 'ラベル (エラー表示用)';
        const inputLabel = document.createElement('input');
        inputLabel.type = 'text';
        inputLabel.id = 'fw-field-' + i + '-label';
        inputLabel.value = preset.label || '';
        fLabel.appendChild(lblLabel);
        fLabel.appendChild(inputLabel);
        grid1.appendChild(fLabel);

        // 型
        const fType = document.createElement('div');
        fType.className = 'mini-field';
        const lblType = document.createElement('span');
        lblType.className = 'mini-label';
        lblType.textContent = '型（kintone フィールド種別）';
        const selType = document.createElement('select');
        selType.id = 'fw-field-' + i + '-type';
        const presetType = preset.uiType || 'text';
        TYPE_OPTIONS.forEach((optDef) => {
          const opt = document.createElement('option');
          opt.value = optDef.value;
          opt.textContent = optDef.label;
          if (optDef.value === presetType) opt.selected = true;
          selType.appendChild(opt);
        });
        fType.appendChild(lblType);
        fType.appendChild(selType);
        grid1.appendChild(fType);

        // 文字数
        const fLen = document.createElement('div');
        fLen.className = 'mini-field';
        const lblLen = document.createElement('span');
        lblLen.className = 'mini-label';
        lblLen.textContent = '文字数';
        const inputLen = document.createElement('input');
        inputLen.type = 'number';
        inputLen.min = '0';
        inputLen.max = '200';
        inputLen.id = 'fw-field-' + i + '-length';
        inputLen.value = preset.length != null ? String(preset.length) : '0';
        fLen.appendChild(lblLen);
        fLen.appendChild(inputLen);
        grid1.appendChild(fLen);

        // テーブル転記先
        const fTable = document.createElement('div');
        fTable.className = 'mini-field';
        const lblTable = document.createElement('span');
        lblTable.className = 'mini-label';
        lblTable.textContent = 'テーブル列フィールドコード';
        const inputTable = document.createElement('input');
        inputTable.type = 'text';
        inputTable.id = 'fw-field-' + i + '-tableField';
        inputTable.value = preset.tableField || '';
        fTable.appendChild(lblTable);
        fTable.appendChild(inputTable);
        grid1.appendChild(fTable);

        group.appendChild(grid1);

        // 判定フィールド
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

        grid2.appendChild(mini('値1フィールドコード',     'fw-field-' + i + '-value1', preset.value1));
        grid2.appendChild(mini('条件1フィールドコード',   'fw-field-' + i + '-op1',    preset.op1));
        grid2.appendChild(mini('値2フィールドコード',     'fw-field-' + i + '-value2', preset.value2));
        grid2.appendChild(mini('条件2フィールドコード',   'fw-field-' + i + '-op2',    preset.op2));
        grid2.appendChild(mini('AND/OR フィールドコード', 'fw-field-' + i + '-join1',  preset.join1));

        group.appendChild(grid2);
        container.appendChild(group);
      }
    }

    fieldCountInput.addEventListener('change', renderFields);
    renderFields();
  }

  // ---- JS 生成 ----
  function buildFwJs(config) {
    const header = [
      '// Generated by QR Config Tool',
      '// Mode: fixed-width (flex fields, max 20 fields, each up to 5 conditions)',
      '// Generated at: ' + new Date().toISOString(),
      ''
    ].join('\n');

    const fieldsLines = config.fields.map((f) => {
      return [
        '      {',
        '        name: ' + JSON.stringify(f.name) + ',',
        '        label: ' + JSON.stringify(f.label) + ',',
        '        type: ' + JSON.stringify(f.type) + ',',
        '        length: ' + f.length + ',',
        '        tableField: ' + JSON.stringify(f.tableField) + ',',
        '        judge: {',
        '          valueFields: ' + JSON.stringify(f.judge.valueFields) + ',',
        '          opFields: ' + JSON.stringify(f.judge.opFields) + ',',
        '          joinFields: ' + JSON.stringify(f.judge.joinFields) + ',',
        '        },',
        '      }'
      ].join('\n');
    }).join(',\n');

    const cfgBlock = [
      '(function () {',
      "  'use strict';",
      '',
      '  const CFG = {',
      '    spaceId: ' + JSON.stringify(config.spaceId) + ',',
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

    const engine = String.raw`
  const val = (rec, code) => (code && rec[code] ? rec[code].value : '');
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

  // ===== 判定関数 =====
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

  // ===== 1項目（最大5条件）の評価 =====
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

  // ===== 固定長 SCAN パース =====
  function parseScan(raw) {
    const text = String(raw || '');
    if (!text) throw new Error('SCAN が空です');

    const fields = CFG.fields || [];
    let requiredLength = 0;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const len = Number(f.length || 0);
      if (len > 0) requiredLength += len;
    }

    const actualLength = text.length;
    if (actualLength !== requiredLength) {
      throw new Error('SCAN 文字数が一致しません（必要:' + requiredLength + '桁 / 実際:' + actualLength + '桁）');
    }

    let idx = 0;
    const values = {};

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const segLen = Number(f.length || 0);
      let info = {};

      if (segLen > 0) {
        const rawSeg = text.slice(idx, idx + segLen);
        idx += segLen;
        const seg = rawSeg.trim();
        info.raw = seg;

        switch (f.type) {
          case 'text':
            info.text = seg;
            break;
          case 'number': {
            const num = Number(seg);
            if (Number.isNaN(num)) {
              throw new Error('数値フィールド "' + f.label + '" の値が不正です: ' + seg);
            }
            info.number = num;
            break;
          }
          case 'date': {
            const v = seg;
            let dStr = v;
            if (/^\d{8}$/.test(v)) {
              dStr = v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8);
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
              throw new Error('日付フィールド "' + f.label + '" の値が不正です: ' + v);
            }
            info.date = dStr;
            break;
          }
          case 'time': {
            let t = seg;
            if (/^\d{4}$/.test(t)) {
              t = t.slice(0, 2) + ':' + t.slice(2, 4);
            }
            if (!/^\d{2}:\d{2}$/.test(t)) {
              throw new Error('時刻フィールド "' + f.label + '" の値が不正です: ' + t);
            }
            const min = parseTimeToMin(t);
            if (min === null) {
              throw new Error('時刻フィールド "' + f.label + '" の値が不正です: ' + t);
            }
            info.time = t;
            info.minutes = min;
            break;
          }
          case 'datetime': {
            const v = seg;
            let dateStr, timeStr;
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) {
              dateStr = v.slice(0, 10);
              timeStr = v.slice(11, 16);
            } else if (/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(v)) {
              dateStr = v.slice(0, 10).replace(/\//g, '-');
              timeStr = v.slice(11, 16);
            } else if (/^[0-9]{12}$/.test(v)) {
              dateStr = v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8);
              timeStr = v.slice(8, 10) + ':' + v.slice(10, 12);
            } else {
              throw new Error('日時フィールド "' + f.label + '" の値が不正です: ' + v);
            }
            const iso = toIsoFromDateTimeParts(dateStr, timeStr);
            if (!iso) {
              throw new Error('日時フィールド "' + f.label + '" の値が不正です: ' + v);
            }
            info.datetimeIso = iso;
            info.date = dateStr;
            info.time = timeStr;
            info.minutes = parseTimeToMin(timeStr);
            break;
          }
          default:
            // 未知typeは raw のまま
            break;
        }
      }

      values[f.name] = info;
    }

    return {
      raw: text,
      values: values
    };
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

  function buildScanUI() {
    const space = kintone.app.record.getSpaceElement(CFG.spaceId);
    let mount = space;
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'tana-scan-fw-fallback';
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
    row2.textContent = '固定長文字列を入力して Enter';

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

  if (typeof kintone !== 'undefined' && kintone.events && kintone.app && kintone.app.record) {
    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], function (event) {
      buildScanUI();
      return event;
    });
  }
})();`;

    return header + '\n' + cfgBlock + engine + '\n';
  }

  // ---- ウィザード ----
  function setupFwWizard() {
    const spaceIdInput     = $('#fw-space-id');
    const fieldCountInput  = $('#fw-field-count');
    const tableCodeInput   = $('#fw-table-code');
    const tableScanAtInput = $('#fw-table-scanat');
    const tableResultInput = $('#fw-table-result');
    const tableReasonInput = $('#fw-table-reason');

    const generateBtn = $('#fw-generate-btn');
    const downloadBtn = $('#fw-download-btn');
    const status      = $('#fw-status');
    const output      = $('#fw-code-output');

    setupFwFieldsUI();

    generateBtn.addEventListener('click', function () {
      const spaceId = (spaceIdInput.value || '').trim() || 'scan_area';

      let fieldCount = parseInt(fieldCountInput.value, 10);
      if (Number.isNaN(fieldCount) || fieldCount < 1) fieldCount = 1;
      if (fieldCount > 20) fieldCount = 20;

      const fields = [];
      for (let i = 1; i <= fieldCount; i++) {
        let name  = ($('#fw-field-' + i + '-name').value || '').trim();
        let label = ($('#fw-field-' + i + '-label').value || '').trim();
        const uiType = ($('#fw-field-' + i + '-type').value || 'text').trim();
        const lenStr = ($('#fw-field-' + i + '-length').value || '').trim();
        const tableField = ($('#fw-field-' + i + '-tableField').value || '').trim();
        const value1 = ($('#fw-field-' + i + '-value1').value || '').trim();
        const op1    = ($('#fw-field-' + i + '-op1').value || '').trim();
        const value2 = ($('#fw-field-' + i + '-value2').value || '').trim();
        const op2    = ($('#fw-field-' + i + '-op2').value || '').trim();
        const join1  = ($('#fw-field-' + i + '-join1').value || '').trim();

        if (!name) name = 'f' + i;
        if (!label) label = name;

        let internalType;
        switch (uiType) {
          case 'number':
          case 'datetime':
          case 'date':
          case 'time':
            internalType = uiType;
            break;
          default:
            internalType = 'text'; // text / dropdown / radio / checkbox → text扱い
        }

        let length = parseInt(lenStr, 10);
        if (Number.isNaN(length) || length < 0) length = 0;

        fields.push({
          name: name,
          label: label,
          type: internalType,
          length: length,
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
        fields: fields,
        table: {
          code: (tableCodeInput.value || '').trim() || 'scan_table',
          scanAtField: (tableScanAtInput.value || '').trim() || 'scan_at',
          resultField: (tableResultInput.value || '').trim() || 'result',
          reasonField: (tableReasonInput.value || '').trim() || 'reason'
        }
      };

      const js = buildFwJs(cfg);
      output.value = js;
      status.textContent = 'JSコードを生成しました。';
      downloadBtn.disabled = false;
    });

    downloadBtn.addEventListener('click', function () {
      downloadJs('pc-fixedwidth-flex.js', output.value);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupFwWizard();
  });
})();
