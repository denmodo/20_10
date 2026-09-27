/* =============================================================
 * player.js — Màn hình của người chơi (nữ)
 * -------------------------------------------------------------
 * Chỉ ĐỌC state từ Realtime DB + ghi bid của chính mình.
 * Mọi tính toán hiển thị dùng chung engine (deterministic).
 * ============================================================= */
import { SETTINGS, FEMALES, MALES, computeMinPrice } from '../config.js';
import {
  createInitialState, validateBid, remaining, needed, maxAllowedBid,
} from '../auction.js';
import { openRoom, remoteToState } from '../store.js';
import { qs, esc, toast, fmt, avatarHTML, startCountdown, haptic, bindStatus } from '../ui.js';

const ROOM = qs('room', 'main');
const MY_ID = qs('f', 'F1');
const ME = FEMALES.find(f => f.id === MY_ID);

if (!ME) {
  document.body.innerHTML = '<div class="wrap"><div class="panel"><h3>Không tìm thấy người chơi</h3><p class="muted">Kiểm tra tham số ?f= trên URL.</p></div></div>';
  throw new Error('unknown female');
}

document.getElementById('playerName').textContent = ME.name;

/* ---------- KẾT NỐI ---------- */
const room = openRoom(ROOM);
await room.connect();
bindStatus(room, 'netStatus');
room.setPresence({ role: 'player', femaleId: MY_ID, name: ME.name });

let S = createInitialState(FEMALES);   // state suy ra từ remote
let myLocalBid = null;                 // bid đã gửi ở lượt hiện tại
let stopCountdown = null;
let lastPhase = 'lobby';
let lastMaleId = null;
let lastRound = 1;

/* Nhãn trạng thái — khai báo SỚM để tránh lỗi TDZ khi callback realtime bắn về */
const phaseText = { lobby: 'Sảnh chờ', bidding: 'Đang đấu giá', reveal: 'Công bố', done: 'Hoàn tất' };

/**
 * Ghép remote -> state engine.
 * Nếu host chưa khởi tạo phòng (chưa có teams), dùng ngân sách dự kiến
 * từ config để người chơi vẫn thấy thông tin thay vì số 0.
 */
function mergeState(remote) {
  const st = remoteToState(remote, FEMALES);
  if (!st) return S;
  if (!remote || !remote.teams || Object.keys(remote.teams).length === 0) {
    st.teams = createInitialState(FEMALES).teams;
  }
  return st;
}

/* =============================================================
 * ĐẶT GIÁ
 * ============================================================= */
const bidInput = document.getElementById('bidAmount');

function currentMinPrice() {
  const m = MALES.find(x => x.id === S.currentMaleId);
  return m ? computeMinPrice(m, MALES, SETTINGS) : 0;
}
function myTeam() { return S.teams[MY_ID] || { budget: 0, spent: 0, maleIds: [] }; }
function myLeft() { return remaining(myTeam()); }
/** Điểm tối đa được bid lượt này (đã trừ tiền dự phòng cho nam còn lại). */
function myMaxBid() {
  if (!S.currentMaleId) return myLeft();
  return maxAllowedBid({ femaleId: MY_ID, maleId: S.currentMaleId, state: S }, MALES, SETTINGS);
}

async function submitBid() {
  if (S.phase !== 'bidding' || !S.currentMaleId) return toast('Chưa tới lượt đấu giá.', 'err');
  const amount = Number(bidInput.value);

  const check = validateBid({ femaleId: MY_ID, maleId: S.currentMaleId, amount, state: S }, MALES, SETTINGS);
  if (!check.ok) {
    document.getElementById('bidError').textContent = check.error;
    document.getElementById('bidError').classList.remove('hidden');
    haptic(30);
    return toast(check.error, 'err');
  }
  document.getElementById('bidError').classList.add('hidden');

  // Lưu bid lên remote (kín với người chơi khác — chỉ host đọc khi chốt)
  await room.setBid(MY_ID, amount);
  myLocalBid = amount;
  haptic(20);

  document.getElementById('bidStatus').innerHTML =
    `<div class="ok-box">Đã khoá bid <b>${fmt(amount)}</b> điểm. Bạn có thể sửa trước khi host chốt.</div>`;
  toast(amount === 0 ? 'Đã chọn bỏ qua lượt này.' : `Đã đặt ${fmt(amount)} điểm.`, 'ok');
}

