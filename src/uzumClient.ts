import { config } from './config.js';

const BASE_URL = 'https://api-seller.uzum.uz/api/seller-openapi';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQuery(params: Record<string, unknown> = {}): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, String(item));
      }
      continue;
    }
    searchParams.append(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

class AuthorizationError extends Error {}

async function fetchWithRetry<T>(token: string, path: string, params?: Record<string, unknown>): Promise<T> {
  const url = `${BASE_URL}${path}${buildQuery(params)}`;
  const maxAttempts = 3;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new AuthorizationError('Uzum API authorization failed. Проверяйте токен и shopId.');
      }

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Uzum API error ${response.status}: ${text}`);
      }

      return text ? JSON.parse(text) as T : (undefined as unknown as T);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }

      if (attempt >= maxAttempts) {
        throw new Error(`Uzum API request failed after ${attempt} attempts: ${error instanceof Error ? error.message : String(error)}`);
      }

      const backoff = 200 * 2 ** (attempt - 1);
      await sleep(backoff);
    }
  }

  throw new Error('Unreachable retry logic');
}

export interface UzumProductRequestOptions {
  sortBy?: string;
  order?: 'ASC' | 'DESC';
  page?: number;
  size?: number;
  filter?: string;
}

export class UzumClient {
  constructor(private token: string) {}

  async getShopProducts(shopId: number, options: UzumProductRequestOptions = {}) {
    return fetchWithRetry<unknown>(this.token, `/v1/product/shop/${shopId}`, {
      shopId,
      ...options,
    });
  }

  async fetchAllShopProducts(shopId: number, options: Partial<UzumProductRequestOptions> = {}) {
    const pageSize = options.size ?? 100;
    const result: unknown[] = [];
    let page = options.page ?? 0;
    let total = Number.MAX_SAFE_INTEGER;

    while (result.length < total && page < 20) {
      const pageResult = await this.getShopProducts(shopId, {
        ...options,
        page,
        size: pageSize,
      });

      const payload = pageResult as { productList?: unknown[]; totalProductsAmount?: number };
      const items = Array.isArray(payload.productList) ? payload.productList : [];
      if (total === Number.MAX_SAFE_INTEGER && typeof payload.totalProductsAmount === 'number') {
        total = payload.totalProductsAmount;
      }
      result.push(...items);
      if (!items.length) {
        break;
      }
      page += 1;
    }

    return { items: result, total: total === Number.MAX_SAFE_INTEGER ? result.length : total };
  }

  async getFinanceOrders(dateFrom: number, dateTo: number, shopIds: number[]) {
    return fetchWithRetry<unknown>(this.token, '/v1/finance/orders', {
      dateFrom,
      dateTo,
      page: 0,
      size: 200,
      shopIds,
      group: false,
    });
  }

  async getFinanceExpenses(dateFrom: number, dateTo: number, shopId: number) {
    return fetchWithRetry<unknown>(this.token, '/v1/finance/expenses', {
      dateFrom,
      dateTo,
      page: 0,
      size: 200,
      shopId,
    });
  }

  async getShops() {
    return fetchWithRetry<unknown[]>(this.token, '/v1/shops');
  }
}
