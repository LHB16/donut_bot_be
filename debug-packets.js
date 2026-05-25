const bedrock = require('bedrock-protocol');
const mcData = require('minecraft-data');
const path = require('path');
const fs = require('fs');
const net = require('net');
const dns = require('dns').promises;

let config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const version = config.version || (mcData.versions.bedrock && mcData.versions.bedrock[0]
  ? mcData.versions.bedrock[0].minecraftVersion
  : '1.26.20');

const latestBedrockVersion = version;

(async () => {
  let hostIp = config.host;
  if (config.host && !net.isIP(config.host)) {
    try {
      const lookup = await dns.lookup(config.host);
      hostIp = lookup.address;
      console.log(`DNS: ${config.host} -> ${hostIp}`);
    } catch (e) { /* ignore */ }
  }

  const client = bedrock.createClient({
    host: hostIp,
    port: parseInt(config.port) || 19132,
    username: config.username,
    offline: config.offline !== false,
    profilesFolder: path.join(__dirname, 'auth-cache', config.username || 'DonutAFKBot'),
    connectTimeout: 30000,
    skipPing: true,
    version: config.version || latestBedrockVersion
  });

  // Đếm tần suất các loại gói tin
  const packetCounts = {};
  const importantPackets = [];

  client.on('packet', (packet) => {
    const name = packet.data.name;
    packetCounts[name] = (packetCounts[name] || 0) + 1;
    
    // Ghi chi tiết các gói tin quan trọng
    if (['network_stack_latency', 'tick_sync', 'correct_player_move_prediction', 
         'move_player', 'set_entity_motion', 'disconnect', 'play_status',
         'text', 'start_game'].includes(name)) {
      const info = { name, time: new Date().toLocaleTimeString() };
      if (name === 'start_game') {
        info.current_tick = packet.data.params.current_tick;
        info.runtime_entity_id = packet.data.params.runtime_entity_id;
      } else if (name === 'network_stack_latency') {
        info.timestamp = packet.data.params.timestamp;
        info.needs_response = packet.data.params.needs_response;
      } else if (name === 'tick_sync') {
        info.request_time = packet.data.params.request_time;
        info.response_time = packet.data.params.response_time;
      } else if (name === 'text') {
        info.message = packet.data.params.message;
      } else if (name === 'correct_player_move_prediction') {
        info.position = packet.data.params.position;
        info.tick = packet.data.params.tick;
      }
      importantPackets.push(info);
      console.log(`[${info.time}] << ${name}`, JSON.stringify(info, (key, value) => typeof value === 'bigint' ? value.toString() : value));
    }
  });

  // Tự động phản hồi gói tin network_stack_latency để tránh bị hệ thống bảo mật kick
  // Xem core.md - Vấn đề 4 để biết chi tiết kỹ thuật
  client.on('network_stack_latency', (packet) => {
    if (packet.needs_response) {
      const tsVal = packet.timestamp.valueOf();
      const signedVal = BigInt.asIntN(64, tsVal);
      const multiplied = signedVal * 1000000n;
      const responseTimestamp = BigInt.asUintN(64, multiplied);

      console.log(`[${new Date().toLocaleTimeString()}] >> Phản hồi latency. Signed: ${signedVal} -> Response: ${responseTimestamp}`);
      try {
        client.write('network_stack_latency', {
          timestamp: responseTimestamp,
          needs_response: 0
        });
      } catch (e) {
        console.error('❌ Lỗi gửi phản hồi network_stack_latency:', e.message);
      }
    }
  });

  client.on('spawn', () => {
    console.log('\n✅ Bot spawned! Đang lắng nghe gói tin 60 giây...\n');
  });

  client.on('error', (err) => {
    console.error('❌ Error:', err.message);
  });

  client.on('kick', (packet) => {
    console.log('⚠️ Kicked:', packet.message);
  });

  client.on('close', () => {
    console.log('\n🔌 Connection closed.\n');
    console.log('=== THỐNG KÊ GÓI TIN NHẬN ĐƯỢC ===');
    const sorted = Object.entries(packetCounts).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      console.log(`  ${name}: ${count}`);
    }
    console.log('\n=== GÓI TIN QUAN TRỌNG ===');
    for (const p of importantPackets) {
      console.log(`  [${p.time}] ${p.name}`, JSON.stringify(p, (key, value) => typeof value === 'bigint' ? value.toString() : value));
    }
    process.exit(0);
  });

  // Tự động ngắt kết nối sau 60 giây
  setTimeout(() => {
    console.log('\n⏱️ Hết 60 giây. Ngắt kết nối...');
    client.close();
  }, 60000);
})();
