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
    BLYNK_SERVER: 'https://sgp1.blynk.cloud/external/api',
    BLYNK_VPINS: {
        STOCK: 'V0',      // Gauge - Stok Pakan (0-100%)
        TIME: 'V1',       // Label - Waktu WIB
        FEEDING: 'V2'     // Button - Beri Pakan Manual
    }
};

// ============================================================
// GLOBAL VARIABLES (Heartbeat System)
// ============================================================
let lastHeartbeatTime = Date.now(); // Catat waktu terakhir data diterima dari ESP32

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
    
    // Start intervals
    setInterval(updateClock, 1000);
    setInterval(checkFeedingSchedule, 1000);
    
    // Connect to Blynk
    console.log('Attempting to connect to Blynk...');
    connectToBlynk();
    
    // Start polling Blynk data
    STATE.blynkPollInterval = setInterval(pollBlynkData, CONFIG.BLYNK_SEND_INTERVAL);
    
    // Heartbeat check - jika 30 detik tidak ada data valid dari Blynk, set OFFLINE
    setInterval(() => {
        const elapsed = Date.now() - lastHeartbeatTime;
        if (elapsed > 30000) {
            console.warn(
                `Heartbeat timeout! Tidak ada data selama ${
                    Math.round(elapsed / 1000)
                } detik`
            );
            setOnlineStatus(false);
        }
    }, 3000); // Cek setiap 3 detik
    
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
    
    // Update digital clock (mengikuti jam perangkat / laptop / HP)
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    DOM.digitalClock.textContent = `${hours}:${minutes}:${seconds}`;
    
    // Update label zona waktu secara dinamis
    const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const tzOffsetMin = -now.getTimezoneOffset(); // menit dari UTC
    const tzH = Math.floor(Math.abs(tzOffsetMin) / 60);
    const tzM = Math.abs(tzOffsetMin) % 60;
    let tzString = 'UTC' + (tzOffsetMin >= 0 ? '+' : '-') + String(tzH).padStart(2,'0');
    if (tzM > 0) tzString += ':' + String(tzM).padStart(2,'0');
    // Tampilkan nama pendek jika diketahui (WIB / WITA / WIT), fallback ke UTC+N
    const tzShort = tzLabel.includes('Jakarta') || tzLabel.includes('Asia/Jakarta') ? 'WIB'
                  : tzLabel.includes('Makassar') ? 'WITA'
                  : tzLabel.includes('Jayapura') ? 'WIT'
                  : tzString;
    const tzElem = document.querySelector('.time-zone');
    if (tzElem) tzElem.textContent = tzShort;
    
    // Update date
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    DOM.dateDisplay.textContent = now.toLocaleDateString('id-ID', options);
    
    // Update day
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    DOM.dayDisplay.textContent = days[now.getDay()];
}

// ============================================================
// BLYNK CONNECTION & COMMUNICATION
// ============================================================

async function connectToBlynk() {
    try {
        console.log("Connecting to Blynk...");
        const response = await fetch(
            `${CONFIG.BLYNK_SERVER}/get?token=${CONFIG.BLYNK_AUTH_TOKEN}&pin=${CONFIG.BLYNK_VPINS.STOCK}`
        );
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const testData = await response.text();
        console.log("Blynk Response:", testData);
        STATE.blynkConnected = true;
        STATE.blynkConnectionAttempts = 0;
        lastHeartbeatTime = Date.now();
        setOnlineStatus(true);
        showToast("✓ Blynk Connected", "success");
        return true;
    } catch (error) {
        console.error("Blynk Connection Failed:", error);
        STATE.blynkConnected = false;
        setOnlineStatus(false);
        setTimeout(connectToBlynk, 5000);
        return false;
    }
}

