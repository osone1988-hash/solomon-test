// admin.js
// 管理者だけが使えるユーザー一覧 & plan/status 編集画面

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

function $(id) {
  return document.getElementById(id);
}

/**
 * 管理者パネルの内容を更新
 */
async function refreshAdminPanel() {
  const msgEl = $("admin-message");
  const panel = $("admin-panel");
  const tbody = $("admin-users-body");
  if (!msgEl || !panel || !tbody) return;

  tbody.innerHTML = "";
  panel.style.display = "none";

  const auth = window.tanaAuth;
  const user = auth && auth.currentUser;
  const db   = auth && auth.db;

  if (!user || !db) {
    msgEl.textContent = "このページは管理者専用です。まずログインしてください。";
    return;
  }

  // 自分が admin かどうかチェック
  let meData = null;
  try {
    const meSnap = await getDoc(doc(db, "users", user.uid));
    meData = meSnap.exists() ? meSnap.data() : null;
  } catch (e) {
    console.error("自分のユーザ情報取得エラー:", e);
    msgEl.textContent = "ユーザー情報の取得に失敗しました。コンソールを確認してください。";
    return;
  }

  if (!meData || meData.role !== "admin") {
    msgEl.textContent = "管理者権限がありません（role != \"admin\"）。";
    return;
  }

  msgEl.textContent = "ユーザー一覧を読み込み中…";

  try {
    const snap = await getDocs(collection(db, "users"));
    snap.forEach(docSnap => {
      const data = docSnap.data() || {};
      const uid = docSnap.id;

      const tr = document.createElement("tr");
      if (uid === user.uid) {
        tr.classList.add("me-row");
      }
      tr.dataset.uid = uid;

      const plan = data.plan || "free";
      const status = data.status || "active";
      const memo = data.billingMemo || "";

      tr.innerHTML = `
        <td>${data.email || ""}</td>
        <td class="uid-cell">${uid}</td>
        <td>
          <select class="admin-plan">
            <option value="free">free</option>
            <option value="trial">trial</option>
            <option value="pro">pro</option>
          </select>
        </td>
        <td>
          <select class="admin-status">
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </td>
        <td>
          <input type="text" class="admin-memo" style="width:100%;box-sizing:border-box;" />
        </td>
        <td>
          <button type="button" class="admin-save">更新</button>
        </td>
      `;

      const planSel = tr.querySelector(".admin-plan");
      const statusSel = tr.querySelector(".admin-status");
      const memoInput = tr.querySelector(".admin-memo");
      if (planSel)   planSel.value = plan;
      if (statusSel) statusSel.value = status;
      if (memoInput) memoInput.value = memo;

      tbody.appendChild(tr);
    });

    panel.style.display = "";
    msgEl.textContent = "ユーザー一覧を読み込みました。";
  } catch (e) {
    console.error("ユーザー一覧取得エラー:", e);
    msgEl.textContent = "ユーザー一覧の取得に失敗しました。コンソールを確認してください。";
  }
}

/**
 * 行の「更新」ボタン押下で Firestore の users/{uid} を更新
 */
async function handleTableClick(ev) {
  const btn = ev.target.closest(".admin-save");
  if (!btn) return;

  const tr = btn.closest("tr");
  if (!tr) return;

  const uid = tr.dataset.uid;
  if (!uid) return;

  const auth = window.tanaAuth;
  const db   = auth && auth.db;
  if (!db) return;

  const planSel   = tr.querySelector(".admin-plan");
  const statusSel = tr.querySelector(".admin-status");
  const memoInput = tr.querySelector(".admin-memo");

  const plan   = planSel ? planSel.value : "free";
  const status = statusSel ? statusSel.value : "active";
  const memo   = memoInput ? memoInput.value : "";

  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = "保存中…";

  try {
    await updateDoc(doc(db, "users", uid), {
      plan,
      status,
      billingMemo: memo,
      updatedAt: serverTimestamp()
    });
    btn.textContent = "保存済み";
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = oldText;
    }, 800);
  } catch (e) {
    console.error("ユーザー更新エラー:", e);
    alert("ユーザー情報の更新に失敗しました。コンソールを確認してください。");
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

// 初期化
document.addEventListener("DOMContentLoaded", () => {
  const tbody = $("admin-users-body");
  if (tbody) {
    tbody.addEventListener("click", handleTableClick);
  }
  refreshAdminPanel();
});

// ログイン状態が変わったら再読み込み
if (window.tanaAuth && typeof window.tanaAuth.onChange === "function") {
  window.tanaAuth.onChange(() => {
    refreshAdminPanel();
  });
}
