/* =============================================================
 * player.js — Màn hình của người chơi (nữ)
 * -------------------------------------------------------------
 * Chỉ ĐỌC state từ Realtime DB + ghi bid của chính mình.
 * Mọi tính toán hiển thị dùng chung engine (deterministic).
 * ============================================================= */
import { SETTINGS, FEMALES, MALES, computeMinPrice } from '../config.js';
import {
  createInitialState, remaining, needed, maxAllowedBid, bidBoard, nextValidBid, highestBid,
} from '../auction.js';
import { openRoom, remoteToState } from '../store.js';
import { qs, readRoleParam, esc, toast, fmt, avatarHTML, startCountdown, haptic, bindStatus } from '../ui.js';

const ROOM = readRoleParam('room', 'main');
const MY_ID = readRoleParam('f', 'F1');
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
 * ĐẶT GIÁ — ĐẤU GIÁ CÔNG KHAI
 * Người chơi gửi "ý định trả giá" lên Firebase; host là trọng tài
 * xác nhận và cập nhật giá dẫn cho mọi người cùng thấy.
 * ============================================================= */
const bidInput = document.getElementById('bidAmount');

function currentMinPrice() {
  const m = MALES.find(x => x.id === S.currentMaleId);
  return m ? computeMinPrice(m, MALES, SETTINGS) : 0;
}
function myTeam() { return S.teams[MY_ID] || { budget: 0, spent: 0, maleIds: [] }; }
function myLeft() { return remaining(myTeam()); }
/** Điểm tối đa được trả lượt này (đã trừ tiền dự phòng cho nam còn lại). */
function myMaxBid() {
  if (!S.currentMaleId) return myLeft();
  return maxAllowedBid({ femaleId: MY_ID, maleId: S.currentMaleId, state: S }, MALES, SETTINGS);
}
/** Giá tối thiểu để vượt người đang dẫn. */
function myMinToLead() {
  if (!S.currentMaleId) return 0;
  return nextValidBid(S.currentMaleId, S.bids, MALES, SETTINGS);
}
/** Người đang dẫn đầu lượt này (nếu có). */
function currentLeader() { return highestBid(S.bids, MALES, SETTINGS); }
function amLeading() { const l = currentLeader(); return !!l && l.femaleId === MY_ID; }

async function submitBid() {
  if (S.phase !== 'bidding' || !S.currentMaleId) return toast('Chưa tới lượt đấu giá.', 'err');
  if (amLeading()) return toast('Bạn đang dẫn đầu rồi.', 'err');

  const amount = Number(bidInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return toast('Nhập số điểm muốn trả.', 'err');
  }
  if (amount > myLeft()) return toast(`Chỉ còn ${myLeft()} điểm.`, 'err');

  const minLead = myMinToLead();
  if (amount < minLead) return toast(`Phải trả ít nhất ${fmt(minLead)} điểm.`, 'err');
  const max = myMaxBid();
  if (amount > max) return toast(`Tối đa ${fmt(max)} điểm (phải để dành mua nam còn lại).`, 'err');
  if ((amount - currentMinPrice()) % SETTINGS.minIncrement !== 0) {
    return toast(`Giá phải theo bước ${SETTINGS.minIncrement}.`, 'err');
  }

  document.getElementById('bidError').classList.add('hidden');
  await room.setBid(MY_ID, amount);      // công khai: ghi thẳng lên Firebase
  myLocalBid = amount;
  haptic(25);
  document.getElementById('bidStatus').innerHTML =
    `<div class="ok-box">Đã trả <b>${fmt(amount)}</b> điểm.</div>`;
  toast(`Đã trả ${fmt(amount)} điểm.`, 'ok');
}

/* ---------- Quick buttons ---------- */
document.querySelectorAll('[data-quick]').forEach(btn => {
  btn.addEventListener('click', () => {
    const q = btn.dataset.quick;
    const step = SETTINGS.minIncrement;
    const minLead = myMinToLead();
    let v = Number(bidInput.value) || 0;
    if (q === 'min') v = minLead;
    else if (q === 'plus') v = Math.max(minLead, v + step);
    else if (q === 'plus10') v = Math.max(minLead, v + 10);
    else if (q === 'max') v = myMaxBid();
    else if (q === 'skip') v = 0;
    bidInput.value = v;
    updateHint();
  });
});
bidInput.addEventListener('input', updateHint);
bidInput.addEventListener('focus', () => { if (!Number(bidInput.value)) { bidInput.value = myMinToLead(); updateHint(); } });
document.getElementById('btnBid').addEventListener('click', submitBid);

