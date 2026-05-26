const bedrock = require('bedrock-protocol');
const EventEmitter = require('events');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;
const mcData = require('minecraft-data');

const latestBedrockVersion = mcData.versions.bedrock && mcData.versions.bedrock[0]
  ? mcData.versions.bedrock[0].minecraftVersion
  : '1.26.20';


function cleanMinecraftColors(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/§./g, '');
}

class BotManager extends EventEmitter {
  constructor(config, logCallback) {
    super();
    this.config = config;
    this.logCallback = logCallback || (() => {});
    this.client = null;
    this.status = 'offline'; // 'offline', 'connecting', 'online'
    this.userDisconnected = false; // Người dùng chủ động ngắt kết nối hay không
    this.reconnectTimer = null;
    

    this.keepAliveTimer = null;

    // Tọa độ và hướng nhìn hiện tại của Bot nhận được từ server
    this.position = { x: 0, y: 0, z: 0 };
    this.rotation = { pitch: 0, yaw: 0, headYaw: 0 };
    this.runtimeEntityId = null;
    this.isSpawned = false;
    this.tick = 0n;
  }

  // Ghi nhận nhật ký và đẩy về server.js để hiển thị trên Web UI
  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    this.logCallback({ timestamp, message, type });
  }

  // Cập nhật trạng thái bot và thông báo về server.js
  setStatus(newStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit('statusChange', newStatus);
    }
  }

  // Kết nối tới server Minecraft Bedrock
  async connect() {
    if (this.status === 'online' || this.status === 'connecting') {
      this.log('Bot đã ở trạng thái kết nối hoặc đang kết nối!', 'warning');
      return;
    }

    // Xóa các timer cũ nếu có
    this.cleanupTimers();

    this.userDisconnected = false;
    this.setStatus('connecting');
    this.isSpawned = false;
    this.tick = 0n;

    // Kiểm tra host không được để trống
    if (!this.config.host || this.config.host.trim() === '') {
      this.log('Lỗi: Chưa cấu hình IP Server (Host). Vui lòng điền IP Server trên Web UI trước khi kết nối!', 'error');
      this.setStatus('offline');
      return;
    }
    
    this.log(`Bắt đầu kết nối tới server ${this.config.host}:${this.config.port}...`, 'info');

    // Phân giải DNS hostname thành IP trước khi truyền cho bedrock-protocol
    // để tránh lỗi khi thư viện nội bộ không xử lý tốt hostname qua proxy Cloudflare
    let resolvedHost = this.config.host;
    if (this.config.host && !net.isIP(this.config.host)) {
      try {
        this.log(`Đang phân giải DNS: ${this.config.host}...`, 'info');
        const lookup = await dns.lookup(this.config.host);
        resolvedHost = lookup.address;
        this.log(`✓ Đã phân giải DNS thành IP: ${resolvedHost}`, 'info');
      } catch (dnsErr) {
        this.log(`⚠ Không thể phân giải DNS ${this.config.host}: ${dnsErr.message}. Sử dụng hostname gốc.`, 'warning');
      }
    }

    try {
      const connectionOptions = {
        host: resolvedHost,
        port: parseInt(this.config.port) || 19132,
        username: this.config.username || 'DonutAFKBot',
        offline: this.config.offline !== false, // true mặc định (không yêu cầu Microsoft/Xbox Auth)
        profilesFolder: path.join(__dirname, 'auth-cache', this.config.username || 'DonutAFKBot'),
        connectTimeout: 30000, // 30 giây để xử lý server lag hoặc bắt tay RakNet chậm qua proxy
        skipPing: true, // Bỏ qua bước Ping dò phiên bản để tránh bị Cloudflare/firewall chặn UDP
        version: this.config.version || latestBedrockVersion, // Chỉ định phiên bản cố định, tránh dò tự động
        onMsaCode: (data) => {
          this.log(`[Xác thực Microsoft]: ${data.message}`, 'warning');
          this.emit('msaCode', data);
        }
      };

      // Nếu không dùng chế độ Offline (yêu cầu Xbox Live Auth)
      if (!connectionOptions.offline) {
        this.log('Đang kết nối bằng chế độ xác thực tài khoản Microsoft (Xbox Live)...', 'info');
      }

      this.log(`Sử dụng backend: raknet-native | Phiên bản: ${connectionOptions.version} | skipPing: true`, 'info');

      this.client = bedrock.createClient(connectionOptions);

      // 1. Sự kiện khi đã hoàn thành handshake và tham gia server
      this.client.on('join', () => {
        this.log(`Bắt tay thành công với server! Đang tải thế giới...`, 'info');
      });

      // 2. Sự kiện khi thế giới bắt đầu tải (nhận các thông tin cấu hình ban đầu)
      this.client.on('start_game', (packet) => {
        this.runtimeEntityId = packet.runtime_entity_id;
        
        // Lưu vị trí spawn ban đầu của bot
        if (packet.player_position) {
          this.position = {
            x: packet.player_position.x,
            y: packet.player_position.y,
            z: packet.player_position.z
          };
        }
        if (packet.rotation) {
          this.rotation = {
            pitch: packet.rotation.x || 0,
            yaw: packet.rotation.y || 0,
            headYaw: packet.rotation.y || 0
          };
        }
        
        this.log(`Nhận dữ liệu khởi động game. Runtime ID: ${this.runtimeEntityId}. Tọa độ spawn: (${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}, ${this.position.z.toFixed(2)})`, 'info');
      });

      // 3. Sự kiện khi bot spawn thực tế vào thế giới
      this.client.on('spawn', () => {
        this.isSpawned = true;
        this.setStatus('online');
        this.log(`Bot đã spawn vào thế giới thành công! Bắt đầu chạy cơ chế giữ kết nối.`, 'success');
        
        // Luôn khởi động keep-alive cơ bản để giữ kết nối ổn định
        this.startKeepAlive();
      });

      // Tự động phản hồi gói tin network_stack_latency để tránh bị hệ thống bảo mật kick
      this.client.on('network_stack_latency', (packet) => {
        if (packet.needs_response) {
          const tsVal = packet.timestamp.valueOf();
          const signedVal = BigInt.asIntN(64, tsVal);
          const multiplied = signedVal * 1000000n;
          const responseTimestamp = BigInt.asUintN(64, multiplied);
          
          if (this.client) {
            try {
              this.client.write('network_stack_latency', {
                timestamp: responseTimestamp,
                needs_response: 0
              });
            } catch (err) {
              // Thầm lặng bỏ qua lỗi ghi socket
            }
          }
        }
      });

      // 4. Lắng nghe cập nhật vị trí từ server để bám sát vị trí thực tế của Bot
      this.client.on('move_player', (packet) => {
        // Chỉ cập nhật nếu gói tin này áp dụng cho chính Bot của chúng ta
        if (this.runtimeEntityId && packet.runtime_id === this.runtimeEntityId) {
          this.position = {
            x: packet.position.x,
            y: packet.position.y,
            z: packet.position.z
          };
          this.rotation = {
            pitch: packet.pitch,
            yaw: packet.yaw,
            headYaw: packet.head_yaw || packet.yaw
          };
        }
      });

      // 5. Lắng nghe tin nhắn chat từ server
      this.client.on('text', (packet) => {
        // Lọc hiển thị tin nhắn chat trên Web UI
        let sender = cleanMinecraftColors(packet.source_name || 'Hệ thống');
        let message = cleanMinecraftColors(packet.message);
        
        if (packet.type === 'chat') {
          this.log(`[Chat] <${sender}>: ${message}`, 'chat');
        } else if (packet.type === 'translation') {
          // Tin nhắn dịch thuật từ game (thường là tin nhắn hệ thống như người chơi join/leave)
          const params = (packet.parameters || []).map(p => typeof p === 'string' ? cleanMinecraftColors(p) : p);
          this.log(`[Hệ thống]: ${message} ${JSON.stringify(params)}`, 'system');
        } else {
          // Các loại tin nhắn khác (system, tip, v.v.)
          this.log(`[Thông báo]: ${message}`, 'system');
        }
      });

      // 6. Lắng nghe khi bị server kick
      this.client.on('kick', (packet) => {
        const reason = cleanMinecraftColors(packet.message || 'Không rõ lý do');
        this.log(`Bot bị server KICK! Lý do: ${reason}`, 'error');
        this.handleDisconnect();
      });

      // 7. Lắng nghe khi gặp lỗi kết nối
      this.client.on('error', (err) => {
        this.log(`Lỗi kết nối Bot: ${err.message}`, 'error');
        // Không gọi handleDisconnect trực tiếp ở đây vì sự kiện close/end sẽ được kích hoạt ngay sau đó
      });

      // 8. Lắng nghe khi kết nối bị đóng hoàn toàn
      this.client.on('close', () => {
        this.log('Kết nối tới server Minecraft đã bị đóng.', 'warning');
        this.handleDisconnect();
      });

    } catch (error) {
      this.log(`Lỗi nghiêm trọng khi khởi tạo kết nối: ${error.message}`, 'error');
      this.setStatus('offline');
      this.handleReconnect();
    }
  }

  // Ngắt kết nối chủ động từ phía người dùng trên Web UI
  disconnect() {
    this.log('Nhận lệnh ngắt kết nối từ Web UI. Đang tắt bot...', 'warning');
    this.userDisconnected = true;
    
    this.cleanupTimers();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.client) {
      try {
        this.client.close();
      } catch (err) {
        // Bỏ qua lỗi đóng kết nối
      }
      this.client = null;
    }

    this.isSpawned = false;
    this.setStatus('offline');
    this.log('Bot đã ngắt kết nối hoàn toàn. Chế độ Auto-Reconnect đã tắt.', 'warning');
  }

  // Xử lý ngắt kết nối và quyết định có Reconnect hay không
  handleDisconnect() {
    this.cleanupTimers();
    this.isSpawned = false;
    this.setStatus('offline');
    this.client = null;

    if (!this.userDisconnected) {
      this.handleReconnect();
    }
  }

  // Cơ chế tự động kết nối lại thông minh
  handleReconnect() {
    if (this.reconnectTimer) return; // Tránh tạo nhiều timer Reconnect cùng lúc

    const delay = 10000; // 10 giây kết nối lại một lần
    this.log(`Sẽ tự động kết nối lại sau ${delay / 1000} giây... (Bấm 'Ngắt kết nối' trên Web UI để hủy)`, 'warning');
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.userDisconnected) {
        this.connect();
      }
    }, delay);
  }

  // ============================================================
  // KEEP-ALIVE CẤP GIAO THỨC (luôn chạy khi bot online, độc lập với Anti-AFK)
  // Giữ kết nối ổn định bằng cách gửi move_player định kỳ để server 
  // biết client vẫn tồn tại, tránh bị kick do timeout
  // ============================================================
  startKeepAlive() {
    this.log('Khởi động cơ chế Keep-Alive tự nhiên bằng phản hồi Latency...', 'info');
    // Không gửi player_auth_input để tránh lệch tick (desync) với server
  }



  // Gửi tin nhắn chat hoặc lệnh lên server Minecraft Bedrock
  sendChatMessage(message) {
    if (this.status !== 'online' || !this.client || !this.isSpawned) {
      this.log('Không thể gửi tin nhắn chat: Bot đang offline!', 'warning');
      return;
    }

    try {
      if (message.startsWith('/')) {
        // Gửi dưới dạng command_request chuẩn của Bedrock protocol
        this.client.write('command_request', {
          command: message,
          origin: {
            type: 'player',
            uuid: '00000000-0000-0000-0000-000000000000',
            request_id: '',
            player_entity_id: 0n
          },
          internal: false,
          version: '0'
        });
        this.log(`[Gửi lệnh AFK]: ${message}`, 'success');
      } else {
        // Gửi dưới dạng tin nhắn chat thông thường
        this.client.write('text', {
          type: 'chat',
          needs_translation: false,
          source_name: this.client.username || this.config.username,
          message: message,
          xuid: '',
          platform_chat_id: ''
        });
        this.log(`[Gửi tin AFK]: ${message}`, 'success');
      }
    } catch (err) {
      this.log(`Lỗi khi gửi: ${err.message}`, 'error');
    }
  }

  // Xóa các vòng lặp timer
  cleanupTimers() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  // Cập nhật cấu hình bot động từ Web UI
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.log('Đã cập nhật cấu hình Bot mới.', 'info');
    
    // Nếu bot đang online, khởi động lại cấu hình mới
    if (this.status === 'online') {
      this.cleanupTimers();
      this.startKeepAlive();
    }
  }
}

module.exports = BotManager;
