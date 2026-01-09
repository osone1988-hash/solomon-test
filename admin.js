// admin.js　　ver.3.1
// 管理者だけが使えるユーザー管理画面
// Firestore の users コレクションを読み書きします。
//
// ✅ 修正ポイント:
// - tbody の click リスナーを { once:true } で付けていたため、最初のクリック（select を開く等）でリスナーが解除され、
//   「保存」クリックが効かない不具合が起きていました。→ リスナーは初期化時に1回だけ登録します。
// - 管理者判定を users/{uid}.role 依存から、allowlist（admins/{uid} の存在）優先に変更（互換として role もフォールバック）
//
// 推奨: セキュリティルール側も「admins/{uid} の存在」または「custom claim(admin)」で判定してください。

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

function $(id) {
  return document.getElementById(id);
}

const PLAN_OPTIONS = [
  { value: "free", label: "free（無料）" },
  { value: "pro", label: "pro（有料）" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "active（有効）" },
  { value: "inactive", label: "inactive（停止）" },
];

const ROLE_OPTIONS = [
  { value: "user", label: "user（通常ユーザー）" },
  { value: "admin", label: "admin（管理者）" }, // ※ 互換表示用。権限は allowlist/claim で判定推奨
];

// ===== trialEndsAt 表示変換 =====
function pad2(n) {
  return String(n).padStart(2, "0");
}
function toDateTimeLocal(v) {
  if (!v) return "";
  let d = null;
  try {
    if (v instanceof Timestamp) d = v.toDate();
    else if (typeof v === "string") d = new Date(v);
    else if (typeof v === "number") d = new Date(v);
    else if (v && typeof v.toDate === "function") d = v.toDate(); // 念のため
  } catch (_) {}

  if (!d || Number.isNaN(d.getTime())) return "";
  return (
    d.getFullYear() +
    "-" +
    pad2(d.getMonth() + 1) +
    "-" +
    pad2(d.getDate()) +
    "T" +
    pad2(d.getHours()) +
    ":" +
    pad2(d.getMinutes())
  );
}
function fromDateTimeLocal(str) {
  const s = String(str || "").trim();
  if (!s) return null;
  const d = new Date(s); // datetime-local は「ローカル時刻」として解釈されます
  if (Number.isNaN(d.getTime())) return null;
  return Timestamp.fromDate(d);
}

// ===== 管理者チェック =====
async function loadCurrentUserAsAdmin() {
  const gateMsgEl = $("admin-gate-message");
  const currentUserEl = $("admin-current-user");
  const adminMainEl = $("admin-main");

  const auth = window.tanaAuth;
  const user = auth && auth.currentUser;
  const db = auth && auth.db;

  if (!auth || !db) {
    gateMsgEl.textContent =
      "auth.js の初期化がまだのようです。ページを再読込してみてください。";
    adminMainEl.style.display = "none";
    currentUserEl.textContent = "---";
    return null;
  }

  if (!user) {
    gateMsgEl.textContent =
      "ログインしていません。右上のログインメニューからログインしてください。";
    adminMainEl.style.display = "none";
    currentUserEl.textContent = "---";
    return null;
  }

  try {
    // まず自分の users/{uid} を読んで表示用情報を取得
    const selfRef = doc(db, "users", user.uid);
    const selfSnap = await getDoc(selfRef);
    const self = selfSnap.exists() ? selfSnap.data() || {} : {};

    // 管理者判定：allowlist を優先（admins/{uid} の存在）
    const adminRef = doc(db, "admins", user.uid);
    const adminSnap = await getDoc(adminRef);
    const isAdminAllowlist = adminSnap.exists();

    // 互換: 旧実装 role=admin でも一応通す（将来は削除推奨）
    const isAdminLegacyRole = (self.role || "user") === "admin";

    const isAdmin = isAdminAllowlist || isAdminLegacyRole;

    const plan = self.plan || "free";
    const status = self.status || "active";
    const role = self.role || "user";

    currentUserEl.textContent =
      (self.email || user.email || "(emailなし)") +
      " / plan=" +
      plan +
      " / status=" +
      status +
      " / role=" +
      role +
      " / uid=" +
      user.uid +
      (isAdminAllowlist ? " / admin=allowlist" : isAdminLegacyRole ? " / admin=legacyRole" : "");

    if (!isAdmin) {
      gateMsgEl.textContent =
        "このページは管理者専用です。（admins/{uid} に登録されたユーザー、または互換で users.role=admin のユーザーのみ）";
      adminMainEl.style.display = "none";
      return null;
    }

    if (isAdminLegacyRole && !isAdminAllowlist) {
      gateMsgEl.textContent =
        "管理者としてログインしています（互換モード: users.role=admin）。推奨: admins/{uid} allowlist へ移行してください。";
    } else {
      gateMsgEl.textContent = "管理者としてログインしています。";
    }

    adminMainEl.style.display = "block";
    return { db, user, self, isAdminAllowlist, isAdminLegacyRole };
  } catch (e) {
    console.error("管理者チェック中にエラー:", e);
    gateMsgEl.textContent =
      "管理者情報の取得に失敗しました。コンソールを確認してください。";
    adminMainEl.style.display = "none";
    currentUserEl.textContent = "---";
    return null;
  }
}

