// mypage.js
// マイページ：ユーザー情報 & 保存済み設定一覧

import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

function $(id) {
  return document.getElementById(id);
}

// ===== ユーザー情報の描画 =====
function renderUserInfo(user, userDocData) {
  const card = $("my-user-card");
  const container = $("my-user-info");
  if (!card || !container) return;

  if (!user) {
    card.style.display = "none";
    return;
  }
  card.style.display = "";

  container.innerHTML = "";

  const items = [];

  items.push({
    label: "メールアドレス",
    value: user.email || "(未設定)"
  });

  items.push({
    label: "UID",
    value: user.uid
  });

  const status = userDocData && userDocData.status ? String(userDocData.status) : "unknown";
  const plan   = userDocData && userDocData.plan   ? String(userDocData.plan)   : "free";

  // status badge
  const statusHtml =
    status === "active"
      ? '<span class="badge badge-status-active">status: active</span>'
      : status === "inactive"
      ? '<span class="badge badge-status-inactive">status: inactive</span>'
      : `<span class="badge badge-status-inactive">status: ${status}</span>`;

  items.push({
    label: "ステータス",
    value: statusHtml,
    isHtml: true
  });

  const planHtml = `<span class="badge badge-plan">plan: ${plan}</span>`;
  items.push({
    label: "プラン",
    value: planHtml,
    isHtml: true
  });

  // createdAt / updatedAt があれば表示
  if (userDocData && userDocData.createdAt && userDocData.createdAt.toDate) {
    items.push({
      label: "登録日時",
      value: userDocData.createdAt.toDate().toLocaleString()
    });
  }
  if (userDocData && userDocData.updatedAt && userDocData.updatedAt.toDate) {
    items.push({
      label: "更新日時",
      value: userDocData.updatedAt.toDate().toLocaleString()
    });
  }

  for (const item of items) {
    const wrap = document.createElement("div");
    const lab = document.createElement("div");
    lab.className = "info-item-label";
    lab.textContent = item.label;
    const val = document.createElement("div");
    val.className = "info-item-value";
    if (item.isHtml) {
      val.innerHTML = item.value;
    } else {
      val.textContent = item.value;
    }
    wrap.appendChild(lab);
    wrap.appendChild(val);
    container.appendChild(wrap);
  }
}

// ===== 設定一覧の描画 =====

function modeLabel(mode) {
  switch (mode) {
    case "simple": return "単純区切り";
    case "kv":     return "キー型";
    case "fixed":  return "文字数区切り";
    default:       return mode || "(不明)";
  }
}

