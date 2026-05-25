# 🍩 Donut Minecraft Bedrock AFK Bot with Premium Web UI

Một dự án bot AFK chuyên nghiệp, ổn định dành riêng cho **Minecraft Bedrock Edition (BE)** được viết bằng **Node.js** và thư viện **`bedrock-protocol` (v3.56.1)**. Ứng dụng tích hợp bảng điều khiển Web UI realtime đỉnh cao mang phong cách **Glassmorphism**, đồng thời được trang bị cơ chế bảo mật mật khẩu (`WEB_PASSWORD`) để bảo vệ an toàn tuyệt đối khi bạn deploy lên **Render.com**.

---

## ✨ Các Tính Năng Nổi Bật

- **Giao diện Web UI Premium:** Giao diện điều khiển mượt mà phong cách Glassmorphism, đèn LED trạng thái động (Pulse Effect), thiết kế sang trọng, tối ưu trên cả máy tính và điện thoại.
- **Anti-AFK & Giữ Bot Đứng Đúng 1 Chỗ:**
  - **Xoay đầu định kỳ (Yaw/Pitch Rotation):** Bot sẽ tự động xoay nhẹ góc nhìn qua lại để đánh lừa cơ chế kiểm tra AFK của server, trong khi cơ thể vẫn đứng yên 100% tại chỗ.
  - **Gửi tin nhắn / Lệnh định kỳ:** Gửi tin nhắn tự động (ví dụ: `.`, `/afk`) để reset bộ đếm AFK của máy chủ.
- **Auto Reconnect Thông Minh:** Tự động kết nối lại khi server reset hoặc mất mạng. Chỉ dừng khi người dùng chủ động bấm **"Ngắt Kết Nối"** trên Web UI.
- **Realtime Terminal Logs:** Đẩy logs và các tin nhắn chat trong game về giao diện Web thời gian thực thông qua kết nối WebSocket (Socket.io) cực nhanh.
- **Trò Chuyện Trực Tiếp (Direct Chat):** Cho phép bạn gõ tin nhắn hoặc gửi các câu lệnh Minecraft (ví dụ: `/pay`, `/lobby`, `/tpa`) từ Web UI truyền thẳng vào máy chủ.
- **Bảo Mật Tuyệt Đối (`WEB_PASSWORD`):** Bảo vệ Web điều khiển bằng mật khẩu để ngăn chặn người lạ can thiệp khi bạn deploy bot lên Render.com.

---

## 🛠️ Yêu Cầu Hệ Thống

- **Node.js:** Phiên bản 16.x trở lên (Khuyên dùng 18.x hoặc 20.x).
- **Minecraft Bedrock Server:** Bot hỗ trợ kết nối hầu hết các phiên bản server Minecraft Bedrock mới nhất hiện nay (phiên bản `1.21.x`).

---

## 🚀 Hướng Dẫn Chạy Dưới Local (Máy Tính Cá Nhân)

### Bước 1: Tải dependencies
Sau khi tải mã nguồn về máy, bạn mở Terminal tại thư mục dự án và chạy lệnh sau để cài đặt các thư viện:
```bash
npm install
```

### Bước 2: Thiết lập mật khẩu bảo mật
Mở tệp `.env` tại thư mục dự án và thiết lập mật khẩu truy cập Web UI của bạn tại dòng:
```env
WEB_PASSWORD=mật_khẩu_của_bạn_ở_đây
```
*(Nếu để trống, Web UI sẽ không yêu cầu nhập mật khẩu. Khuyên dùng mật khẩu khi chạy công khai).*

### Bước 3: Khởi động Server điều khiển
Chạy lệnh sau để khởi động dự án:
```bash
npm start
```
Màn hình console sẽ hiển thị:
```text
==================================================
 🚀 Minecraft Bedrock AFK Bot Web Server đang chạy!
 🌐 Web UI: http://localhost:3000
 🔒 Chế độ bảo mật: BẬT (Mật khẩu được yêu cầu)
==================================================
```
Mở trình duyệt và truy cập `http://localhost:3000` để bắt đầu cấu hình và điều khiển bot!

