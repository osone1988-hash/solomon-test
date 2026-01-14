import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  Timestamp,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function setGuardMessage(html) {
  $("admin-guard").innerHTML = html;
}

function showPanel(show) {
  $("admin-panel").classList.toggle("hidden", !show);
}

function tsToYmd(ts) {
  if (!ts) return "";
  // Firestore Timestamp
  if (typeof ts.toDate === "function") {
    const d = ts.toDate();
    const y = String(d.getFullYear());
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  // string
  if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  return "";
}

function ymdToTs(ymd) {
  const s = String(ymd || "").trim();
  if (!s) return null;
  // JST の “その日末” にしておく（将来の自動判定で扱いやすい）
  const d = new Date(s + "T23:59:59+09:00");
  if (Number.isNaN(d.getTime())) return null;
  return Timestamp.fromDate(d);
}

function normalizeOrigins(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  // 重複削除（順序維持）
  const seen = new Set();
  const out = [];
  for (const v of lines) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

async function isCurrentUserAdmin(db, user) {
  if (!db || !user) return false;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;
  return !!data && data.role === "admin";
}

function renderRow({ uid, email, status, plan, trialEndsAt, paidUntil, allowedOriginsEnabled, allowedOrigins }) {
  const tr = document.createElement("tr");
  tr.dataset.uid = uid;
  tr.dataset.email = email || "";

  const userTd = document.createElement("td");
  userTd.innerHTML = `
    <div class="mini"><strong>${email || "(no email)"}</strong></div>
    <div class="muted mini">uid: <code>${uid}</code></div>
  `;

  const statusTd = document.createElement("td");
  const statusSel = document.createElement("select");
  statusSel.innerHTML = `
    <option value="active">active</option>
    <option value="inactive">inactive</option>
  `;
  statusSel.value = status || "active";
  statusTd.appendChild(statusSel);

  const planTd = document.createElement("td");
  const planSel = document.createElement("select");
  planSel.innerHTML = `
    <option value="free">free</option>
    <option value="pro">pro</option>
  `;
  planSel.value = plan || "free";
  planTd.appendChild(planSel);

  const trialTd = document.createElement("td");
  const trialInput = document.createElement("input");
  trialInput.type = "date";
  trialInput.value = tsToYmd(trialEndsAt);
  trialTd.appendChild(trialInput);

  const paidTd = document.createElement("td");
  const paidInput = document.createElement("input");
  paidInput.type = "date";
  paidInput.value = tsToYmd(paidUntil);
  paidTd.appendChild(paidInput);

  const originsTd = document.createElement("td");

  const enabledWrap = document.createElement("label");
  enabledWrap.className = "mini";
  enabledWrap.style.display = "flex";
  enabledWrap.style.alignItems = "center";
  enabledWrap.style.gap = "6px";

  const enabledChk = document.createElement("input");
  enabledChk.type = "checkbox";
  enabledChk.checked = !!allowedOriginsEnabled;

  const enabledText = document.createElement("span");
  enabledText.textContent = "有効化（将来用）";

  enabledWrap.appendChild(enabledChk);
  enabledWrap.appendChild(enabledText);

  const originsTa = document.createElement("textarea");
  originsTa.placeholder = "例:\nhttps://xxxx.cybozu.com\nhttps://xxxx.kintone.com";
  originsTa.value = Array.isArray(allowedOrigins) ? allowedOrigins.join("\n") : "";

  originsTd.appendChild(enabledWrap);
  originsTd.appendChild(originsTa);

  const actionTd = document.createElement("td");
  const saveBtn = document.createElement("button");
  saveBtn.className = "primary";
  saveBtn.textContent = "保存";

  const oneMonthBtn = document.createElement("button");
  oneMonthBtn.textContent = "30日無料(試用)";
  oneMonthBtn.style.marginLeft = "6px";

  actionTd.appendChild(saveBtn);
  actionTd.appendChild(oneMonthBtn);

  tr.appendChild(userTd);
  tr.appendChild(statusTd);
  tr.appendChild(planTd);
  tr.appendChild(trialTd);
  tr.appendChild(paidTd);
  tr.appendChild(originsTd);
  tr.appendChild(actionTd);

  tr._controls = {
    statusSel,
    planSel,
    trialInput,
    paidInput,
    enabledChk,
    originsTa,
    saveBtn,
    oneMonthBtn
  };

  return tr;
}

async function loadAllUsers(db) {
  const snap = await getDocs(collection(db, "users"));
  const list = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    list.push({
      uid: d.id,
      email: data.email || "",
      status: data.status || "active",
      plan: data.plan || "free",
      role: data.role || "user",
      trialEndsAt: data.trialEndsAt || null,
      paidUntil: data.paidUntil || null,
      allowedOriginsEnabled: !!data.allowedOriginsEnabled,
      allowedOrigins: Array.isArray(data.allowedOrigins) ? data.allowedOrigins : []
    });
  });

  // email優先で見やすくソート
  list.sort((a, b) => String(a.email).localeCompare(String(b.email)));
  return list;
}

