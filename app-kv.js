// app-kv.js
// キー型 QR SCAN JS ジェネレーター
// - kintone 用ランタイム JS を生成
// - Firestore にユーザーごとの設定を保存 / 読み込み（mode: "kv"）

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

// デフォルト5項目分（必要に応じて変更可）
const KV_FIELD_PRESETS = {
  1: { name: "a", label: "a", type: "text",     tableField: "at", key: "a", before: "a=", after: ";", value1: "a",  op1: "aj",  value2: "a2", op2: "aj2", join1: "as1" },
  2: { name: "b", label: "b", type: "number",   tableField: "bt", key: "b", before: "b=", after: ";", value1: "b",  op1: "bj",  value2: "b2", op2: "bj2", join1: "bs1" },
  3: { name: "c", label: "c", type: "datetime", tableField: "ct", key: "c", before: "c=", after: ";", value1: "c",  op1: "cj",  value2: "c2", op2: "cj2", join1: "cs1" },
  4: { name: "d", label: "d", type: "date",     tableField: "dt", key: "d", before: "d=", after: ";", value1: "d",  op1: "dj",  value2: "d2", op2: "dj2", join1: "ds1" },
  5: { name: "e", label: "e", type: "time",     tableField: "et", key: "e", before: "e=", after: ";", value1: "e",  op1: "ej",  value2: "e2", op2: "ej2", join1: "es1" }
};

let kvConfigsCache = {};

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

// ===== UI生成 =====
function makeMiniField(labelText, id, value) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const lbl = document.createElement("label");
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

function renderKvFields(config) {
  const countInput = $("kv-field-count");
  let count = parseInt(countInput.value, 10);
  if (!Number.isFinite(count) || count < 1) count = 1;
  if (config && Array.isArray(config.fields)) {
    count = config.fields.length;
  }
  if (count > 20) count = 20;
  countInput.value = String(count);

  const container = $("kv-fields-container");
  container.innerHTML = "";

  for (let i = 1; i <= count; i++) {
    const cfgField = config && config.fields && config.fields[i - 1];
    const preset = KV_FIELD_PRESETS[i] || {};
    const name   = (cfgField && cfgField.name) || preset.name || `f${i}`;
    const label  = (cfgField && cfgField.label) || preset.label || name;
    const type   = (cfgField && cfgField.type) || preset.type || "text";
    const tableField = (cfgField && cfgField.tableField) || preset.tableField || "";
    const key    = (cfgField && cfgField.key) || preset.key || name;
    const before = (cfgField && cfgField.before) || preset.before || (key + "=");
    const after  = (cfgField && cfgField.after)  || preset.after  || ";";

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
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "キー設定";
    title.appendChild(tag);
    group.appendChild(title);

    const grid1 = document.createElement("div");
    grid1.className = "field-group-grid";

    // 論理名
    grid1.appendChild(makeMiniField("論理名 (name)", `kv-field-${i}-name`, name));
    // ラベル
    grid1.appendChild(makeMiniField("ラベル (エラー表示用)", `kv-field-${i}-label`, label));

    // 型
    const typeWrap = document.createElement("div");
    typeWrap.className = "field";
    const typeLbl = document.createElement("label");
    typeLbl.textContent = "型（kintone フィールド型）";
    const typeSel = document.createElement("select");
    typeSel.id = `kv-field-${i}-type`;
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
    grid1.appendChild(makeMiniField("テーブル列フィールドコード", `kv-field-${i}-tableField`, tableField));

    // キー名
    grid1.appendChild(makeMiniField("キー名（例: a）", `kv-field-${i}-key`, key));
    // 前文字列
    grid1.appendChild(makeMiniField("前文字列（例: a=）", `kv-field-${i}-before`, before));
    // 後文字列
    grid1.appendChild(makeMiniField("後文字列（例: ;）", `kv-field-${i}-after`, after));

    group.appendChild(grid1);

    const subTitle = document.createElement("div");
    subTitle.style.marginTop = "6px";
    subTitle.style.fontSize = "12px";
    subTitle.style.color = "#4b5563";
    subTitle.textContent = "判定用フィールド (現在は最大2条件。内部は5条件まで拡張可能)";
    group.appendChild(subTitle);

    const grid2 = document.createElement("div");
    grid2.className = "field-group-grid";

    grid2.appendChild(makeMiniField("値1フィールドコード",   `kv-field-${i}-value1`, value1));
    grid2.appendChild(makeMiniField("条件1フィールドコード", `kv-field-${i}-op1`,    op1));
    grid2.appendChild(makeMiniField("値2フィールドコード",   `kv-field-${i}-value2`, value2));
    grid2.appendChild(makeMiniField("条件2フィールドコード", `kv-field-${i}-op2`,    op2));
    grid2.appendChild(makeMiniField("AND/OR フィールドコード", `kv-field-${i}-join1`, join1));

    group.appendChild(grid2);
    container.appendChild(group);
  }
}

