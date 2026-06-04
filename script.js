/*============================================================
  SMART FISH FEEDER - DASHBOARD MONITORING
  JavaScript - Main Logic (UTUH TANPA PERUBAHAN)
  ============================================================ */

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

let lastHeartbeatTime = Date.now(); 

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

document.addEventListener('DOMContentLoaded', function() {
    console.log('Smart Fish Feeder Dashboard - Initializing...');
    loadSettings();
    updateClock();
    setupEventListeners();
    
    setInterval(updateClock, 1000);
    setInterval(checkFeedingSchedule, 1000);
    
    console.log('Attempting to connect to Blynk...');
    connectToBlynk();
    
    STATE.blynkPollInterval = setInterval(pollBlynkData, CONFIG.BLYNK_SEND_INTERVAL);
    
    setInterval(() => {
        const elapsed = Date.now() - lastHeartbeatTime;
        if (elapsed > 30000) {
            console.warn(`Heartbeat timeout! Tidak ada data selama ${Math.round(elapsed / 1000)} detik`);
            setOnlineStatus(false);
        }
    }, 3000);
    
    loadFeedingHistory();
    console.log('Dashboard initialized successfully');
});

function setupEventListeners() {
    DOM.btnBeriPakan.addEventListener('click', openFeedingConfirmation);
    DOM.btnCloseModal.addEventListener('click', closeModal);
    DOM.btnBatalKonfirmasi.addEventListener('click', closeModal);
    DOM.btnYaKonfirmasi.addEventListener('click', confirmFeeding);
    DOM.btnClearHistory.addEventListener('click', clearHistory);
    DOM.btnClearNotif.addEventListener('click', clearNotifications);
    DOM.btnCloseSettings.addEventListener('click', closeSettings);
    DOM.btnCloseSettingsBtn.addEventListener('click', closeSettings);
    DOM.btnSaveSettings.addEventListener('click', saveSettings);
}

function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    DOM.digitalClock.textContent = `${hours}:${minutes}:${seconds}`;
    
    const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const tzOffsetMin = -now.getTimezoneOffset();
    const tzH = Math.floor(Math.abs(tzOffsetMin) / 60);
    const tzM = Math.abs(tzOffsetMin) % 60;
    let tzString = 'UTC' + (tzOffsetMin >= 0 ? '+' : '-') + String(tzH).padStart(2,'0');
    if (tzM > 0) tzString += ':' + String(tzM).padStart(2,'0');
    
    const tzShort = tzLabel.includes('Jakarta') || tzLabel.includes('Asia/Jakarta') ? 'WIB'
                  : tzLabel.includes('Makassar') ? 'WITA'
                  : tzLabel.includes('Jayapura') ? 'WIT'
                  : tzString;
    const tzElem = document.querySelector('.time-zone');
    if (tzElem) tzElem.textContent = tzShort;
    
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    DOM.dateDisplay.textContent = now.toLocaleDateString('id-ID', options);
    
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    DOM.dayDisplay.textContent = days[now.getDay()];
}

