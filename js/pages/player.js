/* =============================================================
 * player.js — Màn hình của người chơi (nữ)
 * -------------------------------------------------------------
 * Chỉ ĐỌC state từ Realtime DB + ghi bid của chính mình.
 * Mọi tính toán hiển thị dùng chung engine (deterministic).
 * ============================================================= */
import { SETTINGS, FEMALES, MALES, computeMinPrice, priceTable } from '../config.js';
import {
  createInitialState, validateBid, remaining, needed, rankBids, teamStrength, maxAllowedBid,
} from '../auction.js';
import { openRoom, remoteToState } from '../store.js';
import { qs, esc, toast, fmt, avatarHTML, showModeBadge, startCountdown, haptic } from '../ui.js';

const ROOM = qs('room', 'demo');
const MY_ID = qs('f', 'F1');
const ME = FEMALES.find(f => f.id === MY_ID);

if (!ME) {
  document.body.innerHTML = '<div class="wrap"><div class="panel"><h3>❌ Không tìm thấy người chơi</h3><p class="muted">Kiểm tra tham số ?f= trên URL.</p></div></div>';
  throw new Error('unknown female');
}

document.getElementById('playerName').textContent = ME.name;
document.getElementById('roomCode').textContent = ROOM;
showModeBadge();

/* ---------- KẾT NỐI ---------- */
const room = openRoom(ROOM);
await room.connect();
room.setPresence({ role: 'player', femaleId: MY_ID, name: ME.name });

let S = createInitialState(FEMALES);   // state suy ra từ remote
let myLocalBid = null;                 // bid đã gửi ở lượt hiện tại
let stopCountdown = null;
let lastPhase = 'lobby';
let lastMaleId = null;

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

  renderBudget();
  renderBidPanel();
  renderAuction();
  renderMyTeam();
  renderOtherTeams();
  renderMyLog();
}

function renderBudget() {
  const t = myTeam();
  document.getElementById('myBudget').textContent = fmt(t.budget);
  document.getElementById('mySpent').textContent = fmt(t.spent);
  document.getElementById('myLeft').textContent = fmt(remaining(t));
  document.getElementById('myBar').style.width = `${Math.round((t.spent / (t.budget || 1)) * 100)}%`;
}

function renderBidPanel() {
  const waiting = S.phase !== 'bidding';
  document.getElementById('waitBox').classList.toggle('hidden', !waiting);
  document.getElementById('formBox').classList.toggle('hidden', waiting);
  document.getElementById('bidRound').textContent = `Vòng ${S.round} / ${SETTINGS.rounds}`;

  if (waiting) {
    const idle = document.getElementById('countdownIdle');
    idle.textContent = S.phase === 'lobby' ? '--:--'
      : S.phase === 'reveal' ? 'Đã chốt' : 'Kết thúc';
  } else {
    const min = currentMinPrice();
    bidInput.min = String(min);
    if (myLocalBid !== null) bidInput.value = myLocalBid;
    else if (!Number(bidInput.value) || Number(bidInput.value) < min) bidInput.value = min;
    updateHint();
    if (!stopCountdown) startTimer();
  }

  // Khối công bố
  const revealBox = document.getElementById('revealBox');
  if (S.phase === 'reveal' && S.reveal) {
    revealBox.classList.remove('hidden');
    const r = S.reveal;
    const m = MALES.find(x => x.id === r.maleId);
    const iWon = r.winnerId === MY_ID;
    const myEntry = r.entries.find(e => e.femaleId === MY_ID);
    revealBox.innerHTML = `
      <div class="divider"></div>
      <h3 style="margin:0 0 12px">🔓 Kết quả lượt</h3>
      ${iWon ? `<div class="reveal-banner">
          <div class="winner">🎉 Bạn thắng ${esc(m.name)}!</div>
          <div class="price">${fmt(r.price)} điểm</div>
        </div>`
        : r.winnerId ? `<div class="reveal-banner" style="background:rgba(255,255,255,.05);border-color:var(--border)">
          <div class="muted">${esc(m.name)} thuộc về</div>
          <div class="winner">${esc((FEMALES.find(f => f.id === r.winnerId) || {}).name)}</div>
          <div class="price">${fmt(r.price)} điểm</div>
        </div>`
        : `<div class="reveal-banner" style="background:rgba(255,93,115,.12);border-color:rgba(255,93,115,.35)">
          <div class="winner">Không ai mua ${esc(m.name)}</div>
        </div>`}
      ${myEntry ? `<p class="muted center">Bid của bạn: <b>${fmt(myEntry.amount)}</b> điểm</p>` : ''}
    `;
  } else {
    revealBox.classList.add('hidden');
    revealBox.innerHTML = '';
  }
}

