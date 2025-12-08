// app-kv.js
// キー型（key=value）QR SCAN JS 生成ツール
// - 各項目ごとに「キー / 前文字列 / 後文字列 / 型 / 判定フィールド」を設定
// - 1項目=最大5条件（UIは2条件分）の評価ロジックで OK/NG/ERR 判定

(function () {
  'use strict';

  // ========= 共通ユーティリティ =========
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

  // ========= フィールド設定 UI構築 =========
  function setupKvFieldsUI() {
    const fieldCountInput = $('#kv-field-count');
    const container = $('#kv-fields-container');

    // 初期プリセット（a〜e）
    const presets = {
      1: { name: 'a', label: 'a', key: 'a', before: 'a=', after: ';', type: 'text',     tableField: 'at', value1: 'a',  op1: 'aj',  value2: 'a2', op2: 'aj2', join1: 'as1' },
      2: { name: 'b', label: 'b', key: 'b', before: 'b=', after: ';', type: 'number',   tableField: 'bt', value1: 'b',  op1: 'bj',  value2: 'b2', op2: 'bj2', join1: 'bs1' },
      3: { name: 'c', label: 'c', key: 'c', before: 'c=', after: ';', type: 'datetime', tableField: 'ct', value1: 'c',  op1: 'cj',  value2: 'c2', op2: 'cj2', join1: 'cs1' },
      4: { name: 'd', label: 'd', key: 'd', before: 'd=', after: ';', type: 'date',     tableField: 'dt', value1: 'd',  op1: 'dj',  value2: 'd2', op2: 'dj2', join1: 'ds1' },
      5: { name: 'e', label: 'e', key: 'e', before: 'e=', after: ';', type: 'time',     tableField: 'et', value1: 'e',  op1: 'ej',  value2: 'e2', op2: 'ej2', join1: 'es1' }
    };

    const TYPE_OPTIONS = [
      { value: 'text',     label: '文字列 (1行・選択型)' },
      { value: 'number',   label: '数値' },
      { value: 'datetime', label: '日時' },
      { value: 'date',     label: '日付' },
      { value: 'time',     label: '時刻' }
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
        title.innerHTML = '項目 ' + i + '<span class="tag">キー ' + (preset.key || '') + '</span>';
        group.appendChild(title);

        const grid1 = document.createElement('div');
        grid1.className = 'field-group-grid';

        function makeField(labelText, id, value, cls) {
          const wrap = document.createElement('div');
          wrap.className = 'field ' + (cls || '');
          const lbl = document.createElement('label');
          lbl.htmlFor = id;
          lbl.textContent = labelText;
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.id = id;
          inp.value = value || '';
          wrap.appendChild(lbl);
          wrap.appendChild(inp);
          return wrap;
        }

        // 論理名
        grid1.appendChild(makeField('論理名 (name)', 'kv-field-' + i + '-name', preset.name, 'small'));

        // ラベル
        grid1.appendChild(makeField('ラベル (エラー表示用)', 'kv-field-' + i + '-label', preset.label, 'medium'));

        // kintone 型
        const fType = document.createElement('div');
        fType.className = 'field small';
        const lblType = document.createElement('label');
        lblType.htmlFor = 'kv-field-' + i + '-type';
        lblType.textContent = '型（kintone フィールド型）';
        const selType = document.createElement('select');
        selType.id = 'kv-field-' + i + '-type';
        const presetType = preset.type || 'text';
        TYPE_OPTIONS.forEach(function (optDef) {
          const opt = document.createElement('option');
          opt.value = optDef.value;
          opt.textContent = optDef.label;
          if (optDef.value === presetType) opt.selected = true;
          selType.appendChild(opt);
        });
        fType.appendChild(lblType);
        fType.appendChild(selType);
        grid1.appendChild(fType);

        // キー / 前 / 後
        grid1.appendChild(makeField('キー文字列 (例: a)', 'kv-field-' + i + '-key', preset.key, 'xsmall'));
        grid1.appendChild(makeField('前文字列 (例: a=)', 'kv-field-' + i + '-before', preset.before, 'medium'));
        grid1.appendChild(makeField('後文字列 (例: ;)', 'kv-field-' + i + '-after', preset.after, 'xsmall'));

        // テーブル転記先
        grid1.appendChild(makeField('テーブル列フィールドコード', 'kv-field-' + i + '-tableField', preset.tableField, 'medium'));

        group.appendChild(grid1);

        // 判定フィールド
        const subTitle = document.createElement('div');
        subTitle.style.marginTop = '6px';
        subTitle.style.fontSize = '12px';
        subTitle.style.color = '#4b5563';
        subTitle.textContent = '判定用フィールド (現在は最大2条件。内部は5条件拡張可能)';
        group.appendChild(subTitle);

        const grid2 = document.createElement('div');
        grid2.className = 'field-group-grid';

        grid2.appendChild(makeField('値1フィールドコード',     'kv-field-' + i + '-value1', preset.value1, 'small'));
        grid2.appendChild(makeField('条件1フィールドコード',   'kv-field-' + i + '-op1',    preset.op1,    'small'));
        grid2.appendChild(makeField('値2フィールドコード',     'kv-field-' + i + '-value2', preset.value2, 'small'));
        grid2.appendChild(makeField('条件2フィールドコード',   'kv-field-' + i + '-op2',    preset.op2,    'small'));
        grid2.appendChild(makeField('AND/OR フィールドコード', 'kv-field-' + i + '-join1',  preset.join1,  'small'));

        group.appendChild(grid2);
        container.appendChild(group);
      }
    }

    fieldCountInput.addEventListener('change', renderFields);
    renderFields();
  }

  // ========= キー型エンジン JS 生成 =========
  function buildKvJs(config) {
    const header = [
      '// Generated by QR Config Tool',
      '// Mode: key-value (max 20 fields, each up to 5 conditions)',
      '// Generated at: ' + new Date().toISOString(),
      ''
    ].join('\n');

    const cfgJson = JSON.stringify(config, null, 2);

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

  // ===== キー型 SCAN パース =====
  function parseScan(raw) {
    const text = String(raw || '');
    const trimmed = text.trim();
    if (!trimmed) throw new Error('SCAN が空です');

    const fields = CFG.fields || [];
    const parsed = {
      raw: text,
      values: {}
    };

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const before = field.before || '';
      const after  = field.after || '';
      const label = field.label || field.name;

      if (!before && !after) {
        continue; // パターン未設定
      }

      let idx;

      if (before) {
        idx = text.indexOf(before);
        if (idx === -1) {
          // キーが存在しない場合は読み飛ばし
          continue;
        }
        // 重複チェック（同じキーが2回以上出てきたら ERR）
        const second = text.indexOf(before, idx + before.length);
        if (second !== -1) {
          throw new Error('キー "' + label + '" が複数回含まれています');
        }
        idx += before.length;
      } else {
        idx = 0;
      }

      let endIdx;
      if (after) {
        endIdx = text.indexOf(after, idx);
        if (endIdx === -1) {
          endIdx = text.length;
        }
      } else {
        endIdx = text.length;
      }

      const rawVal = text.slice(idx, endIdx);
      const t = rawVal.trim();
      if (!t) {
        continue; // 空なら値なしとしてスキップ
      }

      const info = {};
      const name = field.name;

      switch (field.type) {
        case 'text':
          info.text = t;
          break;

        case 'number': {
          const num = Number(t);
          if (Number.isNaN(num)) {
            throw new Error('数値フィールド "' + label + '" の値が不正です: ' + t);
          }
          info.number = num;
          break;
        }

        case 'date': {
          let d = t;
          if (/^\d{8}$/.test(d)) {
            d = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8);
          } else if (/^\d{4}\/\d{2}\/\d{2}$/.test(d)) {
            d = d.replace(/\//g, '-');
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            throw new Error('日付フィールド "' + label + '" の値が不正です: ' + t);
          }
          info.date = d;
          break;
        }

        case 'time': {
          let tm = t;
          if (/^\d{4}$/.test(tm)) {
            tm = tm.slice(0, 2) + ':' + tm.slice(2, 4);
          }
          if (!/^\d{2}:\d{2}$/.test(tm)) {
            throw new Error('時刻フィールド "' + label + '" の値が不正です: ' + t);
          }
          const min = parseTimeToMin(tm);
          if (min === null) {
            throw new Error('時刻フィールド "' + label + '" の値が不正です: ' + t);
          }
          info.time = tm;
          info.minutes = min;
          break;
        }

        case 'datetime': {
          const dv = t;
          let dateStr;
          let timeStr;

          if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dv)) {
            dateStr = dv.slice(0, 10);
            timeStr = dv.slice(11, 16);
          } else if (/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(dv)) {
            dateStr = dv.slice(0, 10).replace(/\//g, '-');
            timeStr = dv.slice(11, 16);
          } else if (/^[0-9]{12}$/.test(dv)) {
            dateStr = dv.slice(0, 4) + '-' + dv.slice(4, 6) + '-' + dv.slice(6, 8);
            timeStr = dv.slice(8, 10) + ':' + dv.slice(10, 12);
          } else {
            throw new Error('日時フィールド "' + label + '" の値が不正です: ' + dv);
          }

          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) {
            throw new Error('日時フィールド "' + label + '" の値が不正です: ' + dv);
          }

          const iso = toIsoFromDateTimeParts(dateStr, timeStr);
          if (!iso) {
            throw new Error('日時フィールド "' + label + '" の値が不正です: ' + dv);
          }
          info.datetimeIso = iso;
          info.date = dateStr;
          info.time = timeStr;
          info.minutes = parseTimeToMin(timeStr);
          break;
        }

        default:
          info.raw = t;
      }

      parsed.values[name] = parsed.values[name] || info;
    }

    return parsed;
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

  function isEmptyRow(rowValue) {
    if (!rowValue) return true;
    const keys = Object.keys(rowValue);
    if (!keys.length) return true;
    for (let i = 0; i < keys.length; i++) {
      const cell = rowValue[keys[i]];
      if (!cell) continue;
      const v = cell.value;
      if (Array.isArray(v)) {
        if (v.length > 0) return false;
      } else {
        if (v !== '' && v !== null && v !== undefined) return false;
      }
    }
    return true;
  }

  function appendRow(appRec, parsed, evalRes) {
    const rec = appRec.record;
    const tblCfg = CFG.table;

    if (!rec[tblCfg.code]) rec[tblCfg.code] = { type: 'SUBTABLE', value: [] };
    const table = rec[tblCfg.code];

    // 先に「全て空の行」を削除（初期行の空欄を消す）
    if (Array.isArray(table.value)) {
      table.value = table.value.filter(function (row) {
        return !isEmptyRow(row.value);
      });
    } else {
      table.value = [];
    }

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
    row2.textContent = 'キー型の SCAN 文字列を入力して Enter（例: a=TEST;b=10;…）';

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

      const raw = input.value;
      const appRec = kintone.app.record.get();
      let parsed;
      try {
        parsed = parseScan(raw);
      } catch (e) {
        status.textContent = 'NG: ' + e.message;
        // パースエラー時も SCAN を残し、全選択
        input.focus();
        input.select();
        return;
      }

      const evalRes = evaluateAll(appRec.record, parsed);
      appendRow(appRec, parsed, evalRes);
      kintone.app.record.set(appRec);

      if (evalRes.configError) {
        status.textContent = 'ERR (設定エラー)';
        input.value = raw;
        input.focus();
        input.select();
      } else if (!evalRes.ok) {
        status.textContent = 'NG';
        input.value = raw;
        input.focus();
        input.select();
      } else {
        status.textContent = 'OK';
        input.value = '';
        input.focus();
      }
    });
  }

  if (typeof kintone !== 'undefined' && kintone.events && kintone.app && kintone.app.record) {
    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], function (event) {
      buildScanUI();
      return event;
    });
  }
