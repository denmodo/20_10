/* =============================================================
 * host.js — Bảng điều khiển của Host (trọng tài)
 * -------------------------------------------------------------
 * Host giữ STATE CHÍNH (authoritative) trong bộ nhớ + localStorage
 * (để F5 không mất), và mirror lên Realtime DB cho người chơi xem.
 * ============================================================= */
import { SETTINGS, FEMALES, MALES, computeMinPrice, budgetTable, priceTable } from '../config.js';
import {
  createInitialState, startRound, advanceRound, resolveAuction,
  fillRemaining, balanceReport, remaining, needed, nextMaleForAuction, isFinished,
} from '../auction.js';
import { openRoom } from '../store.js';
import { qs, esc, toast, fmt, avatarHTML, initials, showModeBadge, startCountdown, bindStatus } from '../ui.js';

const ROOM = qs('room', 'demo');
const BACKUP_KEY = `hostState:${ROOM}`;

document.getElementById('roomCode').textContent = ROOM;
document.getElementById('eventName').textContent = SETTINGS.eventName;
showModeBadge();

/* ---------- STATE ---------- */
let S = loadBackup() || createInitialState(FEMALES);
let remoteBids = {};
let stopCountdown = null;
let revealing = false;

/* Nhãn trạng thái — khai báo SỚM để tránh lỗi TDZ khi callback realtime bắn về */
const phaseText = { lobby: 'Sảnh chờ', bidding: 'Đang đấu giá', reveal: 'Công bố', done: 'Hoàn tất' };

function loadBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.teams ? s : null;
  } catch { return null; }
}
function saveBackup() {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(S)); } catch {}
}

/* ---------- KẾT NỐI ---------- */
const room = openRoom(ROOM);
await room.connect();
room.onState(remote => {
  if (!remote) return;
  remoteBids = remote.bids || {};
  renderPresenceFromState(remote);
  renderControls();
});

await room.setHostOnline(true);
room.setPresence({ role: 'host', name: 'Host' });
room.onPresence(list => renderPresence(list));
bindStatus(room, 'hostOnline');

/* Ghi state hiện tại lên remote khi mở phòng */
await pushAll();

/* =============================================================
 * ĐỒNG BỘ LÊN REMOTE
 * ============================================================= */
async function pushAll() {
  await room.initTeams(S.teams);
  await room.writeTeams(S.teams);
  await pushMeta();
  await room.writeLog(S.log);
}

async function pushMeta() {
  await room.updateMeta({
    phase: S.phase,
    round: S.round,
    currentMaleId: S.currentMaleId,
    reveal: S.reveal,
    usedMales: S.usedMales.reduce((o, id) => (o[id] = true, o), {}),
    boughtMaleIds: S.boughtMaleIds.reduce((o, id) => (o[id] = true, o), {}),
    roundEndsAt: S.roundEndsAt || 0,
  });
  await room.writeLog(S.log);
}

/* =============================================================
 * HÀNH ĐỘNG CỦA HOST
 * ============================================================= */
async function actionStart() {
  S = startRound(S, MALES);
  if (S.phase === 'done') return finish();
  S.roundEndsAt = Date.now() + SETTINGS.bidSeconds * 1000;
  await room.clearBids();
  saveBackup();
  await pushAll();
  renderAll();
  toast(`Vòng ${S.round} — đấu giá ${nameOfMale(S.currentMaleId)}`, 'ok');
  startTimer();
}

async function actionExtend() {
  if (S.phase !== 'bidding') return;
  S.roundEndsAt = Math.max(Date.now(), S.roundEndsAt) + 30000;
  saveBackup();
  await pushMeta();
  renderControls();
  startTimer();
  toast('Gia hạn thêm 30 giây', 'ok');
}

async function actionReveal() {
  if (S.phase !== 'bidding' || revealing) return;
  revealing = true;
  stopCountdown && stopCountdown();

  // Lấy bid mới nhất từ remote (nguồn sự thật cuối cùng)
  S.bids = { ...remoteBids };
  S = resolveAuction(S, MALES, SETTINGS);
  saveBackup();
  await pushAll();
  renderAll();
  revealing = false;

  const r = S.reveal;
  if (r.winnerId) {
    toast(`🏆 ${nameOfFemale(r.winnerId)} thắng ${nameOfMale(r.maleId)} với ${r.price} điểm`, 'ok');
  } else {
    toast(`Không ai mua ${nameOfMale(r.maleId)} — sẽ gán ở vòng bổ sung.`);
  }
  checkAutoFinish();
}

