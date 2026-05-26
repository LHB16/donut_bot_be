require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const BotPool = require('./bot-pool');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const WEB_PASSWORD = process.env.WEB_PASSWORD || ''; // Nếu để trống sẽ không yêu cầu mật khẩu

const CONFIG_PATH = path.join(__dirname, 'config.json');

// Buffer lưu trữ 100 dòng log gần nhất để hiển thị lại khi client F5 Web UI
const maxLogBuffer = 100;
let logBuffers = {}; // Lưu logs theo botId: { botId: [logs...] }

// Đọc cấu hình bot từ file config.json (hỗ trợ migrate từ object cũ sang array)
function loadBotConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      let parsed = JSON.parse(data);
      
      // Tự động migrate nếu là object cấu hình đơn cũ
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        console.log('⚠️ Phát hiện cấu hình bot cũ dạng object đơn lẻ. Đang tự động chuyển đổi sang định dạng mảng (Multi-Bot)...');
        const migratedConfig = [
          {
            id: 'bot-1',
            name: parsed.username || 'Bot 1',
            host: parsed.host || '',
            port: parseInt(parsed.port) || 19132,
            username: parsed.username || 'DonutAFKBot',
            offline: parsed.offline !== false,
            version: parsed.version || '',
            autoCommand: parsed.autoCommand || '/afk 31'
          }
        ];
        saveBotConfig(migratedConfig);
        return migratedConfig;
      }
      return parsed;
    }
  } catch (err) {
    console.error('Lỗi khi đọc file config.json:', err.message);
  }
  
  // Trả về cấu hình mặc định (mảng) nếu lỗi hoặc file chưa tồn tại
  const defaultConfig = [
    {
      id: 'bot-1',
      name: 'Bot 1',
      host: '',
      port: 19132,
      username: 'DonutAFKBot',
      offline: true,
      version: '',
      autoCommand: '/afk 31'
    }
  ];
  saveBotConfig(defaultConfig);
  return defaultConfig;
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

// Khởi tạo cấu hình ban đầu
let botsConfig = loadBotConfig();

// Khởi tạo log buffers cho các bot
botsConfig.forEach(bot => {
  logBuffers[bot.id] = [];
});

// Hàm xử lý log đẩy ra Console của Node.js với màu sắc
function logToConsole(botId, logObj) {
  const { timestamp, message, type } = logObj;
  let colorPrefix = '\x1b[36m[INFO]\x1b[0m'; // Cyan

  if (type === 'success') colorPrefix = '\x1b[32m[SUCCESS]\x1b[0m'; // Green
  else if (type === 'warning') colorPrefix = '\x1b[33m[WARN]\x1b[0m'; // Yellow
  else if (type === 'error') colorPrefix = '\x1b[31m[ERROR]\x1b[0m'; // Red
  else if (type === 'chat') colorPrefix = '\x1b[35m[CHAT]\x1b[0m'; // Magenta
  else if (type === 'system') colorPrefix = '\x1b[34m[SYSTEM]\x1b[0m'; // Blue

  console.log(`${timestamp} [${botId}] ${colorPrefix} ${message}`);
}

// Khởi tạo Bot Pool để quản lý các bot trong cùng một process
const botPool = new BotPool({
  onLog: (botId, logObj) => {
    if (!logBuffers[botId]) {
      logBuffers[botId] = [];
    }
    logBuffers[botId].push(logObj);
    if (logBuffers[botId].length > maxLogBuffer) {
      logBuffers[botId].shift();
    }
    logToConsole(botId, logObj);
    io.to('authenticated').emit('log', { botId, logObj });
  },
  onStatus: (botId, status) => {
    io.to('authenticated').emit('status', { botId, status });
  },
  onMsaCode: (botId, data) => {
    io.to('authenticated').emit('msa_code', { botId, data });
  }
});

// Thêm các bot từ config vào pool
botsConfig.forEach(bot => {
  botPool.addBot(bot.id, bot);
});

