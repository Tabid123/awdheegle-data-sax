import { supabase } from '@/integrations/supabase/client';
import { rewardAccountPhone } from '@/lib/rewardAccountPhone';

export type RewardPreviewRow = { id: string; package_name: string | null; reward_points_snapshot: number; created_at: string; tx_id: string | null };
export async function loadRewardPreview(rawPhone: string) {
  const phone = rewardAccountPhone(rawPhone);
  if (!phone) return { points: 0, history: [] as RewardPreviewRow[] };
  const seen = new Set<string>();
  const history: RewardPreviewRow[] = [];
  let points = 0;
  const pageSize = 250;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('orders')
      .select('id, package_name, reward_points_snapshot, created_at, tx_id')
      .eq('reward_account_phone', phone)
      .eq('status', 'completed')
      .eq('delivery_status', 'delivered')
      .in('payment_source', ['ussd_online', 'sms_offline'])
      .gt('reward_points_snapshot', 0)
      .not('tx_id', 'is', null)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const key = row.tx_id?.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      points += row.reward_points_snapshot;
      if (history.length < 20) history.push(row);
    }
    if (!data || data.length < pageSize) break;
  }
  return { points, history };
}

// Public package configuration only; do not read sensitive fields.
export async function withPackageRewardPoints<T extends {id: string}>(packages: T[], providerId: string): Promise<(T & {reward_points?: number; reward_value?: number; reward_value_unit?: string})[]> {
  if (!packages.length) return packages;
  const { data, error } = await supabase.from('data_packages_config')
    .select('id, reward_points, reward_value, reward_value_unit').eq('provider_id', providerId).eq('is_active', true);
  if (error) return packages;
  const byId = new Map((data || []).map(p => [p.id, p]));
  return packages.map(p => ({ ...p, reward_points: byId.get(p.id)?.reward_points ?? 0, reward_value: byId.get(p.id)?.reward_value ?? 0, reward_value_unit: byId.get(p.id)?.reward_value_unit ?? 'USD' }));
}
