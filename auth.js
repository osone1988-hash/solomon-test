// auth.js
// Firebase Authentication 共通処理
// - メール＋パスワードでのサインアップ／ログイン
// - ログインバー描画（#auth-bar）
// - [data-require-login="true"] なボタンを「ログイン必須」にする

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// 🔴 ここを Firebase コンソールで取得した値に差し替えてください
// （「プロジェクトの設定 → 全般 → アプリ → SDK の設定と構成」に出てくるもの）
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
// 🔴 ここまでを書き換え

// Firebase 初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// グローバル公開用オブジェクト
const listeners = [];
const tanaAuth = {
  auth,
  currentUser: null,
  onChange(callback) {
    listeners.push(callback);
    // 現状態も即座に返す
    callback(this.currentUser);
  },
  async signIn(email, password) {
    return await signInWithEmailAndPassword(auth, email, password);
  },
  async signUp(email, password) {
    return await createUserWithEmailAndPassword(auth, email, password);
  },
  async signOut() {
    return await signOut(auth);
  }
};
window.tanaAuth = tanaAuth;

// 認証状態の変化を監視
onAuthStateChanged(auth, (user) => {
  tanaAuth.currentUser = user || null;
  listeners.forEach(fn => fn(user || null));
});

// ===== ログインバー（#auth-bar）を組み立てる =====
function setupAuthBar() {
  const root = document.getElementById('auth-bar');
  if (!root) return; // このページにバーがないなら何もしない

  root.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;padding:6px 8px;border-radius:8px;background:#eef2ff;">
      <span id="auth-status-text" style="font-weight:600;">未ログイン</span>
      <span id="auth-user-email" style="color:#4b5563;"></span>

      <div id="auth-logged-out" style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;">
        <input id="auth-email" type="email" placeholder="メールアドレス"
               style="font-size:12px;padding:3px 6px;border-radius:6px;border:1px solid #d1d5db;min-width:180px;">
        <input id="auth-password" type="password" placeholder="パスワード"
               style="font-size:12px;padding:3px 6px;border-radius:6px;border:1px solid #d1d5db;min-width:120px;">
        <button id="auth-login-btn" type="button"
                style="font-size:12px;padding:4px 8px;border-radius:999px;border:none;background:#2563eb;color:#fff;">
          ログイン
        </button>
        <button id="auth-register-btn" type="button"
                style="font-size:12px;padding:4px 8px;border-radius:999px;border:none;background:#e5e7eb;color:#111827;">
          新規登録
        </button>
      </div>

      <div id="auth-logged-in" style="display:none;align-items:center;gap:4px;">
        <button id="auth-logout-btn" type="button"
                style="font-size:12px;padding:4px 8px;border-radius:999px;border:none;background:#e5e7eb;color:#111827;">
          ログアウト
        </button>
      </div>

      <span id="auth-message" style="font-size:11px;color:#ef4444;"></span>
    </div>
  `;

  const statusText = document.getElementById('auth-status-text');
  const userEmail  = document.getElementById('auth-user-email');
  const loggedOut  = document.getElementById('auth-logged-out');
  const loggedIn   = document.getElementById('auth-logged-in');
  const messageEl  = document.getElementById('auth-message');
  const emailInput = document.getElementById('auth-email');
  const passInput  = document.getElementById('auth-password');

  document.getElementById('auth-login-btn').addEventListener('click', async () => {
    messageEl.style.color = '#ef4444';
    messageEl.textContent = '';
    try {
      await tanaAuth.signIn(emailInput.value, passInput.value);
      passInput.value = '';
    } catch (e) {
      console.error(e);
      messageEl.textContent = 'ログイン失敗: ' + (e.code || e.message);
    }
  });

  document.getElementById('auth-register-btn').addEventListener('click', async () => {
    messageEl.style.color = '#ef4444';
    messageEl.textContent = '';
    try {
      await tanaAuth.signUp(emailInput.value, passInput.value);
      passInput.value = '';
      messageEl.style.color = '#16a34a';
      messageEl.textContent = '登録完了しました。';
    } catch (e) {
      console.error(e);
      messageEl.textContent = '登録失敗: ' + (e.code || e.message);
    }
  });

  document.getElementById('auth-logout-btn').addEventListener('click', async () => {
    messageEl.style.color = '#ef4444';
    messageEl.textContent = '';
    try {
      await tanaAuth.signOut();
    } catch (e) {
      console.error(e);
      messageEl.textContent = 'ログアウト失敗: ' + (e.code || e.message);
    }
  });

  // ログイン状態で表示切り替え
  tanaAuth.onChange((user) => {
    if (user) {
      statusText.textContent = 'ログイン中';
      userEmail.textContent  = user.email || '';
      loggedOut.style.display = 'none';
      loggedIn.style.display  = 'flex';
      messageEl.textContent = '';
    } else {
      statusText.textContent = '未ログイン';
      userEmail.textContent  = '';
      loggedOut.style.display = 'flex';
      loggedIn.style.display  = 'none';
    }
  });
}

// ===== ログイン必須ボタンの制御 =====
// data-require-login="true" が付いているボタンを、未ログインなら disabled にする
function setupRequireLoginButtons() {
  const buttons = Array.prototype.slice.call(
    document.querySelectorAll('[data-require-login="true"]')
  );
  if (!buttons.length) return;

  function update(user) {
    const disabled = !user;
    buttons.forEach(btn => {
      btn.disabled = disabled;
      if (disabled) {
        btn.title = '利用するにはログインが必要です';
      } else {
        btn.title = '';
      }
    });
  }

  tanaAuth.onChange(update);
}

// DOM 準備完了後に UI セットアップ
document.addEventListener('DOMContentLoaded', () => {
  setupAuthBar();
  setupRequireLoginButtons();
});
