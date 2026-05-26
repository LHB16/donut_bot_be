document.addEventListener('DOMContentLoaded', () => {
  // Khởi tạo các Icons Lucide
  lucide.createIcons();

  // DOM Elements
  const loginOverlay = document.getElementById('login-overlay');
  const loginForm = document.getElementById('login-form');
  const webPasswordInput = document.getElementById('web-password');
  const loginError = document.getElementById('login-error');
  const errorText = document.getElementById('error-text');

  const statusLed = document.getElementById('status-led');
  const statusText = document.getElementById('status-text');

  const configForm = document.getElementById('config-form');
  const hostInput = document.getElementById('host');
  const portInput = document.getElementById('port');
  const offlineSelect = document.getElementById('offline');
  const usernameInput = document.getElementById('username');

  const versionInput = document.getElementById('version');

  const btnConnect = document.getElementById('btn-connect');
  const btnDisconnect = document.getElementById('btn-disconnect');
  const terminalLogs = document.getElementById('terminal-logs');
  const btnClearLogs = document.getElementById('btn-clear-logs');

  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const btnSendChat = document.getElementById('btn-send-chat');

  // MSA Alert Elements
  const msaAlert = document.getElementById('msa-alert');
  const msaCodeText = document.getElementById('msa-code-text');
  const btnCopyMsa = document.getElementById('btn-copy-msa');
  const msaLink = document.getElementById('msa-link');
  const msaTimer = document.getElementById('msa-timer');
  const btnCloseMsa = document.getElementById('btn-close-msa');
  let msaCountdownInterval = null;

  // Quản lý kết nối Socket.io
  let socket = null;
  let currentPassword = sessionStorage.getItem('web_password') || '';

  // Kết nối tới Socket Server
  function initSocketConnection() {
    // Đóng kết nối cũ nếu có
    if (socket) {
      socket.disconnect();
    }

    // Kết nối Socket.io kèm token mật khẩu trong phần auth handshake
    socket = io({
      auth: {
        password: currentPassword
      },
      reconnectionAttempts: 5,
      timeout: 10000
    });

    // Lắng nghe sự kiện kết nối thành công
    socket.on('connect', () => {
      console.log('Đã kết nối thành công tới Web Server!');
      loginError.classList.add('hidden');
    });

    // Lắng nghe lỗi kết nối (bao gồm cả lỗi xác thực)
    socket.on('connect_error', (err) => {
      console.error('Lỗi kết nối Socket:', err.message);
      
      // Nếu lỗi do sai mật khẩu (UNAUTHORIZED)
      if (err.data && err.data.code === 'UNAUTHORIZED') {
        sessionStorage.removeItem('web_password');
        currentPassword = '';
        
        // Hiển thị màn hình Login và thông báo lỗi
        loginOverlay.classList.remove('hidden');
        loginError.classList.remove('hidden');
        errorText.textContent = 'Mật khẩu Web UI không chính xác. Vui lòng nhập lại!';
        webPasswordInput.value = '';
        webPasswordInput.focus();
      } else {
        // Lỗi kết nối thông thường khác
        addLogLine({
          timestamp: new Date().toLocaleTimeString(),
          message: `Không thể kết nối tới Web Server: ${err.message}. Đang thử lại...`,
          type: 'error'
        });
      }
    });

    // Sự kiện nạp dữ liệu ban đầu sau khi kết nối thành công
    socket.on('init', (data) => {
      const { hasPassword, botStatus, botConfig, logs } = data;

      // 1. Kiểm tra cơ chế mật khẩu
      if (hasPassword && !currentPassword) {
        // Chưa có mật khẩu và server yêu cầu -> Hiện màn hình đăng nhập
        loginOverlay.classList.remove('hidden');
        webPasswordInput.focus();
      } else {
        // Đã xác thực thành công hoặc server không yêu cầu mật khẩu
        loginOverlay.classList.add('hidden');
        if (hasPassword) {
          sessionStorage.setItem('web_password', currentPassword);
        }
      }

      // 2. Điền cấu hình Bot hiện tại vào Form
      if (botConfig) {
        hostInput.value = botConfig.host || '';
        portInput.value = botConfig.port || 19132;
        offlineSelect.value = botConfig.offline ? 'true' : 'false';
        usernameInput.value = botConfig.username || 'DonutAFKBot';

        versionInput.value = botConfig.version || '';
      }

      // 3. Cập nhật Trạng thái UI của Bot
      updateStatusUI(botStatus);

      // 4. Nạp đống logs lịch sử
      terminalLogs.innerHTML = '';
      if (logs && logs.length > 0) {
        logs.forEach(logObj => addLogLine(logObj));
      } else {
        addLogLine({
          timestamp: new Date().toLocaleTimeString(),
          message: 'Bảng điều khiển đã sẵn sàng. Chưa có nhật ký bot nào.',
          type: 'system'
        });
      }
    });

    // Lắng nghe trạng thái bot thay đổi realtime
    socket.on('status', (status) => {
      updateStatusUI(status);
    });

    // Lắng nghe logs realtime đổ về từ server
    socket.on('log', (logObj) => {
      addLogLine(logObj);
    });

    // Lắng nghe kết quả lưu cấu hình thành công
    socket.on('config_saved', (result) => {
      if (result.success) {
        // Có thể hiện một thông báo nhỏ (Toast) ở đây
      } else {
        alert(`Không thể lưu cấu hình: ${result.message}`);
      }
    });

    // Lắng nghe mã xác thực Microsoft
    socket.on('msa_code', (data) => {
      const { user_code, verification_uri } = data;
      
      // Hiển thị code và cập nhật link
      msaCodeText.textContent = user_code;
      msaLink.href = verification_uri;
      
      // Kích hoạt hiển thị banner
      msaAlert.classList.remove('hidden');
      setTimeout(() => {
        msaAlert.classList.add('show');
      }, 50);

      // Cập nhật lại biểu tượng
      lucide.createIcons();

      // Bắt đầu đếm ngược 3 phút (180 giây)
      if (msaCountdownInterval) {
        clearInterval(msaCountdownInterval);
      }
      
      let timeLeft = 180; // 3 phút
      msaTimer.textContent = `Hiệu lực: ${timeLeft}s`;
      
      msaCountdownInterval = setInterval(() => {
        timeLeft--;
        msaTimer.textContent = `Hiệu lực: ${timeLeft}s`;
        
        if (timeLeft <= 0) {
          clearInterval(msaCountdownInterval);
          hideMsaAlert();
        }
      }, 1000);
    });
  }

  // Hàm ẩn banner xác thực Microsoft
  function hideMsaAlert() {
    msaAlert.classList.remove('show');
    if (msaCountdownInterval) {
      clearInterval(msaCountdownInterval);
      msaCountdownInterval = null;
    }
    setTimeout(() => {
      msaAlert.classList.add('hidden');
    }, 400);
  }

  // Cập nhật giao diện trạng thái của Bot
  function updateStatusUI(status) {
    statusLed.className = 'led'; // Reset classes
    
    if (status === 'online') {
      statusLed.classList.add('led-online');
      statusText.textContent = 'Đang Online';
      statusText.style.color = '#10b981';

      // Điều khiển Nút bấm
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;

      // Cho phép Chat
      chatInput.disabled = false;
      btnSendChat.disabled = false;
      chatInput.placeholder = "Gửi tin nhắn hoặc lệnh trong game trực tiếp...";
    } else if (status === 'connecting') {
      statusLed.classList.add('led-connecting');
      statusText.textContent = 'Đang Kết Nối...';
      statusText.style.color = '#f59e0b';

      // Đang kết nối thì khóa cả 2 nút tránh spam
      btnConnect.disabled = true;
      btnDisconnect.disabled = false; // Vẫn cho phép ngắt kết nối/hủy Reconnect

      // Khóa Chat
      chatInput.disabled = true;
      btnSendChat.disabled = true;
      chatInput.placeholder = "Vui lòng đợi bot kết nối thành công để chat...";
    } else {
      // offline
      statusLed.classList.add('led-offline');
      statusText.textContent = 'Đang Offline';
      statusText.style.color = '#ef4444';

      // Điều khiển Nút bấm
      btnConnect.disabled = false;
      btnDisconnect.disabled = true;

      // Khóa Chat
      chatInput.disabled = true;
      btnSendChat.disabled = true;
      chatInput.placeholder = "Bot đang offline. Hãy nhấn 'Bắt đầu AFK' để chat...";
    }
  }

  // Thêm dòng log vào Terminal
  function addLogLine(logObj) {
    const { timestamp, message, type } = logObj;
    const line = document.createElement('div');
    line.className = `log-line log-${type || 'info'}`;
    
    // Tạo phần hiển thị thời gian
    const timeSpan = document.createElement('span');
    timeSpan.style.color = 'var(--text-muted)';
    timeSpan.style.marginRight = '0.75rem';
    timeSpan.textContent = `[${timestamp}]`;
    
    // Tạo phần nội dung log
    const textSpan = document.createElement('span');
    textSpan.textContent = message;

    line.appendChild(timeSpan);
    line.appendChild(textSpan);
    
    terminalLogs.appendChild(line);

    // Tự động cuộn xuống cuối terminal
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  // ==========================================================================
  // XỬ LÝ SỰ KIỆN NÚT BẤM VÀ FORM
  // ==========================================================================

  // 1. Submit mật khẩu Web UI
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pwd = webPasswordInput.value.trim();
    if (pwd) {
      currentPassword = pwd;
      initSocketConnection(); // Thử kết nối lại với mật khẩu mới
    }
  });

  // 2. Lưu cấu hình Bot
  configForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!socket || !socket.connected) {
      alert('Không có kết nối tới Web Server!');
      return;
    }

    const newConfig = {
      host: hostInput.value.trim(),
      port: parseInt(portInput.value) || 19132,
      offline: offlineSelect.value === 'true',
      username: usernameInput.value.trim(),
      version: versionInput.value.trim(),

    };

    socket.emit('save_config', newConfig);
  });

  // 3. Yêu cầu Bot kết nối vào Server game
  btnConnect.addEventListener('click', () => {
    if (socket && socket.connected) {
      socket.emit('start_bot');
    }
  });

  // 4. Yêu cầu Bot ngắt kết nối
  btnDisconnect.addEventListener('click', () => {
    if (socket && socket.connected) {
      socket.emit('stop_bot');
    }
  });

  // 5. Gửi chat trực tiếp từ Terminal
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (msg && socket && socket.connected) {
      socket.emit('send_chat', msg);
      chatInput.value = '';
      chatInput.focus();
    }
  });

  // 6. Xóa màn hình log terminal
  btnClearLogs.addEventListener('click', () => {
    terminalLogs.innerHTML = '';
    addLogLine({
      timestamp: new Date().toLocaleTimeString(),
      message: 'Đã xóa trắng màn hình nhật ký.',
      type: 'system'
    });
  });

  // Event Listener cho Xác thực Microsoft
  btnCopyMsa.addEventListener('click', () => {
    const code = msaCodeText.textContent;
    if (code && code !== '--------') {
      navigator.clipboard.writeText(code).then(() => {
        // Thay đổi icon tạm thời thành check
        const copyIcon = btnCopyMsa.querySelector('i');
        copyIcon.setAttribute('data-lucide', 'check');
        lucide.createIcons();
        
        // Reset lại sau 2 giây
        setTimeout(() => {
          copyIcon.setAttribute('data-lucide', 'copy');
          lucide.createIcons();
        }, 2000);
      }).catch(err => {
        console.error('Không thể copy mã code:', err);
      });
    }
  });

  btnCloseMsa.addEventListener('click', () => {
    hideMsaAlert();
  });

  // Bắt đầu khởi tạo kết nối lần đầu tiên
  initSocketConnection();
});
