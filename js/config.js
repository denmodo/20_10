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
  { id: 'F1', name: 'Ngọc Anh',  strength: 10, secret: 'nu01', img: '' },
  { id: 'F2', name: 'Thu Hà',    strength: 9,  secret: 'nu02', img: '' },
  { id: 'F3', name: 'Minh Thư',  strength: 7,  secret: 'nu03', img: '' },
  { id: 'F4', name: 'Bảo Trân',  strength: 6,  secret: 'nu04', img: '' },
  { id: 'F5', name: 'Lan Phương',strength: 5,  secret: 'nu05', img: '' },
  { id: 'F6', name: 'Hồng Nhung',strength: 3,  secret: 'nu06', img: '' },
];

/* ---------- 3. 12 NAM ĐƯỢC ĐẤU GIÁ ----------
 * rank: 1..12 (1 = mạnh nhất). Giá sàn tự tính từ basePrice + rank.
 */
export const MALES = [
  { id: 'M1',  name: 'Tuấn Kiệt',  rank: 1,  img: '' },
  { id: 'M2',  name: 'Đức Huy',    rank: 2,  img: '' },
  { id: 'M3',  name: 'Hoàng Long', rank: 3,  img: '' },
  { id: 'M4',  name: 'Văn Sơn',    rank: 4,  img: '' },
  { id: 'M5',  name: 'Quốc Bảo',   rank: 5,  img: '' },
  { id: 'M6',  name: 'Trọng Nghĩa',rank: 6,  img: '' },
  { id: 'M7',  name: 'Anh Dũng',   rank: 7,  img: '' },
  { id: 'M8',  name: 'Minh Quân',  rank: 8,  img: '' },
  { id: 'M9',  name: 'Hải Đăng',   rank: 9,  img: '' },
  { id: 'M10', name: 'Thanh Tùng', rank: 10, img: '' },
  { id: 'M11', name: 'Xuân Trường',rank: 11, img: '' },
  { id: 'M12', name: 'Bá Khiêm',   rank: 12, img: '' },
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