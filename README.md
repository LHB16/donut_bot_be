# 🍩 Donut Minecraft Bedrock AFK Bot

Bot AFK cho **Minecraft Bedrock Edition** viết bằng **Node.js** + **bedrock-protocol**. Tích hợp bảng điều khiển Web UI đơn giản, nhẹ, tải nhanh với giao diện Dark theme.

---

## ✨ Tính Năng

- **Web UI đơn giản & nhẹ:** Giao diện Dark theme tối giản, không dùng hiệu ứng nặng, tải nhanh trên mọi thiết bị.
- **Giữ kết nối ổn định 24/7:** Duy trì online bằng phản hồi latency tự động. Bot đứng im hoàn toàn, tránh bị anti-cheat phát hiện.
- **Auto Reconnect:** Tự kết nối lại sau 10 giây khi server restart hoặc mất mạng.
- **Lọc mã màu Minecraft:** Tự động loại bỏ các ký hiệu `§` để log hiển thị plain text sạch sẽ.
- **Chat & Lệnh trực tiếp:** Gửi tin nhắn hoặc lệnh (`/msg`, `/lobby`, `/pay`, `/tpa`) từ Web UI vào server.
- **Xác thực Microsoft trên Web UI:** Hiển thị mã code và link đăng nhập Microsoft ngay trên Web UI kèm đếm ngược 3 phút, không cần mở Console.
- **Bảo mật (`WEB_PASSWORD`):** Bảo vệ Web UI bằng mật khẩu.

---

## 🛠️ Yêu Cầu

- **Node.js** 16.x trở lên (khuyên dùng 18.x hoặc 20.x).
- Server Minecraft Bedrock phiên bản mới nhất.

---

## 🚀 Chạy Local

### 1. Cài đặt
```bash
npm install
```

### 2. Thiết lập mật khẩu
Mở file `.env` và thiết lập:
```env
WEB_PASSWORD=mật_khẩu_của_bạn
```
*(Để trống nếu không cần bảo mật).*

### 3. Khởi động
```bash
npm start
```

> [!IMPORTANT]
> Sau khi chạy, kiểm tra Console để lấy link truy cập Web UI:
> ```
> ==================================================
>  🚀 Minecraft Bedrock AFK Bot Web Server đang chạy!
>  🌐 Web UI: http://localhost:3000
>  🔒 Chế độ bảo mật: BẬT
> ==================================================
> ```
> Truy cập `http://localhost:3000` trên trình duyệt để điều khiển bot.

---

## 🔑 Đăng Nhập Microsoft (Online Mode)

Khi dùng tài khoản Microsoft (`offline: false`):

1. Nhấn **Bắt đầu AFK** trên Web UI.
2. Một banner hiện ra trên Web UI hiển thị **mã code 8 ký tự** và nút link đến trang đăng nhập Microsoft.
3. Copy mã code → truy cập [microsoft.com/link](https://microsoft.com/link) → nhập mã → đăng nhập.
4. Bot tự động kết nối sau khi xác thực. Lần sau không cần đăng nhập lại (lưu trong `auth-cache/`).

---

## ☁️ Deploy Lên Render.com

### 1. Đẩy code lên GitHub
```bash
git init
git add .
git commit -m "feat: initial commit"
git branch -M main
git remote add origin https://github.com/TÊN/TÊN_REPO.git
git push -u origin main
```

### 2. Tạo Web Service trên Render.com
1. Truy cập [render.com](https://render.com/) → **New** → **Web Service**.
2. Kết nối GitHub và chọn repository.

### 3. Cấu hình
| Mục | Giá trị |
|---|---|
| Branch | `main` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | Free |

### 4. Biến môi trường
- `PORT`: `3000`
- `WEB_PASSWORD`: Mật khẩu bạn muốn dùng.

Sau khi deploy xong, truy cập link Render cung cấp để điều khiển bot.

---

## 🔒 Lưu Ý Bảo Mật

- **Luôn đặt `WEB_PASSWORD`** khi deploy lên cloud.
- Dùng [UptimeRobot](https://uptimerobot.com/) ping 5 phút/lần để tránh Render Free Tier ngủ đông.
