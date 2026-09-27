/* =============================================================
 * ui.js — Tiện ích DOM dùng chung cho mọi trang
 * ============================================================= */

/** Lấy tham số trên URL. */
export function qs(name, fallback = '') {
  return new URLSearchParams(location.search).get(name) ?? fallback;
}

/** Chống XSS khi chèn text do người dùng nhập. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Chữ cái đầu của tên, dùng làm avatar fallback. */
export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Tạo HTML avatar: ảnh nếu có, ngược lại là chữ cái đầu. */
export function avatarHTML(person, cls = 'avatar') {
  if (person && person.img) {
    return `<span class="${cls}"><img src="${esc(person.img)}" alt="${esc(person.name)}"
      onerror="this.parentElement.textContent='${esc(initials(person.name))}'"></span>`;
  }
  return `<span class="${cls}">${esc(initials(person && person.name))}</span>`;
}

/** Toast thông báo. */
let toastTimer = null;
export function toast(msg, type = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="toast-inner ${type}">${esc(msg)}</div>`;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/** Rung nhẹ thiết bị (nếu hỗ trợ). */
export function haptic(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

/** Định dạng số có dấu phân cách. */
export function fmt(n) {
  return new Intl.NumberFormat('vi-VN').format(n ?? 0);
}

/** Hiển thị sao theo strength 1..10. */
export function stars(strength) {
  const n = Math.round(strength / 2); // 10 -> 5 sao
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

/** Gắn badge chế độ mock/firebase. */
export function showModeBadge() {
  import('./firebase-config.js').then(({ isConfigured }) => {
    const b = document.getElementById('modeBadge');
    if (!b) return;
    const on = isConfigured();
    b.textContent = on ? 'Firebase online' : 'Mock (offline)';
    b.classList.add(on ? 'firebase' : 'mock');
    b.title = on ? 'Đang dùng Firebase Realtime Database'
      : 'Chưa cấu hình Firebase — chạy chế độ mô phỏng realtime đa tab';
  });
}

/**
 * Hiển thị trạng thái kết nối backend lên một phần tử (vd #hostOnline).
 * Nếu Firebase lỗi -> hiện banner đỏ + badge "Firebase lỗi".
 */
let statusBannerShown = false;
export function bindStatus(room, elId = 'hostOnline') {
  const el = document.getElementById(elId);
  room.onStatus(({ connected, error }) => {
    if (el) {
      if (room.mode === 'mock') {
        el.textContent = '🟡';
        el.title = 'Chế độ mô phỏng (offline) — dữ liệu chỉ lưu trên máy này';
        return;
      }
      el.textContent = error ? '🔴' : (connected ? '🟢' : '🟠');
      el.title = error || (connected ? 'Đã kết nối Firebase' : 'Đang kết nối Firebase…');
    }

    if (room.mode === 'firebase' && error) {
      const b = document.getElementById('modeBadge');
      if (b) { b.textContent = 'Firebase lỗi'; b.className = 'mode-badge mock'; b.title = error; }
      if (!statusBannerShown) {
        statusBannerShown = true;
        showConnBanner(error);
      }
    }
  });
}

/** Banner đỏ cố định ở đầu trang, nêu rõ cách khắc phục. */
function showConnBanner(msg) {
  if (document.getElementById('connBanner')) return;
  const bar = document.createElement('div');
  bar.id = 'connBanner';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:200;' +
    'background:#7a1626;color:#ffe4e8;padding:10px 16px;font-size:.84rem;' +
    'border-bottom:2px solid #ff5d73;line-height:1.5;white-space:pre-line';
  bar.innerHTML = `<b>⚠️ Không kết nối được Firebase</b>\n${esc(msg)}\n` +
    `<span style="opacity:.8">App vẫn chạy nhưng KHÔNG đồng bộ giữa các máy. ` +
    `Xem README.md → mục Firebase để khắc phục.</span>`;
  document.body.appendChild(bar);
}

/** Đồng hồ đếm ngược dùng chung, trả về hàm dừng. */
export function startCountdown(el, endsAt, onEnd) {
  let stop = false;
  const tick = () => {
    if (stop) return;
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    el.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    el.classList.toggle('urgent', left <= 10 && left > 0);
    if (left <= 0) { onEnd && onEnd(); return; }
    setTimeout(tick, 250);
  };
  tick();
  return () => { stop = true; };
}