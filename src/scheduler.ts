import cron from 'node-cron';
import { getActiveShops, decryptShopToken } from './db/shops.js';
import { getUserById } from './db/users.js';
import { UzumClient } from './uzumClient.js';
import { computeProductMetrics, computeOverdueOrders, computeProfitSummary } from './metrics.js';
import { createDailySnapshot } from './db/snapshots.js';
import { config } from './config.js';
import { buildBriefText, buildBriefButtons } from './briefFormatter.js';
import { bot } from './bot.js';

const TASHKENT_TIMEZONE = 'Asia/Tashkent';

function parseTimeString(value: string): { hours: number; minutes: number } {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return { hours, minutes };
}

function getTashkentTimeParts(date: Date): { hours: number; minutes: number; dateString: string } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TASHKENT_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  return {
    hours: Number(values.hour),
    minutes: Number(values.minute),
    dateString: `${values.year}-${values.month}-${values.day}`,
  };
}

function shouldSendBrief(briefTime: string, now: Date): boolean {
  const { hours, minutes } = parseTimeString(briefTime);
  const tashkent = getTashkentTimeParts(now);
  return tashkent.hours === hours && tashkent.minutes === minutes;
}

function getTashkentTimestamps(dateString: string) {
  const from = Date.parse(`${dateString}T00:00:00+05:00`);
  return Math.floor(from / 1000);
}

export function startScheduler(): void {
  cron.schedule(`*/${config.SCHEDULE_CHECK_INTERVAL_MINUTES} * * * *`, async () => {
    const now = new Date();
    try {
      const shops = await getActiveShops();
      for (const shop of shops) {
        try {
          if (!shouldSendBrief(shop.brief_time || config.DEFAULT_BRIEF_TIME, now)) {
            continue;
          }

          const token = decryptShopToken(shop);
          const uzum = new UzumClient(token);
          const tashkentNow = getTashkentTimeParts(now);
          const yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          const yesterdayTz = getTashkentTimeParts(yesterday);
          const dateFrom = getTashkentTimestamps(yesterdayTz.dateString);
          const dateTo = getTashkentTimestamps(tashkentNow.dateString) - 1;

          const productsResult = await uzum.fetchAllShopProducts(shop.shop_id_uzum, { sortBy: 'LEFTOVERS', order: 'ASC', filter: 'WARNING', size: 100 });
          const ordersResponse = await uzum.getFinanceOrders(dateFrom, dateTo, [shop.shop_id_uzum]);
          const expensesResponse = await uzum.getFinanceExpenses(dateFrom, dateTo, shop.shop_id_uzum);

          const products = Array.isArray((productsResult as any).items) ? (productsResult as any).items : Array.isArray((productsResult as any).productList) ? (productsResult as any).productList : [];
          const orders = Array.isArray((ordersResponse as any).payload?.orders) ? (ordersResponse as any).payload.orders : [];
          const expenses = Array.isArray((expensesResponse as any).payload) ? (expensesResponse as any).payload : Array.isArray((expensesResponse as any).expenses) ? (expensesResponse as any).expenses : [];

          const productMetrics = computeProductMetrics(products, Number(shop.min_stock_days ?? config.DEFAULT_MIN_STOCK_DAYS), Number(shop.roi_threshold_percent ?? config.DEFAULT_ROI_THRESHOLD), 10);
          const overdue = computeOverdueOrders(orders);
          const profitSummary = computeProfitSummary(expenses, orders);

          const metrics = { ...productMetrics, overdueOrders: overdue, profitSummary };
          const [snapshotDate = new Date().toISOString()] = (dateFrom ? new Date(dateFrom * 1000).toISOString() : new Date().toISOString()).split('T');
          await createDailySnapshot(shop.id, snapshotDate, { products: productsResult, orders: ordersResponse, expenses: expensesResponse }, metrics);

          const user = await getUserById(shop.user_id);
          if (!user || !user.telegram_chat_id) {
            console.warn(`Skipping shop ${shop.id}: missing Telegram chat id`);
            continue;
          }

          const text = buildBriefText(`Uzum shop ${shop.shop_id_uzum}`, metrics);
          const buttons = buildBriefButtons(shop.id);
          await bot.api.sendMessage(user.telegram_chat_id, text, {
            reply_markup: { inline_keyboard: [buttons] },
          });
        } catch (shopError) {
          console.error(`Error sending brief for shop ${shop.id}:`, shopError);
        }
      }
    } catch (error) {
      console.error('Scheduler error:', error);
    }
  });
}