function applyFilter() {
  const q = String($("user-filter").value || "").trim().toLowerCase();
  const rows = Array.from($("users-body").querySelectorAll("tr"));
  for (const tr of rows) {
    const uid = (tr.dataset.uid || "").toLowerCase();
    const email = (tr.dataset.email || "").toLowerCase();
    const show = !q || uid.includes(q) || email.includes(q);
    tr.style.display = show ? "" : "none";
  }
}

async function main() {
  showPanel(false);
  setGuardMessage(`<div class="muted">ログイン情報を確認中…</div>`);

  const auth = window.tanaAuth;
  if (!auth || typeof auth.onChange !== "function") {
    setGuardMessage(`<div class="muted">auth.js が読み込めていません。</div>`);
    return;
  }

  auth.onChange(async () => {
    const user = auth.currentUser;
    const db = auth.db;

    if (!user || !db) {
      showPanel(false);
      setGuardMessage(`<div class="muted">管理者メニューはログインが必要です。</div>`);
      return;
    }

    const admin = await isCurrentUserAdmin(db, user);
    if (!admin) {
      showPanel(false);
      setGuardMessage(`
        <div><strong>権限がありません。</strong></div>
        <div class="muted">このページは管理者（運営者）専用です。Firestore の users/{uid} に role="admin" を設定してください。</div>
      `);
      return;
    }

    setGuardMessage(`<div class="chip ok">管理者としてログイン中</div>`);
    showPanel(true);

    const statusEl = $("admin-status");
    const reloadBtn = $("reload-btn");

    async function reload() {
      statusEl.textContent = "読込中…";
      $("users-body").innerHTML = "";
      try {
        const users = await loadAllUsers(db);

        for (const u of users) {
          const tr = renderRow(u);

          tr._controls.saveBtn.addEventListener("click", async () => {
            tr._controls.saveBtn.disabled = true;
            try {
              const patch = {
                status: tr._controls.statusSel.value,
                plan: tr._controls.planSel.value,
                trialEndsAt: ymdToTs(tr._controls.trialInput.value),
                paidUntil: ymdToTs(tr._controls.paidInput.value),
                allowedOriginsEnabled: !!tr._controls.enabledChk.checked,
                allowedOrigins: normalizeOrigins(tr._controls.originsTa.value),
                updatedAt: serverTimestamp()
              };

              // null は削除ではなく null で入るのが嫌ならここで消す
              if (patch.trialEndsAt === null) delete patch.trialEndsAt;
              if (patch.paidUntil === null) delete patch.paidUntil;

              await updateDoc(doc(db, "users", u.uid), patch);
              statusEl.textContent = `保存しました: ${u.email || u.uid}`;
            } catch (e) {
              console.error(e);
              statusEl.textContent = "保存エラー: " + (e && e.message ? e.message : String(e));
            } finally {
              tr._controls.saveBtn.disabled = false;
            }
          });

          tr._controls.oneMonthBtn.addEventListener("click", () => {
            const d = new Date();
            d.setDate(d.getDate() + 30);
            const y = String(d.getFullYear());
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            tr._controls.trialInput.value = `${y}-${m}-${dd}`;
          });

          $("users-body").appendChild(tr);
        }

        statusEl.textContent = `ユーザー ${users.length} 件を読み込みました。`;
        applyFilter();
      } catch (e) {
        console.error(e);
        statusEl.textContent = "読込エラー: " + (e && e.message ? e.message : String(e));
      }
    }

    reloadBtn.onclick = reload;
    $("user-filter").addEventListener("input", applyFilter);

    await reload();
  });
}

document.addEventListener("DOMContentLoaded", main);