// ===== UI → 設定オブジェクト =====
function collectKvConfigFromUI() {
  const spaceId   = $("kv-space-id").value.trim() || "scan_area";
  const tableCode = $("kv-table-code").value.trim() || "scan_table";
  const scanAt    = $("kv-table-scanat").value.trim() || "scan_at";
  const result    = $("kv-table-result").value.trim() || "result";
  const reason    = $("kv-table-reason").value.trim() || "reason";

  let fieldCount  = parseInt($("kv-field-count").value, 10);
  if (!Number.isFinite(fieldCount) || fieldCount < 1) fieldCount = 1;
  if (fieldCount > 20) fieldCount = 20;

  const fields = [];
  for (let i = 1; i <= fieldCount; i++) {
    const name  = ($(`kv-field-${i}-name`).value || "").trim() || `f${i}`;
    const label = ($(`kv-field-${i}-label`).value || "").trim() || name;
    const type  = ($(`kv-field-${i}-type`).value || "text").trim();
    const tableField = ($(`kv-field-${i}-tableField`).value || "").trim();
    const key   = ($(`kv-field-${i}-key`).value || "").trim() || name;
    const before= ($(`kv-field-${i}-before`).value || "").trim() || (key + "=");
    const after = ($(`kv-field-${i}-after`).value || "").trim() || ";";

    const value1 = ($(`kv-field-${i}-value1`).value || "").trim();
    const op1    = ($(`kv-field-${i}-op1`).value || "").trim();
    const value2 = ($(`kv-field-${i}-value2`).value || "").trim();
    const op2    = ($(`kv-field-${i}-op2`).value || "").trim();
    const join1  = ($(`kv-field-${i}-join1`).value || "").trim();

    fields.push({
      name,
      label,
      type,
      tableField,
      key,
      before,
      after,
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
    mode: "kv",
    spaceId,
    fields,
    table: {
      code: tableCode,
      scanAtField: scanAt,
      resultField: result,
      reasonField: reason
    }
  };
}

// ===== 設定オブジェクト → UI =====
function applyKvConfigToUI(cfg) {
  if (!cfg) return;
  $("kv-space-id").value   = cfg.spaceId || "scan_area";
  $("kv-table-code").value = (cfg.table && cfg.table.code) || "scan_table";
  $("kv-table-scanat").value = (cfg.table && cfg.table.scanAtField) || "scan_at";
  $("kv-table-result").value = (cfg.table && cfg.table.resultField) || "result";
  $("kv-table-reason").value = (cfg.table && cfg.table.reasonField) || "reason";

  $("kv-field-count").value =
    cfg.fields && cfg.fields.length ? String(cfg.fields.length) : "1";

  renderKvFields(cfg);
}

// ===== Firestore: 設定保存・取得 =====
async function refreshKvConfigList() {
  const select = $("kv-config-select");
  if (!select) return;

  const auth = window.tanaAuth;
  const user = auth && auth.currentUser;
  const db   = auth && auth.db;
  if (!user || !db) {
    select.innerHTML = '<option value="">（ログインが必要です）</option>';
    kvConfigsCache = {};
    return;
  }

  select.innerHTML = '<option value="">（保存済み設定を選択）</option>';
  kvConfigsCache = {};

  try {
    const colRef = collection(db, "users", user.uid, "configs");
    const snap = await getDocs(colRef);
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (!data || data.mode !== "kv" || !data.payload) return;
      kvConfigsCache[docSnap.id] = data;
      const opt = document.createElement("option");
      opt.value = docSnap.id;
      opt.textContent = data.name || "(無題)";
      select.appendChild(opt);
    });
  } catch (e) {
    console.error("KV設定一覧取得エラー:", e);
    select.innerHTML = '<option value="">（設定の取得に失敗しました）</option>';
  }
}

