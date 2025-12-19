// app.js
// 単純区切り型 QR SCAN JS ジェネレーター
// - kintone 用ランタイム JS を生成
// - Firestore にユーザーごとの設定を保存 / 読み込み

import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const TYPE_OPTIONS = [
  { value: "text",     label: "文字列 (1行・選択型)" },
  { value: "number",   label: "数値" },
  { value: "datetime", label: "日時" },
  { value: "date",     label: "日付" },
  { value: "time",     label: "時刻" }
];

// 項目1〜5のデフォルト（必要に応じて調整）
const FIELD_PRESETS = {
  1: { name: "a", label: "a", type: "text",     tableField: "at", value1: "a",  op1: "aj",  value2: "a2", op2: "aj2", join1: "as1" },
  2: { name: "b", label: "b", type: "number",   tableField: "bt", value1: "b",  op1: "bj",  value2: "b2", op2: "bj2", join1: "bs1" },
  3: { name: "c", label: "c", type: "datetime", tableField: "ct", value1: "c",  op1: "cj",  value2: "c2", op2: "cj2", join1: "cs1" },
  4: { name: "d", label: "d", type: "date",     tableField: "dt", value1: "d",  op1: "dj",  value2: "d2", op2: "dj2", join1: "ds1" },
  5: { name: "e", label: "e", type: "time",     tableField: "et", value1: "e",  op1: "ej",  value2: "e2", op2: "ej2", join1: "es1" }
};

let configsCache = {}; // {configId: configData}

// ユーティリティ
function $(id) { return document.getElementById(id); }

function downloadJs(filename, source) {
  if (!source || !source.trim()) {
    alert("先に JSコードを生成してください。");
    return;
  }
  const blob = new Blob([source], { type: "text/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ====== フィールドUI生成 ======
function makeMiniField(labelText, id, value) {
  const wrap = document.createElement("div");
  wrap.className = "mini-field";
  const lbl = document.createElement("div");
  lbl.className = "mini-label";
  lbl.textContent = labelText;
  const inp = document.createElement("input");
  inp.type = "text";
  inp.id = id;
  inp.value = value || "";
  wrap.appendChild(lbl);
  wrap.appendChild(inp);
  return wrap;
}

function renderFields(config) {
  const countInput = $("simple-field-count");
  let count = parseInt(countInput.value, 10);
  if (!Number.isFinite(count) || count < 1) count = 1;
  if (config && Array.isArray(config.fields)) {
    count = config.fields.length;
  }
  if (count > 20) count = 20;
  countInput.value = String(count);

  const container = $("simple-fields-container");
  container.innerHTML = "";

  for (let i = 1; i <= count; i++) {
    const cfgField = config && config.fields && config.fields[i - 1];
    const preset = FIELD_PRESETS[i] || {};
    const name   = (cfgField && cfgField.name) || preset.name || `f${i}`;
    const label  = (cfgField && cfgField.label) || preset.label || name;
    const type   = (cfgField && cfgField.type) || preset.type || "text";
    const tableField = (cfgField && cfgField.tableField) || preset.tableField || "";

    const judge = (cfgField && cfgField.judge) || {};
    const value1 = (judge.valueFields && judge.valueFields[0]) || preset.value1 || "";
    const op1    = (judge.opFields    && judge.opFields[0])    || preset.op1    || "";
    const value2 = (judge.valueFields && judge.valueFields[1]) || preset.value2 || "";
    const op2    = (judge.opFields    && judge.opFields[1])    || preset.op2    || "";
    const join1  = (judge.joinFields  && judge.joinFields[0])  || preset.join1  || "";

    const group = document.createElement("div");
    group.className = "field-group";

    const title = document.createElement("div");
    title.className = "field-group-title";
    title.textContent = `項目 ${i}`;
    group.appendChild(title);

    const grid1 = document.createElement("div");
    grid1.className = "field-group-grid";

    // 論理名
    grid1.appendChild(makeMiniField("論理名 (name)", `simple-field-${i}-name`, name));
    // ラベル
    grid1.appendChild(makeMiniField("ラベル (エラー表示用)", `simple-field-${i}-label`, label));

    // 型
    const typeWrap = document.createElement("div");
    typeWrap.className = "mini-field";
    const typeLbl = document.createElement("div");
    typeLbl.className = "mini-label";
    typeLbl.textContent = "型（kintone フィールド型）";
    const typeSel = document.createElement("select");
    typeSel.id = `simple-field-${i}-type`;
    TYPE_OPTIONS.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === type) o.selected = true;
      typeSel.appendChild(o);
    });
    typeWrap.appendChild(typeLbl);
    typeWrap.appendChild(typeSel);
    grid1.appendChild(typeWrap);

    // テーブル列
    grid1.appendChild(makeMiniField("テーブル列フィールドコード", `simple-field-${i}-tableField`, tableField));

    group.appendChild(grid1);

    const subTitle = document.createElement("div");
    subTitle.style.marginTop = "6px";
    subTitle.style.fontSize = "12px";
    subTitle.style.color = "#4b5563";
    subTitle.textContent = "判定用フィールド (現在は最大2条件。内部は5条件まで拡張可能)";
    group.appendChild(subTitle);

    const grid2 = document.createElement("div");
    grid2.className = "field-group-grid";

    grid2.appendChild(makeMiniField("値1フィールドコード",   `simple-field-${i}-value1`, value1));
    grid2.appendChild(makeMiniField("条件1フィールドコード", `simple-field-${i}-op1`,    op1));
    grid2.appendChild(makeMiniField("値2フィールドコード",   `simple-field-${i}-value2`, value2));
    grid2.appendChild(makeMiniField("条件2フィールドコード", `simple-field-${i}-op2`,    op2));
    grid2.appendChild(makeMiniField("AND/OR フィールドコード", `simple-field-${i}-join1`, join1));

    group.appendChild(grid2);
    container.appendChild(group);
  }
}

