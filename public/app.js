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
  const autoCommandInput = document.getElementById('auto-command');

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

  // TAB DOM Elements
  const tabList = document.getElementById('tab-list');
  const btnAddTab = document.getElementById('btn-add-tab');

  // Quản lý kết nối Socket.io
  let socket = null;
  let currentPassword = sessionStorage.getItem('web_password') || '';

  // STATE MANAGEMENT
  let botsConfig = [];      // Danh sách config của tất cả bot
  let activeBotId = null;   // ID bot đang hiển thị
  let botStates = {};       // Trạng thái realtime từng bot: { botId: { status, logs: [], msa: null } }

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
      const { hasPassword, bots, statuses, logBuffers } = data;

      // 1. Kiểm tra cơ chế mật khẩu
      if (hasPassword && !currentPassword) {
        // Chưa có mật khẩu và server yêu cầu -> Hiện màn hình đăng nhập
        loginOverlay.classList.remove('hidden');
        webPasswordInput.focus();
        return;
      } else {
        // Đã xác thực thành công hoặc server không yêu cầu mật khẩu
        loginOverlay.classList.add('hidden');
        if (hasPassword) {
          sessionStorage.setItem('web_password', currentPassword);
        }
      }

      // 2. Cập nhật State cục bộ
      botsConfig = bots || [];
      botStates = {};
      botsConfig.forEach(bot => {
        botStates[bot.id] = {
          status: statuses[bot.id] || 'offline',
          logs: logBuffers[bot.id] || [],
          msa: null
        };
      });

      // Lựa chọn active bot ban đầu
      if (botsConfig.length > 0) {
        if (!activeBotId || !botStates[activeBotId]) {
          activeBotId = botsConfig[0].id;
        }
      } else {
        activeBotId = null;
      }

      // 3. Render giao diện Tab
      renderTabBar();
      switchActiveBot(activeBotId);
    });

    // Lắng nghe trạng thái bot thay đổi realtime
    socket.on('status', ({ botId, status }) => {
      if (botStates[botId]) {
        botStates[botId].status = status;
        
        // Cập nhật LED trên Tab tương ứng
        const tabLed = document.querySelector(`.tab-item[data-bot-id="${botId}"] .tab-led`);
        if (tabLed) {
          tabLed.className = `tab-led led-${status}`;
        }
        
        // Cập nhật UI chính nếu bot này đang active
        if (botId === activeBotId) {
          updateStatusUI(status);
        }
      }
    });

    // Lắng nghe logs realtime đổ về từ server
    socket.on('log', ({ botId, logObj }) => {
      if (botStates[botId]) {
        botStates[botId].logs.push(logObj);
        if (botStates[botId].logs.length > 100) {
          botStates[botId].logs.shift();
        }
        
        // In log ra Terminal nếu bot này đang active
        if (botId === activeBotId) {
          addLogLine(logObj);
        }
      }
    });

    // Lắng nghe kết quả lưu cấu hình thành công
    socket.on('config_saved', ({ success, botId, config, message }) => {
      if (success) {
        const bot = botsConfig.find(b => b.id === botId);
        if (bot) {
          Object.assign(bot, config);
        }
      } else {
        alert(`Không thể lưu cấu hình: ${message}`);
      }
    });

    // Lắng nghe mã xác thực Microsoft
    socket.on('msa_code', ({ botId, data }) => {
      if (botStates[botId]) {
        botStates[botId].msa = data;
        
        // Hiển thị banner nếu bot này đang active
        if (botId === activeBotId) {
          showMsaAlert(data);
        }
      }
    });

    // Lắng nghe sự kiện thêm bot mới
    socket.on('bot_added', ({ bot, status, logs }) => {
      botsConfig.push(bot);
      botStates[bot.id] = {
        status: status || 'offline',
        logs: logs || [],
        msa: null
      };
      
      renderTabBar();
      // Tự động chuyển sang bot vừa được tạo
      switchActiveBot(bot.id);
    });

    // Lắng nghe sự kiện xóa bot
    socket.on('bot_removed', ({ botId }) => {
      const idx = botsConfig.findIndex(b => b.id === botId);
      if (idx !== -1) {
        botsConfig.splice(idx, 1);
        delete botStates[botId];
        
        renderTabBar();
        
        // Nếu bot bị xóa đang active, chuyển sang bot đầu tiên còn lại
        if (activeBotId === botId) {
          activeBotId = botsConfig.length > 0 ? botsConfig[0].id : null;
          switchActiveBot(activeBotId);
        }
      }
    });

    // Lắng nghe sự kiện đổi tên bot
    socket.on('bot_renamed', ({ botId, name }) => {
      const bot = botsConfig.find(b => b.id === botId);
      if (bot) {
        bot.name = name;
        
        // Cập nhật tên trên Tab UI tương ứng
        const tabNameSpan = document.querySelector(`.tab-item[data-bot-id="${botId}"] .tab-name`);
        if (tabNameSpan) {
          tabNameSpan.textContent = name;
        }
      }
    });
  }

  // Tiện ích chống XSS cơ bản khi render tên bot
  function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // Render danh sách các tab bot
  function renderTabBar() {
    tabList.innerHTML = '';
    
    botsConfig.forEach(bot => {
      const state = botStates[bot.id] || { status: 'offline' };
      const tab = document.createElement('div');
      tab.className = `tab-item${bot.id === activeBotId ? ' active' : ''}`;
      tab.setAttribute('data-bot-id', bot.id);
      
      tab.innerHTML = `
        <span class="tab-led led-${state.status}"></span>
        <span class="tab-name">${escapeHTML(bot.name)}</span>
        <button class="tab-close-btn" title="Xóa bot">&times;</button>
      `;

      // Chuyển bot active khi click
      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close-btn')) return;
        switchActiveBot(bot.id);
      });

      // Double-click để đổi tên bot
      tab.addEventListener('dblclick', () => {
        startRenameTab(bot.id, tab);
      });

      // Nút đóng/xóa bot
      const closeBtn = tab.querySelector('.tab-close-btn');
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Bạn có chắc chắn muốn xóa cấu hình và ngắt kết nối bot "${bot.name}"?`)) {
          socket.emit('remove_bot', { botId: bot.id });
        }
      });

      tabList.appendChild(tab);
    });

    lucide.createIcons();
  }

  // Kích hoạt input đổi tên tab
  function startRenameTab(botId, tabElement) {
    const nameSpan = tabElement.querySelector('.tab-name');
    const oldName = nameSpan.textContent;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-rename-input';
    input.value = oldName;
    
    nameSpan.replaceWith(input);
    input.focus();
    input.select();
    
    let isFinished = false;

    const finishRename = () => {
      if (isFinished) return;
      isFinished = true;
      const newName = input.value.trim();
      if (newName && newName !== oldName) {
        socket.emit('rename_bot', { botId, name: newName });
      } else {
        const span = document.createElement('span');
        span.className = 'tab-name';
        span.textContent = oldName;
        input.replaceWith(span);
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishRename();
      } else if (e.key === 'Escape') {
        isFinished = true;
        const span = document.createElement('span');
        span.className = 'tab-name';
        span.textContent = oldName;
        input.replaceWith(span);
      }
    });

    input.addEventListener('blur', finishRename);
  }

  // Chuyển đổi bot active hiện tại
  function switchActiveBot(botId) {
    if (!botId) {
      activeBotId = null;
      clearFormAndTerminal();
      return;
    }

    activeBotId = botId;
    
    // Cập nhật class active trong UI tab
    document.querySelectorAll('.tab-item').forEach(tab => {
      if (tab.getAttribute('data-bot-id') === botId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    const bot = botsConfig.find(b => b.id === botId);
    const state = botStates[botId];

    if (bot && state) {
      // 1. Đổ dữ liệu cấu hình bot vào form
      hostInput.value = bot.host || '';
      portInput.value = bot.port || 19132;
      offlineSelect.value = bot.offline ? 'true' : 'false';
      usernameInput.value = bot.username || 'DonutAFKBot';
      versionInput.value = bot.version || '';
      autoCommandInput.value = bot.autoCommand || '';

      // 2. Nạp log của bot active vào terminal
      terminalLogs.innerHTML = '';
      if (state.logs && state.logs.length > 0) {
        state.logs.forEach(logObj => addLogLine(logObj));
      } else {
        addLogLine({
          timestamp: new Date().toLocaleTimeString(),
          message: `Bot "${bot.name}" đã sẵn sàng. Chưa có log nào.`,
          type: 'system'
        });
      }

      // 3. Cập nhật Trạng thái UI
      updateStatusUI(state.status);

      // 4. Kiểm tra xem bot active có đang hiển thị Microsoft code không
      if (state.msa) {
        showMsaAlert(state.msa);
      } else {
        hideMsaAlert();
      }
    }
  }

  // Reset form và terminal khi không có bot nào
  function clearFormAndTerminal() {
    hostInput.value = '';
    portInput.value = '19132';
    offlineSelect.value = 'true';
    usernameInput.value = '';
    versionInput.value = '';
    autoCommandInput.value = '';
    terminalLogs.innerHTML = '<div class="log-line log-system">Không có bot nào trong danh sách. Hãy nhấn nút "+" để thêm bot mới.</div>';
    
    statusLed.className = 'led led-offline';
    statusText.textContent = 'Đang Offline';
    statusText.style.color = '#ef4444';

    btnConnect.disabled = true;
    btnDisconnect.disabled = true;
    chatInput.disabled = true;
    btnSendChat.disabled = true;
    chatInput.placeholder = "Chưa có bot nào...";
    hideMsaAlert();
  }

  // Hàm hiển thị banner xác thực Microsoft
  function showMsaAlert(data) {
    const { user_code, verification_uri } = data;
    
    msaCodeText.textContent = user_code;
    msaLink.href = verification_uri;
    
    msaAlert.classList.remove('hidden');
    setTimeout(() => {
      msaAlert.classList.add('show');
    }, 50);

    lucide.createIcons();

    // Reset countdown
    if (msaCountdownInterval) {
      clearInterval(msaCountdownInterval);
    }
    
    let timeLeft = 180;
    msaTimer.textContent = `Hiệu lực: ${timeLeft}s`;
    
    msaCountdownInterval = setInterval(() => {
      timeLeft--;
      msaTimer.textContent = `Hiệu lực: ${timeLeft}s`;
      
      if (timeLeft <= 0) {
        clearInterval(msaCountdownInterval);
        hideMsaAlert();
      }
    }, 1000);
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

      hideMsaAlert();

      btnConnect.disabled = true;
      btnDisconnect.disabled = false;

      chatInput.disabled = false;
      btnSendChat.disabled = false;
      chatInput.placeholder = "Gửi tin nhắn hoặc lệnh trong game trực tiếp...";
    } else if (status === 'connecting') {
      statusLed.classList.add('led-connecting');
      statusText.textContent = 'Đang Kết Nối...';
      statusText.style.color = '#f59e0b';

      btnConnect.disabled = true;
      btnDisconnect.disabled = false;

      chatInput.disabled = true;
      btnSendChat.disabled = true;
      chatInput.placeholder = "Vui lòng đợi bot kết nối thành công để chat...";
    } else {
      // offline
      statusLed.classList.add('led-offline');
      statusText.textContent = 'Đang Offline';
      statusText.style.color = '#ef4444';

      btnConnect.disabled = false;
      btnDisconnect.disabled = true;

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
    
    const timeSpan = document.createElement('span');
    timeSpan.style.color = 'var(--text-muted)';
    timeSpan.style.marginRight = '0.75rem';
    timeSpan.textContent = `[${timestamp}]`;
    
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
      initSocketConnection();
    }
  });

  // 2. Lưu cấu hình Bot active
  configForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!socket || !socket.connected) {
      alert('Không có kết nối tới Web Server!');
      return;
    }
    if (!activeBotId) {
      alert('Không có bot nào hoạt động để lưu cấu hình!');
      return;
    }

    const config = {
      host: hostInput.value.trim(),
      port: parseInt(portInput.value) || 19132,
      offline: offlineSelect.value === 'true',
      username: usernameInput.value.trim(),
      version: versionInput.value.trim(),
      autoCommand: autoCommandInput.value.trim(),
    };

    socket.emit('save_config', { botId: activeBotId, config });
  });

  // 3. Yêu cầu Bot active kết nối
  btnConnect.addEventListener('click', () => {
    if (activeBotId && socket && socket.connected) {
      socket.emit('start_bot', { botId: activeBotId });
    }
  });

  // 4. Yêu cầu Bot active ngắt kết nối
  btnDisconnect.addEventListener('click', () => {
    if (activeBotId && socket && socket.connected) {
      socket.emit('stop_bot', { botId: activeBotId });
    }
  });

  // 5. Gửi chat trực tiếp cho bot active
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (msg && activeBotId && socket && socket.connected) {
      socket.emit('send_chat', { botId: activeBotId, message: msg });
      chatInput.value = '';
      chatInput.focus();
    }
  });

  // 6. Nút thêm bot mới
  btnAddTab.addEventListener('click', () => {
    if (!socket || !socket.connected) {
      alert('Không có kết nối tới Web Server!');
      return;
    }
    const name = prompt('Nhập tên cho bot mới:', `Bot ${botsConfig.length + 1}`);
    if (name !== null) {
      socket.emit('add_bot', { name: name });
    }
  });

  // 7. Xóa màn hình log terminal (chỉ xóa ở local client hiển thị)
  btnClearLogs.addEventListener('click', () => {
    terminalLogs.innerHTML = '';
    addLogLine({
      timestamp: new Date().toLocaleTimeString(),
      message: 'Đã xóa trắng màn hình nhật ký hiển thị.',
      type: 'system'
    });
  });

  // Microsoft code Copy
  btnCopyMsa.addEventListener('click', () => {
    const code = msaCodeText.textContent;
    if (code && code !== '--------') {
      navigator.clipboard.writeText(code).then(() => {
        const copyIcon = btnCopyMsa.querySelector('i');
        copyIcon.setAttribute('data-lucide', 'check');
        lucide.createIcons();
        
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
    if (activeBotId && botStates[activeBotId]) {
      botStates[activeBotId].msa = null;
    }
    hideMsaAlert();
  });

  // Bắt đầu khởi tạo kết nối lần đầu tiên
  initSocketConnection();
});