function renderAuction() {
  const box = document.getElementById('auctionArea');
  const maleId = S.currentMaleId || (S.reveal && S.reveal.maleId);
  if (!maleId) { box.innerHTML = '<p class="muted center">Chưa bắt đầu.</p>'; return; }
  const m = MALES.find(x => x.id === maleId);
  const minP = computeMinPrice(m, MALES, SETTINGS);
  box.innerHTML = `
    <div class="male-hero">
      ${avatarHTML(m, 'big-avatar')}
      <div class="m-name">${esc(m.name)}</div>
      <div class="mt"><span class="badge-rank ${m.rank > 6 ? 'low' : ''}">Hạng ${m.rank}</span></div>
      <div class="m-meta">
        <div>Giá sàn<b>${fmt(minP)}</b></div>
        <div>Bước giá<b>${fmt(SETTINGS.minIncrement)}</b></div>
        <div>Điểm mạnh<b>${MALES.length - m.rank + 1}</b></div>
      </div>
    </div>`;
}

function teamCardHTML(t, highlight) {
  const f = FEMALES.find(x => x.id === t.femaleId);
  const slots = [];
  for (let i = 0; i < SETTINGS.malesPerTeam; i++) {
    const mid = t.maleIds[i];
    if (mid) {
      const m = MALES.find(x => x.id === mid);
      slots.push(`<div class="member">${avatarHTML(m, 'avatar-sm')} <span>${esc(m.name)}</span>
        <span class="muted" style="margin-left:auto;font-size:.72rem">#${m.rank}</span></div>`);
    } else slots.push('<div class="member"><span class="slot-empty">— chưa có nam —</span></div>');
  }
  return `<div class="team-card ${needed(t, SETTINGS.malesPerTeam) ? 'incomplete' : ''}"
      style="${highlight ? 'border-color:var(--primary);box-shadow:0 0 0 3px rgba(108,140,255,.15)' : ''}">
    <div class="team-head">
      ${avatarHTML(f, 'avatar')}
      <div>
        <div class="t-name">${esc(f.name)}${highlight ? ' (bạn)' : ''}</div>
        <div class="t-strength">Sức mạnh đội: ${teamStrength(t, FEMALES, MALES)}</div>
      </div>
    </div>
    <div class="team-members">${slots.join('')}</div>
    <div class="team-foot">
      <span>Ngân sách <b>${fmt(t.budget)}</b></span>
      <span>Còn <b>${fmt(remaining(t))}</b></span>
    </div>
  </div>`;
}

function renderMyTeam() {
  document.getElementById('myTeam').innerHTML = teamCardHTML(myTeam(), false);
}

function renderOtherTeams() {
  const others = Object.values(S.teams).filter(t => t.femaleId !== MY_ID);
  const done = others.filter(t => needed(t, SETTINGS.malesPerTeam) === 0).length;
  document.getElementById('othersCount').textContent = `${done}/${others.length}`;
  document.getElementById('otherTeams').innerHTML = others.map(t => teamCardHTML(t, false)).join('');
}

function renderMyLog() {
  const my = S.log.filter(l => l.winnerId === MY_ID);
  const el = document.getElementById('myLog');
  if (!my.length) { el.innerHTML = '<p class="muted center">Bạn chưa mua được nam nào.</p>'; return; }
  el.innerHTML = my.map(l => {
    const m = MALES.find(x => x.id === l.maleId);
    const label = l.round === 'fill' ? 'Bổ sung' : `Vòng ${l.round}`;
    return `<div class="row-item">
      ${avatarHTML(m, 'avatar-sm')}
      <span class="rank-pill" style="min-width:52px;font-size:.66rem">${label}</span>
      <span class="r-name">${esc(m ? m.name : l.maleId)}</span>
      <span class="r-price">${fmt(l.price)}</span>
    </div>`;
  }).join('');
}

/* ---------- BOOT ---------- */
renderAll();

/* Đăng ký realtime SAU khi mọi hàm/biến đã khởi tạo — tránh lỗi TDZ */
room.onState(remote => {
  S = mergeState(remote);
  const changedRound = S.currentMaleId !== lastMaleId || S.phase !== lastPhase;
  if (changedRound) { myLocalBid = null; }
  lastPhase = S.phase; lastMaleId = S.currentMaleId;
  renderAll();
  if (S.phase === 'bidding' && S.roundEndsAt) startTimer();
});