function updateHint() {
  const max = myMaxBid();
  const minLead = myMinToLead();
  const v = Number(bidInput.value) || 0;
  const hint = document.getElementById('bidHint');
  const leader = currentLeader();

  if (amLeading()) {
    hint.innerHTML = '<span style="color:var(--accent)">Bạn đang dẫn đầu — không cần trả thêm.</span>';
    return;
  }
  if (v > 0 && v < minLead) {
    hint.innerHTML = `<span style="color:var(--danger)">Phải trả ít nhất ${fmt(minLead)} điểm</span>`;
  } else if (v > max) {
    hint.innerHTML = `<span style="color:var(--danger)">Vượt tối đa ${fmt(max)} — phải để dành mua nam còn lại</span>`;
  } else {
    hint.innerHTML = leader
      ? `Đang dẫn: <b>${fmt(leader.amount)}</b> · Cần trả ≥ <b>${fmt(minLead)}</b> · Tối đa ${fmt(max)}`
      : `Chưa ai trả · Giá khởi điểm <b>${fmt(minLead)}</b> · Tối đa ${fmt(max)}`;
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
    bidInput.min = String(myMinToLead());
    // Gợi ý sẵn giá tối thiểu để vượt người đang dẫn
    if (myLocalBid === null) bidInput.value = myMinToLead();
    updateHint();
    if (!stopCountdown) startTimer();
  }

  // Khối trạng thái bid công khai (ai đang dẫn)
  const revealBox = document.getElementById('revealBox');
  if (S.phase === 'bidding') {
    revealBox.classList.remove('hidden');
    revealBox.innerHTML = renderLiveBoard();
  } else if (S.phase === 'reveal' && S.reveal) {
    revealBox.classList.remove('hidden');
    const r = S.reveal;
    const m = MALES.find(x => x.id === r.maleId);
    const iWon = r.winnerId === MY_ID;
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
               <div class="winner">Không ai trả giá cho ${esc(m.name)}</div>
             </div>`}
      ${renderBidRows(r.entries, r.winnerId)}
    `;
  } else {
    revealBox.classList.add('hidden');
    revealBox.innerHTML = '';
  }
}

/** Bảng bid trực tiếp: ai đang dẫn, mọi người thấy hết. */
function renderLiveBoard() {
  const board = bidBoard(S.bids, MALES, SETTINGS);
  const mine = board.find(b => b.femaleId === MY_ID);

  if (!board.length) {
    return `<div class="divider"></div>
      <p class="muted center">Chưa ai trả giá — mở màn với <b>${fmt(myMinToLead())}</b> điểm.</p>`;
  }
  return `<div class="divider"></div>
    <div class="live-board">
      <div class="live-head">
        <span>Giá cao nhất</span>
        <b>${fmt(board[0].amount)}</b>
      </div>
      <div class="live-leader">
        ${esc(nameOfFemale(board[0].femaleId))}${board[0].femaleId === MY_ID ? ' (bạn)' : ''}
        đang dẫn đầu
      </div>
      <div class="bid-list">${renderBidRows(board, board[0].femaleId)}</div>
      ${mine && mine.leading
        ? '<div class="ok-box mt center">Bạn đang dẫn đầu — giữ vững!</div>'
        : `<div class="warn-box mt center">Cần trả ít nhất <b>${fmt(myMinToLead())}</b> điểm để vượt.</div>`}
    </div>`;
}

function renderBidRows(entries, winnerId) {
  return `<div class="bid-list">${(entries || []).map((e, i) => `
    <div class="bid-row ${e.femaleId === winnerId ? 'win' : ''}">
      <span class="pos">${e.place || i + 1}</span>
      <span>${esc(nameOfFemale(e.femaleId))}${e.femaleId === MY_ID ? ' <span class="tag">bạn</span>' : ''}</span>
      <span class="amount">${fmt(e.amount)}</span>
    </div>`).join('')}</div>`;
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

/* Rời phòng -> host thấy offline ngay */
window.addEventListener('pagehide', () => room.clearPresence());
window.addEventListener('beforeunload', () => room.clearPresence());