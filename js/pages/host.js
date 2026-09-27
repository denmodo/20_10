/* =============================================================
 * host.js — Bảng điều khiển của Host (trọng tài)
 * -------------------------------------------------------------
 * Host giữ STATE CHÍNH (authoritative) trong bộ nhớ + localStorage
 * (để F5 không mất), và mirror lên Realtime DB cho người chơi xem.
 * ============================================================= */
import { SETTINGS, FEMALES, MALES, computeMinPrice } from '../config.js';
import {
  createInitialState, startRound, advanceRound, resolveAuction,
  fillRemaining, balanceReport, remaining, needed, nextMaleForAuction, isFinished,
  applyBid, bidBoard,
} from '../auction.js';
import { openRoom, remoteToState } from '../store.js';
import { qs, readRoleParam, esc, toast, fmt, avatarHTML, startCountdown, bindStatus } from '../ui.js';

const ROOM = readRoleParam('room', 'main');


/* ---------- STATE ---------- */
let S = createInitialState(FEMALES);
let remoteBids = {};
let remotePending = {};
let stopCountdown = null;
let revealing = false;
let booted = false;   // đã khôi phục state từ Firebase lần đầu
let processing = false;

/* Nhãn trạng thái — khai báo SỚM để tránh lỗi TDZ khi callback realtime bắn về */
const phaseText = { lobby: 'Sảnh chờ', bidding: 'Đang đấu giá', reveal: 'Công bố', done: 'Hoàn tất' };

/* ---------- KẾT NỐI ---------- */
const room = openRoom(ROOM);
await room.connect();
room.onState(async remote => {
  remoteBids = (remote && remote.bids) || {};
  remotePending = (remote && remote.pending) || {};

  // Lần đầu: khôi phục state từ Firebase (nguồn chân lý) để F5 không mất dữ liệu
  if (!booted) {
    booted = true;
    const restored = remoteToState(remote, FEMALES);
    if (restored && remote && remote.teams && Object.keys(remote.teams).length) {
      S = restored;
      renderAll();
      if (S.phase === 'bidding' && S.roundEndsAt) startTimer();
      return;
    }
    await pushAll();      // phòng mới -> tạo đội hình trên Firebase
    renderAll();
    return;
  }

  processPendingBids();   // trọng tài xác nhận các bid vừa gửi
  renderControls();
});

await room.setHostOnline(true);
room.setPresence({ role: 'host', name: 'Host' });
room.onPresence(list => renderPresence(list));
bindStatus(room, 'netStatus');

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
  await pushAll();
  renderAll();
  toast(`Vòng ${S.round} — đấu giá ${nameOfMale(S.currentMaleId)}`, 'ok');
  startTimer();
}

async function actionExtend() {
  if (S.phase !== 'bidding') return;
  S.roundEndsAt = Math.max(Date.now(), S.roundEndsAt) + 30000;
  await pushMeta();
  renderControls();
  startTimer();
  toast('Gia hạn thêm 30 giây', 'ok');
}

/**
 * TRỌNG TÀI XÁC NHẬN BID
 * Người chơi gửi ý định vào /pending. Host đọc, kiểm tra hợp lệ rồi
 * ghi vào /bids để mọi người cùng thấy. Nhờ vậy:
 *  - Không ai tự ý sửa giá trực tiếp (chống gian lận)
 *  - Xử lý tuần tự -> không tranh chấp khi nhiều người trả cùng lúc
 *  - Giá luôn tăng đúng bước giá so với người đang dẫn
 */
async function processPendingBids() {
  if (processing || S.phase !== 'bidding' || !S.currentMaleId) return;
  processing = true;
  try {
    // Sắp xếp theo thời điểm gửi để xử lý công bằng
    const queue = Object.entries(remotePending)
      .map(([femaleId, v]) => ({ femaleId, amount: Number(v && v.amount), ts: (v && v.ts) || 0 }))
      .filter(e => Number.isFinite(e.amount))
      .sort((a, b) => a.ts - b.ts);

    if (!queue.length) return;

    let changed = false;
    let extended = false;

    for (const q of queue) {
      // Bỏ qua nếu người này đã được ghi giá rồi
      if (S.bids[q.femaleId] === q.amount) continue;

      const res = applyBid(S, q.femaleId, q.amount, MALES, SETTINGS);
      if (!res.ok) {
        toast(`${nameOfFemale(q.femaleId)}: ${res.error}`, 'err');
        continue;
      }
      S = res.state;
      changed = true;
      if (res.extended) extended = true;
    }

    if (changed) {
      await room.writeBids(S.bids, S.roundEndsAt);
      if (extended) {
        toast('⏱ Có người trả phút chót — gia hạn thêm!', 'ok');
        startTimer();
      }
      renderAuction();
      renderLiveBoard();
    }
    await room.clearPending();
  } finally {
    processing = false;
  }
}

