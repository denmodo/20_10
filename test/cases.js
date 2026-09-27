/* =============================================================
 * cases.js — Bộ test dùng chung cho Node & trình duyệt
 * Chỉ dùng ESM thuần, không dùng API riêng của Node.
 * ============================================================= */
import { SETTINGS, FEMALES, MALES, computeBudget, computeMinPrice, budgetTable, priceTable } from '../js/config.js';
import {
  createInitialState, validateBid, rankBids, resolveAuction,
  fillRemaining, balanceReport, startRound, advanceRound,
  remaining, needed, nextMaleForAuction, isFinished, sumMaleScore,
  maxAllowedBid, cheapestAvailablePrice,
} from '../js/auction.js';

export function runTests() {
  const results = [];
  const test = (name, fn) => {
    try { fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, error: e.message }); }
  };
  const eq = (a, b, msg = '') => {
    if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  };
  const ok = (v, msg = 'assertion failed') => { if (!v) throw new Error(msg); };
  const throws = (fn, msg = 'expected throw') => {
    let threw = false; try { fn(); } catch { threw = true; }
    if (!threw) throw new Error(msg);
  };

  /* ---------- Nhóm 1: NGÂN SÁCH ---------- */
  test('Ngân sách: nữ mạnh nhất nhận ít điểm nhất', () => {
    const t = budgetTable(FEMALES, SETTINGS);
    const strongest = t.find(x => x.id === 'F1');
    const weakest = t.find(x => x.id === 'F6');
    ok(strongest.budget < weakest.budget, 'F1 phải ít điểm hơn F6');
  });

  test('Ngân sách: tổng xấp xỉ totalPoints (sai số ≤ n)', () => {
    const t = budgetTable(FEMALES, SETTINGS);
    const sum = t.reduce((a, b) => a + b.budget, 0);
    ok(Math.abs(sum - SETTINGS.totalPoints) <= FEMALES.length,
      `tổng=${sum} lệch quá nhiều so với ${SETTINGS.totalPoints}`);
  });

  test('Ngân sách: đủ mua tối thiểu 2 nam rẻ nhất', () => {
    const prices = priceTable(MALES, SETTINGS).map(p => p.minPrice).sort((a, b) => a - b);
    const cheapestTwo = prices[0] + prices[1];
    for (const f of budgetTable(FEMALES, SETTINGS)) {
      ok(f.budget >= cheapestTwo, `${f.name} ngân sách ${f.budget} < ${cheapestTwo}`);
    }
  });

  test('Ngân sách: các nữ bằng strength thì bằng ngân sách', () => {
    const F = [
      { id: 'A', name: 'A', strength: 5, secret: 'x' },
      { id: 'B', name: 'B', strength: 5, secret: 'y' },
    ];
    eq(computeBudget(F[0], F, SETTINGS), computeBudget(F[1], F, SETTINGS), 'phải bằng nhau:');
  });

  /* ---------- Nhóm 2: GIÁ SÀN ---------- */
  test('Giá sàn: rank 1 đắt nhất, rank cuối rẻ nhất', () => {
    const t = priceTable(MALES, SETTINGS);
    const p1 = t.find(x => x.rank === 1).minPrice;
    const p12 = t.find(x => x.rank === 12).minPrice;
    ok(p1 > p12, 'rank 1 phải đắt hơn rank 12');
    eq(p1, SETTINGS.basePrice, 'rank 1 phải bằng basePrice:');
  });

  test('Giá sàn: đơn điệu giảm theo rank', () => {
    const t = priceTable(MALES, SETTINGS).sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < t.length; i++) {
      ok(t[i].minPrice <= t[i - 1].minPrice, `rank ${t[i].rank} phải ≤ rank ${t[i - 1].rank}`);
    }
  });

  test('Giá sàn: không âm', () => {
    for (const p of priceTable(MALES, SETTINGS)) ok(p.minPrice >= 0, `rank ${p.rank} âm`);
  });

  /* ---------- Nhóm 3: VALIDATE BID ---------- */
  test('Validate: từ chối bid vượt điểm còn lại', () => {
    const st = createInitialState();
    const r = validateBid({ femaleId: 'F1', maleId: 'M12', amount: 999999, state: st });
    ok(!r.ok, 'phải từ chối');
  });

  test('Validate: từ chối bid dưới giá sàn', () => {
    const st = createInitialState();
    const male = MALES.find(m => m.rank === 1);
    const r = validateBid({ femaleId: 'F1', maleId: male.id, amount: 1, state: st });
    ok(!r.ok, 'phải từ chối bid < giá sàn');
  });

  test('Validate: từ chối bid = 0 khi chưa có nam (must-buy)', () => {
    const st = createInitialState();
    const r = validateBid({ femaleId: 'F1', maleId: 'M12', amount: 0, state: st });
    ok(!r.ok, 'phải bắt buộc bid > 0');
  });

  test('Validate: cho phép bid = 0 khi đã có đủ 1 nam', () => {
    const st = createInitialState();
    st.teams.F1.maleIds.push('M12');
    st.teams.F1.spent = computeMinPrice(MALES.find(m => m.id === 'M12'));
    const r = validateBid({ femaleId: 'F1', maleId: 'M1', amount: 0, state: st });
    ok(r.ok, 'phải cho phép bỏ qua');
  });

  test('Validate: từ chối sai bước giá', () => {
    const st = createInitialState();
    const male = MALES.find(m => m.rank === 1); // minPrice 40
    const r = validateBid({ femaleId: 'F1', maleId: male.id, amount: 43, state: st });
    ok(!r.ok, 'phải từ chối vì 43-40 không chia hết cho 5');
  });

  test('Validate: chấp nhận giá sàn và bội số của bước giá', () => {
    const st = createInitialState();
    const male = MALES.find(m => m.rank === 1);
    ok(validateBid({ femaleId: 'F1', maleId: male.id, amount: 40, state: st }).ok, 'giá sàn phải OK');
    ok(validateBid({ femaleId: 'F1', maleId: male.id, amount: 45, state: st }).ok, 'bước giá phải OK');
    ok(validateBid({ femaleId: 'F1', maleId: male.id, amount: 60, state: st }).ok, 'bội số phải OK');
  });

  /* ---------- Nhóm 3b: LUẬT GIỮ TIỀN DỰ PHÒNG ---------- */
  test('Dự phòng: chặn bid đốt hết tiền ở vòng đầu', () => {
    const st = createInitialState();
    const male = MALES.find(m => m.rank === 1);
    const left = remaining(st.teams.F1);
    const r = validateBid({ femaleId: 'F1', maleId: male.id, amount: left, state: st });
    ok(!r.ok, 'phải chặn vì còn phải mua nam thứ 2');
  });

  test('Dự phòng: maxAllowedBid = còn lại − dự phòng nam thứ 2', () => {
    const st = createInitialState();
    const male = MALES.find(m => m.rank === 1);
    const left = remaining(st.teams.F1);
    const max = maxAllowedBid({ femaleId: 'F1', maleId: male.id, state: st });
    const reserve = Math.max(SETTINGS.minReservePerMale, cheapestAvailablePrice(st, MALES, SETTINGS, male.id));
    eq(max, left - reserve, 'max phải trừ đúng dự phòng:');
    ok(max < left, 'max phải nhỏ hơn tổng còn lại');
  });

  test('Dự phòng: lượt mua nam CUỐI được tiêu hết', () => {
    const st = createInitialState();
    st.teams.F1.maleIds.push('M12');
    st.teams.F1.spent = 20;
    const male = MALES.find(m => m.rank === 1);
    const left = remaining(st.teams.F1);
    eq(maxAllowedBid({ femaleId: 'F1', maleId: male.id, state: st }), left, 'lượt cuối không giới hạn:');
  });

  test('Dự phòng: mọi nữ luôn đủ tiền mua nam thứ 2 sau vòng 1 tệ nhất', () => {
    let st = createInitialState();
    st = startRound(st);
    const male = MALES.find(m => m.id === st.currentMaleId);
    st.bids = {};
    // mọi nữ bid tối đa cho phép
    for (const id of Object.keys(st.teams)) {
      const max = maxAllowedBid({ femaleId: id, maleId: male.id, state: st }, MALES, SETTINGS);
      if (max >= computeMinPrice(male, MALES, SETTINGS)) st.bids[id] = max;
    }
    st = resolveAuction(st, MALES, SETTINGS);
    // Sau đó vòng 2 + fill phải hoàn tất được
    st = fillRemaining(st, MALES, SETTINGS);
    ok(isFinished(st), 'phải hoàn tất đội hình dù ai cũng bid tối đa');
    for (const t of Object.values(st.teams)) ok(t.spent <= t.budget, 'không vượt ngân sách');
  });

  test('Dự phòng: cheapestAvailablePrice bỏ qua nam đang đấu giá', () => {
    const st = createInitialState();
    const current = MALES.find(m => m.rank === 12); // nam rẻ nhất
    const p = cheapestAvailablePrice(st, MALES, SETTINGS, current.id);
    const others = MALES.filter(m => m.id !== current.id).map(m => computeMinPrice(m, MALES, SETTINGS));
    eq(p, Math.min(...others), 'phải lấy giá rẻ thứ 2:');
  });

  /* ---------- Nhóm 4: TIE-BREAK ---------- */
  test('Tie-break: giá cao hơn thắng', () => {
    const st = createInitialState();
    const ranked = rankBids({ maleId: 'M3', bids: { F1: 50, F2: 60 }, teams: st.teams });
    eq(ranked[0].femaleId, 'F2', 'F2 bid cao hơn phải thắng:');
  });

  test('Tie-break: đồng giá -> người chưa có nam thắng', () => {
    const st = createInitialState();
    st.teams.F1.maleIds.push('M12'); // F1 đã có 1 nam
    const ranked = rankBids({ maleId: 'M3', bids: { F1: 50, F2: 50 }, teams: st.teams });
    eq(ranked[0].femaleId, 'F2', 'F2 còn thiếu nam phải thắng:');
  });

  test('Tie-break: tái lập được (chạy 2 lần cùng kết quả)', () => {
    const st = createInitialState();
    const bids = { F1: 50, F2: 50, F3: 50, F4: 50 };
    const a = rankBids({ maleId: 'M3', bids, teams: st.teams });
    const b = rankBids({ maleId: 'M3', bids, teams: st.teams });
    eq(JSON.stringify(a.map(x => x.femaleId)), JSON.stringify(b.map(x => x.femaleId)), 'phải giống nhau:');
  });

  test('Tie-break: bỏ qua bid = 0', () => {
    const st = createInitialState();
    const ranked = rankBids({ maleId: 'M3', bids: { F1: 0, F2: 50 }, teams: st.teams });
    eq(ranked.length, 1, 'chỉ còn 1 bid:');
    eq(ranked[0].femaleId, 'F2');
  });

  /* ---------- Nhóm 5: CHỐT LƯỢT ---------- */
  test('Resolve: người thắng bị trừ điểm & nhận nam', () => {
    let st = createInitialState();
    st = startRound(st);
    st.bids = { F1: 60 };
    const before = remaining(st.teams.F1);
    st = resolveAuction(st);
    eq(st.teams.F1.spent, 60, 'spent phải = 60:');
    eq(remaining(st.teams.F1), before - 60, 'điểm còn lại phải giảm 60:');
    eq(st.teams.F1.maleIds.length, 1, 'phải có 1 nam:');
    eq(st.phase, 'reveal');
  });

  test('Resolve: không ai bid -> nam không được bán', () => {
    let st = createInitialState();
    st = startRound(st);
    st.bids = {};
    st = resolveAuction(st);
    eq(st.reveal.winnerId, null, 'không có người thắng:');
    eq(st.reveal.reason, 'no-bid');
    ok(!st.boughtMaleIds.includes(st.reveal.maleId), 'nam không được mua');
  });

  test('Resolve: nam đã đấu giá vào usedMales, không xuất hiện lại', () => {
    let st = createInitialState();
    st = startRound(st);
    const maleId = st.currentMaleId;
    st.bids = { F1: 60 };
    st = resolveAuction(st);
    ok(st.usedMales.includes(maleId), 'phải ghi vào usedMales');
    const next = nextMaleForAuction(st);
    ok(next.id !== maleId, 'không được lặp lại nam vừa đấu');
  });

  /* ---------- Nhóm 6: VÒNG BỔ SUNG ---------- */
  test('Fill: lấp đầy để mọi đội đủ 2 nam', () => {
    let st = createInitialState();
    st = fillRemaining(st, MALES, SETTINGS, FEMALES);
    ok(isFinished(st), 'mọi đội phải đủ nam');
    for (const t of Object.values(st.teams)) {
      eq(needed(t, SETTINGS.malesPerTeam), 0, `${t.femaleId} còn thiếu nam:`);
    }
  });

  test('Fill: không mua trùng 1 nam cho 2 đội', () => {
    let st = createInitialState();
    st = fillRemaining(st, MALES, SETTINGS, FEMALES);
    const all = Object.values(st.teams).flatMap(t => t.maleIds);
    eq(new Set(all).size, all.length, 'không được trùng nam:');
    eq(all.length, SETTINGS.teamsCount * SETTINGS.malesPerTeam, 'tổng số nam phải = 12:');
  });

  test('Fill: không tiêu quá ngân sách', () => {
    let st = createInitialState();
    st = fillRemaining(st, MALES, SETTINGS, FEMALES);
    for (const t of Object.values(st.teams)) {
      ok(t.spent <= t.budget, `${t.femaleId} tiêu ${t.spent} > ngân sách ${t.budget}`);
      ok(remaining(t) >= 0, `${t.femaleId} âm điểm`);
    }
  });

  test('Fill: đội yếu hơn được ưu tiên nhận nam mạnh (cân bằng)', () => {
    let st = createInitialState();
    st = fillRemaining(st, MALES, SETTINGS, FEMALES);
    const rep = balanceReport(st, FEMALES, MALES, SETTINGS);
    // Với thuật toán bù trừ, độ lệch phải nhỏ hơn hẳn mức "xếp theo rank"
    ok(rep.stdDev < 6, `độ lệch ${rep.stdDev.toFixed(2)} quá cao`);
    ok(rep.allComplete, 'phải hoàn tất');
  });

  /* ---------- Nhóm 7: ĐIỀU KHIỂN VÒNG ---------- */
  test('startRound: chuyển phase bidding & chọn nam rank tốt nhất', () => {
    const st = startRound(createInitialState());
    eq(st.phase, 'bidding');
    eq(st.currentMaleId, 'M1', 'vòng 1 phải là nam rank 1:');
  });

  test('advanceRound: tăng round', () => {
    let st = startRound(createInitialState());
    st.bids = { F1: 60 };
    st = resolveAuction(st);
    st = advanceRound(st);
    eq(st.round, 2);
    eq(st.phase, 'bidding');
  });

  test('Kết thúc: startRound khi hết nam -> phase done', () => {
    let st = createInitialState();
    st.usedMales = MALES.map(m => m.id);
    st = startRound(st);
    eq(st.phase, 'done');
  });

  /* ---------- Nhóm 8: BÁO CÁO CÂN BẰNG ---------- */
  test('Balance: báo cáo đúng số đội & tổng nam', () => {
    let st = createInitialState();
    st = fillRemaining(st);
    const rep = balanceReport(st);
    eq(rep.rows.length, SETTINGS.teamsCount, 'số đội:');
    ok(rep.allComplete, 'phải hoàn tất');
    ok(rep.stdDev >= 0, 'stdDev không âm');
  });

  test('Balance: mọi đội có đúng 2 nam & điểm dư hợp lý', () => {
    let st = createInitialState();
    st = fillRemaining(st);
    const rep = balanceReport(st);
    for (const r of rep.rows) {
      eq(r.maleIds.length, SETTINGS.malesPerTeam, `${r.name} số nam:`);
      ok(r.left >= 0, `${r.name} điểm dư âm`);
    }
  });

  /* ---------- Nhóm 9: MÔ PHỎNG TOÀN GIẢI ---------- */
  test('Mô phỏng full: 2 vòng + fill -> giải hoàn tất hợp lệ', () => {
    let st = createInitialState();
    const bidsPerRound = [60, 45];
    for (let r = 0; r < SETTINGS.rounds; r++) {
      st = startRound(st);
      if (st.phase === 'done') break;
      // mọi nữ còn thiếu nam bid đúng giá sàn của nam hiện tại
      const male = MALES.find(m => m.id === st.currentMaleId);
      const price = computeMinPrice(male, MALES, SETTINGS);
      st.bids = {};
      for (const t of Object.values(st.teams)) {
        if (needed(t, SETTINGS.malesPerTeam) > 0 && remaining(t) >= price) {
          st.bids[t.femaleId] = price;
        }
      }
      st = resolveAuction(st);
    }
    st = fillRemaining(st);
    ok(isFinished(st), 'giải phải hoàn tất');
    const all = Object.values(st.teams).flatMap(t => t.maleIds);
    eq(new Set(all).size, 12, 'phải dùng đủ 12 nam:');
    for (const t of Object.values(st.teams)) ok(t.spent <= t.budget, 'không vượt ngân sách');
  });

  /* ---------- Nhóm 10: BẤT BIẾN (INVARIANTS) ---------- */
  test('Bất biến: tổng spent ≤ tổng budget luôn đúng', () => {
    let st = createInitialState();
    st = fillRemaining(st);
    const totalBudget = Object.values(st.teams).reduce((a, t) => a + t.budget, 0);
    const totalSpent = Object.values(st.teams).reduce((a, t) => a + t.spent, 0);
    ok(totalSpent <= totalBudget, 'tổng chi vượt tổng ngân sách');
  });

  test('Bất biến: resolveAuction không sửa state gốc (immutable)', () => {
    let st = createInitialState();
    st = startRound(st);
    st.bids = { F1: 60 };
    const snapshot = JSON.stringify(st.teams);
    resolveAuction(st);
    eq(JSON.stringify(st.teams), snapshot, 'state gốc phải không đổi:');
  });

  test('Bất biến: sumMaleScore khớp với đội hình', () => {
    let st = createInitialState();
    st = fillRemaining(st);
    for (const t of Object.values(st.teams)) {
      const manual = t.maleIds.reduce((a, id) => {
        const m = MALES.find(x => x.id === id);
        return a + (MALES.length - m.rank + 1);
      }, 0);
      eq(sumMaleScore(t), manual, `${t.femaleId} điểm nam:`)  ;
    }
  });

  return results;
}