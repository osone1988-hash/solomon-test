// auth.js
// Firebase Authentication + Firestore 会員管理
// - メール＋パスワードでサインアップ／ログイン
// - users/{uid} にユーザープロファイルを自動作成
//   { email, plan, status, createdAt }
// - data-require-login="true" のボタンを
//   「ログインかつ status==="active" のときだけ有効」にする

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDxwQavji9G0bl55ue4jdhRkO450Gj_W04",
  authDomain: "qr-scan-service-std.firebaseapp.com",
  projectId: "qr-scan-service-std",
  storageBucket: "qr-scan-service-std.firebasestorage.app",
  messagingSenderId: "1017855002210",
  appId: "1:1017855002210:web:562df417b134da0cb0333b",
  measurementId: "G-PMYY6MTMNZ"
};

// --- Firebase 初期化 ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// グローバル公開
const listeners = [];
const tanaAuth = {
  auth,
  db,
  currentUser: null,
  profile: null, // Firestore の users/{uid} の中身
  onChange(callback) {
    listeners.push(callback);
    callback(this.currentUser, this.profile);
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

// --- ユーザープロファイルを Firestore に作成／取得 ---
async function ensureUserProfile(user) {
  if (!user) return null;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
      const TRIAL_MONTHS = 3; // ← 1か月にしたいなら 1 にする
      const trialEnd = new Date();
      trialEnd.setMonth(trialEnd.getMonth() + TRIAL_MONTHS);
      trialEnd.setHours(23, 59, 59, 999);
          const profile = {
        email: user.email || '',
        role: 'user',                 // ★ Firestore rules の create 条件を満たすため必須
        plan: 'free',
        status: 'active',
        allowedOrigins: [],
        trialEndsAt: Timestamp.fromDate(trialEnd),
        paidUntil: null,
        createdAt: serverTimestamp()
      };
    await setDoc(ref, profile, { merge: true });
    return profile;
  } else {
    return snap.data();
  }
}

// --- 認証状態 + プロファイル監視 ---
onAuthStateChanged(auth, (user) => {
  if (!user) {
    tanaAuth.currentUser = null;
    tanaAuth.profile = null;
    listeners.forEach(fn => fn(null, null));
    return;
  }

  tanaAuth.currentUser = user;

  ensureUserProfile(user)
    .then((profile) => {
      tanaAuth.profile = profile || null;
      listeners.forEach(fn => fn(user, tanaAuth.profile));
    })
    .catch((err) => {
      console.error("ユーザープロファイル取得エラー:", err);
      tanaAuth.profile = null;
      listeners.forEach(fn => fn(user, null));
    });
});

// === ログインバー描画 ===
function setupAuthBar() {
  const root = document.getElementById('auth-bar');
  if (!root) return;

  root.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;padding:6px 8px;border-radius:8px;background:#eef2ff;">
      <span id="auth-status-text" style="font-weight:600;">未ログイン</span>
      <span id="auth-user-email" style="color:#4b5563;"></span>
      <span id="auth-profile-info" style="color:#6b7280;font-size:11px;"></span>

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
  const profileInfo= document.getElementById('auth-profile-info');
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

  // ログイン状態 + プラン表示
  tanaAuth.onChange((user, profile) => {
    if (user) {
      statusText.textContent = 'ログイン中';
      userEmail.textContent  = user.email || '';

      const plan   = profile && profile.plan   ? profile.plan   : 'free';
      const status = profile && profile.status ? profile.status : 'active';
      profileInfo.textContent = `（プラン: ${plan} / 状態: ${status}）`;

      loggedOut.style.display = 'none';
      loggedIn.style.display  = 'flex';
      messageEl.textContent   = '';
    } else {
      statusText.textContent = '未ログイン';
      userEmail.textContent  = '';
      profileInfo.textContent= '';
      loggedOut.style.display = 'flex';
      loggedIn.style.display  = 'none';
    }
  });
}

// === ログイン＋会員ステータスでボタン制御 ===
// data-require-login="true" のボタンを、
// 「ログイン中 かつ status==="active"」のときだけ有効にする
function setupRequireLoginButtons() {
  const buttons = Array.from(
    document.querySelectorAll('[data-require-login="true"]')
  );
  if (!buttons.length) return;

  function update(user, profile) {
    const status = profile && profile.status ? profile.status : 'active';
    const isActiveMember = !!user && status === 'active';

    buttons.forEach(btn => {
      btn.disabled = !isActiveMember;
      if (!user) {
        btn.title = '利用するにはログインが必要です';
      } else if (!isActiveMember) {
        btn.title = '有効な会員ステータスではありません';
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
