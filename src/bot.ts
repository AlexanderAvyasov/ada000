// grammY chosen because it is lightweight, modern, and offers strong TypeScript support.
// It suits an MVP bot better than a heavier framework when we only need commands and inline buttons.
// grammY chosen because it is lightweight, modern, and offers strong TypeScript support.
// It is a good fit for MVP bot functionality with commands and inline buttons.
import { Bot } from 'grammy';
import { config } from './config.js';
import { getOrCreateUser } from './db/users.js';
import { createOrUpdateShop, getShopsByUserId, updateShopSettings, disableShop, getShopById, decryptShopToken } from './db/shops.js';
import { UzumClient } from './uzumClient.js';
import { computeProductMetrics, computeOverdueOrders, computeProfitSummary } from './metrics.js';
import { buildBriefText, buildBriefButtons, formatDetails } from './briefFormatter.js';
import { createDailySnapshot } from './db/snapshots.js';

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

bot.command('start', async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  await getOrCreateUser(chatId);
  await ctx.reply('Привет! Я SellerPilot Daily Brief. Отправь /connect, чтобы привязать Uzum магазин.');
});

bot.command('connect', async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await getOrCreateUser(chatId);
  const text = ctx.message?.text ?? '';
  const args = text.split(' ').slice(1);
  if (args.length < 2) {
    await ctx.reply('Использование: /connect <shopId> <uzum_api_token>');
    return;
  }
  const shopIdUzum = Number(args[0]);
  const apiToken = args[1];
  if (!shopIdUzum || !apiToken) {
    await ctx.reply('Некорректный shopId или токен.');
    return;
  }
  await createOrUpdateShop(user.id, shopIdUzum, apiToken, config.DEFAULT_BRIEF_TIME, config.DEFAULT_MIN_STOCK_DAYS, config.DEFAULT_ROI_THRESHOLD);
  await ctx.reply('Магазин сохранен. Дайджест будет приходить ежедневно в ' + config.DEFAULT_BRIEF_TIME + '. Используй /brief для теста.');
});

bot.command('brief', async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await getOrCreateUser(chatId);
  const shops = await getShopsByUserId(user.id);
  if (!shops.length) {
    await ctx.reply('У вас нет подключенных магазинов. Используйте /connect <shopId> <token>.');
    return;
  }

  for (const shop of shops) {
    try {
      const token = decryptShopToken(shop);
      const uzum = new UzumClient(token);
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const dateFrom = Math.floor(new Date(yesterday.toDateString()).getTime() / 1000);
      const dateTo = Math.floor(new Date(now.toDateString()).getTime() / 1000) - 1;
      const productsResult = await uzum.fetchAllShopProducts(shop.shop_id_uzum, { sortBy: 'LEFTOVERS', order: 'ASC', filter: 'WARNING', size: 100 });
      const ordersResponse = await uzum.getFinanceOrders(dateFrom, dateTo, [shop.shop_id_uzum]);
      const expensesResponse = await uzum.getFinanceExpenses(dateFrom, dateTo, shop.shop_id_uzum);
      const products = Array.isArray((productsResult as any).items)
        ? (productsResult as any).items
        : Array.isArray((productsResult as any).productList)
        ? (productsResult as any).productList
        : [];
      const orders = Array.isArray((ordersResponse as any).payload?.orders)
        ? (ordersResponse as any).payload.orders
        : [];
      const expenses = Array.isArray((expensesResponse as any).payload)
        ? (expensesResponse as any).payload
        : Array.isArray((expensesResponse as any).expenses)
        ? (expensesResponse as any).expenses
        : [];
      const productMetrics = computeProductMetrics(
        products,
        Number(shop.min_stock_days ?? config.DEFAULT_MIN_STOCK_DAYS),
        Number(shop.roi_threshold_percent ?? config.DEFAULT_ROI_THRESHOLD),
        10,
      );
      const overdue = computeOverdueOrders(orders);
      const profitSummary = computeProfitSummary(expenses, orders);
      const metrics = { ...productMetrics, overdueOrders: overdue, profitSummary };
      const [snapshotDate = new Date().toISOString()] = new Date().toISOString().split('T');
      await createDailySnapshot(shop.id, snapshotDate, { products: productsResult, orders: ordersResponse, expenses: expensesResponse }, metrics);
      const text = buildBriefText(`Uzum shop ${shop.shop_id_uzum}`, metrics);
      const buttons = buildBriefButtons(shop.id);
      await ctx.reply(text, {
        reply_markup: { inline_keyboard: [buttons] },
      });
    } catch (error) {
      await ctx.reply(`Ошибка при получении дайджеста для магазина ${shop.shop_id_uzum}: ${(error as Error).message}`);
    }
  }
});