async function saveKvConfig() {
  const statusEl = $("kv-status");
  const auth = window.tanaAuth;
  const user = auth && auth.currentUser;
  const db   = auth && auth.db;

  if (!user || !db) {
    alert("設定を保存するにはログインが必要です。");
    return;
  }

  const nameInput = $("kv-config-name");
  const name = (nameInput.value || "").trim() || "無題";

  const payload = collectKvConfigFromUI();

  try {
    const colRef = collection(db, "users", user.uid, "configs");
    await addDoc(colRef, {
      name,
      mode: "kv",
      payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    statusEl.textContent = `設定「${name}」を保存しました。`;
    await refreshKvConfigList();
  } catch (e) {
    console.error("KV設定保存エラー:", e);
    statusEl.textContent = "設定の保存に失敗しました。コンソールを確認してください。";
  }
}

// ===== ランタイム JS 生成 =====
function buildKvJs(config, licenseUid) {
  const header = [
    "// Generated by QR Config Tool",
    "// Mode: key-value (max 20 fields, up to 5 conditions each)",
    "// Generated at: " + new Date().toISOString(),
    ""
  ].join("\n");

  const cfgJson = JSON.stringify(
    {
      spaceId: config.spaceId,
      fields: config.fields,
      table: config.table
    },
    null,
    2
  );

  // ライセンス用エンドポイント & UID を埋め込む
  const endpointLiteral = JSON.stringify(
    "https://checkruntimel-6cd2lwhrea-uc.a.run.app"
  );
  const uidLiteral = JSON.stringify(licenseUid || "");

  const engine = String.raw`  // ここは既存の engine 本文そのまま（省略）
  // （既存のキー型ランタイムロジック：parseScan / evaluateAll / appendRow / buildScanUI / checkLicense など）
`;

  const source = `${header}
(function () {
  'use strict';

  // ライセンス情報（ランタイム側で checkLicense が参照）
  const LICENSE = {
    endpoint: ${endpointLiteral},
    uid: ${uidLiteral}
  };

  const CFG = ${cfgJson};

${engine}
})();
`;
  return source;
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

  // ===== 判定関数（単純区切り版と同じ） =====
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

  // ===== キー型 SCAN パース =====
  function extractBetween(str, before, after) {
    const text = String(str || '');
    const b = before || '';
    const a = after || '';
    const startIdx = b ? text.indexOf(b) : -1;
    if (startIdx < 0) return null;
    const from = startIdx + b.length;
    let end;
    if (a) {
      const idx = text.indexOf(a, from);
      end = idx >= 0 ? idx : text.length;
    } else {
      end = text.length;
    }
    return text.slice(from, end);
  }

  function parseScan(raw) {
    const text = String(raw || '');
    const trimmed = text.trim();
    if (!trimmed) throw new Error('SCAN が空です');

    const fields = CFG.fields || [];
    const parsed = { raw: text, values: {} };

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const label = field.label || field.name;
      const before = field.before || (field.key ? (field.key + '=') : '');
      const after  = field.after || ';';

      const segment = extractBetween(trimmed, before, after);
      if (segment === null || segment === undefined) continue;

      const t = String(segment).trim();
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
          const sub = String(t).split(/\s+/);
          if (sub.length < 2) {
            throw new Error('日時フィールド "' + label + '" の値が不足しています');
          }
          const dateToken = sub[0];
          const timeToken = sub[1];
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

  // ===== サブテーブル転記・UI などは単純区切り版と同じ =====
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

  const source = `${header}
(function () {
  'use strict';

  const CFG = ${cfgJson};
  const LICENSE = {
    endpoint: 'https://checkruntimel-6cd2lwhrea-uc.a.run.app',
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
          message: data.message || 'このJSのライセンスが無効です',
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

${engine}

  // ライセンス確認で UI を制御
  if (typeof kintone !== 'undefined' && kintone.events && kintone.app && kintone.app.record) {
    kintone.events.on(
      ['app.record.create.show', 'app.record.edit.show'],
      async function (event) {
        const space = kintone.app.record.getSpaceElement(CFG.spaceId);
        let mount = space || document.getElementById('tana-scan-kv-fallback');
        if (!mount) {
          // スペースも fallback もなければ何もできない
          return event;
        }

        // 既存のステータス行を再利用 or 作成
        let statusLine = mount.querySelector('.tana-license-status');
        if (!statusLine) {
          statusLine = document.createElement('div');
          statusLine.className = 'tana-license-status';
          statusLine.style.fontSize = '12px';
          statusLine.style.color = '#666';
          statusLine.style.marginTop = '4px';
          mount.appendChild(statusLine);
        }
        statusLine.textContent = 'ライセンスを確認しています...';
        statusLine.style.color = '#666';

        const lic = await checkLicense();
        if (!lic.ok) {
          statusLine.textContent =
            (lic.message || 'このJSのライセンスが無効です') +
            (lic.status ? ' (status: ' + lic.status + ')' : '');
          statusLine.style.color = '#c00';

          // 入力とボタンを無効化
          const input = mount.querySelector('input[type="text"]');
          if (input) input.disabled = true;
          const buttons = mount.querySelectorAll('button');
          buttons.forEach((b) => { b.disabled = true; });

          return event;
        }

        statusLine.textContent =
          'status: ' + (lic.status || 'active') +
          (lic.plan ? ' / plan: ' + lic.plan : '');
        statusLine.style.color = '#2c7';

        return event;
      }
    );
  }

})();
`;
  return source;
}

// ===== 初期化 =====
function initKv() {
  const fieldCountInput = $("kv-field-count");
  fieldCountInput.addEventListener("change", () => renderKvFields());

  renderKvFields();

  const genBtn  = $("kv-generate-btn");
  const dlBtn   = $("kv-download-btn");
  const saveBtn = $("kv-save-config-btn");
  const status  = $("kv-status");
  const output  = $("kv-code-output");

  // JS生成ボタン
  genBtn.addEventListener("click", () => {
    const auth = window.tanaAuth;
    const user = auth && auth.currentUser;

    if (!user) {
      alert("JSコードを生成するにはログインが必要です。");
      return;
    }

    const cfg = collectKvConfigFromUI();
    const js  = buildKvJs(cfg, user.uid);   // ← ここで uid を埋め込む
    output.value = js;
    status.textContent =
      "JSコードを生成しました。（uid=" + user.uid + " を埋め込みました）";
    dlBtn.disabled = false;
  });

  // ダウンロードボタン
  dlBtn.addEventListener("click", () => {
    const now = new Date();
    const y  = String(now.getFullYear());
    const m  = String(now.getMonth() + 1).padStart(2, "0");
    const d  = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const filename = `pc-ng-kv-${y}${m}${d}-${hh}${mm}${ss}.js`;
    downloadJs(filename, $("kv-code-output").value);
  });

  // 設定保存
  saveBtn.addEventListener("click", () => {
    saveKvConfig();
  });

  // 設定読込
  $("kv-config-select").addEventListener("change", (ev) => {
    const id = ev.target.value;
    if (!id || !kvConfigsCache[id]) return;
    const data = kvConfigsCache[id];
    if (data.payload) {
      $("kv-config-name").value = data.name || "";
      applyKvConfigToUI(data.payload);
      $("kv-status").textContent =
        `設定「${data.name || "(無題)"}」を読み込みました。`;
    }
  });

  // ログイン状態が変わったら一覧更新
  if (window.tanaAuth && typeof window.tanaAuth.onChange === "function") {
    window.tanaAuth.onChange(() => {
      refreshKvConfigList();
    });
  }
  // 初回ロード
  refreshKvConfigList();
}

document.addEventListener("DOMContentLoaded", initKv);



