/**
 * INDEX.JS — Entry Point
 * Multi-Clinic WhatsApp AI Receptionist
 * By: SreeniVerse Technologies
 */
require('dotenv').config();
const { startBot, loadClinics } = require('./bot');

async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  Multi-Clinic WhatsApp AI Receptionist   ║');
    console.log('║  SreeniVerse Technologies v1.0           ║');
    console.log('║  Baileys + Gemini AI + Google Sheets     ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');

    const clinics = loadClinics();
    if (Object.keys(clinics).length === 0) {
        console.error('[ERROR] No clinic configs found in ./clinics/');
        process.exit(1);
    }

    await startBot(clinics);
}

process.on('SIGINT',  () => { console.log('\n[INFO] Shutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n[INFO] Shutting down...'); process.exit(0); });
process.on('unhandledRejection', (err) => console.error('[ERROR] Unhandled:', err?.message));

main();
