// admin.js
// 管理者メニュー: Firestore の users コレクションの plan / status を閲覧・更新

import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

function $(id) {
  return document.getElementById(id);
}

// 必要に応じてここはあとで増減・ラベル変更してOK
const PLAN_OPTIONS = [
  { value: "free",  label: "free" },
  { value: "trial", label: "trial" },
  { value: "pro",   label: "pro" },
];

const STATUS_OPTIONS = [
  { value: "active",   label: "active" },
  { value: "inactive", label: "inactive" },
];

// ① ログインユーザーが admin かチェック
async function ensureAdminUser() {
  const auth = window.tanaAuth;
  const user = auth && auth.currentUser;
  const db   = auth && auth.db;
  const statusEl = $("admin-status");

  if (!user || !db) {
    if (statusEl) statusEl.textContent = "ログインしてください。";
    throw new Error("not-logged-in");
  }

  const meRef  = doc(db, "users", user.uid);
  const meSnap = await getDoc(meRef);

  if (!meSnap.exists()) {
    if (statusEl) statusEl.textContent = "ユーザー情報(users/" + user.uid + ")が見つかりません。";
    throw new Error("user-doc-not-found");
  }

  const meData = meSnap.data();
  if (meData.role !== "admin") {
    if (statusEl) statusEl.textContent = "管理者権限がありません（role が admin ではありません）。";
    throw new Error("not-admin");
  }

  return { auth, db, user, meData };
}

// ② 1ユーザー分の行を作成
function renderUserRow(db, userDoc, tbody, statusEl) {
  const data = userDoc.data() || {};
  const uid  = userDoc.id;

  const tr = document.createElement("tr");

  // メール
  const emailTd = document.createElement("td");
  emailTd.textContent = data.email || "";
  tr.appendChild(emailTd);

  // UID
  const uidTd = document.createElement("td");
  uidTd.textContent = uid;
  tr.appendChild(uidTd);

  // plan セレクト
  const planTd = document.createElement("td");
  const planSelect = document.createElement("select");

  PLAN_OPTIONS.forEach(opt => {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    planSelect.appendChild(o);
  });

  // Firestore に既に入っている plan が PLAN_OPTIONS にない場合も表示できるようにする
  if (data.plan && !PLAN_OPTIONS.some(p => p.value === data.plan)) {
    const extra = document.createElement("option");
    extra.value = data.plan;
    extra.textContent = data.plan + " (既存)";
    planSelect.appendChild(extra);
  }

  planSelect.value = data.plan || "free";
  planTd.appendChild(planSelect);
  tr.appendChild(planTd);

  // status セレクト
  const statusTd = document.createElement("td");
  const statusSelect = document.createElement("select");

  STATUS_OPTIONS.forEach(opt => {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    statusSelect.appendChild(o);
  });

  if (data.status && !STATUS_OPTIONS.some(s => s.value === data.status)) {
    const extra = document.createElement("option");
    extra.value = data.status;
    extra.textContent = data.status + " (既存)";
    statusSelect.appendChild(extra);
  }

  statusSelect.value = data.status || "inactive";
  statusTd.appendChild(statusSelect);
  tr.appendChild(statusTd);

  // 更新日時
  const updatedTd = document.createElement("td");
  if (data.updatedAt && typeof data.updatedAt.toDate === "function") {
    const d = data.updatedAt.toDate();
    const iso = d.toISOString().slice(0, 19).replace("T", " ");
    updatedTd.textContent = iso;
  } else {
    updatedTd.textContent = "";
  }
  tr.appendChild(updatedTd);

  // 操作（保存ボタン）
  const actionTd = document.createElement("td");
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "保存";
  actionTd.appendChild(saveBtn);
  tr.appendChild(actionTd);

  saveBtn.addEventListener("click", async () => {
    const newPlan   = planSelect.value;
    const newStatus = statusSelect.value;

    saveBtn.disabled = true;
    const beforeText = saveBtn.textContent;
    saveBtn.textContent = "保存中…";

    try {
      const ref = doc(db, "users", uid);
      await updateDoc(ref, {
        plan: newPlan,
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      if (statusEl) {
        statusEl.textContent = `保存しました: uid=${uid}, plan=${newPlan}, status=${newStatus}`;
      }
    } catch (e) {
      console.error("update user error", e);
      alert("保存に失敗しました: " + e.message);
      if (statusEl) statusEl.textContent = "保存に失敗しました。コンソールを確認してください。";
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = beforeText;
    }
  });

  tbody.appendChild(tr);
}

// ③ 一覧を読み込んでテーブルに描画
async function loadAllUsers() {
  const statusEl = $("admin-status");
  const tbody    = $("admin-users-tbody");
  if (!tbody) return;

  if (statusEl) statusEl.textContent = "読み込み中…";

  try {
    const { db } = await ensureAdminUser();

    const snap = await getDocs(collection(db, "users"));
    tbody.innerHTML = "";

    snap.forEach(docSnap => {
      renderUserRow(db, docSnap, tbody, statusEl);
    });

    if (statusEl) statusEl.textContent = "読み込み完了。plan / status を変更して「保存」してください。";
  } catch (e) {
    // not-logged-in / not-admin のときは ensureAdminUser 側でメッセージ済み
    if (e.message === "not-logged-in" || e.message === "not-admin") {
      console.warn(e);
      return;
    }
    console.error("loadAllUsers error", e);
    if (statusEl) statusEl.textContent = "読み込みに失敗しました: " + e.message;
  }
}

// ④ 初期化：ログイン状態の変化に追従しつつ一覧を読む
function initAdmin() {
  if (window.tanaAuth && typeof window.tanaAuth.onChange === "function") {
    window.tanaAuth.onChange(() => {
      loadAllUsers();
    });
  }
  // 初回表示
  loadAllUsers();
}

document.addEventListener("DOMContentLoaded", initAdmin);
