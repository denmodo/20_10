/* =============================================================
 * auction.js — ENGINE LOGIC THUẦN (pure functions)
 * -------------------------------------------------------------
 * Không truy cập DOM, không truy cập Firebase.
 * Mọi hàm đều deterministic -> test được & tái lập được.
 * ============================================================= */
import {
  SETTINGS, FEMALES, MALES,
  computeBudget, computeMinPrice, maleScore,
} from './config.js';

/* ---------- Kiểu dữ liệu "state" của phòng đấu giá ----------
 * {
 *   phase: 'lobby' | 'bidding' | 'reveal' | 'done',
 *   round: 1..rounds,
 *   currentMaleId: string|null,
 *   bids: { [femaleId]: number },
 *   teams: { [femaleId]: { femaleId, budget, spent, maleIds: [] } },
 *   boughtMaleIds: string[],
 *   log: [{ round, maleId, winnerId, price, note }],
 *   reveal: null | { maleId, entries: [...], winnerId, reason },
 *   usedMales: string[],       // đã đấu giá (kể cả không ai mua)
 * }
 */

/* =============================================================
 * 1. KHỞI TẠO
 * ============================================================= */
export function createInitialState(females = FEMALES) {
  const teams = {};
  for (const f of females) {
    teams[f.id] = {
      femaleId: f.id,
      budget: computeBudget(f, females, SETTINGS),
      spent: 0,
      maleIds: [],
    };
  }
  return {
    phase: 'lobby',
    round: 1,
    currentMaleId: null,
    bids: {},
    teams,
    boughtMaleIds: [],
    usedMales: [],
    log: [],
    reveal: null,
  };
}

/** Điểm còn lại của 1 nữ. */
export function remaining(team) {
  return team.budget - team.spent;
}

/** Nữ còn thiếu bao nhiêu nam. */
export function needed(team, malesPerTeam = SETTINGS.malesPerTeam) {
  return malesPerTeam - team.maleIds.length;
}

/* =============================================================
 * 2. CHỌN NAM ĐƯA RA ĐẤU GIÁ
 * -------------------------------------------------------------
 * Vòng 1 ưu tiên nam mạnh nhất (rank nhỏ).
 * Các vòng sau ưu tiên nam còn lại có rank tốt nhất.
 * ============================================================= */
export function nextMaleForAuction(state, males = MALES) {
  const available = males
    .filter(m => !state.usedMales.includes(m.id))
    .sort((a, b) => a.rank - b.rank);
  return available.length ? available[0] : null;
}

/* =============================================================
 * 3. VALIDATE BID
 * -------------------------------------------------------------
 * Trả về { ok: boolean, error?: string }
 *
 * LUẬT GIỮ TIỀN DỰ PHÒNG:
 * Mỗi nữ phải mua đủ malesPerTeam nam. Vì vậy bid tối đa bị giới
 * hạn để luôn còn đủ tiền trả giá sàn rẻ nhất cho các nam còn lại:
 *
 *   maxBid = điểmCònLại − (sốNamCònThiếu − 1) × giáSànRẻNhất
 *
 * Nhờ vậy không ai "đốt hết tiền" ở lượt đầu rồi bị kẹt không mua
 * được nam thứ hai → mọi đội luôn đủ đội hình.
 * ============================================================= */

/** Giá sàn rẻ nhất trong các nam chưa được mua (bỏ qua nam đang đấu giá). */
export function cheapestAvailablePrice(state, males = MALES, s = SETTINGS, excludeId = null) {
  const prices = males
    .filter(m => !state.boughtMaleIds.includes(m.id) && m.id !== excludeId)
    .map(m => computeMinPrice(m, males, s));
  return prices.length ? Math.min(...prices) : 0;
}

/** Số điểm tối đa được phép bid, sau khi trừ tiền dự phòng cho nam còn lại. */
export function maxAllowedBid({ femaleId, maleId, state }, males = MALES, s = SETTINGS) {
  const team = state.teams[femaleId];
  if (!team) return 0;
  const stillNeed = needed(team, s.malesPerTeam);
  if (stillNeed <= 1) return remaining(team); // lượt mua nam cuối -> được tiêu hết
  // Mỗi nam còn thiếu phải giữ ít nhất minReservePerMale, nhưng không thấp hơn giá sàn rẻ nhất
  const perMale = Math.max(s.minReservePerMale ?? 0, cheapestAvailablePrice(state, males, s, maleId));
  return Math.max(0, remaining(team) - (stillNeed - 1) * perMale);
}

