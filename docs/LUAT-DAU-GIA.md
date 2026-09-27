# Phân tích luật đấu giá — Giải cầu lông vui vẻ

Mục tiêu: **6 đội**, mỗi đội = **1 nữ + 2 nam**. Đấu giá vui vẻ, công bằng, minh bạch,
không cần server riêng (chỉ HTML/CSS/JS + Firebase Realtime Database).

---

## 1. Vì sao cần "luật" thay vì đấu giá tự do?

Nếu ai cũng có cùng số điểm và bid tự do, sẽ xảy ra 4 vấn đề:

| Vấn đề | Ví dụ | Hệ quả |
|---|---|---|
| **Bid vô nghĩa / thổi giá** | Nữ A bid 999 điểm cho nam số 1 | Phá giá ngay lượt đầu |
| **Đợi "mua hớ" cuối giờ** | Cả 6 nữ cùng để dành điểm tới phút chót | Lượt đầu không ai bid, nhàm chán |
| **Đội mạnh quá** | Ai cũng dồn hết vào nam rank 1 & 2 | Mất cân bằng chuyên môn |
| **Không đủ tiền mua 2 nam** | Tiêu hết ở nam 1, nam 2 không ai mua | Không đủ đội hình |

→ Cần 3 cơ chế: **ngân sách có công thức**, **giá sàn theo rank**, **thuật toán ghép công bằng**.

---

## 2. Ngân sách: mỗi nữ bao nhiêu điểm?

Bid càng cao = nam càng mạnh (rank nhỏ). Muốn công bằng về **tổng sức mạnh đội**,
ngân sách phải tỉ lệ nghịch với sức mạnh của nữ.

Công thức (dùng trong `js/config.js`):

```
budget(nữ) = round( TOTAL / n × (1 + k × (MID - strength) / SPREAD) )
```

- `TOTAL` = tổng điểm của cả giải (vd 600)
- `strength` 1..10 (10 = nữ giỏi nhất)
- `MID` = trung bình strength của các nữ (vd 6.5)
- `SPREAD` = (max − min) strength (= 5)
- `k` = độ "bù trừ" (mặc định **0.35**)

**Nguyên tắc vàng:** chỉ nên dùng **khoảng 80–90% ngân sách** để bid.
Engine **tự động ép** luật này bằng `minReservePerMale` (xem mục 3b) —
người chơi không thể tiêu hết tiền ở lượt đầu.

Ví dụ với TOTAL = 600, 6 nữ:

| Nữ | strength | Ngân sách | Ghi chú |
|---|---|---|---|
| A | 10 | 83 | Mạnh nhất → ít điểm nhất |
| B | 9 | 88 | |
| C | 7 | 98 | |
| D | 6 | 103 | |
| E | 5 | 108 | |
| F | 3 | 118 | Yếu nhất → nhiều điểm nhất |
| | | **598** | |

---

## 3. Giá sàn theo rank nam

Rank 1 = mạnh nhất. Giá sàn tăng dần theo độ mạnh:

```
minPrice(rank) = round( BASE × (N − rank + 1) / N )
```

Với `BASE = 40`, 12 nam: rank 1 = 40, rank 6 = 23, rank 12 = 3.

Quy tắc:
- **Bid = 0** được phép (bỏ qua, không mất gì) — nhưng chỉ khi bạn đã có ≥ 1 nam.
- **Bid > 0** thì phải **≥ giá sàn**.
- Nữ **chưa có nam nào** bắt buộc bid > 0 (luật "must buy").
- **Bước giá (min increment)** = 5 điểm → tránh cuộc đua 41–42–43.
- **Bid không được vượt số điểm còn lại.**

---

## 3b. Luật GIỮ TIỀN DỰ PHÒNG — chống "đốt hết tiền"

**Vấn đề:** Nữ F6 có 118 điểm. Nếu không có luật, F6 bid 118 cho nam hạng 1
→ thắng, nhưng **còn 0 điểm** → không mua được nam thứ 2 → đội không đủ người.

**Giải pháp:** bid tối đa bị chặn để luôn còn đủ tiền mua nam còn lại:

```
maxBid = điểmCònLại − (sốNamCònThiếu − 1) × max(minReservePerMale, giáSànRẻNhất)
```

Với `minReservePerMale = 10` (trong `config.js`):

| Nữ | Ngân sách | Lượt mua nam 1 | Lượt mua nam 2 |
|---|---|---|---|
| F6 | 118 | tối đa **108** (giữ 10) | được tiêu **hết** |

Điểm hay:
- **Lượt cuối không giới hạn** → vẫn có thể "all-in" gay cấn.
- `minReservePerMale` càng cao → buộc chia đều ngân sách hơn.
- Đặt `minReservePerMale = 0` để tắt luật này (không khuyến khích).
- Engine có **fallback**: nếu giới hạn chặt hơn cả giá sàn → tự nới để tránh kẹt.

---

## 4. Chia lượt (round) — chống dồn điểm cuối

Thay vì đấu giá tự do, chia **2 vòng**:

