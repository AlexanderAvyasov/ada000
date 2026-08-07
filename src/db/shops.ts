import { supabase } from './client.js';
import { decryptText, encryptText } from '../utils/crypto.js';

export interface ShopRow {
  id: number;
  user_id: number;
  shop_id_uzum: number;
  api_token_encrypted: string;
  brief_time: string;
  min_stock_days: number;
  roi_threshold_percent: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShopWithChatRow extends ShopRow {
  telegram_chat_id: number;
}

export async function getShopsByUserId(userId: number): Promise<ShopRow[]> {
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getActiveShops(): Promise<ShopRow[]> {
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('active', true);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getActiveShopsWithChat(): Promise<ShopWithChatRow[]> {
  const { data, error } = await supabase
    .from('shops')
    .select('*, user:users(telegram_chat_id)')
    .eq('active', true);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    ...row,
    telegram_chat_id: row.user?.telegram_chat_id,
  }));
}

export async function getShopById(id: number): Promise<ShopRow | null> {
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function createOrUpdateShop(
  userId: number,
  shopIdUzum: number,
  apiToken: string,
  briefTime: string,
  minStockDays: number,
  roiThresholdPercent: number,
): Promise<ShopRow> {
  const encrypted = encryptText(apiToken);
  const values = {
    user_id: userId,
    shop_id_uzum: shopIdUzum,
    api_token_encrypted: encrypted,
    brief_time: briefTime,
    min_stock_days: minStockDays,
    roi_threshold_percent: roiThresholdPercent,
    active: true,
  };

  const { data, error } = await supabase
    .from('shops')
    .upsert(values, { onConflict: 'user_id,shop_id_uzum' })
    .select()
    .maybeSingle();

  if (error || !data) {
    throw error ?? new Error('Failed to create or update shop');
  }

  return data;
}

export async function updateShopSettings(
  shopId: number,
  settings: Partial<Pick<ShopRow, 'brief_time' | 'min_stock_days' | 'roi_threshold_percent' | 'active'>>,
): Promise<ShopRow> {
  const { data, error } = await supabase
    .from('shops')
    .update(settings)
    .eq('id', shopId)
    .select()
    .maybeSingle();

  if (error || !data) {
    throw error ?? new Error('Failed to update shop settings');
  }

  return data;
}

export async function disableShop(shopId: number): Promise<ShopRow> {
  return updateShopSettings(shopId, { active: false });
}

export function decryptShopToken(shop: ShopRow): string {
  return decryptText(shop.api_token_encrypted);
}
