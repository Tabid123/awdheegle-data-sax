import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ReversalAlert {
  id: string;
  amount: number;
  sender_phone: string;
  ussd_code: string;
  sms_body: string;
  created_at: string;
}

interface Props {
  iconClassName?: string;
  buttonClassName?: string;
}

export function ReversalAlertsHeader({ iconClassName, buttonClassName }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: alerts = [] } = useQuery({
    queryKey: ['reversal-alerts-24h'],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('reversal_alerts')
        .select('id, amount, sender_phone, ussd_code, sms_body, created_at')
        .is('dismissed_at', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as ReversalAlert[]) || [];
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('reversal-alerts-header')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reversal_alerts' },
        () => queryClient.invalidateQueries({ queryKey: ['reversal-alerts-24h'] })
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reversal_alerts', filter: 'dismissed_at=is.null' },
        () => queryClient.invalidateQueries({ queryKey: ['reversal-alerts-24h'] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const count = alerts.length;

  const dismiss = async (id: string) => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('reversal_alerts')
      .update({ dismissed_at: new Date().toISOString(), dismissed_by: userData.user?.id ?? null })
      .eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['reversal-alerts-24h'] });
  };

  const copyUssd = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      toast.success('La koobiyay');
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      toast.error('Copy fail');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative p-2 rounded-full hover:bg-white/20 transition-colors',
            buttonClassName
          )}
          title="Reversal Alerts (24 saac)"
        >
          <AlertTriangle
            className={cn(
              iconClassName || 'h-5 w-5',
              count > 0 ? 'text-red-300 animate-pulse' : 'text-white'
            )}
          />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center border border-white/40">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0 max-h-[70vh] overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b bg-muted/50">
          <div className="font-semibold text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Reversal Alerts (24 saac)
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Fariimaha lacag-celin ah ee 24-saacii la soo dhaafay
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {count === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Wax reversal ah ma jiraan
            </div>
          ) : (
            <ul className="divide-y">
              {alerts.map((a) => (
                <li key={a.id} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{format(new Date(a.created_at), 'dd MMM HH:mm')}</span>
                    <span className="font-bold text-destructive text-sm">
                      ${Number(a.amount).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Sender: </span>
                    <span className="font-mono">{a.sender_phone}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 font-mono text-xs bg-muted px-2 py-1 rounded truncate">
                      {a.ussd_code}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => copyUssd(a.id, a.ussd_code)}
                    >
                      {copiedId === a.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => dismiss(a.id)}>
                      Xaqiiji oo qari
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default ReversalAlertsHeader;