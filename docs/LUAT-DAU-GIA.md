# Phân tích luật đấu giá — Giải cầu lông vui vẻ

Mục tiêu: **6 đội**, mỗi đội = **1 nữ + 2 nam**. Đấu giá vui vẻ, công bằng, minh bạch,
không cần server riêng (chỉ HTML/CSS/JS + Firebase Realtime Database).

## Kiểu đấu giá: **CÔNG KHAI NHẢY LIÊN TỤC** (live / ascending)

> ⚠️ Bản này KHÔNG dùng đấu giá kín. Mọi người **đều thấy giá cao nhất hiện tại**
> và **ai đang dẫn đầu**. Ai muốn thắng phải trả **cao hơn** người đang dẫn.

```
Giá khởi điểm = giá sàn của nam
Người đầu tiên  → trả đúng giá khởi điểm
Người tiếp theo → phải trả ≥ giáDẫn + bướcGiá (5 điểm)
Hết giờ (có chống bắn tỉa) → người dẫn đầu thắng
```

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

> ⚠️ **Nguyên tắc then chốt:** vì **mọi nữ đều mua đúng 2 nam**, nên nếu ai cũng
> có số điểm bằng nhau thì đội của nữ giỏi sẽ **yếu hơn** (cô ấy không đủ tiền
> mua nam mạnh). Vì vậy ngân sách phải **tỉ lệ THUẬN với sức mạnh nữ**.

Công thức (dùng trong `js/config.js`):

```
budget(nữ) = totalPoints / n × (1 + k × (strength − MID) / SPREAD)
```

- `totalPoints` = tổng điểm của cả giải (vd 600)
- `strength` 1..10 (10 = nữ giỏi nhất)
- `MID` = trung bình strength của các nữ
- `SPREAD` = (max − min) strength
- `k` = độ chênh lệch (mặc định **0.35**); `k = 0` → chia đều

**Vì sao tỉ lệ thuận lại công bằng?**

Tổng sức mạnh cả giải = `Σ strength(nữ) + Σ score(nam)`.
Chia đều cho 6 đội → mỗi đội cần đạt mục tiêu `T`.

| Nữ | strength | Cần mua nam tổng score | Nên có ngân sách |
|---|---|---|---|
| Giỏi (5) | cao | thấp hơn T | nhiều hơn (mua nam mạnh) |
| Yếu (2) | thấp | cao hơn T | ít hơn (mua nam vừa) |

Nếu làm ngược lại (nữ giỏi nhận **ít** điểm) thì nữ giỏi bị ép mua nam yếu → đội yếu đi,
trong khi nữ yếu lại dư tiền mua nam mạnh → **đội lệch nhau rõ rệt**.

Ví dụ với TOTAL = 600, 6 nữ strength `[2,5,4,4,4,3]`:

| Nữ | strength | Ngân sách |
|---|---|---|
| Hoa | 2 | 81 |
| Ngọc | 5 | **116** |
| Hương / Linh / Phượng | 4 | 104 |
| Châu | 3 | 92 |
| | | **601** |

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

## 4. Chia lượt (round)

Chia **2 vòng**:

```
Vòng 1: mỗi nữ mua nam THỨ NHẤT
Vòng 2: mỗi nữ mua nam THỨ HAI
```

Trong mỗi vòng:
1. Host bấm **Bắt đầu** → giá khởi điểm = giá sàn của nam.
2. Ai muốn mua thì bấm **Trả giá** — giá nhảy lên tức thì, **mọi người thấy ngay**.
3. Người khác thấy giá đang dẫn → bấm **Vượt giá** để trả cao hơn (≥ +5).
4. Hết giờ (countdown 60s) hoặc host **Chốt lượt** → người dẫn đầu thắng.

### Chống "bắn tỉa" (anti-snipe)

Nếu có người trả giá trong **15 giây cuối**, đồng hồ **tự động cộng thêm 15 giây**.
Nhờ vậy không ai thắng nhờ "núp" tới giây chót — mọi người đều có cơ hội đáp trả.

Điều chỉnh trong `config.js`: `antiSnipeSeconds`, `antiSnipeExtend`.

---

## 5. Vì sao không cần tie-break?

Trong đấu giá **công khai**, mỗi người buộc phải trả **cao hơn** người đang dẫn
⇒ giá luôn khác nhau ⇒ người cao nhất luôn thắng, không bao giờ đồng giá.

