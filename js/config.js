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

  // ---- ĐẤU GIÁ CÔNG KHAI (ai cũng thấy giá hiện tại) ----
  // Khi có người trả giá trong X giây cuối, tự động cộng thêm thời gian
  // để tránh "bắn tỉa" (snipe) ở phút chót.
  antiSnipeSeconds: 15,          // nếu bid trong X giây cuối thì gia hạn
  antiSnipeExtend: 15,           // cộng thêm bao nhiêu giây khi bị snipe

  // Ngưỡng cảnh báo lệch sức mạnh giữa các đội
  balanceWarnStdDev: 4.0,
};

/* ---------- 2. 6 NỮ ĐƯỢC ĐẤU GIÁ ----------
 * strength: 1..10 (10 = mạnh nhất). Dùng để tính ngân sách.
 * secret  : mật khẩu riêng để vào phòng đấu giá.
 * img     : link ảnh (để trống '' -> dùng avatar chữ cái).
 */
export const FEMALES = [
  { id: 'F1', name: 'Hoa',      strength: 2,    secret: '1', img: 'https://scontent.fdad3-6.fna.fbcdn.net/v/t39.30808-6/495261390_23966071829689598_6465097612011847146_n.jpg?stp=dst-jpg_tt6&cstp=mx960x960&ctp=s960x960&_nc_cat=110&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeH38jwMnCySWFS_30qisnXtH4TgQASWeJwfhOBABJZ4nLML41RCJZe2ohYJ9-_ORiLDzdUYpxyHsfqoGIfrc_rW&_nc_ohc=MypL0BjA0HMQ7kNvwH3NWDU&_nc_oc=Adr-ktKsju_FJsmSuSFigT-Y4lxl8nAyAmUK0zw-riDkSb62V1OtP94QyA-dW66BhIqt6TVPJ9uQ7Yfu9GhPpQ-t&_nc_zt=23&_nc_ht=scontent.fdad3-6.fna&_nc_gid=FIWF23xpcAXNhICB32Pl3w&_nc_ss=7b2a8&oh=00_AQKo1sBgqjIG1AycoD4FWBJ2KyLbHgCaGNERQ5Ya3Xb_HA&oe=6ABEB2D7' },
  { id: 'F2', name: 'Ngọc',     strength: 5,    secret: '2', img: 'https://scontent.fdad3-6.fna.fbcdn.net/v/t39.30808-6/696694075_4433043213577742_3110798705838143578_n.jpg?stp=dst-jpg_tt6&cstp=mx2048x2048&ctp=s2048x2048&_nc_cat=109&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeFY0tKGCay5ciV6PfGk7_fMYz4QC5f_VqVjPhALl_9WpQCoTE-5fgs5vA2l1oRS-h8ipdF_z6FeqIaGgwnCWcOs&_nc_ohc=asqNq4srSXsQ7kNvwHaMJIy&_nc_oc=AdoF9dhDRB0AmWtyU3I02vIP5BdkKP4WvkUiduqxAgkf3GGWEWNGRvs5LQVtb3ShZNWRRfS-Z3T8wHD2YW1gEVkL&_nc_zt=23&_nc_ht=scontent.fdad3-6.fna&_nc_gid=nSHc_GmWBlg9UdEi1404dg&_nc_ss=7b2a8&oh=00_AQIMcdOBBAhGoWoUj63HOaHa80N8R0B3xFOTSzhJuklrRA&oe=6ABED0C8' },
  { id: 'F3', name: 'Hương',    strength: 4,    secret: '3', img: 'https://scontent.fdad3-6.fna.fbcdn.net/v/t39.30808-6/653477230_27320200184236871_988850877047694951_n.jpg?stp=dst-jpg_tt6&cstp=mx960x960&ctp=s960x960&_nc_cat=100&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeHdDuWLtIgME_tiGSkEbP4yZXdYPc2P-hlld1g9zY_6GWdkzcq2EUktkFT9XsROxk6Mr7tCOYyj7rYxETUO6TOe&_nc_ohc=i3lxpdQjIgYQ7kNvwGCv8kL&_nc_oc=Adq3DVlMg-qOUNZR45fqRITWYxj4y2Q24jW_wo2z1VkVNAXJSEroKkNMsbE_fuB74JHXtk5t41tqPvxDH_Mn-ngT&_nc_zt=23&_nc_ht=scontent.fdad3-6.fna&_nc_gid=gpAnVOFY1cFd70vWywDHoA&_nc_ss=7b2a8&oh=00_AQIb4aR-4mwfo2-pVk39Vhkp_BcRX1PZ5pe9JyoQQ8IbrQ&oe=6ABEB793' },
  { id: 'F4', name: 'Linh',     strength: 4,    secret: '4', img: 'https://scontent.fdad3-6.fna.fbcdn.net/v/t39.30808-1/792148800_28602555209381602_709917722147756226_n.jpg?stp=dst-jpg_tt6&cstp=mx1072x1072&ctp=s200x200&_nc_cat=107&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=1d2534&_nc_eui2=AeFcgqRskyDGTL5KZtSeTcga7t8HnZ6Scxbu3wednpJzFrN_LHv9waKBjJPDdwXXt0mmOrULPnGok4RaL7DWGaJx&_nc_ohc=aVyUuGAutLUQ7kNvwGg1nYM&_nc_oc=Adp8OIhUpmhKT_mghD_ScLA04UW9_sunNckfs1wiB-kFi2RjGCaEC0WBAdLWpGPMVtyCFxd-vX9_b5so941B5rpX&_nc_zt=24&_nc_ht=scontent.fdad3-6.fna&_nc_gid=VKtRo5aYeSDvQ2lteeZW9g&_nc_ss=7b2a8&oh=00_AQLofVmsnqduHKp2c6F_7GWQizXR0PW89V84MNcY9eO_9w&oe=6ABEC216' },
  { id: 'F5', name: 'Phượng',   strength: 4,    secret: '5', img: 'https://scontent.fdad3-6.fna.fbcdn.net/v/t39.30808-6/776794671_27780988751581420_4676755240586419701_n.jpg?stp=dst-jpg_tt6&cstp=mx2028x2048&ctp=s2028x2048&_nc_cat=101&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeFsplw6bTA0GYVi4RMySqbY6V0Igq_IuDzpXQiCr8i4PHsgrKo8o36GixWbr_s1FHqLIzH_-ZGsJP7u2KVjeCgp&_nc_ohc=t4sZ9Tu2KSgQ7kNvwGlO2mD&_nc_oc=AdpirAwh52YP5xY-3YNftAsp4YfeeJ8p7SV80-SBo26CYsh4BU6ODdY3p0N__KcNIINLDeB6SdQP_iUQVBwN256a&_nc_zt=23&_nc_ht=scontent.fdad3-6.fna&_nc_gid=AcEMLPji03VoQZk5lB9NPg&_nc_ss=7b2a8&oh=00_AQIfysYqYIErnoq2__B0wQ7iaTP6mxxrfsLmVRqaukJpeg&oe=6ABED899' },
  { id: 'F6', name: 'Châu',     strength: 3,    secret: '6', img: 'https://scontent.fdad3-6.fna.fbcdn.net/v/t39.30808-1/605724828_10214635088746224_5468575712043666125_n.jpg?stp=dst-jpg_tt6&cstp=mx960x958&ctp=s100x100&_nc_cat=100&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=e99d92&_nc_eui2=AeGgnXauLTF1icKi62RTSys2mTORIsiZPJSZM5EiyJk8lJj-MlLXRK0G80rAQep6Diqtr_tXHTqDK-OptwNH7BAo&_nc_ohc=l863yPFDeT4Q7kNvwHuqDXF&_nc_oc=AdqoeG2v5knHpEGSxnafE63aTlQNWd6F2YwCRHSr6EqHcaDPer54cXNAhN2ymX_4sA97UBBGVV_TR7eS0yqmy_TC&_nc_zt=24&_nc_ht=scontent.fdad3-6.fna&_nc_gid=5O9_tvDIbjPg3-rXBGTv0A&_nc_ss=7b2a8&oh=00_AQIdrZGpDd0N-8fm3l-fpQJYoQVlGMGofSLDxXUWHbadwA&oe=6ABEAA3E' },
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