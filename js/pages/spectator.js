/* =============================================================
 * spectator.js — Bảng trực tiếp cho khán giả / máy chiếu
 * -------------------------------------------------------------
 * Chỉ đọc. Không bao giờ hiện số tiền của bid đang mở (giữ kín).
 * Chỉ công bố kết quả khi phase = reveal.
 * ============================================================= */
import { SETTINGS, FEMALES, MALES, computeMinPrice } from '../config.js';
import { createInitialState, remaining, needed, balanceReport, bidBoard } from '../auction.js';
import { openRoom, remoteToState } from '../store.js';
import { qs, readRoleParam, esc, fmt, avatarHTML, startCountdown, bindStatus } from '../ui.js';

const ROOM = readRoleParam('room', 'main');

const room = openRoom(ROOM);
await room.connect();
bindStatus(room, 'netStatus');

let S = createInitialState(FEMALES);
let stopCountdown = null;

/* Nhãn trạng thái — khai báo SỚM để tránh lỗi TDZ khi callback realtime bắn về */
const phaseText = { lobby: 'Sảnh chờ', bidding: 'Đấu giá', reveal: 'Công bố', done: 'Hoàn tất' };

/** Ghép remote -> state; dùng ngân sách dự kiến nếu host chưa khởi tạo. */
function mergeState(remote) {
  const st = remoteToState(remote, FEMALES);
  if (!st) return S;
  if (!remote || !remote.teams || Object.keys(remote.teams).length === 0) {
    st.teams = createInitialState(FEMALES).teams;
  }
  return st;
}

function startTimer() {
  const el = document.getElementById('countdown');
  stopCountdown && stopCountdown();
  if (!el) return;
  if (S.phase !== 'bidding' || !S.roundEndsAt) { el.textContent = ''; return; }
  stopCountdown = startCountdown(el, S.roundEndsAt, () => {});
}

function renderAll() {
  const pill = document.getElementById('phasePill');
  pill.textContent = phaseText[S.phase] || S.phase;
  pill.className = `pill ${S.phase}`;

  renderAuction();
  renderTeams();
  renderBalance();
}

function renderAuction() {
  const box = document.getElementById('auctionArea');
  const revealBox = document.getElementById('revealBox');
  const panel = document.getElementById('malePanel');
  const maleId = S.currentMaleId || (S.reveal && S.reveal.maleId);

  if (!maleId) {
    panel.classList.add('hidden');
    box.innerHTML = '';
    revealBox.innerHTML = '';
    return;
  }
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
        <div class="countdown-sm" id="countdown"></div>
      </div>
    </div>`;

  // Công bố kết quả
  if (S.phase === 'reveal' && S.reveal) {
    const r = S.reveal;
    revealBox.innerHTML = `
      <div class="divider"></div>
      ${r.winnerId
        ? `<div class="reveal-banner">
             <div class="muted">${esc(m.name)} thuộc về</div>
             <div class="winner">${esc(nameF(r.winnerId))}</div>
             <div class="price">${fmt(r.price)} điểm</div>
           </div>`
        : `<div class="reveal-banner fail">
             <div class="winner">Không ai mua ${esc(m.name)}</div>
           </div>`}
      <div class="bid-list">
        ${r.entries.map((e, i) => `
          <div class="bid-row ${r.winnerId === e.femaleId ? 'win' : ''}">
            <span class="pos">${i + 1}</span>
            <span>${esc(nameF(e.femaleId))}</span>
            <span class="amount">${fmt(e.amount)}</span>
          </div>`).join('')}
      </div>`;
  } else if (S.phase === 'bidding') {
    const board = bidBoard(S.bids, MALES, SETTINGS);
    revealBox.innerHTML = board.length
      ? `<div class="divider"></div>
         <div class="live-board">
           <div class="live-head"><span>Giá cao nhất</span><b>${fmt(board[0].amount)}</b></div>
           <div class="live-leader">${esc(nameF(board[0].femaleId))} đang dẫn đầu</div>
           <div class="bid-list">${board.map((e, i) => `
             <div class="bid-row ${i === 0 ? 'win' : ''}">
               <span class="pos">${e.place}</span>
               <span>${esc(nameF(e.femaleId))}</span>
               <span class="amount">${fmt(e.amount)}</span>
             </div>`).join('')}</div>
         </div>`
      : '<p class="muted center mt">Chưa ai trả giá.</p>';
  } else {
    revealBox.innerHTML = '';
  }
}

/** Hàng đội gọn cho mobile. */
function teamRowHTML(t) {
  const f = FEMALES.find(x => x.id === t.femaleId);
  const names = [];
  for (let i = 0; i < SETTINGS.malesPerTeam; i++) {
    const mid = t.maleIds[i];
    names.push(mid ? esc((MALES.find(x => x.id === mid) || {}).name) : '—');
  }
  const full = needed(t, SETTINGS.malesPerTeam) === 0;
  return `<div class="team-row ${full ? '' : 'incomplete'}">
    ${avatarHTML(f, 'avatar-sm')}
    <div class="tr-body">
      <div class="tr-name">${esc(f.name)}</div>
      <div class="tr-males">${names.join(' · ')}</div>
    </div>
    <div class="tr-left"><b>${fmt(remaining(t))}</b><span>điểm</span></div>
  </div>`;
}

function renderTeams() {
  const done = Object.values(S.teams).filter(t => needed(t, SETTINGS.malesPerTeam) === 0).length;
  document.getElementById('teamsDone').textContent = `${done}/${FEMALES.length}`;
  document.getElementById('teams').innerHTML = Object.values(S.teams).map(teamRowHTML).join('');
}

function renderBalance() {
  const rep = balanceReport(S, FEMALES, MALES, SETTINGS);
  document.getElementById('stdLabel').textContent = `σ ${rep.stdDev.toFixed(2)}`;
  const v = document.getElementById('balanceVerdict');
  if (!rep.allComplete) {
    v.innerHTML = '<div class="warn-box">Chưa đủ đội hình.</div>';
  } else if (rep.balanced) {
    v.innerHTML = '<div class="ok-box">Đội hình cân bằng tốt.</div>';
  } else {
    v.innerHTML = `<div class="warn-box">Độ lệch ${rep.stdDev.toFixed(2)}.</div>`;
  }
}

function nameF(id) { return (FEMALES.find(f => f.id === id) || {}).name || id; }

renderAll();

/* Đăng ký realtime SAU khi mọi hàm/biến đã khởi tạo — tránh lỗi TDZ */
room.onState(remote => {
  S = mergeState(remote);
  renderAll();
  if (S.phase === 'bidding' && S.roundEndsAt) startTimer();
});