/* =============================================================
 * spectator.js — Bảng trực tiếp cho khán giả / máy chiếu
 * -------------------------------------------------------------
 * Chỉ đọc. Không bao giờ hiện số tiền của bid đang mở (giữ kín).
 * Chỉ công bố kết quả khi phase = reveal.
 * ============================================================= */
import { SETTINGS, FEMALES, MALES, computeMinPrice, priceTable } from '../config.js';
import { createInitialState, remaining, needed, balanceReport, teamStrength } from '../auction.js';
import { openRoom, remoteToState } from '../store.js';
import { qs, esc, fmt, avatarHTML, showModeBadge, startCountdown, bindStatus } from '../ui.js';

const ROOM = qs('room', 'demo');
document.getElementById('roomCode').textContent = ROOM;
document.getElementById('eventName').textContent = SETTINGS.eventName;
showModeBadge();

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
  const el = document.getElementById('sCountdown');
  stopCountdown && stopCountdown();
  if (S.phase !== 'bidding' || !S.roundEndsAt) { el.textContent = '--:--'; return; }
  stopCountdown = startCountdown(el, S.roundEndsAt, () => {});
}

function renderAll() {
  const pill = document.getElementById('phasePill');
  pill.textContent = phaseText[S.phase] || S.phase;
  pill.className = `pill ${S.phase}`;
  document.getElementById('sPhase').textContent = phaseText[S.phase] || S.phase;
  document.getElementById('sRound').textContent = `${S.round}/${SETTINGS.rounds}`;

  // Chỉ đếm ai đã bid, KHÔNG hiện số tiền
  const bidCount = Object.values(S.bids || {}).filter(v => Number(v) > 0).length;
  document.getElementById('sBidders').textContent = bidCount;

  renderAuction();
  renderMales();
  renderTeams();
  renderLog();
  renderBalance();
}

function renderAuction() {
  const box = document.getElementById('auctionArea');
  const revealBox = document.getElementById('revealBox');
  const maleId = S.currentMaleId || (S.reveal && S.reveal.maleId);

  if (!maleId) {
    box.innerHTML = '<p class="muted center">Chưa bắt đầu.</p>';
    revealBox.innerHTML = '';
    return;
  }
  const m = MALES.find(x => x.id === maleId);
  const minP = computeMinPrice(m, MALES, SETTINGS);
  box.innerHTML = `
    <div class="male-hero">
      ${avatarHTML(m, 'big-avatar')}
      <div class="m-name">${esc(m.name)}</div>
      <div class="mt"><span class="badge-rank ${m.rank > 6 ? 'low' : ''}">Hạng ${m.rank} / ${MALES.length}</span></div>
      <div class="m-meta">
        <div>Giá sàn<b>${fmt(minP)}</b></div>
        <div>Bước giá<b>${fmt(SETTINGS.minIncrement)}</b></div>
        <div>Điểm mạnh<b>${MALES.length - m.rank + 1}</b></div>
      </div>
    </div>`;

  // Công bố kết quả
  if (S.phase === 'reveal' && S.reveal) {
    const r = S.reveal;
    revealBox.innerHTML = `
      <div class="divider"></div>
      ${r.winnerId
        ? `<div class="reveal-banner">
             <div class="winner">🏆 ${esc(nameF(r.winnerId))} thắng ${esc(m.name)}</div>
             <div class="price">${fmt(r.price)} điểm</div>
           </div>`
        : `<div class="reveal-banner" style="background:rgba(255,93,115,.12);border-color:rgba(255,93,115,.35)">
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
    revealBox.innerHTML = '<p class="muted center mt">🔒 Bid đang được giữ kín tới khi host chốt lượt.</p>';
  } else {
    revealBox.innerHTML = '';
  }
}

function renderMales() {
  const left = MALES.filter(m => !S.boughtMaleIds.includes(m.id));
  document.getElementById('malesLeft').textContent = `${left.length} còn lại`;
  const plist = priceTable(MALES, SETTINGS);
  document.getElementById('malesList').innerHTML = MALES.map(m => {
    const p = plist.find(x => x.id === m.id);
    const owner = Object.values(S.teams).find(t => t.maleIds.includes(m.id));
    return `<div class="row-item ${owner ? 'taken' : (m.id === S.currentMaleId ? 'highlight' : '')}">
      ${avatarHTML(m, 'avatar-sm')}
      <span class="rank-pill">#${m.rank}</span>
      <span class="r-name">${esc(m.name)}</span>
      ${owner ? `<span class="muted" style="font-size:.74rem">${esc(nameF(owner.femaleId))}</span>` : ''}
      <span class="r-price">${fmt(p.minPrice)}</span>
    </div>`;
  }).join('');
}

function renderTeams() {
  const done = Object.values(S.teams).filter(t => needed(t, SETTINGS.malesPerTeam) === 0).length;
  document.getElementById('teamsDone').textContent = `${done}/${FEMALES.length}`;

  document.getElementById('teams').innerHTML = Object.values(S.teams).map(t => {
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
    return `<div class="team-card ${needed(t, SETTINGS.malesPerTeam) ? 'incomplete' : ''}">
      <div class="team-head">
        ${avatarHTML(f, 'avatar')}
        <div>
          <div class="t-name">${esc(f.name)}</div>
          <div class="t-strength">Sức mạnh: ${teamStrength(t, FEMALES, MALES)}</div>
        </div>
      </div>
      <div class="team-members">${slots.join('')}</div>
      <div class="team-foot">
        <span>Ngân sách <b>${fmt(t.budget)}</b></span>
        <span>Đã chi <b>${fmt(t.spent)}</b></span>
        <span>Còn <b>${fmt(remaining(t))}</b></span>
      </div>
    </div>`;
  }).join('');
}

function renderLog() {
  document.getElementById('logCount').textContent = (S.log || []).length;
  const el = document.getElementById('logList');
  if (!S.log || !S.log.length) { el.innerHTML = '<p class="muted center">Chưa có lượt nào.</p>'; return; }
  el.innerHTML = [...S.log].reverse().map(l => {
    const m = MALES.find(x => x.id === l.maleId);
    const label = l.round === 'fill' ? 'Bổ sung' : `Vòng ${l.round}`;
    return `<div class="row-item">
      <span class="rank-pill" style="min-width:52px;font-size:.66rem">${label}</span>
      <span class="r-name">${esc(m ? m.name : l.maleId)}</span>
      ${l.winnerId
        ? `<span class="muted" style="font-size:.78rem">→ ${esc(nameF(l.winnerId))}</span>
           <span class="r-price">${fmt(l.price)}</span>`
        : '<span class="muted" style="font-size:.78rem">không ai mua</span>'}
    </div>`;
  }).join('');
}

function renderBalance() {
  const rep = balanceReport(S, FEMALES, MALES, SETTINGS);
  document.getElementById('stdLabel').textContent = `σ = ${rep.stdDev.toFixed(2)}`;
  const v = document.getElementById('balanceVerdict');
  if (!rep.allComplete) {
    v.innerHTML = '<div class="warn-box">Chưa đủ đội hình.</div>';
  } else if (rep.balanced) {
    v.innerHTML = '<div class="ok-box">✅ Đội hình cân bằng tốt. Sẵn sàng thi đấu!</div>';
  } else {
    v.innerHTML = `<div class="warn-box">⚠️ Độ lệch ${rep.stdDev.toFixed(2)} > ${SETTINGS.balanceWarnStdDev}.</div>`;
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