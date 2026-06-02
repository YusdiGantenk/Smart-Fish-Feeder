/*============================================================
  SMART FISH FEEDER - DASHBOARD MONITORING
  JavaScript - Main Logic
  ============================================================ */

// ============================================================
// CONFIGURATION & CONSTANTS
// ============================================================

const CONFIG = {
    SCHEDULE_MORNING: { hour: 7, minute: 0, label: 'Jadwal Pagi' },
    SCHEDULE_EVENING: { hour: 16, minute: 0, label: 'Jadwal Sore' },
    FEEDING_DURATION: 3000, // 3 detik
    SENSOR_CHECK_INTERVAL: 2000, // 2 detik
    LCD_UPDATE_INTERVAL: 1000, // 1 detik
    BLYNK_SEND_INTERVAL: 5000, // 5 detik
    STOCK_THRESHOLD: 20, // persen
    
    // Blynk Configuration
    BLYNK_AUTH_TOKEN: 'wKnMqKdDMW0-yhnLs_pDGbUcdfq2nqcZ',
    BLYNK_SERVER: 'https://blynk.cloud/external/api',
    BLYNK_VPINS: {
        STOCK: 'V0',      // Gauge - Stok Pakan (0-100%)
        TIME: 'V1',       // Label - Waktu WIB
        FEEDING: 'V2'     // Button - Beri Pakan Manual
    }
};

// ============================================================
// GLOBAL STATE
// ============================================================

const STATE = {
    stockPercentage: -1,
    isOnline: false,
    blynkConnected: false,
    blynkConnectionAttempts: 0,
    sensorReady: false,
    totalFeedings: 0,
    morningFed: false,
    eveningFed: false,
    feedingHistory: [],
    notifications: [],
    lastBlynkCheck: 0,
    blynkPollInterval: null,
    settings: {
        morningHour: 7,
        morningMinute: 0,
        eveningHour: 16,
        eveningMinute: 0,
        stockThreshold: 20,
        notificationsEnabled: true
    }
};

// ============================================================
// DOM ELEMENTS
// ============================================================

