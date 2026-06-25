/**
 * BOT.JS — Multi-Clinic WhatsApp AI Receptionist v1.1
 * Full English | Impressive UI | Gemini AI
 * SreeniVerse Technologies
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
require('dotenv').config();

const { detectIntent, getSmartReply } = require('./ai');
const { bookAppointment, getBookedSlots } = require('./sheets');
const { getSession, setStep, clearSession, STEPS } = require('./sessions');
const { initScheduler } = require('./scheduler');

const logger = {
    info:  (msg) => console.log(`[INFO]  ${new Date().toLocaleString('en-IN')} » ${msg}`),
    warn:  (msg) => console.log(`[WARN]  ${new Date().toLocaleString('en-IN')} » ${msg}`),
    error: (msg) => console.log(`[ERROR] ${new Date().toLocaleString('en-IN')} » ${msg}`),
};

function loadClinics() {
    const dir = path.join(__dirname, 'clinics');
    const clinics = {};
    fs.readdirSync(dir).forEach(file => {
        if (file.endsWith('.json')) {
            const cfg = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
            clinics[cfg.id] = cfg;
            logger.info(`📋 Clinic loaded: ${cfg.name}`);
        }
    });
    return clinics;
}

const randomDelay = (min, max) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

function isClinicOpen(clinic) {
    const now = new Date();
    const hour = now.getHours();
    const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()];
    if (!clinic.workingHours.days.includes(day)) return false;
    if (hour < clinic.workingHours.start || hour >= clinic.workingHours.end) return false;
    if (hour >= clinic.workingHours.lunchBreak.start && hour < clinic.workingHours.lunchBreak.end) return false;
    return true;
}

function parseDate(input) {
    const t = input.trim().toLowerCase();
    const fmt = (d) => {
        const dd = String(d.getDate()).padStart(2,'0');
        const mm = String(d.getMonth()+1).padStart(2,'0');
        return `${dd}/${mm}/${d.getFullYear()}`;
    };
    if (t === 'today') return fmt(new Date());
    if (t === 'tomorrow') { const d = new Date(); d.setDate(d.getDate()+1); return fmt(d); }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(input.trim())) return input.trim();
    return null;
}

async function handleBookingFlow(sock, from, phone, text, clinic, session) {
    const t = text.trim();

    if (/^(cancel|exit|stop|back|menu)$/i.test(t)) {
        clearSession(phone);
        return `❌ *Booking Cancelled*\n\n_Type_ *BOOK* _to start a new booking_\n_Type_ *0* _for main menu_ 🙏`;
    }

    switch (session.step) {
        case STEPS.AWAIT_NAME: {
            if (t.length < 2) return `👤 Please enter your *full name*:`;
            setStep(phone, STEPS.AWAIT_DATE, { patientName: t });
            return clinic.messages.askDate;
        }
        case STEPS.AWAIT_DATE: {
            const date = parseDate(t);
            if (!date) return `📅 *Invalid date format.*\n\n_Please use: DD/MM/YYYY_\n_Example: 28/06/2026_\n\nOr type *today* or *tomorrow*:`;
            const booked = await getBookedSlots(date);
            const available = clinic.availableSlots.filter(s => !booked.includes(s));
            if (available.length === 0) return `😔 *No slots available on ${date}.*\n\nPlease try a different date:`;
            const slotList = available.map((s, i) => `▸ ${i+1}. ${s}`).join('\n');
            setStep(phone, STEPS.AWAIT_SLOT, { date, availableSlots: available });
            return clinic.messages.askSlot.replace('{slots}', slotList);
        }
        case STEPS.AWAIT_SLOT: {
            const available = session.data.availableSlots || [];
            const num = parseInt(t);
            let slot = (!isNaN(num) && num >= 1 && num <= available.length) ? available[num-1] : null;
            if (!slot && clinic.availableSlots.includes(t)) slot = t;
            if (!slot) return `⏰ Please enter a valid slot number *(1–${available.length})*:`;
            setStep(phone, STEPS.AWAIT_REASON, { slot });
            return clinic.messages.askReason;
        }
        case STEPS.AWAIT_REASON: {
            if (t.length < 2) return `🦷 Please describe your reason for visiting:`;
            setStep(phone, STEPS.AWAIT_CONFIRM, { reason: t });
            const d = session.data;
            return `📋 *Booking Summary*\n_Please review and confirm:_\n\n━━━━━━━━━━━━━━━━━━━━━━\n👤 *Name:*   ${d.patientName}\n📅 *Date:*    ${d.date}\n⏰ *Time:*    ${d.slot}\n🦷 *Reason:* ${t}\n🏥 *Clinic:*  ${clinic.name}\n━━━━━━━━━━━━━━━━━━━━━━\n\n✅ Type *YES* to confirm\n❌ Type *NO* to cancel`;
        }
        case STEPS.AWAIT_CONFIRM: {
            if (/^(yes|ok|okay|confirm|sure|y|yep|yeah)$/i.test(t)) {
                const d = session.data;
                await bookAppointment({
                    patientName: d.patientName,
                    phone,
                    date: d.date,
                    slot: d.slot,
                    reason: d.reason,
                    clinicName: clinic.name,
                    bookedAt: new Date().toLocaleString('en-IN'),
                });
                clearSession(phone);
                try {
                    await sock.sendMessage(process.env.OWNER_NUMBER + '@s.whatsapp.net', {
                        text: `🔔 *New Appointment Booked!*\n\n🏥 ${clinic.name}\n👤 ${d.patientName}\n📱 ${phone}\n📅 ${d.date} at ${d.slot}\n🦷 ${d.reason}`
                    });
                } catch(e) {}
                return clinic.messages.confirmBooking
                    .replace('{name}', d.patientName)
                    .replace('{date}', d.date)
                    .replace('{slot}', d.slot)
                    .replace('{reason}', d.reason);
            }
            if (/^(no|nope|cancel|n)$/i.test(t)) {
                clearSession(phone);
                return `❌ *Booking Cancelled*\n\n_Type_ *BOOK* _to start again_ 🙏`;
            }
            return `Please type *YES* to confirm or *NO* to cancel:`;
        }
        default:
            clearSession(phone);
            return clinic.messages.welcome;
    }
}

async function handleMessage(sock, from, phone, text, clinic) {
    const session = getSession(phone);
    if (session.step !== STEPS.IDLE) {
        return await handleBookingFlow(sock, from, phone, text, clinic, session);
    }

    const intent = await detectIntent(text, clinic);
    logger.info(`🧠 Intent: ${intent} | ${phone}`);

    switch (intent) {
        case 'GREETING':
            return clinic.messages.welcome;
        case 'BOOK_APPOINTMENT':
            setStep(phone, STEPS.AWAIT_NAME);
            return clinic.messages.bookingStart;
        case 'SERVICES':
            return `🦷 *Our Dental Services*\n_SmileCare Dental Clinic, Hyderabad_\n\n━━━━━━━━━━━━━━━━━━━━━━\n${clinic.services.map((s,i)=>`${i+1}️⃣  ${s}`).join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━\n\n📅 Type *BOOK* to book an appointment\n📞 Type *CONTACT* for more info`;
        case 'FEES':
            return `💰 *Consultation & Treatment Fees*\n\n━━━━━━━━━━━━━━━━━━━━━━\n${clinic.faq.fees}\n━━━━━━━━━━━━━━━━━━━━━━\n\n📅 Type *BOOK* to book an appointment`;
        case 'LOCATION':
            return `📍 *Find Us*\n\n━━━━━━━━━━━━━━━━━━━━━━\n${clinic.faq.location}\n\n🅿️ ${clinic.faq.parking}\n━━━━━━━━━━━━━━━━━━━━━━\n\n📅 Type *BOOK* to book an appointment`;
        case 'TIMINGS':
            return `🕐 *Working Hours*\n\n━━━━━━━━━━━━━━━━━━━━━━\n${clinic.faq.timings}\n\n🚨 ${clinic.faq.emergency}\n━━━━━━━━━━━━━━━━━━━━━━\n\n📅 Type *BOOK* to book an appointment`;
        case 'CONTACT':
        case 'HUMAN_HANDOFF':
            return clinic.messages.humanHandoff;
        case 'CANCEL_APPOINTMENT':
            return `❌ *Cancel / Reschedule*\n\nPlease contact us directly:\n\n📱 ${clinic.phone}\n🕐 ${clinic.faq.timings}`;
        default:
            const smart = await getSmartReply(text, clinic);
            if (smart) return smart;
            return `🤔 *I didn't quite understand that.*\n\nHere's what I can help with:\n\n1️⃣  📅 Book Appointment\n2️⃣  🦷 Our Services\n3️⃣  💰 Fees\n4️⃣  📍 Location\n5️⃣  🕐 Timings\n6️⃣  📞 Contact Team\n\n_Type a number or keyword_ 👆`;
    }
}

async function startBot(clinics) {
    let reconnectAttempts = 0;
    const sessionPath = './sessions/main';
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    try {
        logger.info('🤖 Multi-Clinic AI Receptionist v1.1 Starting...');

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();
        logger.info(`📦 Baileys v${version.join('.')}`);

        const sock = makeWASocket({
            version, auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ['SmileCare-Bot','Chrome','10.0'],
            markOnlineOnConnect: false,
            syncFullHistory: false,
            getMessage: async () => undefined,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) { logger.info('📱 Scan QR:'); qrcode.generate(qr, { small: true }); }
            if (connection === 'open') {
                reconnectAttempts = 0;
                logger.info('✅ Clinic Bot Connected!');
                initScheduler(sock);
            }
            if (connection === 'close') {
                const code = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : 500;
                logger.warn(`⚠️ Disconnected — code: ${code}`);
                if (code === DisconnectReason.loggedOut || code === 401) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    setTimeout(() => startBot(clinics), 3000); return;
                }
                if (code === DisconnectReason.restartRequired) { startBot(clinics); return; }
                if (reconnectAttempts < 5) {
                    reconnectAttempts++;
                    setTimeout(() => startBot(clinics), 8000 * reconnectAttempts);
                } else { setTimeout(() => startBot(clinics), 30000); }
            }
        });

        // ── REPLY LIMIT — max 2 auto-replies per number per 6 hours ─────────
        const replyCount = {};
        function canReply(phone) {
            const now = Date.now();
            if (!replyCount[phone]) replyCount[phone] = { count: 0, first: now };
            if (now - replyCount[phone].first > 6 * 60 * 60 * 1000) {
                replyCount[phone] = { count: 0, first: now };
            }
            return replyCount[phone].count < 2;
        }
        function markReplied(phone) {
            if (!replyCount[phone]) replyCount[phone] = { count: 0, first: Date.now() };
            replyCount[phone].count++;
        }

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;
                const msg = messages[0];
                if (!msg?.message || msg.key.fromMe) return;
                const from = msg.key.remoteJid;
                if (from.endsWith('@g.us') || from === 'status@broadcast') return;

                const phone = from.split('@')[0];
                const text = (
                    msg.message.conversation
                    || msg.message.extendedTextMessage?.text
                    || msg.message.imageMessage?.caption
                    || ''
                ).trim();
                if (!text) return;

                logger.info(`📨 ${phone}: "${text.substring(0, 60)}"`);

                // ── LOOP PROTECTION — skip if reply limit reached ─────────
                const session = getSession(phone);
                if (session.step === STEPS.IDLE && !canReply(phone)) {
                    logger.info(`🔇 Reply limit reached for ${phone} — silent`);
                    return;
                }

                const clinic = Object.values(clinics)[0];
                if (!clinic) return;

                if (!isClinicOpen(clinic) && session.step === STEPS.IDLE) {
                    const intent = await detectIntent(text, clinic);
                    if (intent !== 'GREETING' && intent !== 'BOOK_APPOINTMENT') {
                        await sock.sendMessage(from, { text: clinic.messages.outsideHours });
                        markReplied(phone);
                        return;
                    }
                }

                await randomDelay(1500, 3000);
                await sock.sendPresenceUpdate('composing', from);
                await randomDelay(1000, 2000);
                await sock.sendPresenceUpdate('paused', from);

                const reply = await handleMessage(sock, from, phone, text, clinic);
                if (reply) {
                    await sock.sendMessage(from, { text: reply });
                    markReplied(phone);
                    logger.info(`✅ Replied to ${phone}`);
                }
            } catch (err) {
                logger.error('Handler: ' + err.message);
            }
        });

    } catch (err) {
        logger.error('startBot: ' + err.message);
        setTimeout(() => startBot(clinics), 15000);
    }
}

module.exports = { startBot, loadClinics };
