// auth.js
// Firebase Authentication 共通処理
// - メール＋パスワードでサインアップ／ログイン
// - #auth-bar にログインバーを表示
// - data-require-login="true" が付いたボタンを「ログイン必須」にする

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyADQlKzZyiGJwajXQ-pfvmEN04r2U4YB_w",
  authDomain: "qr-scan-service.firebaseapp.com",
  projectId: "qr-scan-service",
  storageBucket: "qr-scan-service.firebasestorage.app",
  messagingSenderId: "555293545036",
  appId: "1:555293545036:web:3b2d6f906e68e979e5dae9",
  measurementId: "G-DJEYHX0P42"
};

// --- Firebase 初期化 ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// グローバル公開
const listeners = [];
const tanaAuth = {
  auth,
  currentUser: null,
  onChange(callback) {
    listeners.push(callback);
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

// 認証状態監視
onAuthStateChanged(auth, (user) => {
  tanaAuth.currentUser = user || null;
  listeners.forEach(fn => fn(user || null));
});

// === ログインバー描画 ===
function setupAuthBar() {
  const root = document.getElementById('auth-bar');
  if (!root) return;

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

  tanaAuth.onChange((user) => {
    if (user) {
      statusText.textContent = 'ログイン中';
      userEmail.textContent  = user.email || '';
      loggedOut.style.display = 'flex';
      loggedIn.style.display  = 'flex';
      loggedOut.style.display = 'none';
      messageEl.textContent = '';
    } else {
      statusText.textContent = '未ログイン';
      userEmail.textContent  = '';
      loggedOut.style.display = 'flex';
      loggedIn.style.display  = 'none';
    }
  });
}

// === ログイン必須ボタン制御 ===
function setupRequireLoginButtons() {
  const buttons = Array.from(
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

document.addEventListener('DOMContentLoaded', () => {
  setupAuthBar();
  setupRequireLoginButtons();
});
