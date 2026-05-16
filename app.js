/**
 * app.js - Core application logic for Smart Hydration System
 * Orchestrates UI, State, and Events.
 */

// --- 1. Event Bus ---
const bus = new EventTarget();
const EVENTS = {
    AUTH_CHANGE: 'auth-change',
    DATA_UPDATED: 'data-updated',
    SETTINGS_UPDATED: 'settings-updated',
    TAB_CHANGE: 'tab-change'
};

function dispatch(event, detail = {}) {
    bus.dispatchEvent(new CustomEvent(event, { detail }));
}

// --- 2. State Management ---
let state = {
    currentUser: null,
    settings: null,
    activeTab: 'tracker',
    activeReminders: [],
    chart: null,
    dbReady: false
};

// --- 3. Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Setup Listeners IMMEDIATELY to prevent form submission reloads
    setupEventListeners();

    try {
        // 2. Initialize DB
        await window.dbLayer.initDatabase();
        state.dbReady = true;
        
        // 3. Check Session
        const savedUser = sessionStorage.getItem('user');
        if (savedUser) {
            state.currentUser = JSON.parse(savedUser);
            await loadUserSettings();
            showMainApp();
        }
    } catch (err) {
        console.error('App initialization error:', err);
        const errorEl = document.getElementById('auth-error');
        if (errorEl) errorEl.textContent = "Database error. Please refresh or check console.";
    }
    
    // 4. Initial Lucide
    if (window.lucide) lucide.createIcons();
});

async function loadUserSettings() {
    if (!state.currentUser) return;
    const settings = await window.dbLayer.getSettings(state.currentUser.user_id);
    state.settings = settings;
    window.appSettings = settings; // Sync with notification layer
    applySettings();
}

function applySettings() {
    if (!state.settings) return;
    // Theme
    document.body.setAttribute('data-theme', state.settings.dark_mode ? 'dark' : 'light');
    // UI Values
    document.getElementById('setting-notifications').checked = !!state.settings.notifications_enabled;
    document.getElementById('setting-haptic').checked = !!state.settings.haptic_enabled;
    document.getElementById('setting-dark-mode').checked = !!state.settings.dark_mode;
    document.getElementById('setting-display-name').value = state.settings.display_name || '';
    document.getElementById('setting-daily-goal').value = state.settings.daily_goal || 1925;
}

// --- 4. Event Listeners ---
function setupEventListeners() {
    // Auth Form
    document.getElementById('auth-form').addEventListener('submit', handleAuth);
    document.getElementById('btn-toggle-auth').addEventListener('click', toggleAuthMode);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.tab;
            switchTab(tab);
        });
    });

    // Water Logging
    document.getElementById('btn-add-water-modal').addEventListener('click', () => openModal('modal-add-water'));
    document.getElementById('btn-cancel-add').addEventListener('click', () => closeModal('modal-add-water'));
    document.getElementById('btn-save-water').addEventListener('click', handleAddWater);
    document.querySelectorAll('.btn-quick-add').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.getElementById('water-amount').value = e.target.dataset.amount;
        });
    });

    // Reminders
    document.getElementById('btn-add-reminder').addEventListener('click', handleAddReminder);

    // Settings
    document.getElementById('btn-save-settings').addEventListener('click', handleSaveSettings);
    document.getElementById('btn-test-notification').addEventListener('click', handleTestNotification);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    // Change Password
    document.getElementById('btn-open-change-password').addEventListener('click', () => openModal('modal-change-password'));
    document.getElementById('btn-cancel-change-password').addEventListener('click', () => closeModal('modal-change-password'));
    document.getElementById('btn-save-new-password').addEventListener('click', handleChangePassword);

    // Goal Calculator
    document.getElementById('btn-open-goal-calc').addEventListener('click', () => openModal('modal-goal-calc'));
    document.getElementById('btn-cancel-calc').addEventListener('click', () => closeModal('modal-goal-calc'));
    document.getElementById('btn-apply-calc').addEventListener('click', handleApplyGoal);
    ['calc-weight', 'calc-gender', 'calc-activity'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateCalcResult);
    });

    // Bus Listeners
    bus.addEventListener(EVENTS.DATA_UPDATED, refreshUI);
    bus.addEventListener(EVENTS.TAB_CHANGE, handleTabActivation);
    bus.addEventListener(EVENTS.SETTINGS_UPDATED, applySettings);
}

