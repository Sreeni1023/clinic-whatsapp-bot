/**
 * SHEETS.JS — Google Sheets via n8n Webhook
 * No service account JSON needed!
 */
const https = require('https');
const http = require('http');
require('dotenv').config();

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';

function postToWebhook(data) {
    return new Promise((resolve) => {
        if (!N8N_WEBHOOK_URL) {
            console.log('[SHEETS] Mock mode - no webhook URL:', JSON.stringify(data));
            return resolve({ success: true, mock: true });
        }
        try {
            const url = new URL(N8N_WEBHOOK_URL);
            const body = JSON.stringify(data);
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            };
            const lib = url.protocol === 'https:' ? https : http;
            const req = lib.request(options, (res) => {
                let d = '';
                res.on('data', chunk => d += chunk);
                res.on('end', () => resolve({ success: true, response: d }));
            });
            req.on('error', (e) => { console.error('[SHEETS] Webhook error:', e.message); resolve({ success: false }); });
            req.write(body);
            req.end();
        } catch (e) {
            console.error('[SHEETS] URL error:', e.message);
            resolve({ success: false });
        }
    });
}

async function bookAppointment(appointment) {
    console.log('[SHEETS] Booking:', appointment.patientName, appointment.date, appointment.slot);
    return await postToWebhook({ action: 'BOOK', ...appointment });
}

async function getBookedSlots(date) {
    // For now return empty — slots always available in demo mode
    return [];
}

module.exports = { bookAppointment, getBookedSlots };
