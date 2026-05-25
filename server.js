require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const BotManager = require('./bot-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const WEB_PASSWORD = process.env.WEB_PASSWORD || ''; // Nếu để trống sẽ không yêu cầu mật khẩu

const CONFIG_PATH = path.join(__dirname, 'config.json');

// Buffer lưu trữ 100 dòng log gần nhất để hiển thị lại khi client F5 Web UI
const maxLogBuffer = 100;
let logBuffer = [];

// Đọc cấu hình bot từ file config.json
function loadBotConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Lỗi khi đọc file config.json:', err.message);
  }
  // Mặc định nếu lỗi hoặc không có file
  return {
    host: "",
    port: 19132,
    username: "DonutAFKBot",
    offline: true,
    antiAfk: true,
    antiAfkInterval: 15000,
    chatInterval: 60000,
    chatMessage: "."
  };
}

// Lưu cấu hình bot xuống file config.json
function saveBotConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Lỗi khi lưu file config.json:', err.message);
    return false;
  }
}

// Khởi tạo cấu hình và Bot Manager
let botConfig = loadBotConfig();

// Hàm xử lý log đẩy ra Console của Node.js với màu sắc giả lập đơn giản
function logToConsole(logObj) {
  const { timestamp, message, type } = logObj;
  let colorPrefix = '\x1b[36m[INFO]\x1b[0m'; // Cyan

  if (type === 'success') colorPrefix = '\x1b[32m[SUCCESS]\x1b[0m'; // Green
  else if (type === 'warning') colorPrefix = '\x1b[33m[WARN]\x1b[0m'; // Yellow
  else if (type === 'error') colorPrefix = '\x1b[31m[ERROR]\x1b[0m'; // Red
  else if (type === 'chat') colorPrefix = '\x1b[35m[CHAT]\x1b[0m'; // Magenta
  else if (type === 'system') colorPrefix = '\x1b[34m[SYSTEM]\x1b[0m'; // Blue

  console.log(`${timestamp} ${colorPrefix} ${message}`);
}

const botManager = new BotManager(botConfig, (logObj) => {
  // Callback ghi log nhận từ BotManager
  logBuffer.push(logObj);
  if (logBuffer.length > maxLogBuffer) {
    logBuffer.shift(); // Xóa log cũ nhất nếu vượt quá giới hạn buffer
  }

  // Ghi ra Node.js console
  logToConsole(logObj);

  // Phát log realtime tới các client Socket.io đã xác thực
  io.to('authenticated').emit('log', logObj);
});

// Phục vụ tệp tĩnh trong thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// Middleware xác thực bảo mật kết nối WebSocket
io.use((socket, next) => {
  // Nếu server không cấu hình mật khẩu, cho phép kết nối thoải mái
  if (!WEB_PASSWORD) {
    return next();
  }

  // Lấy mật khẩu client gửi lên qua auth token hoặc handshake query
  const clientPassword = socket.handshake.auth?.password || socket.handshake.query?.password;

  if (clientPassword === WEB_PASSWORD) {
    return next();
  } else {
    // Từ chối kết nối nếu sai mật khẩu
    const err = new Error('Mật khẩu truy cập không chính xác!');
    err.data = { code: 'UNAUTHORIZED' };
    return next(err);
  }
});

// Lắng nghe sự kiện kết nối từ Web UI
io.on('connection', (socket) => {
  // Đưa client vào room 'authenticated'
  socket.join('authenticated');
  
  // Gửi trạng thái ban đầu của server và bot cho client vừa kết nối
  socket.emit('init', {
    hasPassword: WEB_PASSWORD !== '', // Báo cho client biết server có cài mật khẩu hay không
    botStatus: botManager.status,
    botConfig: botManager.config,
    logs: logBuffer
  });

  // Xử lý sự kiện khi người dùng yêu cầu BẮT ĐẦU KẾT NỐI Bot vào game
  socket.on('start_bot', () => {
    if (botManager.status === 'offline') {
      botManager.connect();
    }
  });

  // Xử lý sự kiện khi người dùng yêu cầu NGẮT KẾT NỐI Bot khỏi game
  socket.on('stop_bot', () => {
    botManager.disconnect();
  });

  // Xử lý sự kiện gửi tin nhắn chat thủ công từ Web UI
  socket.on('send_chat', (message) => {
    if (message && botManager.status === 'online') {
      botManager.sendChatMessage(message);
    }
  });

  // Xử lý sự kiện LƯU cấu hình mới từ Web UI
  socket.on('save_config', (newConfig) => {
    // Chỉ cập nhật các cấu hình hợp lệ
    botConfig = { ...botConfig, ...newConfig };
    const success = saveBotConfig(botConfig);
    
    if (success) {
      botManager.updateConfig(botConfig);
      socket.emit('config_saved', { success: true, config: botConfig });
      botManager.log('Cấu hình bot đã được cập nhật thành công từ Web UI!', 'success');
    } else {
      socket.emit('config_saved', { success: false, message: 'Không thể lưu cấu hình xuống ổ đĩa!' });
    }
  });

  socket.on('disconnect', () => {
    socket.leave('authenticated');
  });
});

// Lắng nghe sự thay đổi trạng thái của Bot để đẩy về Web UI
botManager.on('statusChange', (newStatus) => {
  io.to('authenticated').emit('status', newStatus);
});

// Chạy server lắng nghe cổng cấu hình
server.listen(PORT, () => {
  console.log('\x1b[32m%s\x1b[0m', '==================================================');
  console.log('\x1b[32m%s\x1b[0m', ` 🚀 Minecraft Bedrock AFK Bot Web Server đang chạy!`);
  console.log('\x1b[32m%s\x1b[0m', ` 🌐 Web UI: http://localhost:${PORT}`);
  if (WEB_PASSWORD) {
    console.log('\x1b[33m%s\x1b[0m', ` 🔒 Chế độ bảo mật: BẬT (Mật khẩu được yêu cầu)`);
  } else {
    console.log('\x1b[31m%s\x1b[0m', ` ⚠️ Cảnh báo: CHƯA THIẾT LẬP MẬT KHẨU BẢO VỆ WEB UI!`);
  }
  console.log('\x1b[32m%s\x1b[0m', '==================================================');
});