// --- 5. Auth Logic ---
async function handleAuth(e) {
    e.preventDefault();
    const isRegister = !document.getElementById('register-fields').classList.contains('hidden');
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('auth-error');
    
    errorEl.textContent = '';

    try {
        let user;
        if (isRegister) {
            const displayName = document.getElementById('display-name').value;
            const confirmPass = document.getElementById('confirm-password').value;
            if (password !== confirmPass) {
                errorEl.textContent = "Passwords don't match";
                window.notifyLayer.vibrate(window.notifyLayer.VIBRATION_PATTERNS.ERROR);
                return;
            }
            user = await window.dbLayer.createUser(username, password, displayName);
        } else {
            user = await window.dbLayer.getUserByUsername(username);
            if (!user || user.password !== password) {
                errorEl.textContent = "Invalid username or password";
                window.notifyLayer.vibrate(window.notifyLayer.VIBRATION_PATTERNS.ERROR);
                return;
            }
        }

        state.currentUser = user;
        sessionStorage.setItem('user', JSON.stringify(user));
        await loadUserSettings();
        showMainApp();
    } catch (err) {
        errorEl.textContent = "An error occurred. Try again.";
    }
}

function toggleAuthMode() {
    const fields = document.getElementById('register-fields');
    const btnPrimary = document.getElementById('btn-primary');
    const btnToggle = document.getElementById('btn-toggle-auth');
    
    if (fields.classList.contains('hidden')) {
        fields.classList.remove('hidden');
        btnPrimary.textContent = 'Create Account';
        btnToggle.textContent = 'Back to Sign In';
    } else {
        fields.classList.add('hidden');
        btnPrimary.textContent = 'Sign In';
        btnToggle.textContent = 'Create Account';
    }
}

function showMainApp() {
    document.getElementById('screen-login').classList.remove('active');
    document.getElementById('main-app').classList.remove('hidden');
    switchTab('tracker');
    startReminderChecks();
}

function handleLogout() {
    sessionStorage.removeItem('user');
    state.currentUser = null;
    state.settings = null;
    location.reload();
}

// --- 6. Navigation Logic ---
function switchTab(tabId) {
    state.activeTab = tabId;
    
    // UI Update
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabId);
    });

    dispatch(EVENTS.TAB_CHANGE, { tab: tabId });
}

function handleTabActivation(e) {
    const tab = e.detail.tab;
    if (tab === 'tracker') refreshTracker();
    if (tab === 'reminders') refreshReminders();
    if (tab === 'progress') refreshProgress();
}

function refreshUI() {
    if (state.activeTab === 'tracker') refreshTracker();
    if (state.activeTab === 'reminders') refreshReminders();
    if (state.activeTab === 'progress') refreshProgress();
}

// --- 7. Dashboard Logic ---
async function refreshTracker() {
    if (!state.currentUser) return;
    
    const logs = await window.dbLayer.getTodayLogs(state.currentUser.user_id);
    const goal = state.settings?.daily_goal || 1925;
    const total = logs.reduce((sum, log) => sum + log.intake_ml, 0);
    const percent = Math.min(Math.round((total / goal) * 100), 100);

    // Update Progress Ring
    document.getElementById('progress-current').textContent = total;
    document.getElementById('progress-goal').textContent = goal;
    document.getElementById('progress-percent').textContent = `${percent}%`;
    
    const circle = document.getElementById('progress-ring-circle');
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
    
    // Color transitions
    if (percent < 50) circle.style.stroke = 'var(--danger)';
    else if (percent < 100) circle.style.stroke = 'var(--accent)';
    else circle.style.stroke = 'var(--success)';

    // Update Logs List
    const listEl = document.getElementById('logs-list');
    listEl.innerHTML = logs.map(log => `
        <div class="log-item">
            <div class="log-info">
                <div class="amount">${log.intake_ml} ml</div>
                <div class="time">${new Date(log.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div class="log-actions">
                <button class="btn-icon delete" onclick="handleDeleteLog(${log.log_id})">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `).join('');
    
    if (window.lucide) lucide.createIcons();
}