async function connectToBlynk() {
    try {
        console.log("Connecting to Blynk...");
        const response = await fetch(`${CONFIG.BLYNK_SERVER}/get?token=${CONFIG.BLYNK_AUTH_TOKEN}&pin=${CONFIG.BLYNK_VPINS.STOCK}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
        const response = await fetch(`${CONFIG.BLYNK_SERVER}/get?token=${CONFIG.BLYNK_AUTH_TOKEN}&pin=${CONFIG.BLYNK_VPINS.STOCK}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rawData = await response.text();
        const cleanData = rawData.replace(/[\[\]"]/g, '');
        const stockValue = parseInt(cleanData);
        if (!isNaN(stockValue)) {
            STATE.stockPercentage = Math.max(0, Math.min(100, stockValue));
            const now = new Date();
            DOM.lastUpdate.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
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
        const response = await fetch(`${CONFIG.BLYNK_SERVER}/update?token=${CONFIG.BLYNK_AUTH_TOKEN}&${vpin}=${value}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        console.log(`Blynk Update Success : ${vpin} = ${value}`);
        return true;
    } catch (error) {
        console.error(`Blynk Update Failed (${vpin})`, error);
        return false;
    }
}

function updateStockDisplay() {
    const percentage = STATE.stockPercentage;
    DOM.percentageDisplay.textContent = `${percentage}%`;
    DOM.progressFill.style.width = `${percentage}%`;
    updateGauge(percentage);
    
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
    updateProgressColor(percentage);
}

function updateGauge(percentage) {
    const circumference = 219.8; 
    const offset = circumference - (percentage / 100) * circumference;
    DOM.gaugeFill.style.strokeDasharray = circumference;
    DOM.gaugeFill.style.strokeDashoffset = offset;
    const rotation = (percentage / 100) * 180;
    DOM.needle.style.transform = `rotate(${rotation}deg)`;
    DOM.needle.style.transformOrigin = '100px 100px';
}

function updateProgressColor(percentage) {
    const progressFill = DOM.progressFill;
    if (percentage < 20) {
        progressFill.style.background = 'var(--color-danger)';
    } else if (percentage < 50) {
        progressFill.style.background = 'var(--color-warning)';
    } else {
        progressFill.style.background = 'var(--color-success)';
    }
}

function checkStockThreshold() {
    const stock = parseInt(STATE.stockPercentage);
    if (stock === 0 && !STATE.notifications.some(n => n.notifType === 'stock_empty')) {
        const message = `🚨 STOK PAKAN HABIS (0%)! Segera isi ulang!`;
        addNotification(message, 'warning', 'STOK HABIS', 'stock_empty');
        if (STATE.settings.notificationsEnabled) showToast(message, 'warning', 5000);
        if (DOM.stockStatus) {
            DOM.stockStatus.style.color = 'var(--color-danger)';
            DOM.stockStatus.textContent = '🚨 STOK HABIS!';
        }
    }
    if (stock > 0 && stock <= STATE.settings.stockThreshold && !STATE.notifications.some(n => n.notifType === 'stock_low')) {
        const message = `⚠️ Peringatan: Stok Pakan KRITIS (${stock}%)! SEGERA ISI ULANG!`;
        addNotification(message, 'warning', 'STOK RENDAH', 'stock_low');
        if (STATE.settings.notificationsEnabled) showToast(message, 'warning');
        if (DOM.stockStatus) {
            DOM.stockStatus.style.color = 'var(--color-danger)';
            DOM.stockStatus.textContent = '⚠️ SEGERA ISI ULANG!';
        }
    }
    if (stock > STATE.settings.stockThreshold) {
        STATE.notifications = STATE.notifications.filter(n => n.notifType !== 'stock_low' && n.notifType !== 'stock_empty');
        if (DOM.stockStatus) DOM.stockStatus.style.color = '';
    }
}

function openFeedingConfirmation() {
    DOM.modalStok.textContent = `${STATE.stockPercentage}%`;
    DOM.modalKonfirmasi.classList.add('active');
}

function closeModal() { DOM.modalKonfirmasi.classList.remove('active'); }
function closeSettings() { DOM.modalSettings.classList.remove('active'); }
function confirmFeeding() { closeModal(); performFeeding('Manual (Website)'); }

async function performFeeding(source) {
    console.log(`Memberi pakan dari: ${source}`);
    const blynkSent = await sendToBlynk(CONFIG.BLYNK_VPINS.FEEDING, 1);
    if (!blynkSent && source !== 'Jadwal Pagi' && source !== 'Jadwal Sore') {
        showToast('⚠️ Gagal mengirim perintah ke ESP32', 'error');
        return;
    }
    DOM.btnBeriPakan.disabled = true;
    DOM.btnBeriPakan.textContent = 'Sedang Memberi Pakan...';
    
    setTimeout(() => { DOM.btnBeriPakan.textContent = 'Pintu Terbuka...'; }, 100);
    
    setTimeout(() => {
        DOM.btnBeriPakan.textContent = 'BERI PAKAN SEKARANG';
        DOM.btnBeriPakan.disabled = false;
        sendToBlynk(CONFIG.BLYNK_VPINS.FEEDING, 0);
        STATE.totalFeedings++;
        DOM.totalFeeding.textContent = `${STATE.totalFeedings}x`;
        addToHistory(source);
        addNotification(`Pakan diberikan dari: ${source}`, 'success', 'Berhasil');
        showToast('Pakan berhasil diberikan!', 'success');
    }, CONFIG.FEEDING_DURATION);
}

function addToHistory(source) {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const entry = { id: Date.now(), source: source, time: time, timestamp: now };
    STATE.feedingHistory.unshift(entry);
    if (STATE.feedingHistory.length > 50) STATE.feedingHistory.pop();
    saveFeedingHistory();
    updateHistoryDisplay();
}

function updateHistoryDisplay() {
    if (STATE.feedingHistory.length === 0) {
        DOM.historyList.innerHTML = '<div class="history-empty"><p>Belum ada riwayat pemberian pakan</p></div>';
        return;
    }
    let html = '';
    STATE.feedingHistory.forEach(entry => {
        html += `<div class="history-item"><div><strong>${entry.source}</strong></div><div class="history-time">${entry.time}</div></div>`;
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

function addNotification(message, type = 'info', title = 'Notifikasi', notifType = null) {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const notification = { id: Date.now(), title: title, message: message, type: type, notifType: notifType, time: time, timestamp: now };
    STATE.notifications.unshift(notification);
    if (STATE.notifications.length > 30) STATE.notifications.pop();
    updateNotificationsDisplay();
}

function updateNotificationsDisplay() {
    if (STATE.notifications.length === 0) {
        DOM.notificationsList.innerHTML = '<div class="notification-empty"><p>Belum ada notifikasi</p></div>';
        return;
    }
    let html = '';
    STATE.notifications.forEach(notif => {
        html += `<div class="notification-item ${notif.type}"><div><strong>${notif.title}</strong><br><small>${notif.message}</small></div><div class="notification-time">${notif.time}</div></div>`;
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

function checkFeedingSchedule() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const second = now.getSeconds();
    
    if (hour === STATE.settings.morningHour && minute === STATE.settings.morningMinute && second < 2 && !STATE.morningFed) {
        performFeeding('Jadwal Pagi');
        STATE.morningFed = true;
        updateScheduleDisplay('pagi', 'completed');
    }
    if (hour === STATE.settings.eveningHour && minute === STATE.settings.eveningMinute && second < 2 && !STATE.eveningFed) {
        performFeeding('Jadwal Sore');
        STATE.eveningFed = true;
        updateScheduleDisplay('sore', 'completed');
    }
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
    
    localStorage.setItem('fishFeederSettings', JSON.stringify(STATE.settings));
    closeSettings();
    showToast('Pengaturan berhasil disimpan', 'success');
}

function updateSettingsUI() {
    DOM.settingsJamPagi.value = `${String(STATE.settings.morningHour).padStart(2, '0')}:${String(STATE.settings.morningMinute).padStart(2, '0')}`;
    DOM.settingsJamSore.value = `${String(STATE.settings.eveningHour).padStart(2, '0')}:${String(STATE.settings.eveningMinute).padStart(2, '0')}`;
    DOM.settingsThreshold.value = STATE.settings.stockThreshold;
    DOM.settingsNotif.checked = STATE.settings.notificationsEnabled;
}

function setOnlineStatus(isOnline) {
    STATE.isOnline = isOnline;
    if (isOnline) {
        lastHeartbeatTime = Date.now();
        if (DOM.statusDot) { DOM.statusDot.className = 'status-dot online'; }
        if (DOM.statusText) DOM.statusText.textContent = 'ONLINE';
        if (DOM.systemStatus) { DOM.systemStatus.textContent = 'Aktif'; DOM.systemStatus.style.color = 'var(--color-success)'; }
        STATE.blynkConnected = true;
        if (DOM.blynkStatus) { DOM.blynkStatus.textContent = 'Terhubung'; DOM.blynkStatus.style.color = 'var(--color-success)'; }
        STATE.sensorReady = true;
        if (DOM.sensorStatus) { DOM.sensorStatus.textContent = 'Siap'; DOM.sensorStatus.style.color = 'var(--color-success)'; }
    } else {
        if (DOM.statusDot) { DOM.statusDot.className = 'status-dot'; }
        if (DOM.statusText) DOM.statusText.textContent = 'OFFLINE';
        if (DOM.systemStatus) { DOM.systemStatus.textContent = 'Offline'; DOM.systemStatus.style.color = 'var(--color-danger)'; }
        STATE.blynkConnected = false;
        if (DOM.blynkStatus) { DOM.blynkStatus.textContent = 'Terputus'; DOM.blynkStatus.style.color = 'var(--color-danger)'; }
        if (DOM.sensorStatus) { DOM.sensorStatus.textContent = 'Tidak Terbaca'; DOM.sensorStatus.style.color = 'var(--color-warning)'; }
    }
}

function showToast(message, type = 'info', duration = 3000) {
    DOM.toast.textContent = message;
    DOM.toast.className = `toast show ${type}`;
    setTimeout(() => { DOM.toast.classList.remove('show'); }, duration);
}

function saveFeedingHistory() { localStorage.setItem('feedingHistory', JSON.stringify(STATE.feedingHistory)); }
function loadFeedingHistory() {
    const saved = localStorage.getItem('feedingHistory');
    if (saved) {
        STATE.feedingHistory = JSON.parse(saved);
        updateHistoryDisplay();
        STATE.totalFeedings = STATE.feedingHistory.length;
        DOM.totalFeeding.textContent = `${STATE.totalFeedings}x`;
    }
}

window.addEventListener('online', () => { connectToBlynk(); });
window.addEventListener('offline', () => { setOnlineStatus(false); });