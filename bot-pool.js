const BotManager = require('./bot-manager');

class BotPool {
  constructor({ onLog, onStatus, onMsaCode }) {
    this.bots = new Map();
    this.onLog = onLog || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onMsaCode = onMsaCode || (() => {});
  }

  // Thêm một bot mới vào pool
  addBot(botId, config) {
    if (this.bots.has(botId)) {
      this.onLog(botId, {
        timestamp: new Date().toLocaleTimeString(),
        message: `[System] Bot ${botId} đã tồn tại trong hệ thống.`,
        type: 'warning'
      });
      return this.bots.get(botId);
    }

    const bot = new BotManager(config, (logObj) => {
      this.onLog(botId, logObj);
    });

    bot.on('statusChange', (newStatus) => {
      this.onStatus(botId, newStatus);
    });

    bot.on('msaCode', (data) => {
      this.onMsaCode(botId, data);
    });

    this.bots.set(botId, bot);
    return bot;
  }

  // Xóa bot khỏi pool
  removeBot(botId) {
    const bot = this.bots.get(botId);
    if (bot) {
      try {
        bot.disconnect();
      } catch (err) {
        console.error(`Lỗi khi ngắt kết nối bot ${botId}:`, err.message);
      }
      this.bots.delete(botId);
      return true;
    }
    return false;
  }

  // Bắt đầu kết nối cho bot
  async startBot(botId) {
    const bot = this.bots.get(botId);
    if (bot) {
      await bot.connect();
    } else {
      throw new Error(`Không tìm thấy bot với ID: ${botId}`);
    }
  }

  // Dừng bot
  stopBot(botId) {
    const bot = this.bots.get(botId);
    if (bot) {
      bot.disconnect();
    }
  }

  // Gửi tin nhắn chat/lệnh
  sendChat(botId, message) {
    const bot = this.bots.get(botId);
    if (bot && bot.status === 'online') {
      bot.sendChatMessage(message);
    }
  }

  // Cập nhật cấu hình bot
  updateConfig(botId, config) {
    const bot = this.bots.get(botId);
    if (bot) {
      bot.updateConfig(config);
    }
  }

  // Lấy thông tin 1 bot instance
  getBot(botId) {
    return this.bots.get(botId);
  }

  // Lấy trạng thái của tất cả bot
  getAllStatuses() {
    const statuses = {};
    for (const [botId, bot] of this.bots.entries()) {
      statuses[botId] = bot.status;
    }
    return statuses;
  }
}

module.exports = BotPool;
