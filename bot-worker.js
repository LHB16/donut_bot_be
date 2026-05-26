const BotManager = require('./bot-manager');

let botManager = null;

// Lắng nghe các tin nhắn IPC từ tiến trình cha (Web UI)
process.on('message', async (msg) => {
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'start':
      try {
        if (!botManager) {
          // Khởi tạo BotManager lần đầu
          botManager = new BotManager(msg.config, (logObj) => {
            // Chuyển tiếp các log của bot về tiến trình cha
            if (process.send) {
              process.send({ type: 'log', logObj });
            }
          });

          // Lắng nghe sự thay đổi trạng thái của bot
          botManager.on('statusChange', (newStatus) => {
            if (process.send) {
              process.send({ type: 'status', status: newStatus });
            }

            // TỐI ƯU HÓA CHO RENDER.COM:
            // Nếu bot ở trạng thái offline VÀ người dùng chủ động ngắt kết nối (Stop Bot)
            // thì tiến trình con sẽ tự động thoát hoàn toàn để giải phóng 100% tài nguyên RAM/CPU.
            if (newStatus === 'offline' && botManager.userDisconnected) {
              if (process.send) {
                process.send({
                  type: 'log',
                  logObj: {
                    timestamp: new Date().toLocaleTimeString(),
                    message: '[System] Tiến trình Bot con đang tự động thoát để giải phóng RAM cho Render...',
                    type: 'system'
                  }
                });
              }
              // Trì hoãn 200ms để đảm bảo tin nhắn log cuối cùng được gửi đi
              setTimeout(() => {
                process.exit(0);
              }, 200);
            }
          });

          // Lắng nghe mã xác thực Microsoft/Xbox Live (nếu dùng chế độ online)
          botManager.on('msaCode', (data) => {
            if (process.send) {
              process.send({ type: 'msa_code', data });
            }
          });
        } else {
          // Nếu đã tồn tại BotManager, cập nhật lại config mới trước khi kết nối
          botManager.updateConfig(msg.config);
        }

        // Bắt đầu kết nối Bot vào game
        await botManager.connect();
      } catch (err) {
        if (process.send) {
          process.send({
            type: 'log',
            logObj: {
              timestamp: new Date().toLocaleTimeString(),
              message: `Lỗi nghiêm trọng ở tiến trình con: ${err.message}`,
              type: 'error'
            }
          });
          process.send({ type: 'status', status: 'offline' });
        }
        setTimeout(() => process.exit(1), 500);
      }
      break;

    case 'stop':
      if (botManager) {
        // Thực hiện ngắt kết nối sạch sẽ, sau đó tiến trình sẽ tự thoát qua event statusChange -> offline
        botManager.disconnect();
      } else {
        process.exit(0);
      }
      break;

    case 'send_chat':
      if (botManager && botManager.status === 'online') {
        botManager.sendChatMessage(msg.message);
      }
      break;

    case 'update_config':
      if (botManager) {
        botManager.updateConfig(msg.config);
      }
      break;

    default:
      break;
  }
});

// Xử lý các lỗi không lường trước để tránh sập âm thầm
process.on('uncaughtException', (err) => {
  if (process.send) {
    process.send({
      type: 'log',
      logObj: {
        timestamp: new Date().toLocaleTimeString(),
        message: `Lỗi UncaughtException ở bot process: ${err.message}`,
        type: 'error'
      }
    });
  }
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason) => {
  if (process.send) {
    process.send({
      type: 'log',
      logObj: {
        timestamp: new Date().toLocaleTimeString(),
        message: `Lỗi UnhandledRejection ở bot process: ${reason}`,
        type: 'error'
      }
    });
  }
});
