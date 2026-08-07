export interface ProductMetricsInput {
  skuId?: number;
  skuTitle?: string;
  productTitle?: string;
  quantityActive?: number;
  avgdsales?: number;
  roi?: number;
  price?: number;
  purchasePrice?: number;
  commission?: number;
  sellPrice?: number;
  priceHistory?: Array<{ date: string; price: number }>;
  quantityFbs?: number;
}

export interface ShopMetricsResult {
  lowStock: ProductMetricsInput[];
  lowRoi: ProductMetricsInput[];
  priceAlerts: ProductMetricsInput[];
  overdueOrders: unknown[];
  profitSummary: {
    revenue: number;
    commission: number;
    logistics: number;
    returns: number;
    profit: number;
    note: string;
  };
}

function safeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function computeProductMetrics(
  products: any[],
  minStockDays: number,
  roiThresholdPercent: number,
  priceChangePercent: number,
): Pick<ShopMetricsResult, 'lowStock' | 'lowRoi' | 'priceAlerts'> {
  const lowStock: ProductMetricsInput[] = [];
  const lowRoi: ProductMetricsInput[] = [];
  const priceAlerts: ProductMetricsInput[] = [];

  for (const item of products) {
    const sku = item as any;
    const quantityActive = safeNumber(sku.quantityActive ?? sku.quantityActive);
    const avgdsales = safeNumber(sku.avgdsales ?? sku.avgdquantity ?? 0);
    const roi = safeNumber(sku.roi ?? sku.ROI ?? 0);
    const price = safeNumber(sku.price ?? sku.sellPrice ?? 0);
    const purchasePrice = safeNumber(sku.purchasePrice ?? 0);
    const commission = safeNumber(sku.commission ?? (sku.commissionDto?.percent ?? 0));
    const priceHistory = Array.isArray(sku.priceHistory) ? sku.priceHistory : [];

    const expectedDays = avgdsales > 0 ? quantityActive / avgdsales : Number.POSITIVE_INFINITY;
    if (expectedDays < minStockDays) {
      lowStock.push({ skuId: safeNumber(sku.skuId), skuTitle: sku.skuTitle, productTitle: sku.productTitle, quantityActive, avgdsales, roi, price, purchasePrice, commission, priceHistory, quantityFbs: safeNumber(sku.quantityFbs) });
    }

    if (roi > 0 && roi < roiThresholdPercent) {
      lowRoi.push({ skuId: safeNumber(sku.skuId), skuTitle: sku.skuTitle, productTitle: sku.productTitle, quantityActive, avgdsales, roi, price, purchasePrice, commission, priceHistory, quantityFbs: safeNumber(sku.quantityFbs) });
    }

    if (priceHistory.length >= 2) {
      const sorted = priceHistory.slice().sort((a: { date: string; price: number }, b: { date: string; price: number }) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const last = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      const lastPrice = safeNumber(last.price);
      const prevPrice = safeNumber(prev.price);
      if (prevPrice > 0) {
        const deltaPercent = Math.abs((lastPrice - prevPrice) / prevPrice) * 100;
        if (deltaPercent >= priceChangePercent) {
          priceAlerts.push({ skuId: safeNumber(sku.skuId), skuTitle: sku.skuTitle, productTitle: sku.productTitle, price, purchasePrice, commission, roi, quantityActive, avgdsales, priceHistory, quantityFbs: safeNumber(sku.quantityFbs) });
        }
      }
    }
  }

  return { lowStock, lowRoi, priceAlerts };
}

export function computeOverdueOrders(orders: any[]): unknown[] {
  const overdue: unknown[] = [];

  for (const order of orders) {
    const status = order.status ?? order.orderStatus ?? '';
    const acceptUntil = order.acceptUntil ? new Date(order.acceptUntil) : null;
    const deliverUntil = order.deliverUntil ? new Date(order.deliverUntil) : null;
    const now = new Date();

    if (acceptUntil && status === 'PROCESSING' && acceptUntil < now) {
      overdue.push(order);
    } else if (deliverUntil && ['PROCESSING', 'ACCEPTED', 'CONFIRMED'].includes(String(status).toUpperCase()) && deliverUntil < now) {
      overdue.push(order);
    }
  }

  return overdue;
}

export function computeProfitSummary(expenses: any[], orders: any[]): ShopMetricsResult['profitSummary'] {
  const revenue = orders.reduce((sum, order) => sum + safeNumber(order.price ?? order.totalPrice ?? 0), 0);
  let commission = 0;
  let logistics = 0;
  let returns = 0;

  for (const expense of expenses) {
    const amount = safeNumber(expense.amount ?? expense.price ?? expense.sum ?? 0);
    const source = String(expense.source ?? expense.type ?? '').toLowerCase();
    if (source.includes('commission')) {
      commission += amount;
    } else if (source.includes('logistic') || source.includes('transport') || source.includes('delivery')) {
      logistics += amount;
    } else if (source.includes('return') || source.includes('refund')) {
      returns += amount;
    } else {
      commission += 0;
    }
  }

  const profit = revenue - commission - logistics - returns;
  const note = expenses.length === 0 ? 'нет данных по расходам, посчитана только выручка' : 'рассчитано по доступным данным расходов';

  return { revenue, commission, logistics, returns, profit, note };
}
