/* =============================================================
 * firebase-config.js
 * -------------------------------------------------------------
 * Dán cấu hình Firebase của bạn vào đây.
 * Lấy tại: Firebase Console -> Project settings -> Your apps -> Web.
 *
 * Nếu để nguyên placeholder -> app tự chạy chế độ MOCK (offline, test được).
 * ============================================================= */

export const firebaseConfig = {
  apiKey: 'AIzaSyDOPdUofOJd5TbAfDg8Jm7reCh_c8l64lM',
  authDomain: 'mdg-bin-3.firebaseapp.com',
  databaseURL: 'https://mdg-bin-3.firebaseio.com',
  projectId: 'mdg-bin-3',
  storageBucket: 'mdg-bin-3.firebasestorage.app',
  messagingSenderId: '175934787300',
  appId: '1:175934787300:web:aa36619bbc3353015ce6f1',
};

/** true nếu config còn là placeholder -> dùng mock. */
export function isConfigured() {
  return !/PASTE_YOUR/.test(JSON.stringify(firebaseConfig)) &&
    /^https:\/\/.+\.firebaseio\.com$/.test(firebaseConfig.databaseURL || '');
}