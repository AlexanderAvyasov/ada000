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

// Temporary in-memory store for tokens submitted during interactive /connect flow.
// Keyed by Telegram chat id. This is ephemeral and will be lost on process restart.
const pendingTokens = new Map<number, string>();

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

  // Backwards-compatible: /connect <shopId> <token>
  if (args.length >= 2) {
    const shopIdUzum = Number(args[0]);
    const apiToken = args[1];
    if (!shopIdUzum || !apiToken) {
      await ctx.reply('Некорректный shopId или токен.');
      return;
    }
    await createOrUpdateShop(user.id, shopIdUzum, apiToken, config.DEFAULT_BRIEF_TIME, config.DEFAULT_MIN_STOCK_DAYS, config.DEFAULT_ROI_THRESHOLD);
    await ctx.reply('Магазин сохранен. Дайджест будет приходить ежедневно в ' + config.DEFAULT_BRIEF_TIME + '. Используй /brief для теста.');
    return;
  }

  // New interactive flow: /connect <token>
  if (args.length === 1) {
    const apiToken = args[0] as string;
    // store token temporarily for this chat
    pendingTokens.set(chatId, apiToken);
    try {
      const uzum = new UzumClient(apiToken as string);
      const shops = (await uzum.getShops()) as any[];
      if (!Array.isArray(shops) || shops.length === 0) {
        await ctx.reply('Не найдено магазинов для этого токена. Проверьте токен.');
        pendingTokens.delete(chatId);
        return;
      }

      // build buttons: one per shop, plus "All shops"
      const buttons: { text: string; callback_data: string }[][] = [];
      for (const shop of shops) {
        const label = `${shop.id} — ${shop.name ?? shop.shop_title ?? ''}`.trim();
        buttons.push([{ text: label, callback_data: `connect:${shop.id}` }]);
      }
      buttons.push([{ text: 'Подключить все магазины', callback_data: 'connect:all' }]);

      await ctx.reply('Выберите магазин для подключения:', {
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (err) {
      await ctx.reply('Ошибка при получении списка магазинов: ' + (err instanceof Error ? err.message : String(err)));
      pendingTokens.delete(chatId);
    }
    return;
  }

  // No args — show usage
  await ctx.reply('Использование: /connect <uzum_api_token> или /connect <shopId> <uzum_api_token>');
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
  if (!payload) return;

  // brief: callback (existing)
  if (payload.startsWith('brief:')) {
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

    return;
  }

  // connect: callbacks (interactive connect flow)
  if (payload.startsWith('connect:')) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const token = pendingTokens.get(chatId);
    if (!token) {
      await ctx.answerCallbackQuery({ text: 'Токен просрочен. Отправьте /connect <token> снова.' });
      return;
    }

    const user = await getOrCreateUser(chatId);

    const [, action] = payload.split(':');
    if (action === 'all') {
      try {
        const uzum = new UzumClient(token);
        const shops = (await uzum.getShops()) as any[];
        let count = 0;
        for (const shop of shops) {
          await createOrUpdateShop(user.id, Number(shop.id), token, config.DEFAULT_BRIEF_TIME, config.DEFAULT_MIN_STOCK_DAYS, config.DEFAULT_ROI_THRESHOLD);
          count += 1;
        }
        pendingTokens.delete(chatId);
        await ctx.answerCallbackQuery({ text: `Подключено ${count} магазинов.` });
        await ctx.reply(`Подключено ${count} магазинов. Используйте /brief для теста.`);
      } catch (err) {
        await ctx.reply('Ошибка подключения всех магазинов: ' + (err instanceof Error ? err.message : String(err)));
      }
      return;
    }

    // single shop
    const shopId = Number(action);
    if (!shopId) {
      await ctx.answerCallbackQuery({ text: 'Неверный идентификатор магазина.' });
      return;
    }

    try {
      await createOrUpdateShop(user.id, shopId, token, config.DEFAULT_BRIEF_TIME, config.DEFAULT_MIN_STOCK_DAYS, config.DEFAULT_ROI_THRESHOLD);
      pendingTokens.delete(chatId);
      await ctx.answerCallbackQuery({ text: `Магазин ${shopId} подключён.` });
      await ctx.reply(`Магазин ${shopId} сохранён. Дайджест будет приходить ежедневно в ${config.DEFAULT_BRIEF_TIME}.`);
    } catch (err) {
      await ctx.reply('Ошибка сохранения магазина: ' + (err instanceof Error ? err.message : String(err)));
    }

    return;
  }
});
