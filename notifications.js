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
function vibrate(pattern) {
    // CAPACITOR NOTE: Replace navigator.vibrate() with @capacitor/haptics:
    // import { Haptics, ImpactStyle } from '@capacitor/haptics';
    // await Haptics.impact({ style: ImpactStyle.Medium });
    
    if (!window.appSettings.haptic_enabled) return;
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
function fireNotification(title, body) {
    // CAPACITOR NOTE: Replace with @capacitor/local-notifications for background support:
    // import { LocalNotifications } from '@capacitor/local-notifications';
    // await LocalNotifications.schedule({ notifications: [{ title, body, id: Date.now() }] });

    if (!window.appSettings.notifications_enabled) return;
    
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
    VIBRATION_PATTERNS
};