async function handleAddWater() {
    const amount = parseFloat(document.getElementById('water-amount').value);
    if (isNaN(amount) || amount <= 0) {
        window.notifyLayer.vibrate(window.notifyLayer.VIBRATION_PATTERNS.ERROR);
        return;
    }

    await window.dbLayer.addLog(state.currentUser.user_id, amount);
    window.notifyLayer.vibrate(window.notifyLayer.VIBRATION_PATTERNS.SUCCESS);
    closeModal('modal-add-water');
    dispatch(EVENTS.DATA_UPDATED);
}

window.handleDeleteLog = async (logId) => {
    if (confirm('Delete this log?')) {
        await window.dbLayer.deleteLog(logId);
        window.notifyLayer.vibrate(window.notifyLayer.VIBRATION_PATTERNS.DELETE);
        dispatch(EVENTS.DATA_UPDATED);
    }
};

// --- 8. Reminders Logic ---
async function refreshReminders() {
    const reminders = await window.dbLayer.getReminders(state.currentUser.user_id);
    state.activeReminders = reminders;
    
    const listEl = document.getElementById('reminders-list');
    listEl.innerHTML = reminders.map(rem => `
        <div class="reminder-item">
            <div class="reminder-info">
                <div class="label">${rem.label}</div>
                <div class="interval">Every ${rem.interval_ms / 60000} minutes</div>
            </div>
            <button class="btn-icon delete" onclick="handleDeleteReminder(${rem.reminder_id})">
                <i data-lucide="x"></i>
            </button>
        </div>
    `).join('');
    
    if (window.lucide) lucide.createIcons();
}

async function handleAddReminder() {
    const label = document.getElementById('reminder-label').value || "Time to drink water!";
    const interval = parseInt(document.getElementById('reminder-interval').value);
    
    await window.dbLayer.addReminder(state.currentUser.user_id, label, interval);
    window.notifyLayer.vibrate(window.notifyLayer.VIBRATION_PATTERNS.SUCCESS);
    dispatch(EVENTS.DATA_UPDATED);
    
    // Request permission if not granted
    await window.notifyLayer.requestNotificationPermission();
}

window.handleDeleteReminder = async (id) => {
    await window.dbLayer.deleteReminder(id);
    dispatch(EVENTS.DATA_UPDATED);
};

let reminderInterval;
let lastFiredReminders = {};

function startReminderChecks() {
    if (reminderInterval) clearInterval(reminderInterval);
    
    // Check every 10 seconds
    reminderInterval = setInterval(() => {
        const now = Date.now();
        state.activeReminders.forEach(rem => {
            // If we haven't tracked this reminder yet, start tracking from 'now'
            if (!lastFiredReminders[rem.reminder_id]) {
                lastFiredReminders[rem.reminder_id] = now;
                return;
            }

            const lastFired = lastFiredReminders[rem.reminder_id];
            if (now - lastFired >= rem.interval_ms) {
                // FIRE NOTIFICATION
                window.notifyLayer.fireNotification("Drink Reminder", rem.label);
                window.notifyLayer.vibrate(window.notifyLayer.VIBRATION_PATTERNS.REMINDER);
                
                // Show in-app toast for visual confirmation in browser
                showToast(`🔔 Reminder: ${rem.label}`, 5000);
                
                // Update last fired timestamp
                lastFiredReminders[rem.reminder_id] = now;
            }
        });
    }, 10000);
}

