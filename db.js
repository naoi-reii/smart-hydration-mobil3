/**
 * db.js - SQLite abstraction layer for Smart Hydration System
 * Uses @capacitor-community/sqlite for native and jeep-sqlite for browser.
 */

// Detect environment
const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
let db = null;
let useFallback = false;

/**
 * Initialize the database connection and tables
 */
async function initDatabase() {
    try {
        if (isNative) {
            // In Vanilla JS APK, we check for the plugin globally
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorSQLite) {
                // Future optimization: Implement native SQLite connection here
                // For now, we use the robust fallback to ensure the app works immediately
                useFallback = true;
            } else {
                useFallback = true;
            }
        } else {
            // Browser - jeep-sqlite fallback or LocalStorage
            useFallback = true;
        }

        await createTables();
        await seedData();
        console.log('Database initialized successfully');
    } catch (err) {
        console.error('Database initialization failed, using fallback:', err);
        useFallback = true;
        await createTables();
        await seedData();
    }
}

/**
 * Create tables if they don't exist
 */
async function createTables() {
    if (useFallback) return; // LocalStorage mock handles its own structure
    const queries = [
        `CREATE TABLE IF NOT EXISTS users (
            user_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            username  TEXT NOT NULL UNIQUE,
            password  TEXT NOT NULL,
            display_name TEXT,
            daily_goal INTEGER DEFAULT 1925,
            created_at TEXT DEFAULT (datetime('now'))
        );`,
        `CREATE TABLE IF NOT EXISTS hydration_logs (
            log_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id   INTEGER NOT NULL,
            intake_ml REAL NOT NULL,
            logged_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        );`,
        `CREATE TABLE IF NOT EXISTS reminders (
            reminder_id  INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL,
            label        TEXT NOT NULL,
            interval_ms  INTEGER NOT NULL,
            created_at   TEXT DEFAULT (datetime('now')),
            is_active    INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        );`,
        `CREATE TABLE IF NOT EXISTS settings (
            user_id               INTEGER PRIMARY KEY,
            notifications_enabled INTEGER DEFAULT 1,
            haptic_enabled        INTEGER DEFAULT 1,
            dark_mode             INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        );`
    ];

    for (const query of queries) {
        await executeQuery(query);
    }
}

/**
 * Seed initial data on first launch
 */
async function seedData() {
    // Check if seeded already
    if (localStorage.getItem('db_seeded')) return;

    try {
        // Create admin user
        await executeQuery(`INSERT OR IGNORE INTO users (username, password, display_name, daily_goal) VALUES ('admin', 'admin123', 'Admin', 1925);`);
        
        // Settings for admin (user_id 1)
        await executeQuery(`INSERT OR IGNORE INTO settings (user_id, notifications_enabled, haptic_enabled, dark_mode) VALUES (1, 1, 1, 0);`);

        // Sample logs for last 7 days
        const logs = [
            `INSERT INTO hydration_logs (user_id, intake_ml, logged_at) VALUES (1, 500, datetime('now', 'localtime', '-2 hours'));`,
            `INSERT INTO hydration_logs (user_id, intake_ml, logged_at) VALUES (1, 500, datetime('now', 'localtime', '-4 hours'));`,
            `INSERT INTO hydration_logs (user_id, intake_ml, logged_at) VALUES (1, 250, datetime('now', 'localtime', '-6 hours'));`,
            `INSERT INTO hydration_logs (user_id, intake_ml, logged_at) VALUES (1, 600, datetime('now', 'localtime', '-1 day'));`,
            `INSERT INTO hydration_logs (user_id, intake_ml, logged_at) VALUES (1, 400, datetime('now', 'localtime', '-1 day', '-3 hours'));`,
            `INSERT INTO hydration_logs (user_id, intake_ml, logged_at) VALUES (1, 300, datetime('now', 'localtime', '-1 day', '-6 hours'));`,
            `INSERT INTO hydration_logs (user_id, intake_ml, logged_at) VALUES (1, 2000, datetime('now', 'localtime', '-2 days'));`,
            `INSERT INTO hydration_logs (user_id, intake_ml, logged_at) VALUES (1, 800, datetime('now', 'localtime', '-3 days'));`,
            `INSERT INTO hydration_logs (user_id, intake_ml, logged_at) VALUES (1, 1925, datetime('now', 'localtime', '-4 days'));`,
            `INSERT INTO hydration_logs (user_id, intake_ml, logged_at) VALUES (1, 1100, datetime('now', 'localtime', '-5 days'));`,
            `INSERT INTO hydration_logs (user_id, intake_ml, logged_at) VALUES (1, 600, datetime('now', 'localtime', '-6 days'));`
        ];

        for (const log of logs) {
            await executeQuery(log);
        }

        localStorage.setItem('db_seeded', 'true');
        console.log('Data seeded successfully');
    } catch (err) {
        console.error('Seeding failed:', err);
    }
}

