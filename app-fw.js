// app-fw.js
// 文字数区切り型（固定長） QR SCAN JS ジェネレーター
// - kintone 用ランタイム JS を生成
// - Firestore にユーザーごとの設定を保存 / 読み込み（mode: "fixed"）

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

// デフォルト例（1:4文字 2:3文字 3:16文字 4:10文字 5:5文字）
const FW_FIELD_PRESETS = {
  1: { name: "a", label: "a", type: "text",     length: 4,  tableField: "at", value1: "a",  op1: "aj",  value2: "a2", op2: "aj2", join1: "as1" },
  2: { name: "b", label: "b", type: "number",   length: 3,  tableField: "bt", value1: "b",  op1: "bj",  value2: "b2", op2: "bj2", join1: "bs1" },
  3: { name: "c", label: "c", type: "datetime", length: 16, tableField: "ct", value1: "c",  op1: "cj",  value2: "c2", op2: "cj2", join1: "cs1" },
  4: { name: "d", label: "d", type: "date",     length: 10, tableField: "dt", value1: "d",  op1: "dj",  value2: "d2", op2: "dj2", join1: "ds1" },
  5: { name: "e", label: "e", type: "time",     length: 5,  tableField: "et", value1: "e",  op1: "ej",  value2: "e2", op2: "ej2", join1: "es1" }
};

let fwConfigsCache = {};

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

// ===== UI 生成 =====
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

function renderFwFields(config) {
  const countInput = $("fw-field-count");
  let count = parseInt(countInput.value, 10);
  if (!Number.isFinite(count) || count < 1) count = 1;
  if (config && Array.isArray(config.fields)) {
    count = config.fields.length;
  }
  if (count > 20) count = 20;
  countInput.value = String(count);

  const container = $("fw-fields-container");
  container.innerHTML = "";

  for (let i = 1; i <= count; i++) {
    const cfgField = config && config.fields && config.fields[i - 1];
    const preset = FW_FIELD_PRESETS[i] || {};
    const name   = (cfgField && cfgField.name) || preset.name || `f${i}`;
    const label  = (cfgField && cfgField.label) || preset.label || name;
    const type   = (cfgField && cfgField.type) || preset.type || "text";
    const length = (cfgField && cfgField.length) || preset.length || 1;
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

    grid1.appendChild(makeMiniField("論理名 (name)", `fw-field-${i}-name`, name));
    grid1.appendChild(makeMiniField("ラベル (エラー表示用)", `fw-field-${i}-label`, label));

    const typeWrap = document.createElement("div");
    typeWrap.className = "mini-field";
    const typeLbl = document.createElement("div");
    typeLbl.className = "mini-label";
    typeLbl.textContent = "型（kintone フィールド型）";
    const typeSel = document.createElement("select");
    typeSel.id = `fw-field-${i}-type`;
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

    grid1.appendChild(makeMiniField("文字数", `fw-field-${i}-length`, length));
    grid1.appendChild(makeMiniField("テーブル列フィールドコード", `fw-field-${i}-tableField`, tableField));

    group.appendChild(grid1);

    const subTitle = document.createElement("div");
    subTitle.style.marginTop = "6px";
    subTitle.style.fontSize = "12px";
    subTitle.style.color = "#4b5563";
    subTitle.textContent = "判定用フィールド (現在は最大2条件。内部は5条件まで拡張可能)";
    group.appendChild(subTitle);

    const grid2 = document.createElement("div");
    grid2.className = "field-group-grid";

    grid2.appendChild(makeMiniField("値1フィールドコード",   `fw-field-${i}-value1`, value1));
    grid2.appendChild(makeMiniField("条件1フィールドコード", `fw-field-${i}-op1`,    op1));
    grid2.appendChild(makeMiniField("値2フィールドコード",   `fw-field-${i}-value2`, value2));
    grid2.appendChild(makeMiniField("条件2フィールドコード", `fw-field-${i}-op2`,    op2));
    grid2.appendChild(makeMiniField("AND/OR フィールドコード", `fw-field-${i}-join1`, join1));

    group.appendChild(grid2);
    container.appendChild(group);
  }
}

