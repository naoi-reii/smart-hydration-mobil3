/**
 * notifications.js - Notification and Vibration logic
 * Handles Web API calls with fallbacks and Capacitor guidance.
 */

// Global settings reference (updated by app.js)
window.appSettings = {
    notifications_enabled: true,
    haptic_enabled: true
};

/**
 * Trigger device vibration with a specific pattern
 * @param {number|number[]} pattern - Vibration pattern in ms
 */
async function vibrate(pattern) {
    if (!window.appSettings.haptic_enabled) return;

    // Use Capacitor Haptics if available
    if (window.Capacitor && window.Capacitor.Plugins.Haptics) {
        const { Haptics } = window.Capacitor.Plugins;
        try {
            if (pattern === VIBRATION_PATTERNS.ERROR) {
                await Haptics.notification({ type: 'ERROR' });
            } else if (pattern === VIBRATION_PATTERNS.SUCCESS) {
                await Haptics.notification({ type: 'SUCCESS' });
            } else {
                await Haptics.impact({ style: 'MEDIUM' });
            }
            return;
        } catch (e) {
            console.warn('Capacitor Haptics failed', e);
        }
    }

    if (!navigator.vibrate) {
        console.warn('Vibration API not supported on this browser');
        return;
    }
    
    navigator.vibrate(pattern);
}

/**
 * Request permission for web notifications
 * @returns {Promise<boolean>} - True if granted
 */
async function requestNotificationPermission() {
    // Use Capacitor Local Notifications if available
    if (window.Capacitor && window.Capacitor.Plugins.LocalNotifications) {
        const { LocalNotifications } = window.Capacitor.Plugins;
        try {
            let permStatus = await LocalNotifications.checkPermissions();
            if (permStatus.display === 'prompt') {
                permStatus = await LocalNotifications.requestPermissions();
            }
            return permStatus.display === 'granted';
        } catch (e) {
            console.warn('Capacitor LocalNotifications error', e);
        }
    }

    if (!("Notification" in window)) {
        console.warn("This browser does not support desktop notification");
        return false;
    }

    if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        return result === 'granted';
    }
    
    return Notification.permission === 'granted';
}

/**
 * Fire a system notification
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 */
async function fireNotification(title, body) {
    if (!window.appSettings.notifications_enabled) return;
    
    // Use Capacitor Local Notifications if available
    if (window.Capacitor && window.Capacitor.Plugins.LocalNotifications) {
        const { LocalNotifications } = window.Capacitor.Plugins;
        try {
            await LocalNotifications.schedule({
                notifications: [
                    {
                        title: title,
                        body: body,
                        id: Math.floor(Math.random() * 1000000),
                        schedule: { at: new Date(Date.now() + 1000) } // Schedule slightly in future for reliable delivery
                    }
                ]
            });
            return;
        } catch (e) {
            console.warn('Capacitor LocalNotifications error', e);
        }
    }

    if (!("Notification" in window)) return;

    if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
            body: body,
            icon: 'https://cdn-icons-png.flaticon.com/512/3105/3105807.png', // Fallback water icon
            badge: 'https://cdn-icons-png.flaticon.com/512/3105/3105807.png'
        });
        
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    } else {
        console.warn('Notification permission not granted');
    }
}

// Vibration Patterns
const VIBRATION_PATTERNS = {
    SUCCESS: 100,
    DELETE: [50, 30, 50],
    REMINDER: [200, 100, 200],
    TEST: [100, 50, 100, 50, 200],
    ERROR: 300
};

// Export to window
window.notifyLayer = {
    vibrate,
    requestNotificationPermission,
    fireNotification,
    syncNativeReminders,
    VIBRATION_PATTERNS
};

/**
 * Sync active reminders to Capacitor Local Notifications
 * This ensures reminders fire even when the app is in the background
 * by pre-scheduling a batch of future notifications.
 * @param {Array} reminders - List of active reminders
 */
async function syncNativeReminders(reminders) {
    if (!window.appSettings.notifications_enabled) return;
    
    if (window.Capacitor && window.Capacitor.Plugins.LocalNotifications) {
        const { LocalNotifications } = window.Capacitor.Plugins;
        try {
            // Cancel existing pending notifications
            const pending = await LocalNotifications.getPending();
            if (pending.notifications.length > 0) {
                await LocalNotifications.cancel({ notifications: pending.notifications });
            }

            const notificationsToSchedule = [];
            const now = Date.now();
            let notifId = 1; // start ID
            
            // Schedule the next 24 occurrences for each reminder
            reminders.forEach(rem => {
                let interval = parseInt(rem.interval_ms);
                if (isNaN(interval) || interval <= 0) return;
                
                for (let i = 1; i <= 24; i++) {
                    notificationsToSchedule.push({
                        id: notifId++,
                        title: "Drink Reminder",
                        body: rem.label,
                        schedule: { 
                            at: new Date(now + (interval * i)),
                            allowWhileIdle: true 
                        }
                    });
                }
            });

            if (notificationsToSchedule.length > 0) {
                await LocalNotifications.schedule({ notifications: notificationsToSchedule });
                console.log(`Scheduled ${notificationsToSchedule.length} native background reminders.`);
            }
        } catch (e) {
            console.warn('Capacitor LocalNotifications sync error', e);
        }
    }
}