function renderConfigList(allConfigs, activeMode) {
  const card = $("my-config-card");
  const container = $("my-config-list");
  if (!card || !container) return;

  if (!allConfigs || allConfigs.length === 0) {
    card.style.display = "none";
    return;
  }
  card.style.display = "";

  container.innerHTML = "";

  const filtered = allConfigs.filter(c => c.mode === activeMode);
  if (!filtered.length) {
    const div = document.createElement("div");
    div.className = "config-list-empty";
    div.textContent = "この種類の設定はまだ保存されていません。";
    container.appendChild(div);
    return;
  }

  const table = document.createElement("table");
  table.className = "config-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>設定名</th>
      <th>モード</th>
      <th>作成日時</th>
      <th>更新日時</th>
      <th>操作</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  filtered.forEach(cfg => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.textContent = cfg.name || "(無題)";

    const tdMode = document.createElement("td");
    tdMode.textContent = modeLabel(cfg.mode);

    const tdCreated = document.createElement("td");
    tdCreated.textContent = cfg.createdAt || "";

    const tdUpdated = document.createElement("td");
    tdUpdated.textContent = cfg.updatedAt || "";

    const tdActions = document.createElement("td");
    tdActions.className = "actions";
    const delBtn = document.createElement("button");
    delBtn.className = "btn-link danger";
    delBtn.textContent = "削除";
    delBtn.dataset.id = cfg.id;
    delBtn.addEventListener("click", () => onDeleteConfig(cfg));
    tdActions.appendChild(delBtn);

    tr.appendChild(tdName);
    tr.appendChild(tdMode);
    tr.appendChild(tdCreated);
    tr.appendChild(tdUpdated);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

// ===== Firestore からデータ取得 =====

async function fetchUserDoc(db, uid) {
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (e) {
    console.error("ユーザードキュメント取得エラー:", e);
    return null;
  }
}

async function fetchConfigs(db, uid) {
  const results = [];
  try {
    const colRef = collection(db, "users", uid, "configs");
    const snap = await getDocs(colRef);
    snap.forEach(docSnap => {
      const data = docSnap.data() || {};
      const createdAt =
        data.createdAt && data.createdAt.toDate
          ? data.createdAt.toDate().toLocaleString()
          : "";
      const updatedAt =
        data.updatedAt && data.updatedAt.toDate
          ? data.updatedAt.toDate().toLocaleString()
          : "";
      results.push({
        id: docSnap.id,
        name: data.name || "",
        mode: data.mode || "",
        createdAt,
        updatedAt
      });
    });
  } catch (e) {
    console.error("設定一覧取得エラー:", e);
  }
  return results;
}

async function onDeleteConfig(cfg) {
  const auth = window.tanaAuth;
  const user = auth && auth.currentUser;
  const db   = auth && auth.db;

  if (!user || !db) {
    alert("ログインが必要です。");
    return;
  }

  const ok = window.confirm(
    `設定「${cfg.name || "(無題)"}」（${modeLabel(cfg.mode)}）を削除してよろしいですか？`
  );
  if (!ok) return;

  try {
    const ref = doc(db, "users", user.uid, "configs", cfg.id);
    await deleteDoc(ref);
    alert("削除しました。");
    // 再読み込み
    await refreshPage();
  } catch (e) {
    console.error("設定削除エラー:", e);
    alert("削除に失敗しました。コンソールを確認してください。");
  }
}

// ===== 全体のリフレッシュ =====

let cachedConfigs = [];
let activeMode = "simple";

async function refreshPage() {
  const loginCard = $("my-login-message");
  const msgEl = loginCard && loginCard.querySelector(".message");
  const userCard = $("my-user-card");
  const configCard = $("my-config-card");

  const auth = window.tanaAuth;
  const user = auth && auth.currentUser;
  const db   = auth && auth.db;

  if (!user || !db) {
    if (msgEl) {
      msgEl.textContent = "未ログインです。右上のログインバーからサインインしてください。";
    }
    if (userCard) userCard.style.display = "none";
    if (configCard) configCard.style.display = "none";
    return;
  }

  if (msgEl) {
    msgEl.textContent = `ログイン中: ${user.email || "(email なし)"}`;
  }

  // Firestore: users/{uid} & configs
  const [userDocData, configs] = await Promise.all([
    fetchUserDoc(db, user.uid),
    fetchConfigs(db, user.uid)
  ]);

  renderUserInfo(user, userDocData);

  cachedConfigs = configs;
  renderConfigList(cachedConfigs, activeMode);
}

// ===== タブ切替 =====

function setupTabs() {
  const tabsContainer = $("my-config-tabs");
  if (!tabsContainer) return;

  const tabs = Array.from(tabsContainer.querySelectorAll(".configs-tab"));
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode;
      activeMode = mode || "simple";

      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      renderConfigList(cachedConfigs, activeMode);
    });
  });
}

// ===== 初期化 =====

function initMyPage() {
  setupTabs();

  // auth 状態変化を監視
  if (window.tanaAuth && typeof window.tanaAuth.onChange === "function") {
    window.tanaAuth.onChange(() => {
      refreshPage();
    });
  }

  // 初回
  refreshPage();
}

document.addEventListener("DOMContentLoaded", initMyPage);
