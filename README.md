# Bilinovel Crawler (nội bộ)

Tool nội bộ, chạy local, crawl truyện từ bilinovel.com để chuẩn bị build EPUB.

## Cài đặt

```
pip install -r requirements.txt
python -m playwright install chromium
copy .env.example .env
```

Sửa `.env` nếu cần (có thể để trống, có giá trị mặc định):

```
BASE_URL=https://www.bilinovel.com
DEFAULT_NOVEL_ID=4699
```

## Chạy

```
streamlit run app.py
```

Mở trình duyệt tại địa chỉ Streamlit in ra (mặc định http://localhost:8501).

## Trạng thái hiện tại

- Nhập `novel_id`, bấm "Lấy mục lục" để lấy danh sách chapter từ
  `https://www.bilinovel.com/novel/{novel_id}/catalog`.
- Chọn/bỏ chọn chapter bằng checkbox, có nút "Chọn tất cả" / "Bỏ chọn tất cả".
- Bấm "Crawl nội dung" để lấy nội dung các chapter đã chọn (dùng Playwright).
  Kết quả từng chapter hiện trạng thái: ✅ OK / ⚠️ bị chặn (`blocked`) / ❌ lỗi.
- Hoặc dùng **browser extension** (khuyến nghị hơn, xem mục bên dưới) để capture
  nội dung khi bạn tự đọc bằng trình duyệt thật, rồi bấm "Nạp nội dung đã capture".
- **Chưa có** chức năng build EPUB (sẽ bổ sung ở phần sau).

## Cơ chế chống bot của site (quan trọng)

Trang content của bilinovel.com chạy sau Cloudflare và có cơ chế phát hiện request
tự động. Khi bị nghi ngờ, trang trả về nội dung **bị cắt cụt** kèm thông báo lỗi
nhúng sẵn, kể cả khi crawl bằng browser thật (Playwright/Chromium). Tool **không**
áp dụng kỹ thuật né phát hiện bot (stealth plugin, xoay proxy...).

### Dùng cookie từ trình duyệt thật của bạn (tuỳ chọn)

Nếu bạn đã mở chapter bằng trình duyệt thật và trang hiển thị đầy đủ (tức là bạn
đã tự vượt qua kiểm tra của Cloudflare), bạn có thể tái sử dụng cookie phiên đó:

1. Mở DevTools (F12) trên trình duyệt đang xem trang bilinovel.com → tab
   **Application** (Chrome) hoặc **Storage** (Firefox) → **Cookies** →
   chọn domain `bilinovel.com`.
2. Copy các cookie liên quan (đặc biệt `cf_clearance`) vào file
   `cookies.local.json` ở thư mục gốc project — xem mẫu cấu trúc ở
   `cookies.local.example.json`.
3. Chạy lại app — mục "Crawl nội dung" sẽ hiện 🍪 báo đã tìm thấy file cookie.

**Lưu ý:**
- `cookies.local.json` chứa dữ liệu phiên đăng nhập/xác thực của chính bạn —
  **không chia sẻ file này**, không commit vào git (đã có trong `.gitignore`).
- Cookie (đặc biệt `cf_clearance`) có thể hết hạn hoặc gắn với đúng IP đã lấy nó —
  nếu ngừng hoạt động, lấy lại cookie mới từ trình duyệt.
- Đây là dùng lại quyền truy cập hợp lệ của chính bạn (bạn đã tự vượt qua kiểm
  tra bằng trình duyệt thật), không phải kỹ thuật giả mạo tự động.

### Dùng browser extension để capture nội dung (khuyến nghị)

Vì trang bị chặn khi truy cập tự động (kể cả bằng browser thật do Playwright điều
khiển), cách chắc ăn nhất là đọc lại nội dung ngay trong trình duyệt thật của bạn
— nơi bạn tự mở trang bình thường, không có gì để chống bot phát hiện cả.

**Cài extension (Chrome/Edge):**
1. Mở `chrome://extensions` (hoặc `edge://extensions`).
2. Bật **Developer mode** (góc trên phải).
3. Bấm **Load unpacked**, chọn thư mục `extension/` trong project này.

**Chạy capture server (ở 1 terminal riêng, để song song với `streamlit run app.py`):**
```
python capture_server.py
```
Server chạy tại `http://127.0.0.1:8765`, dữ liệu capture được lưu vào `data/`.

**Cách dùng:**
1. Chạy `streamlit run app.py`, lấy mục lục, chọn chapter như bình thường.
2. Tự mở từng chapter đã chọn bằng trình duyệt (đã cài extension) — mỗi lần mở 1
   trang chapter, extension tự đọc nội dung và gửi về server (icon extension hiện
   badge "OK" màu xanh nếu gửi thành công, "ERR" màu đỏ nếu lỗi — nhớ mở capture
   server trước).
3. Với chapter chia nhiều trang, mở lần lượt từng trang (bấm "trang sau" trên
   web) — extension tự capture từng trang, server tự gộp lại theo đúng thứ tự.
4. Quay lại Streamlit app, bấm "Nạp nội dung đã capture" để nạp dữ liệu vào tool.

**Lưu ý:**
- Extension **không tự động mở trang nào** — chỉ đọc lại trang bạn đang tự xem.
- `data/` chứa nội dung truyện đã capture, đã có trong `.gitignore` (không commit).

## Ghi chú kỹ thuật

- `crawler/toc.py` dùng `requests` + `BeautifulSoup` (không cần render JS) để lấy
  mục lục. Một số chapter không có href trong mục lục (VIP-looking nhưng thực ra
  không phải VIP) — module tự resolve link thật qua `ReadParams.url_previous`
  nhúng trong trang content của chapter liền kề.
- Toàn bộ chapter của 1 truyện (mọi volume) nằm trong 1 trang `/catalog` duy nhất,
  không phân trang — đã xác nhận với novel_id=4699 (213 chapter).
- `crawler/content.py` dùng Playwright (cần render JS) để lấy nội dung chapter,
  tự gộp các trang con nếu chapter bị chia nhiều trang, tự chờ nội dung "ổn định"
  (poll thay vì chờ cố định) và tự cắt đoạn văn trùng lặp khi nối nhiều trang.
- Có delay ngẫu nhiên 0.5–1s giữa các request và timeout hợp lý để giảm rủi ro
  bị chặn IP.
- Yêu cầu Python 3.9+ (dùng `str.removesuffix`).
