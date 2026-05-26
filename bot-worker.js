/**
 * bot-worker.js
 * Worker Thread chạy BotManager trong luồng riêng biệt.
 * Giao tiếp với Main Thread (Web Server) qua postMessage.
 * Khi bot xử lý packet nặng, Web Server vẫn phản hồi bình thường.
 */
const { parentPort, workerData } = require('worker_threads');
const BotManager = require('./bot-manager');

const botId = workerData.botId;
const config = workerData.config;

// Khởi tạo BotManager trong worker thread
const bot = new BotManager(config, (logObj) => {
  parentPort.postMessage({ type: 'log', logObj });
});

// Forward sự kiện thay đổi trạng thái về main thread
bot.on('statusChange', (newStatus) => {
  parentPort.postMessage({ type: 'status', status: newStatus });
});

// Forward sự kiện xác thực Microsoft về main thread
bot.on('msaCode', (data) => {
  parentPort.postMessage({ type: 'msaCode', data });
});

// Lắng nghe lệnh từ main thread
parentPort.on('message', async (msg) => {
  try {
    switch (msg.action) {
      case 'connect':
        await bot.connect();
        break;
      case 'disconnect':
        bot.disconnect();
        break;
      case 'sendChat':
        bot.sendChatMessage(msg.message);
        break;
      case 'updateConfig':
        bot.updateConfig(msg.config);
        break;
    }
  } catch (err) {
    parentPort.postMessage({
      type: 'log',
      logObj: {
        timestamp: new Date().toLocaleTimeString(),
        message: `[Worker] Lỗi xử lý lệnh '${msg.action}': ${err.message}`,
        type: 'error'
      }
    });
  }
});

// Bắt lỗi không xử lý trong worker để tránh crash âm thầm
process.on('uncaughtException', (err) => {
  parentPort.postMessage({
    type: 'log',
    logObj: {
      timestamp: new Date().toLocaleTimeString(),
      message: `[Worker] Lỗi nghiêm trọng: ${err.message}`,
      type: 'error'
    }
  });
});

process.on('unhandledRejection', (reason) => {
  parentPort.postMessage({
    type: 'log',
    logObj: {
      timestamp: new Date().toLocaleTimeString(),
      message: `[Worker] Promise bị reject: ${reason}`,
      type: 'error'
    }
  });
});

// Thông báo worker đã sẵn sàng
parentPort.postMessage({ type: 'ready' });