async function pollBlynkData() {
    if (!STATE.blynkConnected) {
        await connectToBlynk();
        return;
    }
    try {
        const response = await fetch(
            `${CONFIG.BLYNK_SERVER}/get?token=${CONFIG.BLYNK_AUTH_TOKEN}&pin=${CONFIG.BLYNK_VPINS.STOCK}`
        );
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const rawData = await response.text();
        const cleanData = rawData.replace(/[\[\]"]/g, '');
        const stockValue = parseInt(cleanData);
        if (!isNaN(stockValue)) {
            STATE.stockPercentage =
                Math.max(0, Math.min(100, stockValue));
            
            // Update lastUpdate hanya saat menerima data baru dari Blynk
            const now = new Date();
            DOM.lastUpdate.textContent =
                `${String(now.getHours()).padStart(2,'0')}:` +
                `${String(now.getMinutes()).padStart(2,'0')}:` +
                `${String(now.getSeconds()).padStart(2,'0')}`;
            
            lastHeartbeatTime = Date.now();
            setOnlineStatus(true);
            STATE.sensorReady = true;
            updateStockDisplay();
            checkStockThreshold();
        }
    } catch (error) {
        console.error("Polling Error:", error);
        STATE.blynkConnected = false;
        setOnlineStatus(false);
        setTimeout(connectToBlynk, 5000);
    }
}

async function sendToBlynk(vpin, value) {
    try {
        const response = await fetch(
            `${CONFIG.BLYNK_SERVER}/update?token=${CONFIG.BLYNK_AUTH_TOKEN}&${vpin}=${value}`
        );
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        console.log(
            `Blynk Update Success : ${vpin} = ${value}`
        );
        return true;
    } catch (error) {
        console.error(
            `Blynk Update Failed (${vpin})`,
            error
        );
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
    const stock = parseInt(STATE.stockPercentage);
    
    // Notifikasi jika stok HABIS (0%)
    if (stock === 0 && 
        !STATE.notifications.some(n => n.notifType === 'stock_empty')) {
        
        console.log('🚨 Stok habis total!');
        const message = `🚨 STOK PAKAN HABIS (0%)! Segera isi ulang!`;
        addNotification(message, 'warning', 'STOK HABIS', 'stock_empty');
        
        if (STATE.settings.notificationsEnabled) {
            showToast(message, 'warning', 5000);
        }
        
        if (DOM.stockStatus) {
            DOM.stockStatus.style.color = '#F44336';
            DOM.stockStatus.textContent = '🚨 STOK HABIS!';
        }
    }
    
    // Notifikasi jika stok di bawah threshold (misal 20%) dan di atas 0
    if (stock > 0 && stock <= STATE.settings.stockThreshold && 
        !STATE.notifications.some(n => n.notifType === 'stock_low')) {
        
        console.log(`🚨 Stock threshold triggered: ${stock}%`);
        const message = `⚠️ Peringatan: Stok Pakan KRITIS (${stock}%)! SEGERA ISI ULANG!`;
        addNotification(message, 'warning', 'STOK RENDAH', 'stock_low');
        
        if (STATE.settings.notificationsEnabled) {
            showToast(message, 'warning');
        }
        
        if (DOM.stockStatus) {
            DOM.stockStatus.style.color = '#F44336';
            DOM.stockStatus.textContent = '⚠️ SEGERA ISI ULANG!';
        }
    }
    
    // Kembalikan status normal jika stok sudah di atas threshold
    if (stock > STATE.settings.stockThreshold) {
        // Hapus notifikasi stok rendah dan habis jika stok sudah normal
        STATE.notifications = STATE.notifications.filter(
            n => n.notifType !== 'stock_low' && n.notifType !== 'stock_empty'
        );
        if (DOM.stockStatus) {
            DOM.stockStatus.style.color = '';
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

async function kirimPakanManual() {
    try {
        console.log('Mengirim perintah pemberian pakan manual ke Blynk...');
        
        // Mengirim nilai '1' ke V2 untuk memicu servo di ESP32
        const response = await fetch(
            `${CONFIG.BLYNK_SERVER}/update?token=${CONFIG.BLYNK_AUTH_TOKEN}&${CONFIG.BLYNK_VPINS.FEEDING}=1`
        );
        
        if (response.ok) {
            console.log('✓ Perintah pemberian pakan berhasil dikirim');
            showToast("✓ Pakan berhasil dikirim ke ESP32!", "success");
            
            // Kembalikan ke '0' setelah jeda durasi pakan
            setTimeout(() => {
                fetch(
                    `${CONFIG.BLYNK_SERVER}/update?token=${CONFIG.BLYNK_AUTH_TOKEN}&${CONFIG.BLYNK_VPINS.FEEDING}=0`
                ).catch(e => console.log('Reset V2 tercapai atau sudah auto-reset'));
            }, CONFIG.FEEDING_DURATION);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error("✗ Gagal mengirim pakan:", error);
        showToast("❌ Gagal mengirim pakan: " + error.message, "error");
    }
}

async function performFeeding(source) {
    console.log(`Memberi pakan dari: ${source}`);
    
    // Send command to Blynk V2 (VPIN_BERI_PAKAN)
    const blynkSent = await sendToBlynk(CONFIG.BLYNK_VPINS.FEEDING, 1);
    
    if (!blynkSent && source !== 'Jadwal Pagi' && source !== 'Jadwal Sore') {
        showToast('⚠️ Gagal mengirim perintah ke ESP32', 'error');
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

function addNotification(message, type = 'info', title = 'Notifikasi', notifType = null) {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const notification = {
        id: Date.now(),
        title: title,
        message: message,
        type: type,
        notifType: notifType, // untuk filtering (stock_low, stock_empty, dll)
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
        lastHeartbeatTime = Date.now();
        // Status ONLINE - semua indikator hijau
        if (DOM.statusDot) {
            DOM.statusDot.classList.remove('offline');
            DOM.statusDot.classList.add('online');
            DOM.statusDot.style.backgroundColor = '#4CAF50'; // Hijau
        }
        if (DOM.statusText) DOM.statusText.textContent = 'ONLINE';
        if (DOM.systemStatus) {
            DOM.systemStatus.textContent = 'Aktif';
            DOM.systemStatus.style.color = '#4CAF50';
        }
        STATE.blynkConnected = true;
        if (DOM.blynkStatus) {
            DOM.blynkStatus.textContent = 'Terhubung';
            DOM.blynkStatus.style.color = '#4CAF50';
        }
        STATE.sensorReady = true;
        if (DOM.sensorStatus) {
            DOM.sensorStatus.textContent = 'Siap';
            DOM.sensorStatus.style.color = '#4CAF50';
        }
    } else {
        // Status OFFLINE - semua indikator merah
        if (DOM.statusDot) {
            DOM.statusDot.classList.remove('online');
            DOM.statusDot.classList.add('offline');
            DOM.statusDot.style.backgroundColor = '#f44336'; // Merah
        }
        if (DOM.statusText) DOM.statusText.textContent = 'OFFLINE';
        if (DOM.systemStatus) {
            DOM.systemStatus.textContent = 'Offline';
            DOM.systemStatus.style.color = '#f44336';
        }
        STATE.blynkConnected = false;
        if (DOM.blynkStatus) {
            DOM.blynkStatus.textContent = 'Terputus';
            DOM.blynkStatus.style.color = '#f44336';
        }
        if (DOM.sensorStatus) {
            DOM.sensorStatus.textContent = 'Tidak Terbaca';
            DOM.sensorStatus.style.color = '#ff9800';
        }
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

window.addEventListener('online', () => {
    console.log("Internet Connected");
    connectToBlynk();
});

window.addEventListener('offline', () => {
    console.log("Internet Disconnected");
    setOnlineStatus(false);
});

console.log('Smart Fish Feeder Dashboard loaded successfully');
console.log('Blynk Token:', CONFIG.BLYNK_AUTH_TOKEN);
console.log('Use window.FISH_FEEDER for debugging');
