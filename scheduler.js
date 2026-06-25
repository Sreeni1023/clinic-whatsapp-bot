/**
 * SCHEDULER.JS — Appointment Reminder System
 */
const cron = require('node-cron');

let sockRef = null;

function initScheduler(sock) {
    sockRef = sock;
    console.log('[SCHEDULER] ✅ Reminder scheduler started (runs every 30 min)');
    cron.schedule('*/30 * * * *', async () => {
        console.log('[SCHEDULER] Reminder check running...');
        // Reminders will be triggered via n8n webhook in production
        // For demo: manual reminder sending supported
    });
}

async function sendReminder(phone, appointment) {
    if (!sockRef) return;
    try {
        const msg = `🔔 *Appointment Reminder!*

━━━━━━━━━━━━━━━━━━━━━━
🏥 ${appointment.clinicName}
👤 Patient: ${appointment.patientName}
📅 Date: ${appointment.date}
⏰ Time: ${appointment.slot}
🦷 Reason: ${appointment.reason}
━━━━━━━━━━━━━━━━━━━━━━

మీ appointment *రేపు* ఉంది! ✅
10 minutes ముందు రండి 🙏`;

        await sockRef.sendMessage(phone + '@s.whatsapp.net', { text: msg });
        console.log('[SCHEDULER] Reminder sent to:', phone);
    } catch (err) {
        console.error('[SCHEDULER] Error:', err.message);
    }
}

module.exports = { initScheduler, sendReminder };
