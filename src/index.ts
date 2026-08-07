import { bot } from './bot.js';
import { startScheduler } from './scheduler.js';

async function main() {
  await bot.init();
  startScheduler();
  bot.catch((error) => {
    console.error('Bot error:', error);
  });
  bot.start().catch((error) => {
    console.error('Bot failed to start:', error);
    process.exit(1);
  });
  console.log('SellerPilot Daily Brief started.');
}

main().catch((error) => {
  console.error('Application failed to start:', error);
  process.exit(1);
});