// ====== UI → 設定オブジェクト ======
function collectConfigFromUI() {
  const spaceId   = $("simple-space-id").value.trim() || "scan_area";
  const delimiter = $("simple-delimiter").value.trim() || "/\\s+/";
  const tableCode = $("simple-table-code").value.trim() || "scan_table";
  const scanAt    = $("simple-table-scanat").value.trim() || "scan_at";
  const result    = $("simple-table-result").value.trim() || "result";
  const reason    = $("simple-table-reason").value.trim() || "reason";

  let fieldCount  = parseInt($("simple-field-count").value, 10);
  if (!Number.isFinite(fieldCount) || fieldCount < 1) fieldCount = 1;
  if (fieldCount > 20) fieldCount = 20;

  const fields = [];
  for (let i = 1; i <= fieldCount; i++) {
    const name  = ($(`simple-field-${i}-name`).value || "").trim() || `f${i}`;
    const label = ($(`simple-field-${i}-label`).value || "").trim() || name;
    const type  = ($(`simple-field-${i}-type`).value || "text").trim();
    const tableField = ($(`simple-field-${i}-tableField`).value || "").trim();

    const value1 = ($(`simple-field-${i}-value1`).value || "").trim();
    const op1    = ($(`simple-field-${i}-op1`).value || "").trim();
    const value2 = ($(`simple-field-${i}-value2`).value || "").trim();
    const op2    = ($(`simple-field-${i}-op2`).value || "").trim();
    const join1  = ($(`simple-field-${i}-join1`).value || "").trim();

    fields.push({
      name,
      label,
      type,
      tokenCount: type === "datetime" ? 2 : 1,
      tableField,
      judge: {
        label,
        valueFields: [value1, value2, "", "", ""],
        opFields:    [op1,    op2,    "", "", ""],
        joinFields:  [join1,  "",     "", "", ""]
      }
    });
  }

  return {
    version: 1,
    mode: "simple",
    spaceId,
    delimiter,
    fields,
    table: {
      code: tableCode,
      scanAtField: scanAt,
      resultField: result,
      reasonField: reason
    }
  };
}

// ====== 設定オブジェクト → UI ======
function applyConfigToUI(cfg) {
  if (!cfg) return;

  $("simple-space-id").value   = cfg.spaceId || "scan_area";
  $("simple-delimiter").value  = cfg.delimiter || "/\\s+/";
  $("simple-table-code").value = (cfg.table && cfg.table.code) || "scan_table";
  $("simple-table-scanat").value = (cfg.table && cfg.table.scanAtField) || "scan_at";
  $("simple-table-result").value = (cfg.table && cfg.table.resultField) || "result";
  $("simple-table-reason").value = (cfg.table && cfg.table.reasonField) || "reason";

  $("simple-field-count").value =
    cfg.fields && cfg.fields.length ? String(cfg.fields.length) : "1";

  renderFields(cfg);
}

