import { useQuery } from '@tanstack/react-query';
import { Gift, RefreshCw } from 'lucide-react';
import { rewardAccountPhone } from '@/lib/rewardAccountPhone';
import { loadRewardPreview } from '@/lib/rewardPreview';

export function RewardPreviewCard({ phone, compact = false }: {phone: string | null; compact?: boolean}) {
  const account = rewardAccountPhone(phone);
  const query = useQuery({
    queryKey: ['reward-preview', account],
    queryFn: () => loadRewardPreview(account!),
    enabled: !!account,
    staleTime: 15000,
    refetchOnMount: 'always',
    refetchInterval: 30000,
    retry: false,
  });
  if (!account) return null;
  return <section className="rounded-xl border border-amber-200 bg-card p-4 space-y-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 font-semibold"><Gift className="h-5 w-5 text-amber-600" /> My Points</div>
      <button type="button" aria-label="Refresh points" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} /></button>
    </div>
    <div className="text-2xl font-bold text-amber-600">{query.isError || !query.data ? '—' : query.data.points.toLocaleString()} Points</div>
    <p className="text-xs text-muted-foreground">Points sugaya xaqiijin — weli laguma beddelan karo abaalmarin.</p>
    {query.isError && <p className="text-xs text-destructive">Points-ka lama soo heli karin. Mar kale isku day.</p>}
    {!compact && !!query.data?.history.length && <div className="border-t pt-2 space-y-2">
      <div className="text-sm font-semibold">Points History</div>
      {query.data.history.map(row => <div key={row.id} className="flex items-center justify-between gap-2 text-sm">
        <div className="min-w-0"><div className="truncate">{row.package_name || 'Xirmo internet'}</div><div className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</div></div>
        <span className="shrink-0 font-semibold text-amber-600">+{row.reward_points_snapshot}</span>
      </div>)}
    </div>}
  </section>;
}