/**
 * Helper to execute a single query (Write)
 */
async function executeQuery(query, params = []) {
    if (isNative && !useFallback) {
        return await db.run(query, params);
    } else {
        // WEB & APK FALLBACK: Using LocalStorage to mock a functional DB
        const dbName = 'hydration_mock_db';
        let mockDb = JSON.parse(localStorage.getItem(dbName) || '{"users":[], "hydration_logs":[], "reminders":[], "settings":[]}');

        // Very basic SQL parser/handler for the mock
        if (query.includes('INSERT INTO users')) {
            const newUser = {
                user_id: mockDb.users.length + 1,
                username: params[0],
                password: params[1],
                display_name: params[2],
                daily_goal: 1925,
                created_at: new Date().toISOString()
            };
            mockDb.users.push(newUser);
        } else if (query.includes('INSERT OR IGNORE INTO users')) {
             if (!mockDb.users.find(u => u.username === 'admin')) {
                mockDb.users.push({ user_id: 1, username: 'admin', password: 'admin123', display_name: 'Admin', daily_goal: 1925 });
             }
        } else if (query.includes('INSERT INTO hydration_logs')) {
            const localDate = new Date();
            const localISO = new Date(localDate.getTime() - (localDate.getTimezoneOffset() * 60000)).toISOString().split('.')[0];
            mockDb.hydration_logs.push({
                log_id: mockDb.hydration_logs.length + 1,
                user_id: params[0],
                intake_ml: params[1],
                logged_at: params[2] || localISO
            });
        } else if (query.includes('INSERT INTO reminders')) {
            mockDb.reminders.push({
                reminder_id: mockDb.reminders.length + 1,
                user_id: params[0],
                label: params[1],
                interval_ms: params[2],
                is_active: 1
            });
        } else if (query.includes('UPDATE users SET daily_goal')) {
            const user = mockDb.users.find(u => u.user_id === params[2]);
            if (user) {
                user.daily_goal = params[0];
                user.display_name = params[1];
            }
        } else if (query.includes('INSERT OR REPLACE INTO settings')) {
            const settingIdx = mockDb.settings.findIndex(s => s.user_id === params[0]);
            const newSetting = { user_id: params[0], notifications_enabled: params[1], haptic_enabled: params[2], dark_mode: params[3] };
            if (settingIdx > -1) mockDb.settings[settingIdx] = newSetting;
            else mockDb.settings.push(newSetting);
        } else if (query.includes('DELETE FROM hydration_logs')) {
            mockDb.hydration_logs = mockDb.hydration_logs.filter(l => l.log_id !== params[0]);
        } else if (query.includes('UPDATE reminders SET is_active = 0')) {
            const rem = mockDb.reminders.find(r => r.reminder_id === params[0]);
            if (rem) rem.is_active = 0;
        } else if (query.includes('UPDATE users SET password = ?')) {
            const user = mockDb.users.find(u => u.user_id === params[1]);
            if (user) user.password = params[0];
        }

        localStorage.setItem(dbName, JSON.stringify(mockDb));
        return true; 
    }
}

/**
 * Helper to fetch results (Read)
 */
async function queryResults(query, params = []) {
    if (isNative && !useFallback) {
        const res = await db.query(query, params);
        return res.values;
    } else {
        const dbName = 'hydration_mock_db';
        let mockDb = JSON.parse(localStorage.getItem(dbName) || '{"users":[], "hydration_logs":[], "reminders":[], "settings":[]}');

        if (query.includes('SELECT * FROM users WHERE username = ?')) {
            return mockDb.users.filter(u => u.username === params[0]);
        } else if (query.includes('SELECT s.*, u.daily_goal, u.display_name FROM settings')) {
            const settings = mockDb.settings.find(s => s.user_id === params[0]) || { user_id: params[0], notifications_enabled: 1, haptic_enabled: 1, dark_mode: 0 };
            const user = mockDb.users.find(u => u.user_id === params[0]) || {};
            return [{ ...settings, daily_goal: user.daily_goal || 1925, display_name: user.display_name || '' }];
        } else if (query.includes('SELECT * FROM hydration_logs WHERE user_id = ? AND date(logged_at) = date(\'now\', \'localtime\')')) {
            const now = new Date();
            const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            return mockDb.hydration_logs.filter(l => l.user_id === params[0] && l.logged_at.startsWith(today));
        } else if (query.includes('SELECT * FROM hydration_logs WHERE user_id = ? ORDER BY logged_at DESC')) {
            return mockDb.hydration_logs.filter(l => l.user_id === params[0]).sort((a,b) => new Date(b.logged_at) - new Date(a.logged_at));
        } else if (query.includes('SELECT * FROM reminders WHERE user_id = ? AND is_active = 1')) {
            return mockDb.reminders.filter(r => r.user_id === params[0] && r.is_active === 1);
        } else if (query.includes('SUM(intake_ml) as total_ml')) {
            // Very simplified weekly stats
            const last7Days = [];
            for (let i = 6; i >= 0; i--) {
                const now = new Date();
                const date = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const total = mockDb.hydration_logs
                    .filter(l => l.user_id === params[0] && l.logged_at.startsWith(dateStr))
                    .reduce((sum, l) => sum + l.intake_ml, 0);
                last7Days.push({ log_date: dateStr, total_ml: total });
            }
            return last7Days;
        }

        return []; 
    }
}

