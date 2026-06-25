/**
 * SESSIONS.JS — Conversation State Manager
 */
const sessions = {};

const STEPS = {
    IDLE: 'IDLE',
    AWAIT_NAME: 'AWAIT_NAME',
    AWAIT_DATE: 'AWAIT_DATE',
    AWAIT_SLOT: 'AWAIT_SLOT',
    AWAIT_REASON: 'AWAIT_REASON',
    AWAIT_CONFIRM: 'AWAIT_CONFIRM',
};

function getSession(phone) {
    if (!sessions[phone]) {
        sessions[phone] = { step: STEPS.IDLE, data: {}, lastActivity: Date.now() };
    }
    sessions[phone].lastActivity = Date.now();
    return sessions[phone];
}

function setStep(phone, step, data = {}) {
    const session = getSession(phone);
    session.step = step;
    session.data = { ...session.data, ...data };
    session.lastActivity = Date.now();
}

function clearSession(phone) {
    sessions[phone] = { step: STEPS.IDLE, data: {}, lastActivity: Date.now() };
}

setInterval(() => {
    const now = Date.now();
    for (const phone of Object.keys(sessions)) {
        if (now - sessions[phone].lastActivity > 30 * 60 * 1000) delete sessions[phone];
    }
}, 10 * 60 * 1000);

module.exports = { getSession, setStep, clearSession, STEPS };