---

## ☁️ Hướng Dẫn Deploy Lên Render.com (Treo Bot 24/7 Miễn Phí)

Dưới đây là các bước chi tiết để bạn deploy dự án này lên **Render.com** (dưới dạng một Web Service):

### Bước 1: Đẩy mã nguồn lên GitHub của bạn
1. Tạo một Repository mới trên GitHub (ví dụ đặt tên là `donutsmp-be-bot`).
2. Khởi tạo Git tại thư mục dự án cục bộ, commit toàn bộ mã nguồn lên GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit for bedrock afk bot"
   git branch -M main
   git remote add origin https://github.com/TÊN_GITHUB_CỦA_BẠN/TÊN_REPO.git
   git push -u origin main
   ```
   *(Chú ý: Hãy đảm bảo bạn **không** push tệp `.env` chứa mật khẩu nhạy cảm lên GitHub công khai bằng cách giữ nguyên tệp `.gitignore` hoặc không commit nó).*

### Bước 2: Tạo dự án mới trên Render.com
1. Truy cập vào [Render.com](https://render.com/) và đăng nhập (bằng tài khoản GitHub).
2. Nhấn nút **New +** ở góc trên cùng bên phải và chọn **Web Service**.
3. Kết nối với tài khoản GitHub của bạn và chọn repository bot vừa đẩy lên.

### Bước 4: Thiết lập cấu hình Render Web Service
Trong trang thiết lập của Web Service, điền các thông tin như sau:
- **Name:** Đặt tên cho bot của bạn (ví dụ: `donut-afk-bot`).
- **Language:** Chọn `Node`.
- **Branch:** Chọn `main`.
- **Region:** Chọn khu vực gần bạn nhất (ví dụ: `Singapore` để có ping tốt nhất tới server VN/Châu Á).
- **Runtime:** `Node`.
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Instance Type:** Chọn gói **Free** (Miễn phí).

### Bước 5: Cấu hình biến môi trường Bảo mật (QUAN TRỌNG)
1. Kéo xuống dưới trang thiết lập, nhấn vào mục **Advanced** (hoặc chuyển sang tab **Environment** sau khi tạo).
2. Nhấn **Add Environment Variable** để thêm 2 biến bắt buộc sau:
   - **`PORT`**: Điền là `3000` (Render sẽ tự động lắng nghe cổng này).
   - **`WEB_PASSWORD`**: Nhập mật khẩu bạn muốn dùng để truy cập điều khiển Web UI (Ví dụ: `MySecretBotPass123`).
3. Nhấn **Create Web Service** và đợi Render tiến hành build và deploy.

Sau khi Render báo **Deploy Successful**, bạn sẽ nhận được một đường link truy cập dạng: `https://tên-bot-của-bạn.onrender.com`. 
Mở link này lên, nhập mật khẩu an toàn của bạn và bắt đầu treo bot 24/7 hoàn toàn miễn phí!

---

## 🔒 Khuyến cáo Bảo mật khi Deploy lên Cloud

- **Luôn luôn thiết lập `WEB_PASSWORD`:** Không bao giờ deploy bot lên Render mà không cài đặt mật khẩu, vì bất kỳ ai có đường dẫn cũng có thể vào xem IP server game của bạn và tắt/bật bot.
- **Tránh bị Cloud ngủ đông (Render Free Tier Sleep):** Các gói Free trên Render sẽ tự động ngủ đông (sleep) sau 15 phút không có ai truy cập HTTP request. Để giữ Web Service này hoạt động 24/7 liên tục mà không bị tắt bot, bạn có thể dùng một dịch vụ ping miễn phí như [UptimeRobot](https://uptimerobot.com/) cài đặt ping định kỳ 5 phút một lần tới địa chỉ URL của bot (`https://tên-bot-của-bạn.onrender.com`).