/* ---------- Quick buttons ---------- */
document.querySelectorAll('[data-quick]').forEach(btn => {
  btn.addEventListener('click', () => {
    const min = currentMinPrice();
    const step = SETTINGS.minIncrement;
    const q = btn.dataset.quick;
    let v = Number(bidInput.value) || 0;
    if (q === 'min') v = min;
    else if (q === 'plus') v = Math.max(min, v + step);
    else if (q === 'plus10') v = Math.max(min, v + 10);
    else if (q === 'max') v = myMaxBid();
    else if (q === 'skip') v = 0;
    bidInput.value = v;
    updateHint();
  });
});
bidInput.addEventListener('input', updateHint);
document.getElementById('btnBid').addEventListener('click', submitBid);

function updateHint() {
  const min = currentMinPrice();
  const max = myMaxBid();
  const v = Number(bidInput.value) || 0;
  const hint = document.getElementById('bidHint');
  const mustBuy = needed(myTeam(), SETTINGS.malesPerTeam) >= SETTINGS.malesPerTeam;
  if (v === 0) {
    hint.innerHTML = mustBuy
      ? '<span style="color:var(--danger)">Bạn chưa có nam nào — bắt buộc phải đặt giá!</span>'
      : 'Bỏ qua lượt này (không mất điểm).';
  } else if (v < min) {
    hint.innerHTML = `<span style="color:var(--danger)">Thấp hơn giá sàn ${fmt(min)}</span>`;
  } else if (v > max) {
    hint.innerHTML = `<span style="color:var(--danger)">Vượt mức tối đa ${fmt(max)} — phải để dành tiền mua nam còn lại</span>`;
  } else {
    hint.innerHTML = `Giá sàn ${fmt(min)} · Tối đa <b>${fmt(max)}</b> · Còn lại sau bid: ${fmt(myLeft() - v)} điểm`;
  }
}

/* ---------- Đồng hồ ---------- */
function startTimer() {
  const el = document.getElementById('countdown');
  if (!el) return;
  stopCountdown && stopCountdown();
  stopCountdown = startCountdown(el, S.roundEndsAt, () => {});
}

/* =============================================================
 * RENDER
 * ============================================================= */
function renderAll() {
  const pill = document.getElementById('phasePill');
  pill.textContent = phaseText[S.phase] || S.phase;
  pill.className = `pill ${S.phase}`;

  renderBidPanel();
  renderAuction();
  renderMyTeam();
  renderOtherTeams();
}

function renderBidPanel() {
  const waiting = S.phase !== 'bidding';
  document.getElementById('waitBox').classList.toggle('hidden', !waiting);
  document.getElementById('formBox').classList.toggle('hidden', waiting);
  document.getElementById('myLeft').textContent = fmt(myLeft());

  if (waiting) {
    document.getElementById('waitBox').innerHTML = '<p class="muted center">'
      + (S.phase === 'lobby' ? 'Đang chờ host mở lượt…'
        : S.phase === 'reveal' ? 'Đã chốt lượt này.' : 'Giải đã kết thúc.') + '</p>';
  } else {
    const min = currentMinPrice();
    bidInput.min = String(min);
    if (myLocalBid !== null) bidInput.value = myLocalBid;
    else if (!Number(bidInput.value) || Number(bidInput.value) < min) bidInput.value = min;
    updateHint();
    if (!stopCountdown) startTimer();
  }

  // Khối công bố kết quả
  const revealBox = document.getElementById('revealBox');
  if (S.phase === 'reveal' && S.reveal) {
    revealBox.classList.remove('hidden');
    const r = S.reveal;
    const m = MALES.find(x => x.id === r.maleId);
    const iWon = r.winnerId === MY_ID;
    const myEntry = r.entries.find(e => e.femaleId === MY_ID);
    revealBox.innerHTML = `
      <div class="divider"></div>
      ${iWon
        ? `<div class="reveal-banner">
             <div class="muted">Chúc mừng!</div>
             <div class="winner">Bạn có ${esc(m.name)}</div>
             <div class="price">${fmt(r.price)} điểm</div>
           </div>`
        : r.winnerId
          ? `<div class="reveal-banner plain">
               <div class="muted">${esc(m.name)} thuộc về</div>
               <div class="winner">${esc(nameOfFemale(r.winnerId))}</div>
               <div class="price">${fmt(r.price)} điểm</div>
             </div>`
          : `<div class="reveal-banner fail">
               <div class="winner">Không ai mua ${esc(m.name)}</div>
             </div>`}
      ${myEntry ? `<p class="muted center mt">Bạn đã trả ${fmt(myEntry.amount)} điểm</p>` : ''}
    `;
  } else {
    revealBox.classList.add('hidden');
    revealBox.innerHTML = '';
  }
}