async function actionNext() {
  const male = nextMaleForAuction(S, MALES);
  if (!male) return finish();
  S = advanceRound(S, MALES);
  if (S.phase === 'done') return finish();
  S.roundEndsAt = Date.now() + SETTINGS.bidSeconds * 1000;
  await room.clearBids();
  saveBackup();
  await pushAll();
  renderAll();
  toast(`Vòng ${S.round} — đấu giá ${nameOfMale(S.currentMaleId)}`, 'ok');
  startTimer();
}

async function actionFill() {
  S = fillRemaining(S, MALES, SETTINGS, FEMALES);
  S.phase = 'done';
  S.currentMaleId = null;
  S.reveal = null;
  saveBackup();
  await pushAll();
  renderAll();
  toast('Đã chạy vòng bổ sung.', 'ok');
}

async function actionReset() {
  if (!confirm('Xoá toàn bộ kết quả và chơi lại từ đầu?')) return;
  localStorage.removeItem(BACKUP_KEY);
  S = createInitialState(FEMALES);
  await room.clearBids();
  saveBackup();
  await pushAll();
  renderAll();
  toast('Đã reset phòng.', 'ok');
}

function finish() {
  S.phase = 'done';
  return actionFill();
}

function checkAutoFinish() {
  if (isFinished(S, SETTINGS)) {
    toast('Mọi đội đã đủ nam!', 'ok');
  }
}

/* ---------- ĐỒNG HỒ ---------- */
function startTimer() {
  stopCountdown && stopCountdown();
  const el = document.getElementById('countdown');
  if (!el || S.phase !== 'bidding') return;
  stopCountdown = startCountdown(el, S.roundEndsAt, () => {
    if (S.phase === 'bidding') actionReveal();
  });
}

/* =============================================================
 * RENDER
 * ============================================================= */
function renderAll() {
  renderControls();
  renderAuction();
  renderMalesList();
  renderTeams();
  renderBalance();
  renderLog();
}

function renderControls() {
  const pill = document.getElementById('phasePill');
  pill.textContent = phaseText[S.phase] || S.phase;
  pill.className = `pill ${S.phase}`;
  document.getElementById('roundLabel').textContent = `Vòng ${S.round} / ${SETTINGS.rounds}`;

  document.getElementById('lobbyBox').classList.toggle('hidden', S.phase !== 'lobby');
  document.getElementById('biddingBox').classList.toggle('hidden', S.phase !== 'bidding');
  document.getElementById('revealBox').classList.toggle('hidden', S.phase !== 'reveal');
  document.getElementById('doneBox').classList.toggle('hidden', S.phase !== 'done');

  if (S.phase === 'lobby') {
    document.getElementById('btnStart').textContent = `▶️ Bắt đầu vòng ${S.round}`;
  }

  if (S.phase === 'bidding') {
    const bids = Object.entries(remoteBids).filter(([, v]) => Number(v) > 0);
    document.getElementById('bidCount').textContent = bids.length;
    const mustBuy = Object.values(S.teams).filter(t => needed(t, SETTINGS.malesPerTeam) >= SETTINGS.malesPerTeam).length;
    document.getElementById('needCount').textContent = mustBuy;
    if (!stopCountdown) startTimer();
  }

  if (S.phase === 'reveal') renderReveal();
}