bot.command('settings', async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await getOrCreateUser(chatId);
  const shops = await getShopsByUserId(user.id);
  if (!shops.length) {
    await ctx.reply('У вас нет подключенных магазинов. Используйте /connect <shopId> <token>.');
    return;
  }

  const text = ctx.message?.text ?? '';
  const args = text.split(' ').slice(1);
  if (args.length < 4) {
    await ctx.reply('Использование: /settings <shopDbId> <brief_time HH:MM> <min_stock_days> <roi_threshold_percent>');
    return;
  }

  const shopDbId = Number(args[0]);
  const briefTime = args[1];
  const minStockDays = Number(args[2]);
  const roiThresholdPercent = Number(args[3] ?? config.DEFAULT_ROI_THRESHOLD);
  const shop = shops.find((item) => item.id === shopDbId);
  if (!shop) {
    await ctx.reply('Магазин не найден. Проверьте shopDbId.');
    return;
  }

  await updateShopSettings(shop.id, { brief_time: briefTime, min_stock_days: minStockDays, roi_threshold_percent: roiThresholdPercent });
  await ctx.reply(`Настройки сохранены для магазина ${shop.shop_id_uzum}.`);
});

bot.command('stop', async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const user = await getOrCreateUser(chatId);
  const shops = await getShopsByUserId(user.id);
  if (!shops.length) {
    await ctx.reply('У вас нет подключенных магазинов.');
    return;
  }
  for (const shop of shops) {
    await disableShop(shop.id);
  }
  await ctx.reply('Рассылка отключена, данные магазина сохранены.');
});

bot.on('callback_query:data', async (ctx) => {
  const payload = ctx.callbackQuery.data;
  if (!payload || !payload.startsWith('brief:')) return;
  const shopId = Number(payload.split(':')[1]);
  const shop = await getShopById(shopId);
  if (!shop) {
    await ctx.answerCallbackQuery({ text: 'Магазин не найден.' });
    return;
  }

  try {
    const token = decryptShopToken(shop);
    const uzum = new UzumClient(token);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const dateFrom = Math.floor(new Date(yesterday.toDateString()).getTime() / 1000);
    const dateTo = Math.floor(new Date(now.toDateString()).getTime() / 1000) - 1;

    const productsResult = await uzum.fetchAllShopProducts(shop.shop_id_uzum, { sortBy: 'LEFTOVERS', order: 'ASC', filter: 'WARNING', size: 100 });
    const ordersResponse = await uzum.getFinanceOrders(dateFrom, dateTo, [shop.shop_id_uzum]);
    const expensesResponse = await uzum.getFinanceExpenses(dateFrom, dateTo, shop.shop_id_uzum);
    const products = Array.isArray((productsResult as any).items)
      ? (productsResult as any).items
      : Array.isArray((productsResult as any).productList)
      ? (productsResult as any).productList
      : [];
    const orders = Array.isArray((ordersResponse as any).payload?.orders)
      ? (ordersResponse as any).payload.orders
      : [];
    const expenses = Array.isArray((expensesResponse as any).payload)
      ? (expensesResponse as any).payload
      : Array.isArray((expensesResponse as any).expenses)
      ? (expensesResponse as any).expenses
      : [];
    const productMetrics = computeProductMetrics(
      products,
      Number(shop.min_stock_days ?? config.DEFAULT_MIN_STOCK_DAYS),
      Number(shop.roi_threshold_percent ?? config.DEFAULT_ROI_THRESHOLD),
      10,
    );
    const overdue = computeOverdueOrders(orders);
    const profitSummary = computeProfitSummary(expenses, orders);
    const metrics = { ...productMetrics, overdueOrders: overdue, profitSummary };
    const details = formatDetails(metrics);
    await ctx.answerCallbackQuery();
    await ctx.reply(details);
  } catch (error) {
    await ctx.reply('Ошибка получения подробностей: ' + (error instanceof Error ? error.message : String(error)));
  }
});
