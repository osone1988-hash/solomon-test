// admin.js
// 管理者だけが使えるユーザー管理画面
// Firestore の users コレクションを読み書きします。

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
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
  { value: "admin", label: "admin（管理者）" },
];

// ========== 管理者チェック ==========

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
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      gateMsgEl.textContent =
        "users コレクションにあなたの情報がありません。（一度マイページにアクセスしてユーザー情報を作成してください）";
      adminMainEl.style.display = "none";
      currentUserEl.textContent = user.email || user.uid;
      return null;
    }

    const data = snap.data() || {};
    const plan = data.plan || "free";
    const status = data.status || "active";
    const role = data.role || "user";

    currentUserEl.textContent =
      (data.email || user.email || "(emailなし)") +
      " / plan=" +
      plan +
      " / status=" +
      status +
      " / role=" +
      role +
      " / uid=" +
      user.uid;

    if (role !== "admin") {
      gateMsgEl.textContent =
        "このページは管理者専用です（users ドキュメントの role が admin のユーザーだけが利用できます）。";
      adminMainEl.style.display = "none";
      return null;
    }

    gateMsgEl.textContent = "管理者としてログインしています。";
    adminMainEl.style.display = "block";

    return { db, user, data };
  } catch (e) {
    console.error("管理者チェック中にエラー:", e);
    gateMsgEl.textContent =
      "管理者情報の取得に失敗しました。コンソールを確認してください。";
    adminMainEl.style.display = "none";
    currentUserEl.textContent = "---";
    return null;
  }
}

// ========== ユーザー一覧の描画 ==========

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

function renderUsersTable(db, usersSnap) {
  const tbody = $("users-tbody");
  tbody.innerHTML = "";

  usersSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const uid = docSnap.id;

    const tr = document.createElement("tr");

    // メール
    const tdEmail = document.createElement("td");
    tdEmail.textContent = data.email || "(emailなし)";
    tr.appendChild(tdEmail);

    // UID
    const tdUid = document.createElement("td");
    tdUid.textContent = uid;
    tdUid.className = "mono";
    tr.appendChild(tdUid);

    // plan
    const tdPlan = document.createElement("td");
    const planSel = createSelect(
      PLAN_OPTIONS,
      data.plan || "free",
      "user-plan"
    );
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

    // role
    const tdRole = document.createElement("td");
    const roleSel = createSelect(
      ROLE_OPTIONS,
      data.role || "user",
      "user-role"
    );
    tdRole.appendChild(roleSel);
    tr.appendChild(tdRole);

    // memo（任意）
    const tdMemo = document.createElement("td");
    const memoInput = document.createElement("input");
    memoInput.type = "text";
    memoInput.className = "user-memo";
    memoInput.placeholder = "メモ / trial: 2026-01-31 など";
    memoInput.value = data.memo || "";
    tdMemo.appendChild(memoInput);
    tr.appendChild(tdMemo);

    // 保存ボタン
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

  // 1つのイベントリスナーで全行の「保存」を処理
  tbody.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button");
    if (!btn || !btn.dataset.uid) return;

    const uid = btn.dataset.uid;
    const row = btn.closest("tr");
    if (!row) return;

    const planSel = row.querySelector("select.user-plan");
    const statusSel = row.querySelector("select.user-status");
    const roleSel = row.querySelector("select.user-role");
    const memoInput = row.querySelector("input.user-memo");

    const update = {
      plan: (planSel && planSel.value) || "free",
      status: (statusSel && statusSel.value) || "active",
      role: (roleSel && roleSel.value) || "user",
      memo: memoInput ? memoInput.value : "",
      updatedAt: new Date().toISOString(),
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
      }, 1000);
    } catch (e) {
      console.error("ユーザー更新エラー:", e);
      alert("ユーザー情報の更新に失敗しました。コンソールを確認してください。");
      btn.textContent = "保存";
      btn.disabled = false;
    }
  }, { once: true }); // tbody へのイベント登録は一度だけ
}

async function refreshUsersList(db) {
  const statusEl = $("users-status");
  statusEl.textContent = "ユーザー一覧を読み込み中…";

  try {
    const colRef = collection(db, "users");
    const snap = await getDocs(colRef);
    const count = snap.size;
    renderUsersTable(db, snap);
    statusEl.textContent = count + " 件のユーザーを読み込みました。";
  } catch (e) {
    console.error("ユーザー一覧取得エラー:", e);
    statusEl.textContent = "ユーザー一覧の取得に失敗しました。コンソールを確認してください。";
  }
}

// ========== 初期化 ==========

async function initAdminPage() {
  // ログイン状態が変わるたびに管理者チェック＆一覧再読み込み
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

  // 初回
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