function renderReveal() {
  const r = S.reveal;
  const banner = document.getElementById('revealBanner');
  const list = document.getElementById('revealList');
  if (!r) { banner.innerHTML = ''; list.innerHTML = ''; return; }

  if (r.winnerId) {
    banner.innerHTML = `
      <div class="reveal-banner">
        <div class="muted">${esc(nameOfMale(r.maleId))} (hạng ${rankOfMale(r.maleId)}) thuộc về</div>
        <div class="winner">🏆 ${esc(nameOfFemale(r.winnerId))}</div>
        <div class="price">${fmt(r.price)} điểm</div>
      </div>`;
  } else {
    banner.innerHTML = `
      <div class="reveal-banner">
        <div class="winner">Không ai mua ${esc(nameOfMale(r.maleId))}</div>
        <div class="muted mt">Nam này sẽ được gán tự động ở vòng bổ sung.</div>
      </div>`;
  }

  list.innerHTML = r.entries.length ? r.entries.map((e, i) => `
    <div class="bid-row ${i === 0 && r.winnerId === e.femaleId ? 'win' : ''}">
      <span class="pos">${i + 1}</span>
      <span>${esc(nameOfFemale(e.femaleId))}</span>
      <span class="muted" style="font-size:.75rem">còn lại ${e.leftAfter}</span>
      <span class="amount">${fmt(e.amount)}</span>
    </div>`).join('')
    : '<p class="muted center">Không có bid nào.</p>';

  const lastRound = S.usedMales.length >= MALES.length || isFinished(S, SETTINGS);
  document.getElementById('btnNext').classList.toggle('hidden', lastRound);
}

function renderAuction() {
  const box = document.getElementById('auctionArea');
  const maleId = S.currentMaleId || (S.reveal && S.reveal.maleId);
  if (!maleId) {
    box.innerHTML = '<p class="muted center">Chưa bắt đầu. Bấm “Bắt đầu vòng”.</p>';
    return;
  }
  const m = MALES.find(x => x.id === maleId);
  const minP = computeMinPrice(m, MALES, SETTINGS);
  const teamsTotal = budgetTable(FEMALES, SETTINGS).reduce((a, b) => a + b.budget, 0);
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
    </div>
    <p class="muted center">Tổng ngân sách cả giải: <b>${fmt(teamsTotal)}</b> điểm</p>`;
}

function renderMalesList() {
  const left = MALES.filter(m => !S.boughtMaleIds.includes(m.id));
  document.getElementById('malesLeft').textContent = `${left.length} còn lại`;
  const plist = priceTable(MALES, SETTINGS);
  document.getElementById('malesList').innerHTML = MALES.map(m => {
    const p = plist.find(x => x.id === m.id);
    const owner = Object.values(S.teams).find(t => t.maleIds.includes(m.id));
    const cls = owner ? 'taken' : (m.id === S.currentMaleId ? 'highlight' : '');
    return `<div class="row-item ${cls}">
      ${avatarHTML(m, 'avatar-sm')}
      <span class="rank-pill">#${m.rank}</span>
      <span class="r-name">${esc(m.name)}</span>
      ${owner ? `<span class="muted" style="font-size:.74rem">${esc(nameOfFemale(owner.femaleId))}</span>` : ''}
      <span class="r-price">${fmt(p.minPrice)}</span>
    </div>`;
  }).join('');
}

function renderTeams() {
  const done = Object.values(S.teams).filter(t => needed(t, SETTINGS.malesPerTeam) === 0).length;
  document.getElementById('teamsDone').textContent = `${done}/${FEMALES.length}`;

  document.getElementById('teams').innerHTML = Object.values(S.teams).map(t => {
    const f = FEMALES.find(x => x.id === t.femaleId);
    const left = remaining(t);
    const pct = Math.round((t.spent / t.budget) * 100);
    const slots = [];
    for (let i = 0; i < SETTINGS.malesPerTeam; i++) {
      const mid = t.maleIds[i];
      if (mid) {
        const m = MALES.find(x => x.id === mid);
        slots.push(`<div class="member">${avatarHTML(m, 'avatar-sm')} <span>${esc(m.name)}</span>
          <span class="muted" style="margin-left:auto;font-size:.72rem">#${m.rank}</span></div>`);
      } else {
        slots.push('<div class="member"><span class="slot-empty">— chưa có nam —</span></div>');
      }
    }
    return `<div class="team-card ${needed(t, SETTINGS.malesPerTeam) ? 'incomplete' : ''}">
      <div class="team-head">
        ${avatarHTML(f, 'avatar')}
        <div>
          <div class="t-name">${esc(f.name)}</div>
          <div class="t-strength">${'★'.repeat(Math.round(f.strength / 2))} · ${f.strength}/10</div>
        </div>
      </div>
      <div class="team-members">${slots.join('')}</div>
      <div class="budget-bar"><i style="width:${pct}%"></i></div>
      <div class="team-foot">
        <span>Ngân sách <b>${fmt(t.budget)}</b></span>
        <span>Đã chi <b>${fmt(t.spent)}</b></span>
        <span>Còn <b>${fmt(left)}</b></span>
      </div>
    </div>`;
  }).join('');
}