async function actionReveal() {
  if (S.phase !== 'bidding' || revealing) return;
  revealing = true;
  stopCountdown && stopCountdown();

  // Lấy bid mới nhất từ remote (nguồn sự thật cuối cùng)
  S.bids = { ...remoteBids };
  S = resolveAuction(S, MALES, SETTINGS);
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
  await pushAll();
  renderAll();
  toast('Đã chạy vòng bổ sung.', 'ok');
}

/**
 * Reset TOÀN BỘ: xoá sạch phòng trên backend, đưa về sảnh chờ,
 * tạo lại đội hình với ngân sách ban đầu. Xác nhận bằng hộp thoại đẹp.
 */
async function actionReset() {
  const ok = await confirmDialog({
    title: 'Reset toàn bộ?',
    message: 'Toàn bộ kết quả đấu giá, đội hình và bid sẽ bị xoá sạch trên mọi thiết bị. '
      + 'Không thể hoàn tác.',
    confirmText: 'Xoá hết',
  });
  if (!ok) return;

  // Xoay icon cho phản hồi trực quan
  const icon = document.getElementById('btnResetTop');
  icon && icon.classList.add('spin');

  stopCountdown && stopCountdown();
  stopCountdown = null;
  revealing = false;

  S = createInitialState(FEMALES);
  await room.resetRoom(S.teams);     // xoá sạch + tạo lại đội hình trên backend
  await pushAll();

  renderAll();
  startTimer();
  toast('Đã reset toàn bộ phòng.', 'ok');
  setTimeout(() => icon && icon.classList.remove('spin'), 800);
}

/** Hộp thoại xác nhận dạng promise (thay cho confirm() của trình duyệt). */
function confirmDialog({ title, message, confirmText = 'Đồng ý', cancelText = 'Huỷ' }) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'confirm-overlay';
    ov.innerHTML = `
      <div class="confirm-box">
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="btn-row">
          <button class="btn btn-ghost" data-act="cancel">${esc(cancelText)}</button>
          <button class="btn btn-danger" data-act="ok">${esc(confirmText)}</button>
        </div>
      </div>`;
    const done = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    ov.addEventListener('click', e => {
      const act = e.target.closest('[data-act]');
      if (act) return done(act.dataset.act === 'ok');
      if (e.target === ov) done(false);           // bấm nền để huỷ
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    ov.querySelector('[data-act="ok"]').focus();
  });
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
  renderTeams();
  renderBalance();
}

function renderControls() {
  const pill = document.getElementById('phasePill');
  pill.textContent = phaseText[S.phase] || S.phase;
  pill.className = `pill ${S.phase}`;

  document.getElementById('lobbyBox').classList.toggle('hidden', S.phase !== 'lobby');
  document.getElementById('biddingBox').classList.toggle('hidden', S.phase !== 'bidding');
  document.getElementById('revealBox').classList.toggle('hidden', S.phase !== 'reveal');
  document.getElementById('doneBox').classList.toggle('hidden', S.phase !== 'done');

  if (S.phase === 'lobby') {
    document.getElementById('btnStart').textContent = `Bắt đầu vòng ${S.round}`;
  }

  if (S.phase === 'bidding') {
    const bids = Object.entries(remoteBids).filter(([, v]) => Number(v) > 0);
    document.getElementById('bidCount').textContent = bids.length;
    renderLiveBoard();
    if (!stopCountdown) startTimer();
  }

  if (S.phase === 'reveal') renderReveal();
}