// Phục vụ tệp tĩnh trong thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint cho Render (hoặc các PaaS khác)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), botsCount: botsConfig.length });
});

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

// Lắng nghe kết nối từ Web UI
io.on('connection', (socket) => {
  // Đưa client vào room 'authenticated'
  socket.join('authenticated');
  
  // Gửi trạng thái ban đầu và danh sách tất cả các bot cùng config, log buffer
  socket.emit('init', {
    hasPassword: WEB_PASSWORD !== '',
    bots: botsConfig,
    statuses: botPool.getAllStatuses(),
    logBuffers: logBuffers
  });

  // Xử lý sự kiện khi người dùng yêu cầu BẮT ĐẦU KẾT NỐI Bot vào game
  socket.on('start_bot', ({ botId }) => {
    try {
      const bot = botPool.getBot(botId);
      if (bot && bot.status === 'offline') {
        botPool.startBot(botId).catch(err => {
          console.error(`Lỗi khi kết nối bot ${botId}:`, err.message);
        });
      }
    } catch (err) {
      console.error('Lỗi khi xử lý start_bot:', err.message);
    }
  });

  // Xử lý sự kiện khi người dùng yêu cầu NGẮT KẾT NỐI Bot khỏi game
  socket.on('stop_bot', ({ botId }) => {
    try {
      botPool.stopBot(botId);
    } catch (err) {
      console.error('Lỗi khi xử lý stop_bot:', err.message);
    }
  });

  // Xử lý sự kiện gửi tin nhắn chat thủ công từ Web UI
  socket.on('send_chat', ({ botId, message }) => {
    try {
      botPool.sendChat(botId, message);
    } catch (err) {
      console.error('Lỗi khi xử lý send_chat:', err.message);
    }
  });

  // Xử lý sự kiện LƯU cấu hình mới của 1 bot từ Web UI
  socket.on('save_config', ({ botId, config }) => {
    try {
      const idx = botsConfig.findIndex(b => b.id === botId);
      if (idx !== -1) {
        // Cập nhật cấu hình cục bộ
        botsConfig[idx] = { ...botsConfig[idx], ...config };
        const success = saveBotConfig(botsConfig);
        
        if (success) {
          // Cập nhật cấu hình bot tương ứng trong pool
          botPool.updateConfig(botId, botsConfig[idx]);
          
          socket.emit('config_saved', { success: true, botId, config: botsConfig[idx] });
          
          const logObj = {
            timestamp: new Date().toLocaleTimeString(),
            message: `Cấu hình bot "${botsConfig[idx].name}" đã được lưu thành công từ Web UI!`,
            type: 'success'
          };
          
          if (!logBuffers[botId]) logBuffers[botId] = [];
          logBuffers[botId].push(logObj);
          logToConsole(botId, logObj);
          io.to('authenticated').emit('log', { botId, logObj });
        } else {
          socket.emit('config_saved', { success: false, message: 'Không thể lưu cấu hình xuống ổ đĩa!' });
        }
      } else {
        socket.emit('config_saved', { success: false, message: 'Không tìm thấy ID bot!' });
      }
    } catch (err) {
      console.error('Lỗi khi xử lý save_config:', err.message);
      socket.emit('config_saved', { success: false, message: err.message });
    }
  });

  // Xử lý sự kiện THÊM bot mới
  socket.on('add_bot', ({ name }) => {
    try {
      // Giới hạn tối đa 20 bot để tránh tràn bộ nhớ
      if (botsConfig.length >= 20) {
        socket.emit('log', {
          botId: botsConfig[0]?.id,
          logObj: {
            timestamp: new Date().toLocaleTimeString(),
            message: '[System] Không thể thêm bot mới. Đã đạt giới hạn tối đa 20 bot để đảm bảo hiệu năng server!',
            type: 'warning'
          }
        });
        return;
      }

      const botId = `bot-${Date.now()}`;
      const newBot = {
        id: botId,
        name: name ? name.trim() : `Bot ${botsConfig.length + 1}`,
        host: '',
        port: 19132,
        username: `Bot_${Math.floor(Math.random() * 1000)}`,
        offline: true,
        version: '',
        autoCommand: '/afk 31'
      };

      botsConfig.push(newBot);
      saveBotConfig(botsConfig);
      
      // Tạo log buffer cho bot mới
      logBuffers[botId] = [
        {
          timestamp: new Date().toLocaleTimeString(),
          message: `Bot "${newBot.name}" đã được tạo thành công trên hệ thống.`,
          type: 'system'
        }
      ];

      // Thêm bot mới vào pool
      botPool.addBot(botId, newBot);

      // Phát thông báo thêm bot thành công đến tất cả client đang kết nối
      io.to('authenticated').emit('bot_added', {
        bot: newBot,
        status: 'offline',
        logs: logBuffers[botId]
      });

    } catch (err) {
      console.error('Lỗi khi xử lý add_bot:', err.message);
    }
  });

  // Xử lý sự kiện XÓA bot
  socket.on('remove_bot', ({ botId }) => {
    try {
      const idx = botsConfig.findIndex(b => b.id === botId);
      if (idx !== -1) {
        const botName = botsConfig[idx].name;
        
        // Ngắt kết nối và xóa khỏi Pool
        botPool.removeBot(botId);
        
        // Xóa cấu hình
        botsConfig.splice(idx, 1);
        saveBotConfig(botsConfig);
        
        // Xóa log buffer
        delete logBuffers[botId];
        
        // Phát thông báo xóa bot đến tất cả các client
        io.to('authenticated').emit('bot_removed', { botId });
        console.log(`Đã xóa bot "${botName}" (${botId}) thành công.`);
      }
    } catch (err) {
      console.error('Lỗi khi xử lý remove_bot:', err.message);
    }
  });

  // Xử lý sự kiện ĐỔI TÊN bot (rename tab)
  socket.on('rename_bot', ({ botId, name }) => {
    try {
      const idx = botsConfig.findIndex(b => b.id === botId);
      if (idx !== -1 && name && name.trim()) {
        const oldName = botsConfig[idx].name;
        const newName = name.trim();
        
        botsConfig[idx].name = newName;
        saveBotConfig(botsConfig);

        // Cập nhật tên trong pool config
        botPool.updateConfig(botId, { name: newName });
        
        // Phát thông báo đổi tên bot đến tất cả các client
        io.to('authenticated').emit('bot_renamed', { botId, name: newName });
        
        const logObj = {
          timestamp: new Date().toLocaleTimeString(),
          message: `Đã đổi tên bot từ "${oldName}" thành "${newName}"`,
          type: 'system'
        };
        if (!logBuffers[botId]) logBuffers[botId] = [];
        logBuffers[botId].push(logObj);
        io.to('authenticated').emit('log', { botId, logObj });
      }
    } catch (err) {
      console.error('Lỗi khi xử lý rename_bot:', err.message);
    }
  });

  socket.on('disconnect', () => {
    socket.leave('authenticated');
  });
});

// Khởi chạy server lắng nghe
server.listen(PORT, '0.0.0.0', () => {
  console.log('\x1b[32m%s\x1b[0m', '==================================================');
  console.log('\x1b[32m%s\x1b[0m', ` 🚀 Minecraft Bedrock Multi-Bot Web Server đang chạy!`);
  console.log('\x1b[32m%s\x1b[0m', ` 🌐 Web UI: http://localhost:${PORT}`);
  if (WEB_PASSWORD) {
    console.log('\x1b[33m%s\x1b[0m', ` 🔒 Chế độ bảo mật: BẬT (Mật khẩu được yêu cầu)`);
  } else {
    console.log('\x1b[31m%s\x1b[0m', ` ⚠️ Cảnh báo: CHƯA THIẾT LẬP MẬT KHẨU BẢO VỆ WEB UI!`);
  }
  console.log('\x1b[32m%s\x1b[0m', '==================================================');
});