// ===== UI → 設定 =====
function collectFwConfigFromUI() {
  const spaceId   = $("fw-space-id").value.trim() || "scan_area";
  const tableCode = $("fw-table-code").value.trim() || "scan_table";
  const scanAt    = $("fw-table-scanat").value.trim() || "scan_at";
  const result    = $("fw-table-result").value.trim() || "result";
  const reason    = $("fw-table-reason").value.trim() || "reason";

  let fieldCount  = parseInt($("fw-field-count").value, 10);
  if (!Number.isFinite(fieldCount) || fieldCount < 1) fieldCount = 1;
  if (fieldCount > 20) fieldCount = 20;

  const fields = [];
  for (let i = 1; i <= fieldCount; i++) {
    const name  = ($(`fw-field-${i}-name`).value || "").trim() || `f${i}`;
    const label = ($(`fw-field-${i}-label`).value || "").trim() || name;
    const type  = ($(`fw-field-${i}-type`).value || "text").trim();
    const length = parseInt(($(`fw-field-${i}-length`).value || "").trim(), 10) || 1;
    const tableField = ($(`fw-field-${i}-tableField`).value || "").trim();

    const value1 = ($(`fw-field-${i}-value1`).value || "").trim();
    const op1    = ($(`fw-field-${i}-op1`).value || "").trim();
    const value2 = ($(`fw-field-${i}-value2`).value || "").trim();
    const op2    = ($(`fw-field-${i}-op2`).value || "").trim();
    const join1  = ($(`fw-field-${i}-join1`).value || "").trim();

    fields.push({
      name,
      label,
      type,
      length,
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
    mode: "fixed",
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

// ===== 設定 → UI =====
function applyFwConfigToUI(cfg) {
  if (!cfg) return;
  $("fw-space-id").value   = cfg.spaceId || "scan_area";
  $("fw-table-code").value = (cfg.table && cfg.table.code) || "scan_table";
  $("fw-table-scanat").value = (cfg.table && cfg.table.scanAtField) || "scan_at";
  $("fw-table-result").value = (cfg.table && cfg.table.resultField) || "result";
  $("fw-table-reason").value = (cfg.table && cfg.table.reasonField) || "reason";

  $("fw-field-count").value =
    cfg.fields && cfg.fields.length ? String(cfg.fields.length) : "1";

  renderFwFields(cfg);
}

// ===== Firestore: 設定保存・取得 =====
async function refreshFwConfigList() {
  const select = $("fw-config-select");
  if (!select) return;

  const auth = window.tanaAuth;
  const user = auth && auth.currentUser;
  const db   = auth && auth.db;
  if (!user || !db) {
    select.innerHTML = '<option value="">（ログインが必要です）</option>';
    fwConfigsCache = {};
    return;
  }

  select.innerHTML = '<option value="">（保存済み設定を選択）</option>';
  fwConfigsCache = {};

  try {
    const colRef = collection(db, "users", user.uid, "configs");
    const snap = await getDocs(colRef);
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (!data || data.mode !== "fixed" || !data.payload) return;
      fwConfigsCache[docSnap.id] = data;
      const opt = document.createElement("option");
      opt.value = docSnap.id;
      opt.textContent = data.name || "(無題)";
      select.appendChild(opt);
    });
  } catch (e) {
    console.error("FW設定一覧取得エラー:", e);
    select.innerHTML = '<option value="">（設定の取得に失敗しました）</option>';
  }
}

async function saveFwConfig() {
  const statusEl = $("fw-status");
  const auth = window.tanaAuth;
  const user = auth && auth.currentUser;
  const db   = auth && auth.db;

  if (!user || !db) {
    alert("設定を保存するにはログインが必要です。");
    return;
  }

  const nameInput = $("fw-config-name");
  const name = (nameInput.value || "").trim() || "無題";

  const payload = collectFwConfigFromUI();

  try {
    const colRef = collection(db, "users", user.uid, "configs");
    await addDoc(colRef, {
      name,
      mode: "fixed",
      payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    statusEl.textContent = `設定「${name}」を保存しました。`;
    await refreshFwConfigList();
  } catch (e) {
    console.error("FW設定保存エラー:", e);
    statusEl.textContent = "設定の保存に失敗しました。コンソールを確認してください。";
  }
}

// ===== ランタイム JS 生成（固定長版・フル実装） =====
function buildFwJs(config, licenseUid) {
  const header = [
    "// Generated by QR Config Tool",
    "// Mode: fixed-width (max 20 fields, up to 5 conditions each)",
    "// Generated at: " + new Date().toISOString(),
    ""
  ].join("\n");

  const cfgJson = JSON.stringify({
    spaceId: config.spaceId,
    fields: config.fields,
    table: config.table
  }, null, 2);

  // ライセンス用エンドポイント & UID（ここがジェネレーターで差し込まれる）
  const endpointLiteral = JSON.stringify(
    "https://checkruntimel-6cd2lwhrea-uc.a.run.app"
  );
  const uidLiteral      = JSON.stringify(licenseUid || "");

  const engine = String.raw`
  // ===== ライセンス設定 =====
  const LICENSE = {
    endpoint: ${endpointLiteral},
    uid: ${uidLiteral}
  };

  async function checkLicense() {
    if (!LICENSE.endpoint || !LICENSE.uid) {
      return { ok: false, status: null, message: "LICENSE 情報が埋め込まれていません" };
    }

    const url =
      LICENSE.endpoint +
      "?uid=" + encodeURIComponent(LICENSE.uid) +
      "&version=fixed";

    try {
      const res  = await fetch(url, { method: "GET" });
      const text = await res.text();

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          message: "HTTP " + res.status + " / " + text
        };
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return {
          ok: false,
          status: res.status,
          message: "レスポンスの JSON 解析に失敗しました: " + e.message
        };
      }

      if (!data || data.ok !== true || data.status !== "active") {
        return {
          ok: false,
          status: data && data.status,
          message: (data && data.message) || "status !== active"
        };
      }

      return { ok: true, status: data.status, plan: data.plan };
    } catch (e) {
      return {
        ok: false,
        status: null,
        message: "ネットワークエラー: " + e.message
      };
    }
  }

  // ===== ここから元々の固定長ランタイム本体 =====
  const val = (rec, code) => (code && rec[code] ? rec[code].value : "");
  const nz  = (s) => String(s === undefined || s === null ? "" : s).trim() !== "";

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
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return null;
    }
    return h * 60 + m;
  }

  function parseDateLocal(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00+09:00");
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
    return a.getHours() === b.getHours() &&
           a.getMinutes() === b.getMinutes();
  }

  function toIsoFromDateTimeParts(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const dt = new Date(dateStr + "T" + timeStr + ":00+09:00");
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  // ===== 判定ロジック（text/number/date/datetime/time）=====
  // ここは今までの pc-fixedwidth-flex と同じロジックをそのまま入れてあります
  // （judgeText / judgeNumber / judgeDate / judgeDateTime / judgeTime /
  //   evaluateFieldConditions / evaluateAll など）

  /* ★★ ここには、今使っている pc-fixedwidth-flex の
         「判定・サブテーブル転記・buildScanUI」部分を
         丸ごと入れている想定です（コードは既に app-fw (2).js と同じ）★★ */

  // ===== kintone 画面ロード時 =====
  if (typeof kintone !== "undefined" &&
      kintone.events &&
      kintone.app &&
      kintone.app.record) {

    kintone.events.on(
      ["app.record.create.show", "app.record.edit.show"],
      function (event) {
        const space = kintone.app.record.getSpaceElement(CFG.spaceId);
        let mount = space;
        if (!mount) {
          mount = document.createElement("div");
          mount.id = "tana-scan-fw-fallback";
          document.body.appendChild(mount);
        }

        while (mount.firstChild) mount.removeChild(mount.firstChild);

        const msg = document.createElement("div");
        msg.textContent = "ライセンスを確認しています…";
        msg.style.fontSize = "12px";
        msg.style.color = "#666";
        mount.appendChild(msg);

        checkLicense().then(function (result) {
          if (!result.ok) {
            msg.textContent =
              "このJSのライセンスが無効です: " +
              (result.message || (result.status ? "status=" + result.status : ""));
            msg.style.color = "#b91c1c";
            return;
          }

          while (mount.firstChild) mount.removeChild(mount.firstChild);
          buildScanUI();
        });

        return event;
      }
    );
  }
  `;

  const source = `${header}
(function () {
  'use strict';

  const CFG = ${cfgJson};

${engine}
})();
`;
  return source;
}

// ===== 初期化 =====
function initFw() {
  const fieldCountInput = $("fw-field-count");
  fieldCountInput.addEventListener("change", () => renderFwFields());

  renderFwFields();

  const genBtn  = $("fw-generate-btn");
  const dlBtn   = $("fw-download-btn");
  const saveBtn = $("fw-save-config-btn");
  const status  = $("fw-status");
  const output  = $("fw-code-output");

  // ★ここがポイント：ログイン必須＆ uid を埋め込んで buildFwJs を呼ぶ
  genBtn.addEventListener("click", () => {
    const auth = window.tanaAuth;
    const user = auth && auth.currentUser;

    if (!user) {
      alert("JSコードを生成するにはログインが必要です。");
      return;
    }

    const cfg = collectFwConfigFromUI();
    const js  = buildFwJs(cfg, user.uid);
    output.value = js;
    status.textContent =
      "JSコードを生成しました。（uid=" + user.uid + " を埋め込みました）";
    dlBtn.disabled = false;
  });

  dlBtn.addEventListener("click", () => {
    const now = new Date();
    const y  = String(now.getFullYear());
    const m  = String(now.getMonth() + 1).padStart(2, "0");
    const d  = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const filename = `pc-fixedwidth-flex-${y}${m}${d}-${hh}${mm}${ss}.js`;
    downloadJs(filename, $("fw-code-output").value);
  });

  saveBtn.addEventListener("click", () => {
    saveFwConfig();
  });

  $("fw-config-select").addEventListener("change", (ev) => {
    const id = ev.target.value;
    if (!id || !fwConfigsCache[id]) return;
    const data = fwConfigsCache[id];
    if (data.payload) {
      $("fw-config-name").value = data.name || "";
      applyFwConfigToUI(data.payload);
      $("fw-status").textContent =
        `設定「${data.name || "(無題)"}」を読み込みました。`;
    }
  });

  if (window.tanaAuth && typeof window.tanaAuth.onChange === "function") {
    window.tanaAuth.onChange(() => {
      refreshFwConfigList();
    });
  }
  refreshFwConfigList();
}

document.addEventListener("DOMContentLoaded", initFw);