export function validateBid({ femaleId, maleId, amount, state }, males = MALES, s = SETTINGS) {
  const team = state.teams[femaleId];
  if (!team) return { ok: false, error: 'Không tìm thấy đội.' };

  const male = males.find(m => m.id === maleId);
  if (!male) return { ok: false, error: 'Không tìm thấy nam.' };

  const left = remaining(team);
  const minP = computeMinPrice(male, males, s);

  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'Số điểm không hợp lệ.' };
  if (amount > left) return { ok: false, error: `Chỉ còn ${left} điểm, không thể bid ${amount}.` };

  const mustBuy = needed(team, s.malesPerTeam) >= s.malesPerTeam; // chưa có nam nào
  if (amount === 0 && mustBuy) return { ok: false, error: 'Bạn chưa có nam nào — bắt buộc phải bid (>0).' };

  // Giới hạn dự phòng — nếu vô tình < giá sàn thì nới lỏng để tránh kẹt
  const hardMax = maxAllowedBid({ femaleId, maleId, state }, males, s);
  const effectiveMax = hardMax < minP ? left : hardMax;
  if (amount > effectiveMax) {
    const stillNeed = needed(team, s.malesPerTeam) - 1;
    return {
      ok: false,
      error: `Tối đa ${effectiveMax} điểm — phải để dành mua ${stillNeed} nam còn lại.`,
    };
  }

  if (amount > 0 && amount < minP) return { ok: false, error: `Bid phải ≥ giá sàn ${minP}.` };
  if (amount > 0 && (amount - minP) % s.minIncrement !== 0 && amount !== minP) {
    return { ok: false, error: `Bước giá là ${s.minIncrement} (giá sàn ${minP}, ${minP + s.minIncrement}, ...).` };
  }
  return { ok: true };
}

/* =============================================================
 * 4. TIE-BREAK (4 cấp) — quyết định ai thắng khi đồng giá
 * -------------------------------------------------------------
 * Trả về mảng bid đã sắp xếp giảm dần theo độ ưu tiên.
 * ============================================================= */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function rankBids({ maleId, bids, teams }, males = MALES, s = SETTINGS) {
  const male = males.find(m => m.id === maleId);
  const entries = Object.entries(bids)
    .map(([femaleId, amount]) => ({ femaleId, amount }))
    .filter(e => e.amount > 0 && teams[e.femaleId]);

  entries.sort((a, b) => {
    // 1. Giá cao hơn thắng
    if (a.amount !== b.amount) return b.amount - a.amount;

    const ta = teams[a.femaleId], tb = teams[b.femaleId];

    // 2. Người "cần hơn" (chưa có nam) thắng
    const na = needed(ta, s.malesPerTeam), nb = needed(tb, s.malesPerTeam);
    if (na !== nb) return nb - na;

    // 3. Điểm còn lại sau khi bid thấp hơn thắng (nghèo hơn được ưu tiên)
    const ra = remaining(ta) - a.amount, rb = remaining(tb) - b.amount;
    if (ra !== rb) return ra - rb;

    // 4. Tổng sức mạnh nam đã có thấp hơn thắng (đội yếu được ưu tiên)
    const sa = sumMaleScore(ta, males), sb2 = sumMaleScore(tb, males);
    if (sa !== sb2) return sa - sb2;

    // 5. Bốc thăm seeded — tái lập được
    const ha = hash(`${s.tieBreakSeed}|${maleId}|${a.femaleId}|${a.amount}`);
    const hb = hash(`${s.tieBreakSeed}|${maleId}|${b.femaleId}|${b.amount}`);
    if (ha !== hb) return ha - hb;
    return a.femaleId.localeCompare(b.femaleId);
  });

  return entries.map(e => ({
    ...e,
    team: teams[e.femaleId],
    leftAfter: remaining(teams[e.femaleId]) - e.amount,
    maleScoreSum: sumMaleScore(teams[e.femaleId], males),
  }));
}

export function sumMaleScore(team, males = MALES) {
  return team.maleIds.reduce((sum, id) => {
    const m = males.find(x => x.id === id);
    return sum + (m ? maleScore(m, males) : 0);
  }, 0);
}

/* =============================================================
 * 5. CHỐT 1 LƯỢT ĐẤU GIÁ
 * -------------------------------------------------------------
 * Trả về state MỚI (immutable) + thông tin reveal.
 * Nếu không ai bid (hoặc bid = 0) -> nam vào vòng bổ sung sau.
 * ============================================================= */
export function resolveAuction(state, males = MALES, s = SETTINGS) {
  const maleId = state.currentMaleId;
  if (!maleId) throw new Error('Chưa có nam nào đang đấu giá.');

  const ranked = rankBids({ maleId, bids: state.bids, teams: state.teams }, males, s);
  const next = structuredClone(state);
  next.usedMales = [...next.usedMales, maleId];

  let winnerId = null, price = 0, reason = 'no-bid';

  if (ranked.length > 0) {
    const win = ranked[0];
    // Kiểm tra lại ngân sách (phòng bid cũ đã đổi)
    if (win.amount <= remaining(next.teams[win.femaleId])) {
      winnerId = win.femaleId;
      price = win.amount;
      next.teams[winnerId].spent += price;
      next.teams[winnerId].maleIds.push(maleId);
      next.boughtMaleIds.push(maleId);
      reason = ranked.length > 1 ? 'highest-bid' : 'only-bid';
    } else {
      reason = 'insufficient-funds';
    }
  }

  next.reveal = {
    maleId, winnerId, price, reason,
    entries: ranked.map(e => ({
      femaleId: e.femaleId, amount: e.amount,
      leftAfter: e.leftAfter, maleScoreSum: e.maleScoreSum,
    })),
  };
  next.log = [...next.log, { round: state.round, maleId, winnerId, price, reason }];
  next.bids = {};
  next.phase = 'reveal';
  next.currentMaleId = null;
  return next;
}

