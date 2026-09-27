/* =============================================================
 * simulate.mjs — Mô phỏng một giải đấu HOÀN CHỈNH không cần UI
 *   node test/simulate.mjs
 *
 * Hữu ích để:
 *  - Kiểm tra luật trước buổi chơi thật
 *  - Thử nhiều chiến lược bid khác nhau
 *  - Xem báo cáo cân bằng cuối cùng
 * ============================================================= */
import { SETTINGS, FEMALES, MALES, computeMinPrice, budgetTable, priceTable } from '../js/config.js';
import {
  createInitialState, startRound, resolveAuction, advanceRound,
  fillRemaining, balanceReport, remaining, needed, maxAllowedBid, isFinished,
} from '../js/auction.js';

/* ---------- Chiến lược bid ----------
 * 'min'   : luôn trả giá sàn (tiết kiệm)
 * 'max'   : luôn trả tối đa được phép (hung hăng)
 * 'value' : trả theo tỉ lệ mong muốn/ngân sách (mặc định)
 */
function makeBid(strategy, state, femaleId, males = MALES) {
  const male = males.find(m => m.id === state.currentMaleId);
  const min = computeMinPrice(male, males, SETTINGS);
  const max = maxAllowedBid({ femaleId, maleId: state.currentMaleId, state }, males, SETTINGS);
  if (max < min) return null; // không đủ tiền bid

  if (strategy === 'min') return min;
  if (strategy === 'max') return snapToIncrement(min, max, SETTINGS);
  // 'value': nam càng mạnh càng muốn, nhưng không quá 70% mức tối đa
  const want = Math.round((max * 0.7) / SETTINGS.minIncrement) * SETTINGS.minIncrement;
  return Math.max(min, Math.min(max, want));
}

/** Làm tròn xuống theo bước giá nhưng vẫn ≥ giá sàn. */
function snapToIncrement(min, max, s) {
  const k = Math.floor((max - min) / s.minIncrement);
  return min + k * s.minIncrement;
}

/* ---------- Chạy 1 giải ---------- */
function runGame(strategies, verbose = true) {
  let st = createInitialState(FEMALES);

  // Vòng chính
  for (let r = 0; r < SETTINGS.rounds; r++) {
    st = startRound(st, MALES);
    if (st.phase === 'done') break;

    st.bids = {};
    for (const [fid, strategy] of Object.entries(strategies)) {
      const team = st.teams[fid];
      if (needed(team, SETTINGS.malesPerTeam) === 0) continue;   // đã đủ nam
      const amount = makeBid(strategy, st, fid, MALES);
      if (amount !== null && amount > 0) st.bids[fid] = amount;
    }
    st = resolveAuction(st, MALES, SETTINGS);
    if (verbose) printRound(st);
  }

  // Vòng bổ sung
  st = fillRemaining(st, MALES, SETTINGS, FEMALES);
  st.phase = 'done';
  return st;
}

function printRound(st) {
  const r = st.reveal;
  const m = MALES.find(x => x.id === r.maleId);
  const tag = r.winnerId
    ? `→ ${nameF(r.winnerId)} (${r.price}đ)`
    : '→ không ai mua';
  console.log(`  Vòng ${st.round}: ${m.name.padEnd(12)} ${tag}`);
}
function nameF(id) { return (FEMALES.find(f => f.id === id) || {}).name || id; }

/* ---------- In bảng ---------- */
function printHeader() {
  console.log('\n🏸  MÔ PHỎNG GIẢI ĐẤU GIÁ CẦU LÔNG');
  console.log('='.repeat(66));

  console.log('\n💰 NGÂN SÁCH 6 NỮ');
  console.log('─'.repeat(66));
  for (const f of budgetTable(FEMALES, SETTINGS)) {
    console.log(`  ${f.name.padEnd(14)} strength ${String(f.strength).padStart(2)}/10   →  ${String(f.budget).padStart(4)} điểm`);
  }

  console.log('\n💵 GIÁ SÀN 12 NAM');
  console.log('─'.repeat(66));
  const prices = priceTable(MALES, SETTINGS);
  for (let i = 0; i < prices.length; i += 4) {
    console.log('  ' + prices.slice(i, i + 4)
      .map(p => `#${String(p.rank).padStart(2)} ${p.name.padEnd(12)} ${String(p.minPrice).padStart(3)}đ`)
      .join('   '));
  }
}

function printReport(st) {
  const rep = balanceReport(st, FEMALES, MALES, SETTINGS);
  console.log('\n🏆 KẾT QUẢ CHIA ĐỘI');
  console.log('='.repeat(66));
  for (const r of rep.rows) {
    console.log(`\n  ${r.name} (nữ ${r.femaleStrength}/10)`);
    console.log(`    Nam: ${r.maleNames.join(' + ')}`);
    console.log(`    Sức mạnh đội: ${r.strength}   |   Chi ${r.spent}/${r.budget}đ   |   Dư ${r.left}đ`);
  }

  console.log('\n📊 CÂN BẰNG');
  console.log('─'.repeat(66));
  console.log(`  Sức mạnh trung bình : ${rep.mean.toFixed(2)}`);
  console.log(`  Độ lệch chuẩn (σ)   : ${rep.stdDev.toFixed(2)}`);
  console.log(`  Ngưỡng cảnh báo     : ${SETTINGS.balanceWarnStdDev}`);
  console.log(`  Kết luận            : ${rep.balanced ? '✅ CÂN BẰNG TỐT' : '⚠️  LỆCH — cân nhắc điều chỉnh'}`);
  console.log(`  Hoàn tất đội hình   : ${rep.allComplete ? '✅ 6/6 đội đủ 2 nam' : '❌ còn thiếu nam'}`);

  const totalLeft = rep.rows.reduce((a, r) => a + r.left, 0);
  console.log(`  Tổng điểm dư        : ${totalLeft} (${((totalLeft / SETTINGS.totalPoints) * 100).toFixed(1)}% tổng ngân sách)`);
}

/* ---------- Kịch bản ---------- */
const scenarios = {
  'Tất cả bid giá sàn (tiết kiệm)': Object.fromEntries(FEMALES.map(f => [f.id, 'min'])),
  'Tất cả bid tối đa (hung hăng)': Object.fromEntries(FEMALES.map(f => [f.id, 'max'])),
  'Cân bằng (value 70%)': Object.fromEntries(FEMALES.map(f => [f.id, 'value'])),
  'Nữ yếu all-in, nữ mạnh tiết kiệm': Object.fromEntries(
    FEMALES.map(f => [f.id, f.strength <= 5 ? 'max' : 'min'])),
};

/* ---------- Main ---------- */
printHeader();

for (const [label, strategies] of Object.entries(scenarios)) {
  console.log('\n\n' + '#'.repeat(66));
  console.log(`# KỊCH BẢN: ${label}`);
  console.log('#'.repeat(66));

  const st = runGame(strategies);
  printReport(st);

  const rep = balanceReport(st, FEMALES, MALES, SETTINGS);
  if (!isFinished(st, SETTINGS)) console.log('\n  ❌ LỖI: chưa hoàn tất đội hình!');
  if (rep.stdDev > 8) console.log('\n  ❌ LỖI: độ lệch quá cao!');
}

console.log('\n' + '='.repeat(66));
console.log('✅ Mô phỏng hoàn tất — mọi kịch bản đều chia đủ 6 đội × 2 nam.\n');