/** Bảng bid công khai ngay trên màn host. */
function renderLiveBoard() {
  const box = document.getElementById('liveBoard');
  if (!box) return;
  const board = bidBoard(S.bids, MALES, SETTINGS);
  if (!board.length) {
    box.innerHTML = '<p class="muted center">Chưa ai trả giá.</p>';
    return;
  }
  box.innerHTML = `
    <div class="live-head">
      <span>Giá cao nhất</span>
      <b>${fmt(board[0].amount)}</b>
    </div>
    <div class="live-leader">${esc(nameOfFemale(board[0].femaleId))} đang dẫn đầu</div>
    <div class="bid-list">${board.map((e, i) => `
      <div class="bid-row ${i === 0 ? 'win' : ''}">
        <span class="pos">${e.place}</span>
        <span>${esc(nameOfFemale(e.femaleId))}</span>
        <span class="amount">${fmt(e.amount)}</span>
      </div>`).join('')}</div>`;
}

function renderReveal() {
  const r = S.reveal;
  const banner = document.getElementById('revealBanner');
  const list = document.getElementById('revealList');
  if (!r) { banner.innerHTML = ''; list.innerHTML = ''; return; }

  if (r.winnerId) {
    banner.innerHTML = `
      <div class="reveal-banner">
        <div class="muted">${esc(nameOfMale(r.maleId))} thuộc về</div>
        <div class="winner">${esc(nameOfFemale(r.winnerId))}</div>
        <div class="price">${fmt(r.price)} điểm</div>
      </div>`;
  } else {
    banner.innerHTML = `
      <div class="reveal-banner fail">
        <div class="winner">Không ai mua ${esc(nameOfMale(r.maleId))}</div>
        <div class="muted mt">Sẽ gán ở vòng bổ sung.</div>
      </div>`;
  }

  list.innerHTML = r.entries.length ? r.entries.map((e, i) => `
    <div class="bid-row ${i === 0 && r.winnerId === e.femaleId ? 'win' : ''}">
      <span class="pos">${i + 1}</span>
      <span>${esc(nameOfFemale(e.femaleId))}</span>
      <span class="amount">${fmt(e.amount)}</span>
    </div>`).join('')
    : '<p class="muted center">Không có bid nào.</p>';

  const lastRound = S.usedMales.length >= MALES.length || isFinished(S, SETTINGS);
  document.getElementById('btnNext').classList.toggle('hidden', lastRound);
}

function renderAuction() {
  const box = document.getElementById('auctionArea');
  const panel = document.getElementById('malePanel');
  const maleId = S.currentMaleId || (S.reveal && S.reveal.maleId);
  if (!maleId) {
    panel.classList.add('hidden');
    box.innerHTML = '';
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
        <div>Bước giá<b>${fmt(SETTINGS.minIncrement)}</b></div>
      </div>
    </div>`;
}

/** Hàng đội gọn cho mobile: nữ + tên 2 nam + điểm còn lại. */
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
  document.getElementById('balanceStd').textContent = `σ ${rep.stdDev.toFixed(2)}`;

  const v = document.getElementById('balanceVerdict');
  if (!rep.allComplete) {
    v.innerHTML = '<div class="warn-box">Chưa đủ đội hình.</div>';
  } else if (rep.balanced) {
    v.innerHTML = '<div class="ok-box">Đội hình cân bằng tốt. Sẵn sàng thi đấu.</div>';
  } else {
    v.innerHTML = `<div class="warn-box">Độ lệch ${rep.stdDev.toFixed(2)} — cân nhắc thương lượng.</div>`;
  }
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

/* ---------- HELPERS ---------- */
function nameOfFemale(id) { return (FEMALES.find(f => f.id === id) || {}).name || id; }
function nameOfMale(id) { return (MALES.find(m => m.id === id) || {}).name || id; }

/* ---------- BIND ---------- */
document.getElementById('btnStart').addEventListener('click', actionStart);
document.getElementById('btnReveal').addEventListener('click', actionReveal);
document.getElementById('btnExtend').addEventListener('click', actionExtend);
document.getElementById('btnNext').addEventListener('click', actionNext);
document.getElementById('btnSkipToFill').addEventListener('click', actionFill);
document.getElementById('btnFill2').addEventListener('click', actionFill);
document.getElementById('btnReset').addEventListener('click', actionReset);
document.getElementById('btnResetTop').addEventListener('click', actionReset);

window.addEventListener('beforeunload', () => room.setHostOnline(false));

/* ---------- BOOT ---------- */
renderAll();
if (S.phase === 'bidding' && S.roundEndsAt) startTimer();