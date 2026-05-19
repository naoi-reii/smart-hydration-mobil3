/**
 * db.js - SQLite abstraction layer for Smart Hydration System
 * Uses @capacitor-community/sqlite for native and LocalStorage for fallback.
 */

// Detect environment
const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
const DB_NAME = 'hydration_db';
let sqlitePlugin = null;
let useFallback = false;

/**
 * Initialize the database connection and tables
 */
async function initDatabase() {
    try {
        if (isNative && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorSQLite) {
            sqlitePlugin = window.Capacitor.Plugins.CapacitorSQLite;
            
            // 1. Check if connection already exists
            const { result } = await sqlitePlugin.isConnection({ database: DB_NAME, readonly: false });
            
            if (!result) {
                // 2. Create the connection
                await sqlitePlugin.createConnection({
                    database: DB_NAME,
                    version: 1,
                    encrypted: false,
                    mode: "no-encryption",
                    readonly: false
                });
            }

            // 3. Open the database
            await sqlitePlugin.open({ database: DB_NAME });
            useFallback = false;
            console.log('Native SQLite initialized');
        } else {
            // Browser or Plugin missing - Use LocalStorage fallback
            useFallback = true;
            console.log('Using LocalStorage fallback');
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

    if (!useFallback && sqlitePlugin) {
        // For native, we can run these as a single execution block
        try {
            await sqlitePlugin.execute({
                database: DB_NAME,
                statements: queries.join('\n')
            });
        } catch (err) {
            console.error('Failed to create tables natively:', err);
            // Fallback to individual execution if batch fails
            for (const query of queries) {
                await executeQuery(query);
            }
        }
    } else {
        // Mock DB doesn't need table creation but we keep the loop for consistency if needed
        for (const query of queries) {
            await executeQuery(query);
        }
    }
}

/**
 * Seed initial data on first launch
 */
async function seedData() {
    // Check if seeded already
    const isSeeded = useFallback 
        ? localStorage.getItem('db_seeded')
        : (await queryResults("SELECT count(*) as count FROM users")).length > 0;

    if (isSeeded && isSeeded !== 'false' && isSeeded !== 0) return;

    try {
        // Create admin user
        await executeQuery(`INSERT OR IGNORE INTO users (username, password, display_name, daily_goal) VALUES (?, ?, ?, ?);`, 
            ['admin', 'admin123', 'Admin', 1925]);
        
        // Settings for admin (user_id 1)
        await executeQuery(`INSERT OR IGNORE INTO settings (user_id, notifications_enabled, haptic_enabled, dark_mode) VALUES (?, ?, ?, ?);`, 
            [1, 1, 1, 0]);

        // Sample logs for last 7 days
        // Note: We use individual inserts here for simplicity and cross-compatibility
        const now = new Date();
        for (let i = 0; i < 7; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            await executeQuery(`INSERT INTO hydration_logs (user_id, intake_ml, logged_at) VALUES (?, ?, ?);`, 
                [1, Math.floor(Math.random() * 1000) + 500, `${dateStr} 12:00:00`]);
        }

        if (useFallback) localStorage.setItem('db_seeded', 'true');
        console.log('Data seeded successfully');
    } catch (err) {
        console.error('Seeding failed:', err);
    }
}

/**
 * Helper to execute a single query (Write)
 */
async function executeQuery(query, params = []) {
    if (!useFallback && sqlitePlugin) {
        try {
            const res = await sqlitePlugin.run({
                database: DB_NAME,
                statement: query,
                values: params
            });
            return res;
        } catch (err) {
            console.error('Native Execution Error:', err, query);
            throw err;
        }
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
            mockDb.hydration_logs.push({
                log_id: mockDb.hydration_logs.length + 1,
                user_id: params[0],
                intake_ml: params[1],
                logged_at: params[2] || new Date().toISOString().replace('T', ' ').split('.')[0]
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
    if (!useFallback && sqlitePlugin) {
        try {
            const res = await sqlitePlugin.query({
                database: DB_NAME,
                statement: query,
                values: params
            });
            return res.values || [];
        } catch (err) {
            console.error('Native Query Error:', err, query);
            return [];
        }
    } else {
        const dbName = 'hydration_mock_db';
        let mockDb = JSON.parse(localStorage.getItem(dbName) || '{"users":[], "hydration_logs":[], "reminders":[], "settings":[]}');

        if (query.includes('SELECT count(*) as count FROM users')) {
            return mockDb.users.length > 0 ? [{count: mockDb.users.length}] : [];
        } else if (query.includes('SELECT * FROM users WHERE username = ?')) {
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

async function getStats(userId, startDate, endDate, groupBy = 'day') {
    // Aggregates data between startDate and endDate
    // groupBy: 'day' or 'month'
    
    if (useFallback) {
        const dbName = 'hydration_mock_db';
        let mockDb = JSON.parse(localStorage.getItem(dbName) || '{"users":[], "hydration_logs":[], "reminders":[], "settings":[]}');
        
        const filteredLogs = mockDb.hydration_logs.filter(l => {
            const logDate = l.logged_at.split(' ')[0];
            return l.user_id === userId && logDate >= startDate && logDate <= endDate;
        });

        // Grouping logic for mock DB
        const results = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (groupBy === 'day') {
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                const total = filteredLogs
                    .filter(l => l.logged_at.startsWith(dateStr))
                    .reduce((sum, l) => sum + l.intake_ml, 0);
                results.push({ log_date: dateStr, total_ml: total });
            }
        } else if (groupBy === 'month') {
            // Group by month for yearly view
            for (let m = 0; m < 12; m++) {
                const monthDate = new Date(start.getFullYear(), m, 1);
                const monthStr = monthDate.toISOString().substring(0, 7); // YYYY-MM
                const total = filteredLogs
                    .filter(l => l.logged_at.startsWith(monthStr))
                    .reduce((sum, l) => sum + l.intake_ml, 0);
                results.push({ log_date: monthStr, total_ml: total });
            }
        }
        return results;
    }

    const groupFormat = groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m';
    return await queryResults(`
        SELECT 
            strftime('${groupFormat}', logged_at) as log_date,
            SUM(intake_ml) as total_ml
        FROM hydration_logs 
        WHERE user_id = ? AND date(logged_at) >= ? AND date(logged_at) <= ?
        GROUP BY log_date
        ORDER BY log_date ASC
    `, [userId, startDate, endDate]);
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
    getStats,
    addReminder,
    getReminders,
    deleteReminder,
    getSettings,
    saveSettings
};