/* =============================================================
 * 6. VÒNG BỔ SUNG — lấp đầy nam cho các đội còn thiếu
 * -------------------------------------------------------------
 * Sau các vòng chính, gán nam chưa ai mua cho đội thiếu.
 * Thứ tự ưu tiên (để CÂN BẰNG, không chỉ lấp đầy):
 *   1. Đội thiếu nhiều nam nhất
 *   2. Đội có TỔNG SỨC MẠNH thấp nhất (đội yếu nhận nam mạnh hơn)
 *   3. Đội còn nhiều điểm nhất (ít bị ràng buộc ngân sách)
 * ============================================================= */
export function fillRemaining(state, males = MALES, s = SETTINGS, females = FEMALES) {
  const next = structuredClone(state);
  let guard = 0;

  while (guard++ < 100) {
    // Tìm nữ còn thiếu nam, ưu tiên đội YẾU (bù trừ chuyên môn)
    const needy = Object.values(next.teams)
      .filter(t => needed(t, s.malesPerTeam) > 0)
      .sort((a, b) => {
        const na = needed(a, s.malesPerTeam), nb = needed(b, s.malesPerTeam);
        if (na !== nb) return nb - na;                         // thiếu nhiều hơn trước
        const sa = teamStrength(a, females, males), sb = teamStrength(b, females, males);
        if (sa !== sb) return sa - sb;                         // đội yếu được ưu tiên
        return remaining(b) - remaining(a);                    // nhiều điểm hơn trước
      });

    if (needy.length === 0) break;

    let assigned = false;
    for (const team of needy) {
      const affordable = males
        .filter(m => !next.boughtMaleIds.includes(m.id))
        .filter(m => computeMinPrice(m, males, s) <= remaining(team))
        .sort((a, b) => a.rank - b.rank);
      if (affordable.length === 0) continue;

      const male = affordable[0];
      const price = computeMinPrice(male, males, s);
      next.teams[team.femaleId].spent += price;
      next.teams[team.femaleId].maleIds.push(male.id);
      next.boughtMaleIds.push(male.id);
      next.log = [...next.log, {
        round: 'fill', maleId: male.id, winnerId: team.femaleId, price, reason: 'auto-fill',
      }];
      assigned = true;
      break;
    }
    if (!assigned) break;
  }
  return next;
}

/* =============================================================
 * 7. BÁO CÁO CÂN BẰNG
 * ============================================================= */
export function teamStrength(team, females = FEMALES, males = MALES) {
  const f = females.find(x => x.id === team.femaleId);
  const fScore = f ? f.strength : 0;
  return fScore + sumMaleScore(team, males);
}

export function balanceReport(state, females = FEMALES, males = MALES, s = SETTINGS) {
  const rows = Object.values(state.teams).map(t => {
    const f = females.find(x => x.id === t.femaleId);
    return {
      femaleId: t.femaleId,
      name: f ? f.name : t.femaleId,
      femaleStrength: f ? f.strength : 0,
      maleIds: t.maleIds,
      maleNames: t.maleIds.map(id => (males.find(m => m.id === id) || {}).name || id),
      strength: teamStrength(t, females, males),
      budget: t.budget,
      spent: t.spent,
      left: remaining(t),
      complete: needed(t, s.malesPerTeam) === 0,
    };
  });

  const vals = rows.map(r => r.strength);
  const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length || 1);
  const stdDev = Math.sqrt(variance);

  return {
    rows,
    mean,
    stdDev,
    balanced: stdDev <= s.balanceWarnStdDev,
    allComplete: rows.every(r => r.complete),
  };
}

/* =============================================================
 * 8. ĐIỀU KHIỂN VÒNG ĐẤU GIÁ (dùng bởi host)
 * ============================================================= */
export function startRound(state, males = MALES) {
  const male = nextMaleForAuction(state, males);
  if (!male) return { ...state, phase: 'done' };
  return {
    ...structuredClone(state),
    phase: 'bidding',
    currentMaleId: male.id,
    bids: {},
    reveal: null,
  };
}

export function advanceRound(state, males = MALES) {
  const next = structuredClone(state);
  next.round += 1;
  return startRound(next, males);
}

/** Kiểm tra đã thể kết thúc giải chưa (mọi đội đủ nam). */
export function isFinished(state, s = SETTINGS) {
  return Object.values(state.teams).every(t => needed(t, s.malesPerTeam) === 0);
}