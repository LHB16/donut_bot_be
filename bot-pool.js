const { Worker } = require('worker_threads');
const path = require('path');

const WORKER_PATH = path.join(__dirname, 'bot-worker.js');

class BotPool {
  constructor({ onLog, onStatus, onMsaCode }) {
    this.bots = new Map(); // botId -> { worker, status, config }
    this.onLog = onLog || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onMsaCode = onMsaCode || (() => {});
  }

  // Thêm một bot mới vào pool (chỉ lưu config, chưa spawn worker)
  addBot(botId, config) {
    if (this.bots.has(botId)) {
      this.onLog(botId, {
        timestamp: new Date().toLocaleTimeString(),
        message: `[System] Bot ${botId} đã tồn tại trong hệ thống.`,
        type: 'warning'
      });
      return;
    }

    this.bots.set(botId, { worker: null, status: 'offline', config });
  }

  // Spawn Worker Thread cho bot, trả về Promise resolve khi worker ready
  _spawnWorker(botId) {
    const botData = this.bots.get(botId);
    if (!botData) return null;

    // Terminate worker cũ nếu còn sót
    if (botData.worker) {
      try { botData.worker.terminate(); } catch (e) {}
      botData.worker = null;
    }

    const worker = new Worker(WORKER_PATH, {
      workerData: { botId, config: botData.config }
    });

    // Lắng nghe message từ worker
    worker.on('message', (msg) => {
      // Kiểm tra botData còn tồn tại không (có thể đã bị remove)
      const currentBot = this.bots.get(botId);
      if (!currentBot) return;

      switch (msg.type) {
        case 'log':
          this.onLog(botId, msg.logObj);
          break;
        case 'status':
          currentBot.status = msg.status;
          this.onStatus(botId, msg.status);
          break;
        case 'msaCode':
          this.onMsaCode(botId, msg.data);
          break;
        case 'ready':
          // Worker đã khởi tạo xong BotManager
          break;
      }
    });

    // Worker gặp lỗi runtime → log và đánh offline, KHÔNG crash main thread
    worker.on('error', (err) => {
      console.error(`[Worker ${botId}] Error:`, err.message);
      const currentBot = this.bots.get(botId);
      if (currentBot) {
        this.onLog(botId, {
          timestamp: new Date().toLocaleTimeString(),
          message: `[Worker] Luồng bot gặp lỗi: ${err.message}. Web Server vẫn hoạt động bình thường.`,
          type: 'error'
        });
        currentBot.status = 'offline';
        this.onStatus(botId, 'offline');
        currentBot.worker = null;
      }
    });

    // Worker thoát (crash hoặc bị terminate)
    worker.on('exit', (code) => {
      const currentBot = this.bots.get(botId);
      if (!currentBot) return;

      if (code !== 0 && code !== null) {
        console.error(`[Worker ${botId}] Exited with code ${code}`);
        this.onLog(botId, {
          timestamp: new Date().toLocaleTimeString(),
          message: `[Worker] Luồng bot đã dừng bất thường (code: ${code}). Web Server vẫn hoạt động bình thường.`,
          type: 'warning'
        });
      }
      currentBot.status = 'offline';
      this.onStatus(botId, 'offline');
      currentBot.worker = null;
    });

    botData.worker = worker;
    return worker;
  }

  // Xóa bot khỏi pool
  removeBot(botId) {
    const botData = this.bots.get(botId);
    if (botData) {
      if (botData.worker) {
        try {
          botData.worker.postMessage({ action: 'disconnect' });
        } catch (e) {}
        // Cho bot 2 giây để ngắt kết nối sạch, sau đó terminate worker
        const w = botData.worker;
        setTimeout(() => {
          try { w.terminate(); } catch (e) {}
        }, 2000);
      }
      this.bots.delete(botId);
      return true;
    }
    return false;
  }

  // Bắt đầu kết nối cho bot → spawn worker mới nếu chưa có
  async startBot(botId) {
    const botData = this.bots.get(botId);
    if (!botData) throw new Error(`Không tìm thấy bot với ID: ${botId}`);

    // Spawn worker mới nếu chưa có hoặc đã bị terminate
    if (!botData.worker) {
      this._spawnWorker(botId);
    }

    // Gửi lệnh connect sang worker thread
    botData.worker.postMessage({ action: 'connect' });
  }

  // Dừng bot → gửi lệnh disconnect, terminate worker
  stopBot(botId) {
    const botData = this.bots.get(botId);
    if (botData && botData.worker) {
      botData.worker.postMessage({ action: 'disconnect' });
      // Terminate worker sau 2 giây để giải phóng luồng hoàn toàn
      const w = botData.worker;
      setTimeout(() => {
        try { w.terminate(); } catch (e) {}
      }, 2000);
      botData.worker = null;
    }
  }

  // Gửi tin nhắn chat/lệnh
  sendChat(botId, message) {
    const botData = this.bots.get(botId);
    if (botData && botData.worker && botData.status === 'online') {
      botData.worker.postMessage({ action: 'sendChat', message });
    }
  }

  // Cập nhật cấu hình bot
  updateConfig(botId, config) {
    const botData = this.bots.get(botId);
    if (botData) {
      botData.config = { ...botData.config, ...config };
      if (botData.worker) {
        botData.worker.postMessage({ action: 'updateConfig', config });
      }
    }
  }

  // Lấy thông tin 1 bot (trả về object có .status để tương thích server.js)
  getBot(botId) {
    const botData = this.bots.get(botId);
    if (botData) {
      return { status: botData.status };
    }
    return undefined;
  }

  // Lấy trạng thái của tất cả bot
  getAllStatuses() {
    const statuses = {};
    for (const [botId, botData] of this.bots.entries()) {
      statuses[botId] = botData.status;
    }
    return statuses;
  }
}

module.exports = BotPool;
