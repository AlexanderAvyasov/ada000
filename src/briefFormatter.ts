import { ShopMetricsResult } from './metrics.js';

export function buildBriefText(shopName: string, metrics: ShopMetricsResult): string {
  const lowStockCount = metrics.lowStock.length;
  const lowRoiCount = metrics.lowRoi.length;
  const priceAlertsCount = metrics.priceAlerts.length;
  const overdueCount = metrics.overdueOrders.length;
  const profit = metrics.profitSummary.profit;
  const revenue = metrics.profitSummary.revenue;
  const note = metrics.profitSummary.note;

  return [`Доброе утро!`, '', `Сегодня по магазину ${shopName}:`, `• ${lowStockCount} товаров скоро закончатся`, `• ${lowRoiCount} товаров с низким ROI`, `• ${priceAlertsCount} товаров с резким изменением цены`, `• ${overdueCount} заказов просрочены`, '', `Прибыль за вчера: ${profit.toLocaleString('ru-RU')} сум`, '', `${note}`].join('\n');
}

export function buildBriefButtons(shopId: number): { text: string; callback_data: string }[] {
  return [
    { text: 'Подробнее', callback_data: `brief:${shopId}` },
  ];
}

export function formatDetails(metrics: ShopMetricsResult): string {
  const sections: string[] = [];

  const formatItems = (title: string, items: any[]) => {
    if (!items.length) return `${title}: нет элементов\n`;
    const lines = items.slice(0, 10).map((item) => {
      const titleText = item.skuTitle ?? item.productTitle ?? `SKU ${item.skuId}`;
      return `- ${titleText} (${item.quantityActive ?? 0} шт, ROI ${item.roi ?? 'n/a'})`;
    });
    return `${title}:\n${lines.join('\n')}\n`;
  };

  sections.push(formatItems('Товары на грани остатка', metrics.lowStock));
  sections.push(formatItems('Товары с низким ROI', metrics.lowRoi));
  sections.push(formatItems('Товары с резким изменением цены', metrics.priceAlerts));
  sections.push(`Просроченные заказы: ${metrics.overdueOrders.length}\n`);

  return sections.join('\n');
}
