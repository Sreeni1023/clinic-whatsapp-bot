/**
 * AI.JS — Gemini AI Brain
 * Intent detection + smart replies (English only)
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function detectIntent(message, clinicConfig) {
    const prompt = `You are an intent classifier for a dental clinic WhatsApp bot.
Clinic: ${clinicConfig.name}, Hyderabad.
Patient message: "${message}"
Classify into EXACTLY one of:
GREETING, BOOK_APPOINTMENT, SERVICES, FEES, LOCATION, TIMINGS, CONTACT, CANCEL_APPOINTMENT, CONFIRM_YES, CONFIRM_NO, HUMAN_HANDOFF, UNKNOWN
Reply with ONLY the intent word. Nothing else.`;
    try {
        const result = await model.generateContent(prompt);
        const intent = result.response.text().trim().toUpperCase();
        const valid = ['GREETING','BOOK_APPOINTMENT','SERVICES','FEES','LOCATION','TIMINGS','CONTACT','CANCEL_APPOINTMENT','CONFIRM_YES','CONFIRM_NO','HUMAN_HANDOFF','UNKNOWN'];
        return valid.includes(intent) ? intent : 'UNKNOWN';
    } catch (err) {
        console.error('[AI] Intent error:', err.message);
        return 'UNKNOWN';
    }
}

async function getSmartReply(message, clinicConfig) {
    const prompt = `You are a friendly WhatsApp receptionist for ${clinicConfig.name}, Hyderabad.
Reply in clear, friendly English. Professional but warm. Under 120 words. Use emojis.
Clinic info:
- Services: ${clinicConfig.services.join(', ')}
- Hours: Mon-Sat 9AM-9PM, Sunday closed
- Fees: ${clinicConfig.faq.fees}
- Emergency: ${clinicConfig.faq.emergency}
Patient asked: "${message}"
Reply as a receptionist. End with a helpful next step like BOOK, SERVICES, or CONTACT.`;
    try {
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (err) {
        console.error('[AI] Smart reply error:', err.message);
        return null;
    }
}

module.exports = { detectIntent, getSmartReply };