// --- 9. Progress Logic ---
async function refreshProgress() {
    const stats = await window.dbLayer.getWeeklyStats(state.currentUser.user_id);
    const goal = state.settings?.daily_goal || 1925;
    
    const labels = stats.map(s => {
        const date = new Date(s.log_date);
        return date.toLocaleDateString([], { weekday: 'short' });
    });
    const data = stats.map(s => s.total_ml);
    const colors = data.map(val => {
        if (val < goal * 0.5) return '#EF4444'; // Red
        if (val < goal) return '#4A6CF7';      // Blue
        return '#22C55E';                      // Green
    });

    // Update Stats Row
    const avg = data.length ? Math.round(data.reduce((a,b) => a+b, 0) / data.length) : 0;
    const best = data.length ? Math.max(...data) : 0;
    const met = data.filter(v => v >= goal).length;
    
    document.getElementById('stat-avg').textContent = `${avg}ml`;
    document.getElementById('stat-best').textContent = `${best}ml`;
    document.getElementById('stat-goal-met').textContent = met;

    // Render Chart
    const ctx = document.getElementById('progress-chart').getContext('2d');
    if (state.chart) state.chart.destroy();
    
    state.chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Intake (ml)',
                data: data,
                backgroundColor: colors,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { display: false } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// --- 10. Settings Logic ---
async function handleSaveSettings() {
    const newSettings = {
        notifications_enabled: document.getElementById('setting-notifications').checked ? 1 : 0,
        haptic_enabled: document.getElementById('setting-haptic').checked ? 1 : 0,
        dark_mode: document.getElementById('setting-dark-mode').checked ? 1 : 0,
        display_name: document.getElementById('setting-display-name').value,
        daily_goal: parseInt(document.getElementById('setting-daily-goal').value)
    };

    await window.dbLayer.saveSettings(state.currentUser.user_id, newSettings);
    state.settings = { ...state.settings, ...newSettings };
    window.appSettings = state.settings;
    
    dispatch(EVENTS.SETTINGS_UPDATED);
    window.notifyLayer.vibrate(window.notifyLayer.VIBRATION_PATTERNS.SUCCESS);
    showToast('Settings saved successfully!');
}

async function handleTestNotification() {
    await window.notifyLayer.requestNotificationPermission();
    window.notifyLayer.fireNotification("Drink Reminder", "This is a test notification. Stay hydrated!");
    window.notifyLayer.vibrate(window.notifyLayer.VIBRATION_PATTERNS.TEST);
    showToast('Test notification fired!');
}

async function handleChangePassword() {
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-new-password').value;
    const errorEl = document.getElementById('change-password-error');
    
    errorEl.textContent = '';

    // Validation: min 8 chars, 1 capital, 1 special character
    const hasCapital = /[A-Z]/.test(newPass);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPass);
    const isLongEnough = newPass.length >= 8;

    if (!isLongEnough || !hasCapital || !hasSpecial) {
        errorEl.textContent = "Password must be at least 8 characters long, contain 1 capital letter and 1 special character.";
        window.notifyLayer.vibrate(window.notifyLayer.VIBRATION_PATTERNS.ERROR);
        return;
    }

    if (newPass !== confirmPass) {
        errorEl.textContent = "Passwords do not match.";
        window.notifyLayer.vibrate(window.notifyLayer.VIBRATION_PATTERNS.ERROR);
        return;
    }

    try {
        await window.dbLayer.updatePassword(state.currentUser.user_id, newPass);
        window.notifyLayer.vibrate(window.notifyLayer.VIBRATION_PATTERNS.SUCCESS);
        showToast('Password changed successfully!');
        closeModal('modal-change-password');
        // Clear fields
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-new-password').value = '';
    } catch (err) {
        errorEl.textContent = "Failed to change password.";
    }
}

// --- UI Helpers ---
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// --- Goal Calculator Logic ---
function updateCalcResult() {
    const weight = parseFloat(document.getElementById('calc-weight').value);
    const activityBonus = parseInt(document.getElementById('calc-activity').value);
    const resultEl = document.getElementById('calc-result');
    const valueEl = document.getElementById('calc-result-value');

    if (isNaN(weight) || weight <= 0) {
        resultEl.classList.add('hidden');
        return;
    }

    // Formula: Weight * 35ml + Activity Bonus
    const base = weight * 35;
    const total = Math.round(base + activityBonus);

    valueEl.textContent = `${total} ml`;
    resultEl.classList.remove('hidden');
}

async function handleApplyGoal() {
    const resultValue = document.getElementById('calc-result-value').textContent;
    const goal = parseInt(resultValue);

    if (isNaN(goal)) return;

    // Update the input field in Settings
    document.getElementById('setting-daily-goal').value = goal;
    
    closeModal('modal-goal-calc');
    showToast('Calculated goal applied! Press "Save" to persist.');
}

function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span>${message}</span>
        <i data-lucide="x" style="width: 16px; cursor: pointer;" onclick="this.parentElement.remove()"></i>
    `;
    
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