```
Vòng 1: mỗi nữ mua nam THỨ NHẤT (bắt buộc)
Vòng 2: mỗi nữ mua nam THỨ HAI
```

Trong mỗi vòng:
1. Host bấm **Mở bid** → tất cả nữ nhập bid **kín** (không ai thấy bid của nhau).
2. Hết giờ (countdown 60s) hoặc tất cả đã bid → **Chốt lượt**.
3. Engine tính ai thắng → công bố → hiển thị đội hình.

Lợi ích:
- **Kín (sealed-bid)** ⇒ không ai "hù" theo người khác ⇒ không khí công bằng.
- **2 vòng** ⇒ không thể "để dành hết cho cuối" vì vòng 1 bắt buộc phải mua.
- Countdown tạo kịch tính nhưng **không** cho phép bid sau khi chốt.

---

## 5. Xử lý **đồng giá** (tie-break) — phần quan trọng nhất

Khi 2 nữ cùng bid bằng nhau cho cùng 1 nam, cần thứ tự ưu tiên **xác định trước**,
minh bạch, không thiên vị:

Thứ tự ưu tiên (áp dụng tuần tự):

1. **Ưu tiên người cần hơn** — nữ chưa có nam nào thắng nữ đã có 1 nam.
   *(đảm bảo mọi đội đủ 2 nam)*
2. **Điểm còn lại sau khi bid thấp hơn thắng** — ai "nghèo" hơn được ưu tiên.
   *(cân bằng ngân sách về sau)*
3. **Tổng strength các nam đã có thấp hơn thắng** — đội yếu hơn về chuyên môn được ưu tiên.
4. **Bốc thăm ngẫu nhiên (seeded)** — dùng seed cố định + mã bid để tái lập kết quả.
   *(100% công bằng khi 3 tiêu chí trên bằng nhau)*

> ⚠️ **Không** dùng "nữ nào giơ tay trước" vì phụ thuộc mạng/lag → không công bằng.

Nếu **một nam bị nhiều nữ muốn nhưng giá cao nhất vượt ngân sách**: người bid cao nhất
thắng, miễn bid ≤ điểm còn lại.

---

## 6. Nam không ai bid thì sao?

Sau 2 vòng, còn nam chưa được mua → chạy **vòng bổ sung**:

```
Lặp: chọn nữ theo thứ tự ưu tiên:
     1. Thiếu nhiều nam nhất
     2. Tổng sức mạnh đội THẤP nhất  ← bù trừ chuyên môn
     3. Còn nhiều điểm nhất
     → gán nam có rank tốt nhất mà nữ đó còn đủ tiền mua (giá = giá sàn)
     → lặp tới khi mọi nữ đủ 2 nam
```

**Quan trọng:** ưu tiên (2) khiến **đội yếu nhận nam mạnh hơn** → đội hình
cân bằng hơn hẳn so với việc chỉ "lấp chỗ trống".

Kết quả đo được (6 đội, 12 nam):

| Thuật toán | Độ lệch σ |
|---|---|
| Chỉ lấp chỗ trống | 5.76 ❌ |
| Có bù trừ chuyên môn | **1.11** ✅ |

---

## 7. Công bằng sau khi chia đội — kiểm tra

Sau khi chia xong, hiển thị bảng **cân bằng**:

- `sức mạnh đội = strength(nữ) + Σ(13 − rank(nam))`
- **Độ lệch chuẩn (std dev)** giữa 6 đội → càng nhỏ càng công bằng.
- **Điểm dư** của mỗi nữ (nên ~10–20% để dự phòng).

Nếu std dev > ngưỡng (vd 4.0) → host có thể chạy lại vòng bổ sung hoặc thương lượng.

---

## 8. Toàn bộ bảng quy tắc (checklist)

- [x] Ngân sách cá nhân hoá theo strength nữ
- [x] Giá sàn theo rank nam + bước giá 5
- [x] **Luật giữ tiền dự phòng** (chống đốt hết tiền)
- [x] Bid kín theo vòng, có countdown
- [x] Bắt buộc mua (must-buy) khi chưa có nam
- [x] 2 vòng cố định + vòng bổ sung tự động
- [x] Tie-break 4 cấp, cấp cuối là bốc thăm seeded
- [x] Không cho bid vượt điểm còn lại
- [x] **Vòng bổ sung bù trừ chuyên môn** → σ ≈ 1.1
- [x] Báo cáo cân bằng + điểm dư
- [x] Toàn bộ kết quả **tái lập được** (seeded)

---

## 9. Cách test nhanh mà không cần Firebase

```bash
npm test                                  # 38 unit test trên Node
```

Mở `test/tests.html` trong trình duyệt để chạy test có giao diện.

Mô phỏng realtime đa tab: chưa cấu hình Firebase vẫn chạy được — dùng
`BroadcastChannel` + `localStorage` để đồng bộ giữa các tab trong cùng máy.

Mã phòng cố định là `main` (thiết kế cho buổi chơi dùng 1 lần).