// ===== ユーザー一覧の描画 =====
function createSelect(options, value, className) {
  const sel = document.createElement("select");
  if (className) sel.className = className;
  options.forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    sel.appendChild(o);
  });
  if (value && options.some((o) => o.value === value)) {
    sel.value = value;
  }
  return sel;
}

function renderUsersTable(usersSnap) {
  const tbody = $("users-tbody");
  tbody.innerHTML = "";

  usersSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const uid = docSnap.id;

    const tr = document.createElement("tr");

    // email
    const tdEmail = document.createElement("td");
    tdEmail.textContent = data.email || "(emailなし)";
    tr.appendChild(tdEmail);

    // uid
    const tdUid = document.createElement("td");
    tdUid.textContent = uid;
    tdUid.className = "mono";
    tr.appendChild(tdUid);

    // plan
    const tdPlan = document.createElement("td");
    const planSel = createSelect(PLAN_OPTIONS, data.plan || "free", "user-plan");
    tdPlan.appendChild(planSel);
    tr.appendChild(tdPlan);

    // status
    const tdStatus = document.createElement("td");
    const statusSel = createSelect(
      STATUS_OPTIONS,
      data.status || "active",
      "user-status"
    );
    tdStatus.appendChild(statusSel);
    tr.appendChild(tdStatus);

    // role（表示/互換）
    const tdRole = document.createElement("td");
    const roleSel = createSelect(ROLE_OPTIONS, data.role || "user", "user-role");
    tdRole.appendChild(roleSel);
    tr.appendChild(tdRole);

    // trialEndsAt（datetime-local）
    const tdTrial = document.createElement("td");
    const trialInput = document.createElement("input");
    trialInput.type = "datetime-local";
    trialInput.className = "user-trial";
    trialInput.value = toDateTimeLocal(data.trialEndsAt);
    tdTrial.appendChild(trialInput);
    tr.appendChild(tdTrial);

    // memo
    const tdMemo = document.createElement("td");
    const memoInput = document.createElement("input");
    memoInput.type = "text";
    memoInput.className = "user-memo";
    memoInput.placeholder = "メモ（任意）";
    memoInput.value = data.memo || "";
    tdMemo.appendChild(memoInput);
    tr.appendChild(tdMemo);

    // 保存
    const tdSave = document.createElement("td");
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "保存";
    saveBtn.className = "btn-outline";
    saveBtn.dataset.uid = uid;
    tdSave.appendChild(saveBtn);
    tr.appendChild(tdSave);

    tbody.appendChild(tr);
  });
}