`;

    const full = `${header}
(function () {
  'use strict';

  const CFG = ${cfgJson};

${engine}
})();
`;
    return full;
  }

  // ========= ウィザード制御 =========
  function setupKvWizard() {
    const spaceIdInput     = $('#kv-space-id');
    const fieldCountInput  = $('#kv-field-count');
    const tableCodeInput   = $('#kv-table-code');
    const tableScanAtInput = $('#kv-table-scanat');
    const tableResultInput = $('#kv-table-result');
    const tableReasonInput = $('#kv-table-reason');

    const generateBtn = $('#kv-generate-btn');
    const downloadBtn = $('#kv-download-btn');
    const status      = $('#kv-status');
    const output      = $('#kv-code-output');

    setupKvFieldsUI();

    generateBtn.addEventListener('click', function () {
      const spaceId = (spaceIdInput.value || '').trim() || 'scan_area';

      let fieldCount = parseInt(fieldCountInput.value, 10);
      if (Number.isNaN(fieldCount) || fieldCount < 1) fieldCount = 1;
      if (fieldCount > 20) fieldCount = 20;

      const fields = [];
      for (let i = 1; i <= fieldCount; i++) {
        let name   = ($('#kv-field-' + i + '-name').value  || '').trim();
        let label  = ($('#kv-field-' + i + '-label').value || '').trim();
        const type = ($('#kv-field-' + i + '-type').value  || 'text').trim();
        const key      = ($('#kv-field-' + i + '-key').value     || '').trim();
        const before   = ($('#kv-field-' + i + '-before').value  || '').trim();
        const after    = ($('#kv-field-' + i + '-after').value   || '').trim();
        const tableField = ($('#kv-field-' + i + '-tableField').value || '').trim();
        const value1   = ($('#kv-field-' + i + '-value1').value  || '').trim();
        const op1      = ($('#kv-field-' + i + '-op1').value     || '').trim();
        const value2   = ($('#kv-field-' + i + '-value2').value  || '').trim();
        const op2      = ($('#kv-field-' + i + '-op2').value     || '').trim();
        const join1    = ($('#kv-field-' + i + '-join1').value   || '').trim();

        if (!name) name = 'f' + i;
        if (!label) label = name;

        fields.push({
          name: name,
          label: label,
          key: key,
          before: before,
          after: after,
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
      downloadJs('pc-kv-flex.js', $('#kv-code-output').value);
    });
  }

  document.addEventListener('DOMContentLoaded', setupKvWizard);
})();
