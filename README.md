# 🏸 Đấu Giá Cầu Thủ Cầu Lông

Ứng dụng đấu giá chia đội thi đấu **vui vẻ**: 6 nữ + 12 nam → 6 đội (mỗi đội 1 nữ + 2 nam).
Chỉ dùng **HTML + CSS + JavaScript thuần** (ES modules) và **Firebase Realtime Database**
để đồng bộ realtime.

> Không cần build, không cần framework, không cần backend riêng.

---

## ✨ Tính năng

| | |
|---|---|
| 🎤 **Host** | Bảng điều khiển: mở/chốt từng lượt, đếm ngược, gia hạn, chốt sớm, vòng bổ sung, báo cáo cân bằng |
| 🙋 **Người chơi** | Đăng nhập bằng mật khẩu riêng, đặt giá kín, xem ngân sách, đồng đội, đối thủ |
| 👀 **Khán giả** | Bảng trực tiếp cho máy chiếu — giữ kín bid đang mở, chỉ hiện kết quả khi chốt |
| 🔒 **Bid kín** | Người chơi không thấy bid của nhau |
| ⚖️ **Công bằng** | Ngân sách theo sức mạnh nữ, giá sàn theo rank nam, **luật giữ tiền dự phòng**, tie-break 4 cấp, kết quả tái lập được |
| 🧪 **Test** | **38 unit test** chạy trên Node hoặc trình duyệt |
| 🔌 **Offline mode** | Chưa cấu hình Firebase vẫn chạy được (mô phỏng realtime bằng `BroadcastChannel`) |

---

## 🚀 Chạy nhanh (không cần Firebase)

```bash
npm install      # không có dependency, chỉ để có npm scripts
npm start        # mở http://localhost:5173
```

Hoặc dùng bất kỳ static server nào:

```bash
npx serve .
python -m http.server 5173
```

> ⚠️ **Phải chạy qua HTTP server**, không mở trực tiếp `file://` — vì dùng ES modules.

### Kịch bản test offline (Mock mode)

1. Mở `index.html` trên **1 tab** → tab **Host** → mã phòng `demo`, mật khẩu `host2026` → **Vào phòng Host**.
2. Mở thêm **3–6 tab** `index.html` → tab **Người chơi** → chọn nữ + mật khẩu (`nu01`…`nu06`) → vào phòng.
3. Mở thêm 1 tab → **Khán giả** → `demo` (để chiếu).
4. Trên tab Host: bấm **Bắt đầu vòng 1**.
5. Trên các tab người chơi: nhập điểm, bấm **Xác nhận đặt giá**.
6. Trên tab Host: xem ai đã bid → **Chốt lượt ngay** (hoặc đợi hết giờ).
7. Lặp lại tới khi mọi đội đủ 2 nam.

> 💡 Các tab đồng bộ realtime qua `BroadcastChannel` + `localStorage`.
> Chạy test tự động: `npm test`

---

## 🔥 Kết nối Firebase Realtime Database

### Bước 1 — Tạo project