Tuy vậy engine vẫn giữ **lưới an toàn 5 cấp** (dùng khi dữ liệu bị lệch do lỗi mạng):

1. **Giá cao hơn** thắng
2. Người **chưa có nam** thắng *(đảm bảo đủ đội hình)*
3. **Điểm còn lại sau khi trả thấp hơn** thắng
4. **Tổng sức mạnh nam đã có thấp hơn** thắng
5. **Bốc thăm seeded** — tái lập được

---

## 6. Nam không ai bid thì sao?

Sau 2 vòng, còn nam chưa được mua → chạy **vòng bổ sung**:

```
Lặp: chọn nữ theo thứ tự ưu tiên:
     1. Thiếu nhiều nam nhất
     2. ÍT LỰA CHỌN NHẤT (ít nam trong tầm giá)  ← để không ai bị bỏ rơi
     3. Xa mục tiêu tổng sức mạnh nhất          ← bù trừ chuyên môn
     4. Còn nhiều điểm nhất
     → gán nam đưa đội GẦN MỤC TIÊU T nhất (không vượt quá xa)
     → lặp tới khi mọi nữ đủ 2 nam
```

**Vì sao ưu tiên (2) lại quan trọng?**
Nếu đội nhiều tiền được phục vụ trước, họ sẽ lấy hết nam rẻ → đội vừa trả giá cao
(chỉ còn vài điểm) **không mua được ai** → đội hình thiếu người.

**Fallback:** nếu một đội còn quá ít điểm tới mức không mua nổi nam rẻ nhất,
engine tự "giảm giá" cho nam đó (trả bằng số điểm đang có) để **mọi đội luôn đủ 2 nam**.

Kết quả đo được (4 kịch bản bid khác nhau):

| Thuật toán | σ | Hoàn tất đội hình |
|---|---|---|
| Chỉ lấp chỗ trống | 5.76 ❌ | ❌ thiếu người |
| Bù trừ + ưu tiên ít lựa chọn | **1.41 – 1.73** ✅ | ✅ 6/6 |

---

## 7. Công bằng sau khi chia đội — kiểm tra

Sau khi chia xong, hiển thị bảng **cân bằng**:

- `sức mạnh đội = strength(nữ) + Σ(13 − rank(nam))`
- **Độ lệch chuẩn (std dev)** giữa 6 đội → càng nhỏ càng công bằng.
- **Điểm dư** của mỗi nữ (nên ~10–20% để dự phòng).

Nếu std dev > ngưỡng (vd 4.0) → host có thể chạy lại vòng bổ sung hoặc thương lượng.

---

## 8. Toàn bộ bảng quy tắc (checklist)

- [x] **Đấu giá CÔNG KHAI**: ai cũng thấy giá cao nhất + ai đang dẫn
- [x] Người sau phải trả **cao hơn** người đang dẫn (≥ +5 điểm)
- [x] **Chống bắn tỉa**: bid trong 15s cuối → tự động gia hạn 15s
- [x] Ngân sách cá nhân hoá theo strength nữ
- [x] Giá sàn theo rank nam + bước giá 5
- [x] **Luật giữ tiền dự phòng** (chống đốt hết tiền)
- [x] Bắt buộc mua (must-buy) khi chưa có nam
- [x] 2 vòng cố định + vòng bổ sung tự động
- [x] Không cho trả vượt điểm còn lại
- [x] **Vòng bổ sung bù trừ chuyên môn** → σ ≈ 1.1
- [x] **Host là trọng tài**: xác nhận bid qua hàng đợi `pending` (chống gian lận)
- [x] Báo cáo cân bằng + điểm dư
- [x] Toàn bộ kết quả **tái lập được** (seeded)
- [x] **Presence**: host thấy ai đang online, tự xoá khi rời trang

---

## 9. Cách test nhanh mà không cần Firebase

```bash
npm test                                  # 38 unit test trên Node
```

Mở `test/tests.html` trong trình duyệt để chạy test có giao diện.

Mô phỏng realtime đa tab: chưa cấu hình Firebase vẫn chạy được — dùng
`BroadcastChannel` + `localStorage` để đồng bộ giữa các tab trong cùng máy.

Mã phòng cố định là `main` (thiết kế cho buổi chơi dùng 1 lần).