/* =============================================================
 * landing.js — Trang chủ: chọn vai trò & vào phòng
 * Mã phòng cố định 'main' (dùng 1 lần, không cần nhập).
 * ============================================================= */
import { SETTINGS, FEMALES } from '../config.js';
import { esc, avatarHTML, toast } from '../ui.js';

const ROOM = 'main';

document.getElementById('eventName').textContent = SETTINGS.eventName;

/* ---------- Tabs ---------- */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
  });
});

/* ---------- Chọn nữ ---------- */
let pickedFemale = FEMALES[0]?.id || '';
const picker = document.getElementById('femalePicker');
picker.innerHTML = FEMALES.map(f => `
  <div class="female-chip ${f.id === pickedFemale ? 'selected' : ''}" data-id="${esc(f.id)}">
    ${avatarHTML(f, 'avatar')}
    <div class="name">${esc(f.name)}</div>
  </div>`).join('');

picker.addEventListener('click', e => {
  const chip = e.target.closest('.female-chip');
  if (!chip) return;
  pickedFemale = chip.dataset.id;
  picker.querySelectorAll('.female-chip').forEach(c => c.classList.toggle('selected', c === chip));
});

/* ---------- Điều hướng ---------- */
/**
 * Chuyển trang kèm tham số. Đồng thời lưu vào sessionStorage để không bị mất
 * khi hosting redirect (một số static server bỏ query string khi rewrite .html).
 */
function go(page, params) {
  try {
    for (const [k, v] of Object.entries(params)) sessionStorage.setItem(`role:${k}`, v);
  } catch {}
  location.href = `${page}?${new URLSearchParams(params).toString()}`;
}

document.getElementById('hostGo').addEventListener('click', () => {
  const secret = document.getElementById('hostSecret').value;
  if (secret !== SETTINGS.hostSecret) return toast('Mật khẩu host không đúng.', 'err');
  go('host.html', { room: ROOM });
});

document.getElementById('playerGo').addEventListener('click', () => {
  const secret = document.getElementById('playerSecret').value;
  const female = FEMALES.find(f => f.id === pickedFemale);
  if (!female) return toast('Chưa chọn người chơi.', 'err');
  if (secret !== female.secret) return toast('Mật khẩu không đúng.', 'err');
  go('player.html', { room: ROOM, f: female.id });
});

document.getElementById('specGo').addEventListener('click', () => {
  go('spectator.html', { room: ROOM });
});