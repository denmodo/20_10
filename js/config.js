/* =============================================================
 * config.js — Toàn bộ dữ liệu & tham số của giải đấu
 * -------------------------------------------------------------
 * CHỈ SỬA FILE NÀY khi muốn đổi người chơi / luật.
 * Không cần đụng tới code khác.
 * ============================================================= */

/* ---------- 1. THAM SỐ GIẢI ĐẤU ---------- */
export const SETTINGS = {
  eventName: 'Giải Cầu Lông Vui Vẻ 2026',
  hostSecret: 'host2026',        // mật khẩu đăng nhập phòng host
  roomSecret: 'room2026',        // mật khẩu chung (tuỳ chọn) — để trống nếu không dùng

  teamsCount: 6,                 // số đội = số nữ
  malesPerTeam: 2,               // số nam mỗi đội
  rounds: 2,                     // số vòng đấu giá chính (= malesPerTeam)

  totalPoints: 600,              // tổng điểm phát cho tất cả nữ
  budgetStrengthFactor: 0.35,    // k = độ bù trừ theo sức mạnh nữ (xem docs)

  basePrice: 40,                 // giá sàn của nam mạnh nhất (rank 1)
  minIncrement: 5,               // bước giá tối thiểu

  // Số điểm TỐI THIỂU phải giữ lại cho mỗi nam còn thiếu.
  // Càng cao thì người chơi càng buộc phải chia đều ngân sách,
  // tránh "đốt hết tiền" ở lượt đầu. (0 = tắt luật dự phòng)
  minReservePerMale: 10,

  bidSeconds: 60,                // thời gian mỗi lượt đấu giá (giây)
  tieBreakSeed: 20260927,        // seed bốc thăm → kết quả tái lập được

  // Ngưỡng cảnh báo lệch sức mạnh giữa các đội
  balanceWarnStdDev: 4.0,
};

/* ---------- 2. 6 NỮ ĐƯỢC ĐẤU GIÁ ----------
 * strength: 1..10 (10 = mạnh nhất). Dùng để tính ngân sách.
 * secret  : mật khẩu riêng để vào phòng đấu giá.
 * img     : link ảnh (để trống '' -> dùng avatar chữ cái).
 */
export const FEMALES = [
  { id: 'F1', name: 'Hoa',      strength: 2,    secret: '1', img: '' },
  { id: 'F2', name: 'Ngọc',     strength: 5,    secret: '2', img: '' },
  { id: 'F3', name: 'Hương',    strength: 4,    secret: '3', img: '' },
  { id: 'F4', name: 'Linh',     strength: 4,    secret: '4', img: '' },
  { id: 'F5', name: 'Phượng',   strength: 4,    secret: '5', img: '' },
  { id: 'F6', name: 'Châu',     strength: 3,    secret: '6', img: '' },
];

/* ---------- 3. 12 NAM ĐƯỢC ĐẤU GIÁ ----------
 * rank: 1..12 (1 = mạnh nhất). Giá sàn tự tính từ basePrice + rank.
 */
export const MALES = [
  { id: 'M1',   name: 'Tân',     rank: 1,  img: '' },
  { id: 'M2',   name: 'Hà',      rank: 2,  img: '' },
  { id: 'M3',   name: 'Đức',     rank: 3,  img: '' },
  { id: 'M4',   name: 'Bộp',     rank: 4,  img: '' },
  { id: 'M5',   name: 'Thái',    rank: 5,  img: '' },
  { id: 'M6',   name: 'Tép',     rank: 5,  img: '' },
  { id: 'M7',   name: 'Nam',     rank: 5,  img: '' },
  { id: 'M8',   name: 'Diễn',    rank: 6,  img: '' },
  { id: 'M9',   name: 'Công',    rank: 8,  img: '' },
  { id: 'M10',  name: 'Bình',    rank: 8,  img: '' },
  { id: 'M11',  name: 'a Hiếu',  rank: 8,  img: '' },
  { id: 'M12',  name: 'Huân',    rank: 9,  img: '' },
];

/* =============================================================
 * 4. HÀM TÍNH TOÁN (không sửa trừ khi đổi công thức luật)
 * ============================================================= */

/** Ngân sách của 1 nữ, tỉ lệ nghịch với strength (nữ mạnh -> ít điểm). */
export function computeBudget(female, females = FEMALES, s = SETTINGS) {
  const n = females.length;
  const strengths = females.map(f => f.strength);
  const mid = strengths.reduce((a, b) => a + b, 0) / n;
  const max = Math.max(...strengths);
  const min = Math.min(...strengths);
  const spread = Math.max(1, max - min);
  const raw = (s.totalPoints / n) * (1 + s.budgetStrengthFactor * (mid - female.strength) / spread);
  return Math.round(raw);
}

/** Giá sàn của 1 nam theo rank (rank 1 = mạnh nhất = đắt nhất). */
export function computeMinPrice(male, males = MALES, s = SETTINGS) {
  const n = males.length;
  return Math.round(s.basePrice * (n - male.rank + 1) / n);
}

/** Sức mạnh chuyên môn của 1 nam (rank 1 -> cao nhất). */
export function maleScore(male, males = MALES) {
  return males.length - male.rank + 1;
}

/** Bảng ngân sách đầy đủ để host xem trước. */
export function budgetTable(females = FEMALES, s = SETTINGS) {
  return females.map(f => ({ ...f, budget: computeBudget(f, females, s) }));
}

/** Bảng giá sàn đầy đủ của nam. */
export function priceTable(males = MALES, s = SETTINGS) {
  return males.map(m => ({ ...m, minPrice: computeMinPrice(m, males, s), score: maleScore(m, males) }));
}