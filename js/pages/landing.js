/* =============================================================
 * landing.js — Trang chủ: chọn vai trò & vào phòng
 * ============================================================= */
import { SETTINGS, FEMALES } from '../config.js';
import { qs, esc, initials, avatarHTML, stars, toast, showModeBadge } from '../ui.js';

document.getElementById('eventName').textContent = SETTINGS.eventName;
showModeBadge();

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
    <div class="stars">${stars(f.strength)}</div>
  </div>`).join('');

picker.addEventListener('click', e => {
  const chip = e.target.closest('.female-chip');
  if (!chip) return;
  pickedFemale = chip.dataset.id;
  picker.querySelectorAll('.female-chip').forEach(c => c.classList.toggle('selected', c === chip));
});

/* ---------- Điều hướng ---------- */
function go(page, params) {
  location.href = `${page}?${new URLSearchParams(params).toString()}`;
}

document.getElementById('hostGo').addEventListener('click', () => {
  const room = (document.getElementById('hostRoom').value || 'demo').trim();
  const secret = document.getElementById('hostSecret').value;
  if (secret !== SETTINGS.hostSecret) return toast('Mật khẩu host không đúng.', 'err');
  go('host.html', { room });
});

document.getElementById('playerGo').addEventListener('click', () => {
  const room = (document.getElementById('playerRoom').value || 'demo').trim();
  const secret = document.getElementById('playerSecret').value;
  const female = FEMALES.find(f => f.id === pickedFemale);
  if (!female) return toast('Chưa chọn người chơi.', 'err');
  if (secret !== female.secret) return toast('Mật khẩu riêng không đúng.', 'err');
  go('player.html', { room, f: female.id });
});

document.getElementById('specGo').addEventListener('click', () => {
  const room = (document.getElementById('specRoom').value || 'demo').trim();
  go('spectator.html', { room });
});

/* Tự động điền mã phòng demo */
if (qs('room')) {
  ['hostRoom', 'playerRoom', 'specRoom'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = qs('room');
  });
}