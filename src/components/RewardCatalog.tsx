import { useQuery } from '@tanstack/react-query';
import { Gift, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export function RewardCatalog() {
  const query = useQuery({
    queryKey: ['reward-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase.from('data_packages_config')
        .select('id, package_name, data_amount, redemption_points')
        .eq('is_active', true).eq('is_discovery_root', false)
        .gt('redemption_points', 0).order('redemption_points').order('id');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30000, retry: false,
  });
  return <div className="border-t pt-3 space-y-2">
    <div className="font-semibold flex items-center gap-2"><Gift className="w-4 h-4 text-amber-600" /> Rewards</div>
    {query.isLoading && <p className="text-xs text-muted-foreground">Sugaya...</p>}
    {query.isError && <p className="text-xs text-muted-foreground">Abaalmarinnada lama soo heli karin.</p>}
    {query.isSuccess && !query.data.length && <p className="text-xs text-muted-foreground">Weli abaalmarin lama dejin.</p>}
    {query.data?.map(reward => <div key={reward.id} className="rounded-lg border p-3 flex items-center justify-between gap-2">
      <div className="min-w-0"><div className="font-medium truncate">{reward.package_name}</div><div className="text-xs text-muted-foreground">{reward.data_amount}</div></div>
      <div className="shrink-0 text-right"><div className="font-semibold text-amber-600">{reward.redemption_points.toLocaleString()} Points</div><div className="flex items-center justify-end gap-1 text-xs text-muted-foreground"><Lock className="w-3 h-3"/> Coming soon</div></div>
    </div>)}
  </div>;
}