function renderBalance() {
  const rep = balanceReport(S, FEMALES, MALES, SETTINGS);
  document.getElementById('statMean').textContent = rep.mean.toFixed(1);
  document.getElementById('statStd').textContent = rep.stdDev.toFixed(2);
  document.getElementById('balanceStd').textContent = `σ = ${rep.stdDev.toFixed(2)}`;
  const totalLeft = Object.values(S.teams).reduce((a, t) => a + remaining(t), 0);
  document.getElementById('statLeft').textContent = fmt(totalLeft);

  const v = document.getElementById('balanceVerdict');
  if (!rep.allComplete) {
    v.innerHTML = '<div class="warn-box">Chưa đủ đội hình — hãy đấu giá tiếp hoặc chạy vòng bổ sung.</div>';
  } else if (rep.balanced) {
    v.innerHTML = '<div class="ok-box">✅ Đội hình cân bằng tốt. Sẵn sàng thi đấu!</div>';
  } else {
    v.innerHTML = `<div class="warn-box">⚠️ Độ lệch sức mạnh ${rep.stdDev.toFixed(2)} > ${SETTINGS.balanceWarnStdDev}. Cân nhắc thương lượng hoặc bốc thăm lại.</div>`;
  }
}

function renderLog() {
  document.getElementById('logCount').textContent = S.log.length;
  const el = document.getElementById('logList');
  if (!S.log.length) { el.innerHTML = '<p class="muted center">Chưa có lượt nào.</p>'; return; }
  el.innerHTML = [...S.log].reverse().map(l => {
    const m = MALES.find(x => x.id === l.maleId);
    const label = l.round === 'fill' ? 'Bổ sung' : `Vòng ${l.round}`;
    return `<div class="row-item">
      <span class="rank-pill" style="min-width:52px;font-size:.66rem">${label}</span>
      <span class="r-name">${esc(m ? m.name : l.maleId)}</span>
      ${l.winnerId
        ? `<span class="muted" style="font-size:.78rem">→ ${esc(nameOfFemale(l.winnerId))}</span>
           <span class="r-price">${fmt(l.price)}</span>`
        : '<span class="muted" style="font-size:.78rem">không ai mua</span>'}
    </div>`;
  }).join('');
}

function renderPresence(list) {
  const el = document.getElementById('presence');
  const online = list.filter(p => p.role !== 'host');
  document.getElementById('presenceCount').textContent = `${online.length + 1} online`;
  const hostDot = `<span class="p-dot"><span class="led"></span>Host</span>`;
  el.innerHTML = hostDot + FEMALES.map(f => {
    const p = online.find(x => x.femaleId === f.id);
    return p ? `<span class="p-dot"><span class="led"></span>${esc(f.name)}</span>`
      : `<span class="p-dot off"><span class="led"></span>${esc(f.name)}</span>`;
  }).join('');
}

function renderPresenceFromState(remote) {
  if (!remote) return;
  renderControls();
}

/* ---------- HELPERS ---------- */
function nameOfFemale(id) { return (FEMALES.find(f => f.id === id) || {}).name || id; }
function nameOfMale(id) { return (MALES.find(m => m.id === id) || {}).name || id; }
function rankOfMale(id) { return (MALES.find(m => m.id === id) || {}).rank ?? '?'; }

/* ---------- BIND ---------- */
document.getElementById('btnStart').addEventListener('click', actionStart);
document.getElementById('btnReveal').addEventListener('click', actionReveal);
document.getElementById('btnExtend').addEventListener('click', actionExtend);
document.getElementById('btnNext').addEventListener('click', actionNext);
document.getElementById('btnSkipToFill').addEventListener('click', actionFill);
document.getElementById('btnFill2').addEventListener('click', actionFill);
document.getElementById('btnReset').addEventListener('click', actionReset);

window.addEventListener('beforeunload', () => room.setHostOnline(false));

/* ---------- BOOT ---------- */
renderAll();
if (S.phase === 'bidding' && S.roundEndsAt) startTimer();