const DOM = {
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    percentageDisplay: document.getElementById('percentageDisplay'),
    progressFill: document.getElementById('progressFill'),
    gaugeFill: document.getElementById('gaugeFill'),
    needle: document.getElementById('needle'),
    stockStatus: document.getElementById('stockStatus'),
    levelStok: document.getElementById('levelStok'),
    lastUpdate: document.getElementById('lastUpdate'),
    digitalClock: document.getElementById('digitalClock'),
    dateDisplay: document.getElementById('dateDisplay'),
    dayDisplay: document.getElementById('dayDisplay'),
    statusPagi: document.getElementById('statusPagi'),
    statusSore: document.getElementById('statusSore'),
    btnBeriPakan: document.getElementById('btnBeriPakan'),
    historyList: document.getElementById('historyList'),
    notificationsList: document.getElementById('notificationsList'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    btnClearNotif: document.getElementById('btnClearNotif'),
    totalFeeding: document.getElementById('totalFeeding'),
    systemStatus: document.getElementById('systemStatus'),
    blynkStatus: document.getElementById('blynkStatus'),
    sensorStatus: document.getElementById('sensorStatus'),
    toast: document.getElementById('toast'),
    modalKonfirmasi: document.getElementById('modalKonfirmasi'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    btnBatalKonfirmasi: document.getElementById('btnBatalKonfirmasi'),
    btnYaKonfirmasi: document.getElementById('btnYaKonfirmasi'),
    modalSettings: document.getElementById('modalSettings'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    btnCloseSettingsBtn: document.getElementById('btnCloseSettingsBtn'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    settingsJamPagi: document.getElementById('settingsJamPagi'),
    settingsJamSore: document.getElementById('settingsJamSore'),
    settingsThreshold: document.getElementById('settingsThreshold'),
    settingsNotif: document.getElementById('settingsNotif'),
    modalStok: document.getElementById('modalStok'),
};

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('Smart Fish Feeder Dashboard - Initializing...');
    
    // Load settings from localStorage
    loadSettings();
    
    // Set initial time
    updateClock();
    
    // Event listeners
    setupEventListeners();
    checkFeedingSchedule, 1000);
    
    // Connect to Blynk
    console.log('Attempting to connect to Blynk...');
    connectToBlynk();
    
    // Start polling Blynk data
    STATE.blynkPollInterval = setInterval(pollBlynkData, CONFIG.BLYNK_SEND_INTERVALout(() => {
        setOnlineStatus(true);
        showToast('Sistem terhubung', 'success');
    }, 1500);
    
    // Load history from localStorage
    loadFeedingHistory();
    
    console.log('Dashboard initialized successfully');
});

// ============================================================
// EVENT LISTENERS SETUP
// ============================================================

function setupEventListeners() {
    // Feeding button
    DOM.btnBeriPakan.addEventListener('click', openFeedingConfirmation);
    
    // Modal confirmations
    DOM.btnCloseModal.addEventListener('click', closeModal);
    DOM.btnBatalKonfirmasi.addEventListener('click', closeModal);
    DOM.btnYaKonfirmasi.addEventListener('click', confirmFeeding);
    
    // History & Notifications
    DOM.btnClearHistory.addEventListener('click', clearHistory);
    DOM.btnClearNotif.addEventListener('click', clearNotifications);
    
    // Settings
    DOM.btnCloseSettings.addEventListener('click', closeSettings);
    DOM.btnCloseSettingsBtn.addEventListener('click', closeSettings);
    DOM.btnSaveSettings.addEventListener('click', saveSettings);
}

// ============================================================
// CLOCK & TIME FUNCTIONS
// ============================================================

function updateClock() {
    const now = new Date();
    
    // Update digital clock
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    DOM.digitalClock.textContent = `${hours}:${minutes}:${seconds}`;
    
    // Update date
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    DOM.dateDisplay.textContent = now.toLocaleDateString('id-ID', options);
    
    // Update day
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    DOM.dayDisplay.textContent = days[now.getDay()];
    
    // Update last update time
    DOM.lastUpdate.textContent = `${hours}:${minutes}:${seconds}`;
}

// ============================================================
// BLYNK CONNECTION & COMMUNICATION
// ============================================================

async function connectToBlynk() {
    try {
        console.log('Testing Blynk connection...');
        
        // Test connection by reading V0 (stock level)
        const response = await fetch(
            `${CONFIG.BLYNK_SERVER}/get?token=${CONFIG.BLYNK_AUTH_TOKEN}&pin=${CONFIG.BLYNK_VPINS.STOCK}`
        );
        
        if (response.ok) {
            console.log('✓ Blynk connection successful');
            setOnlineStatus(true);
            STATE.blynkConnected = true;
            STATE.blynkConnectionAttempts = 0;
            showToast('Terhubung dengan Blynk', 'success');
            return true;
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('✗ Blynk connection failed:', error);
        STATE.blynkConnectionAttempts++;
        
        if (STATE.blynkConnectionAttempts === 1) {
            showToast('Mencoba menghubungkan ke Blynk...', 'info');
        }
        
        // Retry connection after 5 seconds
        setTimeout(connectToBlynk, 5000);
        return false;
    }
}

async function pollBlynkData() {
    if (!STATE.blynkConnected) return;
    
    try {
        // Read V0: Stock Percentage
        const stockResponse = await fetch(
            `${CONFIG.BLYNK_SERVER}/get?token=${CONFIG.BLYNK_AUTH_TOKEN}&pin=${CONFIG.BLYNK_VPINS.STOCK}`
        );
        
        if (stockResponse.ok) {
            const stockData = await stockResponse.json();
            const stockValue = parseInt(stockData[0]);
            
            if (!isNaN(stockValue)) {
                STATE.stockPercentage = Math.max(0, Math.min(100, stockValue));
                STATE.sensorReady = true;
                updateStockDisplay();
                checkStockThreshold();
                console.log(`Stock updated: ${STATE.stockPercentage}%`);
            }
        }
        
        // Read V1: Time (optional, we use local time)
        const timeResponse = await fetch(
            `${CONFIG.BLYNK_SERVER}/get?token=${CONFIG.BLYNK_AUTH_TOKEN}&pin=${CONFIG.BLYNK_VPINS.TIME}`
        );
        
        if (timeResponse.ok) {
            const timeData = await timeResponse.json();
            console.log(`ESP32 Time: ${timeData[0]}`);
        }
        
    } catch (error) {
        console.error('Error polling Blynk data:', error);
        
        // If error, try to reconnect
        if (!STATE.blynkConnected) {
            connectToBlynk();
        }
    }
}

async function sendToBlynk(vpin, value) {
    if (!STATE.blynkConnected) {
        showToast('Belum terhubung dengan Blynk', 'warning');
        return false;
    }
    
    try {
        const response = await fetch(
            `${CONFIG.BLYNK_SERVER}/put?token=${CONFIG.BLYNK_AUTH_TOKEN}&pin=${vpin}&value=${value}`,
            { method: 'PUT' }
        );
        
        if (response.ok) {
            console.log(`✓ Sent to Blynk ${vpin}=${value}`);
            return true;
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error(`Error sending to Blynk ${vpin}:`, error);
        return false;
    }
}

// ============================================================
// STOCK SENSOR FUNCTIONS (Now reads from Blynk)
// ============================================================

function updateStockDisplay() {
    const percentage = STATE.stockPercentage;
    
    // Update percentage display
    DOM.percentageDisplay.textContent = `${percentage}%`;
    
    // Update progress bar
    DOM.progressFill.style.width = `${percentage}%`;
    
    // Update gauge (SVG arc animation)
    updateGauge(percentage);
    
    // Update status text
    if (percentage < 0) {
        DOM.stockStatus.textContent = 'Membaca...';
        DOM.levelStok.textContent = '-';
    } else if (percentage === 0) {
        DOM.stockStatus.textContent = 'Stok Habis';
        DOM.levelStok.textContent = 'Kosong Total';
    } else if (percentage <= CONFIG.STOCK_THRESHOLD) {
        DOM.stockStatus.textContent = 'Stok Rendah';
        DOM.levelStok.textContent = 'Hampir Habis';
    } else if (percentage === 100) {
        DOM.stockStatus.textContent = 'Stok Penuh';
        DOM.levelStok.textContent = 'Penuh Total';
    } else {
        DOM.stockStatus.textContent = 'Normal';
        DOM.levelStok.textContent = 'Cukup';
    }
    
    // Update color based on level
    updateProgressColor(percentage);
}

function updateGauge(percentage) {
    // Calculate arc length for SVG (0-180 degrees = 0-100%)
    const circumference = 219.8; // Approximate arc circumference
    const offset = circumference - (percentage / 100) * circumference;
    
    DOM.gaugeFill.style.strokeDasharray = circumference;
    DOM.gaugeFill.style.strokeDashoffset = offset;
    
    // Rotate needle (0% = 0deg, 100% = 180deg)
    const rotation = (percentage / 100) * 180;
    DOM.needle.style.transform = `rotate(${rotation}deg)`;
    DOM.needle.style.transformOrigin = '100px 100px';
}

function updateProgressColor(percentage) {
    const progressFill = DOM.progressFill;
    
    if (percentage < 20) {
        progressFill.style.background = 'linear-gradient(90deg, #F44336 0%, #E53935 100%)';
    } else if (percentage < 50) {
        progressFill.style.background = 'linear-gradient(90deg, #FF9800 0%, #F57C00 100%)';
    } else {
        progressFill.style.background = 'linear-gradient(90deg, #4CAF50 0%, #66BB6A 100%)';
    }
}

function checkStockThreshold() {
    if (STATE.stockPercentage <= STATE.settings.stockThreshold && 
        STATE.stockPercentage > 0 &&
        !STATE.notifications.some(n => n.type === 'stock_low')) {
        
        const message = `Peringatan: Stok pakan ${STATE.stockPercentage}%. Segera isi ulang!`;
        addNotification(message, 'warning', 'Stok Rendah');
        
        if (STATE.settings.notificationsEnabled) {
            showToast(message, 'warning');
        }
    }
}

// ============================================================
// FEEDING FUNCTIONS
// ============================================================

function openFeedingConfirmation() {
    DOM.modalStok.textContent = `${STATE.stockPercentage}%`;
    DOM.modalKonfirmasi.classList.add('active');
}

function closeModal() {
    DOM.modalKonfirmasi.classList.remove('active');
}

function closeSettings() {
    DOM.modalSettings.classList.remove('active');
}

function confirmFeeding() {
    closeModal();
    performFeeding('Manual (Website)');
}

async function performFeeding(source) {
    console.log(`Memberi pakan dari: ${source}`);
    
    // Send command to Blynk V2 (VPIN_BERI_PAKAN)
    const blynkSent = await sendToBlynk(CONFIG.BLYNK_VPINS.FEEDING, 1);
    
    if (!blynkSent && source !== 'Jadwal Pagi' && source !== 'Jadwal Sore') {
        showToast('Gagal mengirim perintah ke ESP32', 'error');
        return;
    }
    
    // Simulate servo opening locally for UI feedback
    DOM.btnBeriPakan.disabled = true;
    DOM.btnBeriPakan.textContent = 'Sedang Memberi Pakan...';
    
    // Simulate servo opening
    setTimeout(() => {
        DOM.btnBeriPakan.textContent = 'Pintu Terbuka...';
    }, 100);
    
    // Wait for feeding duration
    setTimeout(() => {
        // Servo closes
        DOM.btnBeriPakan.textContent = 'BERI PAKAN SEKARANG';
        DOM.btnBeriPakan.disabled = false;
        
        // Reset Blynk button
        sendToBlynk(CONFIG.BLYNK_VPINS.FEEDING, 0);
        
        // Update stats
        STATE.totalFeedings++;
        DOM.totalFeeding.textContent = `${STATE.totalFeedings}x`;
        
        // Add to history
        addToHistory(source);
        
        // Add notification
        addNotification(`Pakan diberikan dari: ${source}`, 'success', 'Berhasil');
        
        showToast('Pakan berhasil diberikan!', 'success');
        
        console.log('Feeding completed');
    }, CONFIG.FEEDING_DURATION);
}

function addToHistory(source) {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const entry = {
        id: Date.now(),
        source: source,
        time: time,
        timestamp: now
    };
    
    STATE.feedingHistory.unshift(entry);
    
    // Keep only last 50 entries
    if (STATE.feedingHistory.length > 50) {
        STATE.feedingHistory.pop();
    }
    
    // Save to localStorage
    saveFeedingHistory();
    
    // Update display
    updateHistoryDisplay();
}

function updateHistoryDisplay() {
    if (STATE.feedingHistory.length === 0) {
        DOM.historyList.innerHTML = '<div class="history-empty"><p>Belum ada riwayat pemberian pakan</p></div>';
        return;
    }
    
    let html = '';
    STATE.feedingHistory.forEach(entry => {
        html += `
            <div class="history-item">
                <div>
                    <strong>${entry.source}</strong>
                </div>
                <div class="history-time">${entry.time}</div>
            </div>
        `;
    });
    
    DOM.historyList.innerHTML = html;
}

function clearHistory() {
    if (confirm('Hapus semua riwayat pemberian pakan?')) {
        STATE.feedingHistory = [];
        saveFeedingHistory();
        updateHistoryDisplay();
        showToast('Riwayat berhasil dihapus', 'info');
    }
}

// ============================================================
// NOTIFICATIONS FUNCTIONS
// ============================================================

function addNotification(message, type = 'info', title = 'Notifikasi') {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const notification = {
        id: Date.now(),
        title: title,
        message: message,
        type: type,
        time: time,
        timestamp: now
    };
    
    STATE.notifications.unshift(notification);
    
    // Keep only last 30 notifications
    if (STATE.notifications.length > 30) {
        STATE.notifications.pop();
    }
    
    updateNotificationsDisplay();
}

function updateNotificationsDisplay() {
    if (STATE.notifications.length === 0) {
        DOM.notificationsList.innerHTML = '<div class="notification-empty"><p>Belum ada notifikasi</p></div>';
        return;
    }
    
    let html = '';
    STATE.notifications.forEach(notif => {
        html += `
            <div class="notification-item ${notif.type}">
                <div>
                    <strong>${notif.title}</strong><br>
                    <small>${notif.message}</small>
                </div>
                <div class="notification-time">${notif.time}</div>
            </div>
        `;
    });
    
    DOM.notificationsList.innerHTML = html;
}

function clearNotifications() {
    if (confirm('Hapus semua notifikasi?')) {
        STATE.notifications = [];
        updateNotificationsDisplay();
        showToast('Notifikasi berhasil dihapus', 'info');
    }
}

// ============================================================
// SCHEDULE FUNCTIONS
// ============================================================

function checkFeedingSchedule() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const second = now.getSeconds();
    
    // Check morning feeding
    if (hour === STATE.settings.morningHour && 
        minute === STATE.settings.morningMinute && 
        second < 2 && 
        !STATE.morningFed) {
        
        performFeeding('Jadwal Pagi');
        STATE.morningFed = true;
        updateScheduleDisplay('pagi', 'completed');
    }
    
    // Check evening feeding
    if (hour === STATE.settings.eveningHour && 
        minute === STATE.settings.eveningMinute && 
        second < 2 && 
        !STATE.eveningFed) {
        
        performFeeding('Jadwal Sore');
        STATE.eveningFed = true;
        updateScheduleDisplay('sore', 'completed');
    }
    
    // Reset flags at midnight
    if (hour === 0 && minute === 0) {
        STATE.morningFed = false;
        STATE.eveningFed = false;
        updateScheduleDisplay('pagi', 'pending');
        updateScheduleDisplay('sore', 'pending');
    }
}

function updateScheduleDisplay(schedule, status) {
    const statusElement = schedule === 'pagi' ? DOM.statusPagi : DOM.statusSore;
    const statusClass = status === 'completed' ? 'completed' : 'pending';
    const statusText = status === 'completed' ? 'Selesai' : 'Menunggu';
    
    statusElement.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
}

// ============================================================
// SETTINGS FUNCTIONS
// ============================================================

function loadSettings() {
    const saved = localStorage.getItem('fishFeederSettings');
    if (saved) {
        const settings = JSON.parse(saved);
        Object.assign(STATE.settings, settings);
        updateSettingsUI();
    }
}

function saveSettings() {
    STATE.settings.morningHour = parseInt(DOM.settingsJamPagi.value.split(':')[0]);
    STATE.settings.morningMinute = parseInt(DOM.settingsJamPagi.value.split(':')[1]);
    STATE.settings.eveningHour = parseInt(DOM.settingsJamSore.value.split(':')[0]);
    STATE.settings.eveningMinute = parseInt(DOM.settingsJamSore.value.split(':')[1]);
    STATE.settings.stockThreshold = parseInt(DOM.settingsThreshold.value);
    STATE.settings.notificationsEnabled = DOM.settingsNotif.checked;
    
    // Save to localStorage
    localStorage.setItem('fishFeederSettings', JSON.stringify(STATE.settings));
    
    closeSettings();
    showToast('Pengaturan berhasil disimpan', 'success');
    
    console.log('Settings saved:', STATE.settings);
}

function updateSettingsUI() {
    DOM.settingsJamPagi.value = `${String(STATE.settings.morningHour).padStart(2, '0')}:${String(STATE.settings.morningMinute).padStart(2, '0')}`;
    DOM.settingsJamSore.value = `${String(STATE.settings.eveningHour).padStart(2, '0')}:${String(STATE.settings.eveningMinute).padStart(2, '0')}`;
    DOM.settingsThreshold.value = STATE.settings.stockThreshold;
    DOM.settingsNotif.checked = STATE.settings.notificationsEnabled;
}

// ============================================================
// STATUS FUNCTIONS
// ============================================================

function setOnlineStatus(isOnline) {
    STATE.isOnline = isOnline;
    
    if (isOnline) {
        DOM.statusDot.classList.add('online');
        DOM.statusText.textContent = 'Online';
        DOM.systemStatus.textContent = 'Online';
        DOM.systemStatus.style.color = 'var(--success-color)';
        STATE.blynkConnected = true;
        DOM.blynkStatus.textContent = 'Terhubung';
        DOM.blynkStatus.style.color = 'var(--success-color)';
        STATE.sensorReady = true;
        DOM.sensorStatus.textContent = 'Siap';
        DOM.sensorStatus.style.color = 'var(--success-color)';
    } else {
        DOM.statusDot.classList.remove('online');
        DOM.statusText.textContent = 'Offline';
        DOM.systemStatus.textContent = 'Offline';
        DOM.systemStatus.style.color = 'var(--danger-color)';
        DOM.blynkStatus.textContent = 'Terputus';
        DOM.blynkStatus.style.color = 'var(--danger-color)';
        DOM.sensorStatus.textContent = 'Tidak Terbaca';
        DOM.sensorStatus.style.color = 'var(--warning-color)';
    }
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(message, type = 'info', duration = 3000) {
    DOM.toast.textContent = message;
    DOM.toast.className = `toast show ${type}`;
    
    // Auto hide
    setTimeout(() => {
        DOM.toast.classList.remove('show');
    }, duration);
}

// ============================================================
// LOCAL STORAGE FUNCTIONS
// ============================================================

function saveFeedingHistory() {
    localStorage.setItem('feedingHistory', JSON.stringify(STATE.feedingHistory));
}

function loadFeedingHistory() {
    const saved = localStorage.getItem('feedingHistory');
    if (saved) {
        STATE.feedingHistory = JSON.parse(saved);
        updateHistoryDisplay();
        STATE.totalFeedings = STATE.feedingHistory.length;
        DOM.totalFeeding.textContent = `${STATE.totalFeedings}x`;
    }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function formatTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

// Export for debugging
window.FISH_FEEDER = {
    STATE,
    CONFIG,
    performFeeding,
    setOnlineStatus,
    showToast,
    addNotification,
    connectToBlynk,
    pollBlynkData,
    sendToBlynk,
    getBlynkStatus: () => ({
        connected: STATE.blynkConnected,
        authToken: CONFIG.BLYNK_AUTH_TOKEN,
        server: CONFIG.BLYNK_SERVER,
        stock: STATE.stockPercentage
    })
};

console.log('Smart Fish Feeder Dashboard loaded successfully');
console.log('Blynk Token:', CONFIG.BLYNK_AUTH_TOKEN);
console.log('Use window.FISH_FEEDER for debugging');