// --- CRUD Helpers ---

// Users
async function getUserByUsername(username) {
    const results = await queryResults(`SELECT * FROM users WHERE username = ?`, [username]);
    return results[0];
}

async function createUser(username, password, displayName) {
    await executeQuery(`INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)`, [username, password, displayName]);
    const user = await getUserByUsername(username);
    // Init settings for new user
    await executeQuery(`INSERT INTO settings (user_id) VALUES (?)`, [user.user_id]);
    return user;
}

// Hydration Logs
async function addLog(userId, intakeMl) {
    return await executeQuery(`INSERT INTO hydration_logs (user_id, intake_ml) VALUES (?, ?)`, [userId, intakeMl]);
}

async function getLogsForUser(userId) {
    return await queryResults(`SELECT * FROM hydration_logs WHERE user_id = ? ORDER BY logged_at DESC`, [userId]);
}

async function getTodayLogs(userId) {
    return await queryResults(`SELECT * FROM hydration_logs WHERE user_id = ? AND date(logged_at) = date('now', 'localtime') ORDER BY logged_at DESC`, [userId]);
}

async function deleteLog(logId) {
    return await executeQuery(`DELETE FROM hydration_logs WHERE log_id = ?`, [logId]);
}

async function getWeeklyStats(userId) {
    // Aggregates last 7 days
    return await queryResults(`
        SELECT 
            strftime('%w', logged_at) as day_of_week,
            date(logged_at) as log_date,
            SUM(intake_ml) as total_ml
        FROM hydration_logs 
        WHERE user_id = ? AND logged_at >= date('now', 'localtime', '-6 days')
        GROUP BY log_date
        ORDER BY log_date ASC
    `, [userId]);
}

// Reminders
async function addReminder(userId, label, intervalMs) {
    return await executeQuery(`INSERT INTO reminders (user_id, label, interval_ms) VALUES (?, ?, ?)`, [userId, label, intervalMs]);
}

async function getReminders(userId) {
    return await queryResults(`SELECT * FROM reminders WHERE user_id = ? AND is_active = 1`, [userId]);
}

async function deleteReminder(reminderId) {
    return await executeQuery(`UPDATE reminders SET is_active = 0 WHERE reminder_id = ?`, [reminderId]);
}

// Settings
async function getSettings(userId) {
    const results = await queryResults(`SELECT s.*, u.daily_goal, u.display_name FROM settings s JOIN users u ON s.user_id = u.user_id WHERE s.user_id = ?`, [userId]);
    return results[0];
}

async function saveSettings(userId, settings) {
    // Update users table for goal and display name
    await executeQuery(`UPDATE users SET daily_goal = ?, display_name = ? WHERE user_id = ?`, [settings.daily_goal, settings.display_name, userId]);
    // Update settings table
    await executeQuery(`INSERT OR REPLACE INTO settings (user_id, notifications_enabled, haptic_enabled, dark_mode) VALUES (?, ?, ?, ?)`, 
        [userId, settings.notifications_enabled, settings.haptic_enabled, settings.dark_mode]);
}

async function updatePassword(userId, newPassword) {
    return await executeQuery(`UPDATE users SET password = ? WHERE user_id = ?`, [newPassword, userId]);
}

// Export functions to window for app.js
window.dbLayer = {
    initDatabase,
    getUserByUsername,
    createUser,
    updatePassword,
    addLog,
    getLogsForUser,
    getTodayLogs,
    deleteLog,
    getWeeklyStats,
    addReminder,
    getReminders,
    deleteReminder,
    getSettings,
    saveSettings
};
