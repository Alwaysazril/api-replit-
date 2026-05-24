const app = require('./src/app');
const { PORT } = require('./src/utils/constants');
const { startTelegramBot } = require('./src/services/telegramService');
const { startUserSessions } = require('./src/services/whatsappService');

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🐉 ════════════════════════════════');
  console.log('   AZRIL STRAVAS API V1.0');
  console.log('   by @usserunknownn');
  console.log(`   Port: ${PORT}`);
  console.log('🐉 ════════════════════════════════\n');

  try { startUserSessions(); } catch(e) { console.log('WA skip:', e.message); }
  startTelegramBot();
});
