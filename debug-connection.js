// Thiết lập chế độ debug chi tiết của thư viện bedrock-protocol và raknet
process.env.DEBUG = 'minecraft-protocol,raknet*';

const bedrock = require('bedrock-protocol');
const mcData = require('minecraft-data');

const latestBedrockVersion = mcData.versions.bedrock && mcData.versions.bedrock[0]
  ? mcData.versions.bedrock[0].minecraftVersion
  : '1.26.20';



const fs = require('fs');
const path = require('path');

// Đọc cấu hình từ config.json
let config = {
  host: "",
  port: 19132,
  username: "DonutAFKBot",
  offline: true,
  version: ""
};

const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error('Không thể đọc tệp config.json, sử dụng cấu hình mặc định.');
  }
}

console.log("\n========================================================");
console.log(" 🔍 CHƯƠNG TRÌNH CHẨN ĐOÁN KẾT NỐI MINECRAFT BEDROCK");
console.log("========================================================");
console.log(` 📍 Máy chủ: ${config.host || 'Chưa cấu hình (Hãy điền IP vào Web UI trước)'}`);
console.log(` 🔌 Cổng (Port): ${config.port}`);
console.log(` 👤 Tên Bot: ${config.username}`);
console.log(` 🔒 Xác thực: ${config.offline ? 'Offline (Crack)' : 'Online (Microsoft Auth)'}`);
console.log(` 🏷️ Phiên bản: ${config.version ? config.version : 'Tự động dò tìm (Gửi gói unconnected ping)'}`);
console.log("========================================================\n");

if (!config.host) {
  console.log("❌ Lỗi: Bạn chưa điền IP máy chủ trong config.json hoặc trên Web UI!");
  process.exit(1);
}

const connectionOptions = {
  host: config.host,
  port: parseInt(config.port) || 19132,
  username: config.username,
  offline: config.offline !== false,
  connectTimeout: 25000,
  profilesFolder: path.join(__dirname, 'auth-cache', config.username),
  skipPing: true,
  version: config.version || latestBedrockVersion
};

// Nếu cấu hình phiên bản cố định, bỏ qua bước ping tự động để tránh bị chặn tường lửa
if (config.version) {
  connectionOptions.version = config.version;
  console.log(`👉 Chỉ định phiên bản cố định: ${config.version}. Bỏ qua bước tự động Ping để tránh bị firewall chặn UDP!`);
} else {
  console.log(`👉 Đang để chế độ tự động dò phiên bản. Bot sẽ gửi gói unconnected ping tới server...`);
}

console.log("\n⏳ Đang khởi tạo kết nối RakNet (UDP) và in chi tiết các gói tin bắt tay...\n");

const net = require('net');
const dns = require('dns').promises;

(async () => {
  let hostIp = config.host;
  if (config.host && !net.isIP(config.host)) {
    try {
      console.log(`🔍 Đang phân giải DNS cho ${config.host}...`);
      const lookup = await dns.lookup(config.host);
      hostIp = lookup.address;
      console.log(`✓ Đã phân giải thành IP: ${hostIp}`);
    } catch (err) {
      console.log(`⚠ Lỗi phân giải DNS: ${err.message}. Sử dụng hostname gốc.`);
    }
  }

  connectionOptions.host = hostIp;

  try {
    const client = bedrock.createClient(connectionOptions);
  
  client.on('connect', () => {
    console.log("\n\x1b[32m[✓ SUCCESS] Bắt tay RakNet thành công! Đang tiến hành xác thực...\x1b[0m\n");
  });
  
  client.on('join', () => {
    console.log("\n\x1b[32m[✓ SUCCESS] Đã đăng nhập thành công vào server Minecraft Bedrock! Đang tải thế giới...\x1b[0m\n");
  });
  
  client.on('spawn', () => {
    console.log("\n\x1b[32m[✓ SUCCESS] Bot đã spawn thành công vào thế giới game! Kết nối hoạt động hoàn hảo.\x1b[0m\n");
    console.log("Ngắt kết nối chẩn đoán.");
    client.close();
    process.exit(0);
  });
  
  client.on('error', (err) => {
    console.log("\n\x1b[31m[✗ ERROR] Lỗi kết nối:\x1b[0m");
    console.error(err);
    console.log("\n💡 Gợi ý khắc phục:");
    if (err.message.includes('timeout') || err.message.includes('Timeout')) {
      console.log("1. Hãy kiểm tra xem Port của bạn đã chính xác chưa (Minecraft Bedrock sử dụng cổng UDP, không dùng cổng TCP của Java).");
      console.log("2. Một số server chặn gói tin unconnected ping (dò phiên bản). Hãy thử thiết lập cố định phiên bản Bedrock trên Web UI (ví dụ: '1.21.130') để bot kết nối thẳng không qua bước ping.");
      console.log("3. Tường lửa máy chủ hoặc nhà mạng của bạn có thể đang chặn gói tin RakNet (UDP). Hãy chắc chắn rằng bạn có thể kết nối vào IP:Port này từ chính máy tính chạy bot bằng game Minecraft BE thực tế.");
    }
    process.exit(1);
  });

  client.on('kick', (packet) => {
    console.log(`\n\x1b[33m[⚠ KICK] Bot bị kick khỏi server. Lý do: ${packet.message}\x1b[0m\n`);
    process.exit(0);
  });

  client.on('close', () => {
    console.log("\n[INFO] Kết nối đã đóng.\n");
  });

} catch (error) {
  
  console.log("\n\x1b[31m[✗ FATAL] Không thể khởi tạo bedrock-protocol client:\x1b[0m");
  console.error(error);
  process.exit(1);

}
})();
