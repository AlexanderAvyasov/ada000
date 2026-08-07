import { supabase } from './client.js';

export interface SnapshotRow {
  id: number;
  shop_id: number;
  date: string;
  raw_payload: unknown;
  computed_metrics: unknown;
  created_at: string;
}

export async function createDailySnapshot(
  shopId: number,
  date: string,
  rawPayload: unknown,
  computedMetrics: unknown,
): Promise<SnapshotRow> {
  const { data, error } = await supabase
    .from('daily_snapshots')
    .insert({ shop_id: shopId, date, raw_payload: rawPayload, computed_metrics: computedMetrics })
    .select()
    .maybeSingle();

  if (error || !data) {
    throw error ?? new Error('Failed to insert snapshot');
  }

  return data;
}