1. Vào [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. Trong project → **Build → Realtime Database → Create Database**.
   - Chọn location bất kỳ.
   - Bắt đầu ở **Test mode** (cho phép đọc/ghi trong 30 ngày) — đủ để thử.

### Bước 2 — Lấy config

**Project settings (⚙️) → General → Your apps → Web app (`</>`)** → copy object `firebaseConfig`.

### Bước 3 — Dán vào `js/firebase-config.js`

```js
export const firebaseConfig = {
  apiKey: 'AIza...',
  authDomain: 'my-room.firebaseapp.com',
  databaseURL: 'https://my-room-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'my-room',
  // ...
};
```

> ⚠️ `databaseURL` **bắt buộc** phải có. Nếu thiếu, app vẫn chạy nhưng ở chế độ Mock.
> Huy hiệu ở góc trên sẽ chuyển từ **MOCK (OFFLINE)** → **FIREBASE ONLINE**.

### Trạng thái kết nối

App tự kiểm tra kết nối thật (đọc/ghi thử) và hiển thị ở góc phải:

| Biểu tượng | Ý nghĩa |
|---|---|
| 🟡 | Chế độ Mock (offline) |
| 🟠 | Đang kết nối Firebase… |
| 🟢 | Đã kết nối, đọc/ghi được |
| 🔴 | Lỗi — kèm banner đỏ nêu cách khắc phục |

Nếu database bị **vô hiệu hoá** (Firebase trả `HTTP 423 Locked`) hoặc **rules chặn**
(`PERMISSION_DENIED`), app sẽ hiện banner đỏ ngay đầu trang thay vì âm thầm thất bại.

**Cách khắc phục nhanh:**
1. Firebase Console → **Realtime Database** → nếu thấy nút **Create Database** thì DB chưa tồn tại → tạo mới.
2. Tab **Rules** → dán `firebase-rules.json` → **Publish**.
3. Kiểm tra `databaseURL` trong `js/firebase-config.js` khớp với DB vừa tạo
   (region khác thì URL có dạng `...asia-southeast1.firebasedatabase.app`).

### Bước 4 — Áp dụng security rules

Vào **Realtime Database → Rules** → dán nội dung `firebase-rules.json` → **Publish**.

Rules này cho phép mọi người trong phòng đọc/ghi (đủ cho buổi chơi nội bộ),
đồng thời validate dữ liệu bid/team không âm.

---

## ⚖️ Luật đấu giá (tóm tắt)

Chi tiết đầy đủ + phân tích công bằng: [`docs/LUAT-DAU-GIA.md`](docs/LUAT-DAU-GIA.md)

### Ngân sách

Mỗi nữ có ngân sách **tỉ lệ nghịch với sức mạnh** — nữ mạnh nhận ít điểm hơn:

```
budget(nữ) = round( TOTAL / n × (1 + k × (MID − strength) / SPREAD) )
```

Ví dụ 600 điểm / 6 nữ: mạnh nhất **83**, yếu nhất **118**.

### Giá sàn & bước giá

```
minPrice(rank) = round( BASE × (12 − rank + 1) / 12 )   với BASE = 40
```

- Nam hạng 1: giá sàn **40**, nam hạng 12: giá sàn **3**.
- Bước giá **5 điểm** → tránh đua 41–42–43.
- Bid phải **≥ giá sàn** (trừ khi bid = 0 để bỏ qua).
- **Bắt buộc bid > 0** nếu bạn chưa có nam nào.
- **Không được bid vượt điểm còn lại.**

### Luật giữ tiền dự phòng (quan trọng)

```
maxBid = điểmCònLại − (sốNamCònThiếu − 1) × max(minReservePerMale, giáSànRẻNhất)
```

Chặn người chơi **"đốt hết tiền"** ở lượt đầu rồi không mua nổi nam thứ hai.
Ví dụ F6 (118 điểm): lượt 1 tối đa **108** (giữ 10), lượt 2 được **all-in**.
Tinh chỉnh bằng `minReservePerMale` trong `config.js` (0 = tắt).

### Vòng đấu

| Vòng | Nội dung |
|---|---|
| 1 | Mua nam **thứ nhất** (bắt buộc) |
| 2 | Mua nam **thứ hai** |
| Bổ sung | Nam không ai mua được gán tự động, **ưu tiên đội yếu nhận nam mạnh** |

Trong mỗi lượt: host mở → **bid kín** (không ai thấy của nhau) → đếm ngược 60s → **chốt** → công bố.

### Tie-break khi đồng giá (theo thứ tự)

1. **Giá cao hơn** thắng
2. Người **chưa có nam** thắng người đã có *(đảm bảo đủ đội hình)*
3. **Điểm còn lại sau bid thấp hơn** thắng *(cân bằng ngân sách)*
4. **Tổng sức mạnh nam đã có thấp hơn** thắng *(đội yếu được ưu tiên)*
5. **Bốc thăm ngẫu nhiên seeded** — tái lập được, 100% công bằng khi 4 tiêu chí trên bằng nhau

### Báo cáo cân bằng

```
sức mạnh đội = strength(nữ) + Σ(13 − rank(nam))
```

Hiển thị **độ lệch chuẩn (σ)** giữa 6 đội — σ càng nhỏ càng công bằng.
Nếu σ > `balanceWarnStdDev` (mặc định 4.0) → cảnh báo.

> 📌 **Vòng bổ sung có bù trừ chuyên môn**: đội yếu được nhận nam mạnh hơn,
> nên σ giảm mạnh (đo thực tế: **5.76 → 1.11**).

---

## 🗂️ Cấu trúc

```
.
├── index.html              # Trang chủ chọn vai trò
├── host.html               # Bảng điều khiển Host
├── player.html             # Màn hình người chơi
├── spectator.html          # Bảng trực tiếp khán giả
│
├── css/
│   └── style.css           # Toàn bộ giao diện (dark, glassmorphism)
│
├── js/
│   ├── config.js           # ⭐ DỮ LIỆU: 6 nữ, 12 nam, tham số luật
│   ├── auction.js          # ⭐ ENGINE: logic thuần, không DOM/Firebase
│   ├── store.js            # Lớp realtime (Firebase + Mock)
│   ├── firebase-config.js  # ⭐ Dán config Firebase vào đây
│   ├── ui.js               # Tiện ích DOM dùng chung
│   └── pages/
│       ├── landing.js
│       ├── host.js
│       ├── player.js
│       └── spectator.js
│
├── test/
│   ├── cases.js            # Bộ test dùng chung
│   ├── tests.html          # Chạy test trong trình duyệt
│   ├── run-tests.mjs       # Chạy test trên Node
│   └── simulate.mjs        # Mô phỏng 4 kịch bản đấu giá
│
├── docs/
│   └── LUAT-DAU-GIA.md     # Phân tích luật & công bằng chi tiết
│
├── firebase-rules.json     # Security rules
└── package.json
```

---

## ✏️ Tuỳ chỉnh

**Tất cả dữ liệu và tham số nằm trong `js/config.js`** — sửa 1 file là đủ:

```js
export const SETTINGS = {
  eventName: 'Giải Cầu Lông Vui Vẻ 2026',
  hostSecret: 'host2026',       // mật khẩu host
  totalPoints: 600,             // tổng điểm phát
  basePrice: 40,                // giá sàn nam mạnh nhất
  minIncrement: 5,              // bước giá
  minReservePerMale: 10,        // tiền tối thiểu giữ lại cho mỗi nam còn thiếu
  bidSeconds: 60,               // thời gian mỗi lượt
  // ...
};

export const FEMALES = [
  { id: 'F1', name: 'Ngọc Anh', strength: 10, secret: 'nu01', img: '' },
  // ...
];

export const MALES = [
  { id: 'M1', name: 'Tuấn Kiệt', rank: 1, img: '' },
  // ...
];
```

> 💡 Muốn thêm ảnh: điền `img: 'https://...'`. Để trống `''` → dùng avatar chữ cái đầu.

---

## 🧪 Kiểm thử

```bash
npm test                 # 38 unit test (Node)
npm run simulate         # mô phỏng 4 kịch bản bid + báo cáo cân bằng
# hoặc mở test/tests.html trong trình duyệt
```

Bao gồm 38 test: ngân sách, giá sàn, validate bid, **luật giữ tiền dự phòng**,
tie-break, chốt lượt, vòng bổ sung, mô phỏng toàn giải, và các bất biến
(immutability, không vượt ngân sách).

`npm run simulate` chạy 4 kịch bản (tiết kiệm / hung hăng / cân bằng / nữ yếu all-in)
và in báo cáo σ để bạn kiểm tra luật trước buổi chơi thật:

```
📊 CÂN BẰNG
  Sức mạnh trung bình : 19.67
  Độ lệch chuẩn (σ)   : 1.11
  Kết luận            : ✅ CÂN BẰNG TỐT
  Hoàn tất đội hình   : ✅ 6/6 đội đủ 2 nam
```

---

## ⚠️ Lưu ý bảo mật

Bản này phù hợp cho **buổi chơi nội bộ / bạn bè**. Mật khẩu chỉ kiểm tra ở client
(không phải auth thật) và security rules mở cho phòng. **Không dùng cho mục đích thương mại
hoặc đấu giá có giá trị thật.**

---

## 📄 License

MIT — dùng thoải mái cho buổi chơi của bạn. 🏸