// ====== Firestore: 設定保存・取得 ======
async function refreshConfigList() {
  const select = $("simple-config-select");
  if (!select) return;

  const auth = window.tanaAuth;
  const user = auth && auth.currentUser;
  const db   = auth && auth.db;
  if (!user || !db) {
    select.innerHTML = '<option value="">（ログインが必要です）</option>';
    configsCache = {};
    return;
  }

  select.innerHTML = '<option value="">（保存済み設定を選択）</option>';
  configsCache = {};

  try {
    const colRef = collection(db, "users", user.uid, "configs");
    const snap = await getDocs(colRef);
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (!data || data.mode !== "simple" || !data.payload) return;
      configsCache[docSnap.id] = data;
      const opt = document.createElement("option");
      opt.value = docSnap.id;
      opt.textContent = data.name || "(無題)";
      select.appendChild(opt);
    });
  } catch (e) {
    console.error("設定一覧取得エラー:", e);
    select.innerHTML = '<option value="">（設定の取得に失敗しました）</option>';
  }
}

async function saveCurrentConfig() {
  const statusEl = $("simple-status");
  const auth = window.tanaAuth;
  const user = auth && auth.currentUser;
  const db   = auth && auth.db;

  if (!user || !db) {
    alert("設定を保存するにはログインが必要です。");
    return;
  }

  const nameInput = $("simple-config-name");
  const name = (nameInput.value || "").trim() || "無題";

  const payload = collectConfigFromUI();

  try {
    const colRef = collection(db, "users", user.uid, "configs");
    await addDoc(colRef, {
      name,
      mode: "simple",
      payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    statusEl.textContent = `設定「${name}」を保存しました。`;
    await refreshConfigList();
  } catch (e) {
    console.error("設定保存エラー:", e);
    statusEl.textContent = "設定の保存に失敗しました。コンソールを確認してください。";
  }
}

// ====== ランタイム JS 生成 ======
// ====== ランタイム JS 生成 ======
function buildSimpleJs(config, licenseUid) {
  const header = [
    "// Generated by QR Config Tool",
    "// Mode: simple-delimiter (max 20 fields, up to 5 conditions each)",
    "// Generated at: " + new Date().toISOString(),
    ""
  ].join("\n");

  const cfgJson = JSON.stringify({
    spaceId: config.spaceId,
    fields: config.fields,
    table: config.table
  }, null, 2);

  // 区切り文字は /.../ 形式ならそのまま、そうでなければ文字列リテラルにする
  const delimRaw = config.delimiter || "/\\s+/";
  let delimLiteral;
  if (/^\/.*\/[gimsuy]*$/.test(delimRaw)) {
    delimLiteral = delimRaw;
  } else {
    delimLiteral = JSON.stringify(delimRaw);
  }
    const uidLiteral = JSON.stringify(licenseUid || "");
  const engine = String.raw`
  // ===== ライセンス設定（共通） =====
  const LICENSE = {
    endpoint: 'https://checkruntimel-6cd2lwhrea-uc.a.run.app';
    uid: ${uidLiteral}
  };

  async function checkLicense() {
    try {
      const version = window.__TANA_PC_VERSION || '';
      const url =
        LICENSE.endpoint +
        '?uid=' + encodeURIComponent(LICENSE.uid) +
        '&version=' + encodeURIComponent(version);

      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        return {
          ok: false,
          message: 'ライセンス確認APIエラー (HTTP ' + res.status + ')'
        };
      }

      const data = await res.json();
      if (!data.ok) {
        return {
          ok: false,
          message: data.message || 'ライセンスが無効です',
          plan: data.plan,
          status: data.status
        };
      }

      return {
        ok: true,
        plan: data.plan,
        status: data.status
      };
    } catch (e) {
      return {
        ok: false,
        message: 'ライセンス確認に失敗しました: ' + e.message
      };
    }
  }

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
      return { specified, ok: true, reason: null };
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
      default: return { specified, ok: true, reason: null };
    }
    return { specified, ok, reason: ok ? null : (label + ':' + op) };
  }

  function judgeNumber(scanNum, baseNum, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified || baseNum === null || baseNum === undefined || baseNum === '' || Number.isNaN(Number(baseNum))) {
      return { specified, ok: true, reason: null };
    }
    const s = Number(scanNum);
    const b = Number(baseNum);
    if (Number.isNaN(s)) {
      return { specified, ok: false, reason: label + ':' + op + ' (scan:NaN, base:' + b + ')' };
    }
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
    return { specified, ok, reason: ok ? null : (label + ':' + op + ' (scan:' + s + ', base:' + b + ')') };
  }

  function judgeDateTime(scanIso, baseIso, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified) return { specified, ok: true, reason: null };

    const s = scanIso ? new Date(scanIso) : null;
    const b = baseIso ? new Date(baseIso) : null;
    if (!s || !b) {
      return { specified, ok: false, reason: label + ':' + op + ' (scan:' + (s ? s.toISOString() : 'NaN') + ', base:' + (b ? b.toISOString() : 'NaN') + ')' };
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
    return { specified, ok, reason: ok ? null : (label + ':' + op) };
  }

  function judgeDate(scanDateStr, baseDateStr, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified) return { specified, ok: true, reason: null };

    const s = scanDateStr ? parseDateLocal(scanDateStr) : null;
    const b = baseDateStr ? parseDateLocal(baseDateStr) : null;
    if (!s || !b) {
      return { specified, ok: false, reason: label + ':' + op + ' (scan:' + (s ? s.toISOString() : 'NaN') + ', base:' + (b ? b.toISOString() : 'NaN') + ')' };
    }
    const ss = s.getTime();
    const bb = b.getTime();
    let ok = true;
    switch (op) {
      case '同じ': ok = (ss === bb); break;
      case '以外': ok = (ss !== bb); break;
      case '以降': ok = (ss >= bb); break;
      case '以前': ok = (ss <= bb); break;
      default: return { specified, ok: true, reason: null };
    }
    return { specified, ok, reason: ok ? null : (label + ':' + op) };
  }

  function judgeTime(scanMin, baseTimeStr, op, label) {
    const specified = !!op && op !== '指定なし';
    if (!specified) return { specified, ok: true, reason: null };

    const s = (scanMin === undefined || scanMin === null) ? null : scanMin;
    const b = baseTimeStr ? parseTimeToMin(baseTimeStr) : null;
    if (s === null || b === null) {
      return { specified, ok: false, reason: label + ':' + op + ' (scan:' + s + ', base:' + b + ')' };
    }
    let ok = true;
    switch (op) {
      case '同じ': ok = (s === b); break;
      case '以外': ok = (s !== b); break;
      case '以降': ok = (s >= b); break;
      case '以前': ok = (s <= b); break;
      default: return { specified, ok: true, reason: null };
    }
    return { specified, ok, reason: ok ? null : (label + ':' + op + ' (scan:' + s + ', base:' + b + ')') };
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

    if (agg === null) agg = true;

    return {
      ok: !configError && agg,
      reasons,
      configError
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
      return { ok: false, reasons, configError: true };
    }
    return { ok: allOk, reasons, configError: false };
  }

  // ===== 単純区切り型 SCAN パース =====
  function splitTokens(text) {
    if (DELIM instanceof RegExp) {
      return text.split(DELIM);
    }
    return text.split(String(DELIM));
  }

  function parseScan(raw) {
    const text = String(raw || '');
    const trimmed = text.trim();
    if (!trimmed) throw new Error('SCAN が空です');

    const tokens = splitTokens(trimmed);
    const fields = CFG.fields || [];
    const parsed = { raw: text, values: {} };

    let idx = 0;

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const label = field.label || field.name;
      const tokenCount = field.tokenCount || (field.type === 'datetime' ? 2 : 1);

      const part = tokens.slice(idx, idx + tokenCount);
      idx += tokenCount;

      if (part.length < tokenCount) {
        throw new Error('トークン数が不足しています（' + label + '）');
      }

      const joined = part.join(' ');
      const t = joined.trim();
      if (!t) continue;

      const info = {};

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
          if (part.length < 2) {
            throw new Error('日時フィールド "' + label + '" の値が不足しています');
          }
          const dateToken = String(part[0]).trim();
          const timeToken = String(part[1]).trim();
          let dateStr = dateToken;
          let timeStr = timeToken;

          if (/^\d{8}$/.test(dateStr)) {
            dateStr = dateStr.slice(0, 4) + '-' + dateStr.slice(4, 6) + '-' + dateStr.slice(6, 8);
          } else if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) {
            dateStr = dateStr.replace(/\//g, '-');
          }
          if (/^\d{4}$/.test(timeStr)) {
            timeStr = timeStr.slice(0, 2) + ':' + timeStr.slice(2, 4);
          }

          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) {
            throw new Error('日時フィールド "' + label + '" の値が不正です: ' + t);
          }

          const iso = toIsoFromDateTimeParts(dateStr, timeStr);
          if (!iso) {
            throw new Error('日時フィールド "' + label + '" の値が不正です: ' + t);
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

      parsed.values[field.name] = parsed.values[field.name] || info;
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
      mount.id = 'tana-scan-simple-fallback';
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
    row2.textContent = '単純区切りの SCAN 文字列を入力して Enter（例: TEST 10 2025-11-14 00:00 …）';

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

  // ===== kintone 画面ロード時：ライセンスチェック → OKならUI描画 =====
  if (typeof kintone !== 'undefined' && kintone.events && kintone.app && kintone.app.record) {
    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], async function (event) {
      // SCAN スペース（なければフォールバック）を確保
      const space = kintone.app.record.getSpaceElement(CFG.spaceId);
      let mount = space;
      if (!mount) {
        mount = document.createElement('div');
        mount.id = 'tana-scan-simple-fallback';
        document.body.appendChild(mount);
      }
      while (mount.firstChild) mount.removeChild(mount.firstChild);

      // 「確認中」メッセージ
      const msg = document.createElement('div');
      msg.textContent = 'ライセンスを確認しています…';
      msg.style.fontSize = '12px';
      msg.style.color = '#666';
      msg.style.margin = '8px 0';
      mount.appendChild(msg);

      const result = await checkLicense();
      if (!result.ok) {
        msg.textContent =
          'このJSのライセンスが無効です: ' +
          (result.message || (result.status ? 'status=' + result.status : ''));
        msg.style.color = '#b91c1c';
        return event;
      }

      // OK のときは UI を描画
      while (mount.firstChild) mount.removeChild(mount.firstChild);
      buildScanUI();
      return event;
    });
  }
`;
  const source = `${header}
(function () {
  'use strict';

  const CFG = ${cfgJson};
  const DELIM = ${delimLiteral};

${engine}
})();
`;
  return source;
}

// ====== 初期化 ======
function init() {
  const fieldCountInput = $("simple-field-count");
  fieldCountInput.addEventListener("change", () => renderFields());

  renderFields();

  const genBtn = $("simple-generate-btn");
  const dlBtn  = $("simple-download-btn");
  const saveBtn= $("simple-save-config-btn");
  const status = $("simple-status");
  const output = $("simple-code-output");

  genBtn.addEventListener("click", () => {
    const auth = window.tanaAuth;
    const user = auth && auth.currentUser;

    if (!user) {
      alert("JSコードを生成するにはログインが必要です。");
      return;
    }

    const cfg = collectConfigFromUI();
    const js  = buildSimpleJs(cfg, user.uid);
    output.value = js;
    status.textContent = "JSコードを生成しました。（uid=" + user.uid + " を埋め込みました）";
    dlBtn.disabled = false;
  });

  dlBtn.addEventListener("click", () => {
    const now = new Date();
    const y = String(now.getFullYear());
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const filename = `pc-simple-flex-${y}${m}${d}-${hh}${mm}${ss}.js`;
    downloadJs(filename, $("simple-code-output").value);
  });

  saveBtn.addEventListener("click", () => {
    saveCurrentConfig();
  });

  $("simple-config-select").addEventListener("change", (ev) => {
    const id = ev.target.value;
    if (!id || !configsCache[id]) return;
    const data = configsCache[id];
    if (data.payload) {
      $("simple-config-name").value = data.name || "";
      applyConfigToUI(data.payload);
      $("simple-status").textContent = `設定「${data.name || "(無題)"}」を読み込みました。`;
    }
  });

  // ログイン状態が変わったら設定一覧を更新
  if (window.tanaAuth && typeof window.tanaAuth.onChange === "function") {
    window.tanaAuth.onChange(() => {
      refreshConfigList();
    });
  }
  // 初期ロード
  refreshConfigList();
}

document.addEventListener("DOMContentLoaded", init);

endpoint