function renderAuction() {
  const box = document.getElementById('auctionArea');
  const panel = document.getElementById('malePanel');
  const maleId = S.currentMaleId || (S.reveal && S.reveal.maleId);
  if (!maleId) { panel.classList.add('hidden'); box.innerHTML = ''; return; }
  panel.classList.remove('hidden');
  const m = MALES.find(x => x.id === maleId);
  const minP = computeMinPrice(m, MALES, SETTINGS);
  box.innerHTML = `
    <div class="male-hero">
      ${avatarHTML(m, 'big-avatar')}
      <div class="m-name">${esc(m.name)}</div>
      <div class="mt"><span class="badge-rank ${m.rank > 6 ? 'low' : ''}">Hạng ${m.rank}/${MALES.length}</span></div>
      <div class="m-meta">
        <div>Giá sàn<b>${fmt(minP)}</b></div>
        <div>Bước giá<b>${fmt(SETTINGS.minIncrement)}</b></div>
      </div>
    </div>`;
}

/** Hàng đội gọn cho mobile: nữ + tên 2 nam + điểm còn lại. */
function teamRowHTML(t, mine) {
  const f = FEMALES.find(x => x.id === t.femaleId);
  const names = [];
  for (let i = 0; i < SETTINGS.malesPerTeam; i++) {
    const mid = t.maleIds[i];
    names.push(mid ? esc((MALES.find(x => x.id === mid) || {}).name) : '—');
  }
  const full = needed(t, SETTINGS.malesPerTeam) === 0;
  return `<div class="team-row ${full ? '' : 'incomplete'} ${mine ? 'mine' : ''}">
    ${avatarHTML(f, 'avatar-sm')}
    <div class="tr-body">
      <div class="tr-name">${esc(f.name)}${mine ? ' <span class="tag">bạn</span>' : ''}</div>
      <div class="tr-males">${names.join(' · ')}</div>
    </div>
    <div class="tr-left"><b>${fmt(remaining(t))}</b><span>điểm</span></div>
  </div>`;
}

function renderMyTeam() {
  document.getElementById('myTeam').innerHTML = teamRowHTML(myTeam(), true);
}

function renderOtherTeams() {
  const others = Object.values(S.teams).filter(t => t.femaleId !== MY_ID);
  document.getElementById('otherTeams').innerHTML =
    others.map(t => teamRowHTML(t, false)).join('');
}

/* ---------- HELPERS ---------- */
function nameOfFemale(id) { return (FEMALES.find(f => f.id === id) || {}).name || id; }

/* ---------- BOOT ---------- */
renderAll();

/* Đăng ký realtime SAU khi mọi hàm/biến đã khởi tạo — tránh lỗi TDZ */
room.onState(remote => {
  S = mergeState(remote);
  // Lượt mới (đổi nam, đổi phase, hoặc đổi vòng) -> xoá bid cũ của mình
  const changedRound = S.currentMaleId !== lastMaleId
    || S.phase !== lastPhase
    || S.round !== lastRound;
  if (changedRound) {
    myLocalBid = null;
    bidInput.value = '';
    const st = document.getElementById('bidStatus'); if (st) st.innerHTML = '';
    document.getElementById('bidError').classList.add('hidden');
  }
  lastPhase = S.phase; lastMaleId = S.currentMaleId; lastRound = S.round;
  renderAll();
  if (S.phase === 'bidding' && S.roundEndsAt) startTimer();
});