async function refreshUsersList(db) {
  const statusEl = $("users-status");
  statusEl.textContent = "ユーザー一覧を読み込み中…";

  try {
    const colRef = collection(db, "users");
    const snap = await getDocs(colRef);
    renderUsersTable(snap);
    statusEl.textContent = snap.size + " 件のユーザーを読み込みました。";
  } catch (e) {
    console.error("ユーザー一覧取得エラー:", e);
    statusEl.textContent =
      "ユーザー一覧の取得に失敗しました。コンソールを確認してください。";
  }
}

// ===== 保存クリック（イベント委譲） =====
async function handleUsersTbodyClick(ev) {
  const btn = ev.target.closest("button");
  if (!btn || !btn.dataset.uid) return;

  const uid = btn.dataset.uid;
  const row = btn.closest("tr");
  if (!row) return;

  const auth = window.tanaAuth;
  const db = auth && auth.db;
  const adminUser = auth && auth.currentUser;
  if (!db || !adminUser) {
    alert("ログイン状態が確認できません。ページを再読込してください。");
    return;
  }

  const planSel = row.querySelector("select.user-plan");
  const statusSel = row.querySelector("select.user-status");
  const roleSel = row.querySelector("select.user-role");
  const memoInput = row.querySelector("input.user-memo");
  const trialInput = row.querySelector("input.user-trial");

  const plan = (planSel && planSel.value) || "free";
  const status = (statusSel && statusSel.value) || "active";
  const role = (roleSel && roleSel.value) || "user";
  const memo = memoInput ? memoInput.value : "";
  const trialEndsAt = fromDateTimeLocal(trialInput ? trialInput.value : "");

  // 最低限のバリデーション（ルール/サーバでも検証推奨）
  const planOk = PLAN_OPTIONS.some((o) => o.value === plan);
  const statusOk = STATUS_OPTIONS.some((o) => o.value === status);
  const roleOk = ROLE_OPTIONS.some((o) => o.value === role);
  if (!planOk || !statusOk || !roleOk) {
    alert("入力値が不正です。再読込してやり直してください。");
    return;
  }

  const update = {
    plan,
    status,
    role,
    memo,
    trialEndsAt: trialEndsAt, // null なら trial 無し扱い
    updatedAt: serverTimestamp(),
    updatedBy: adminUser.uid,
  };

  try {
    btn.disabled = true;
    btn.textContent = "保存中…";

    const ref = doc(db, "users", uid);
    await updateDoc(ref, update);

    btn.textContent = "保存済み";
    setTimeout(() => {
      btn.textContent = "保存";
      btn.disabled = false;
    }, 900);
  } catch (e) {
    console.error("ユーザー更新エラー:", e);
    alert(
      "ユーザー情報の更新に失敗しました。\n\n想定原因: Firestore ルールで拒否 / 管理者判定が未設定 / プロジェクト設定違い。\n\nコンソールを確認してください。"
    );
    btn.textContent = "保存";
    btn.disabled = false;
  }
}

// ===== 初期化 =====
async function initAdminPage() {
  // tbody click は1回だけ登録（←重要）
  const tbody = $("users-tbody");
  if (tbody && !tbody.dataset.listenerAttached) {
    tbody.addEventListener("click", handleUsersTbodyClick);
    tbody.dataset.listenerAttached = "1";
  }

  async function handleAuthChange() {
    const adminInfo = await loadCurrentUserAsAdmin();
    if (adminInfo && adminInfo.db) {
      await refreshUsersList(adminInfo.db);
    }
  }

  if (window.tanaAuth && typeof window.tanaAuth.onChange === "function") {
    window.tanaAuth.onChange(() => {
      handleAuthChange();
    });
  }

  await handleAuthChange();

  const refreshBtn = $("refresh-users-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      const auth = window.tanaAuth;
      const db = auth && auth.db;
      if (!db) return;
      await refreshUsersList(db);
    });
  }
}

document.addEventListener("DOMContentLoaded", initAdminPage);
