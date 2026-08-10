import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Trash2, Clock, Loader2 } from 'lucide-react';

const OPTIONS = [15, 30, 60, 90];

const DataRetentionSettings = () => {
  const [days, setDays] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const { data, error } = await (supabase as any).rpc('get_data_retention_days');
    if (!error) setDays(Number(data));
  };

  useEffect(() => { load(); }, []);

  const save = async (value: number) => {
    setSaving(value);
    const { error } = await (supabase as any).rpc('set_data_retention_days', { p_days: value });
    setSaving(null);
    if (error) { toast.error('Ma suurtagalin: ' + error.message); return; }
    setDays(value);
    toast.success(`Xogta hadda ${value} maalmood ayaa la keydinayo`);
  };

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await (supabase as any).rpc('admin_run_cleanup');
    setRunning(false);
    if (error) { toast.error('Ma suurtagalin: ' + error.message); return; }
    const d = (data || {}) as Record<string, any>;
    toast.success(
      `La tirtiray: ${d.orders ?? 0} dalab, ${d.sms_logs ?? 0} SMS, ${d.payment_receipts ?? 0} receipt`
    );
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Clock className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground">Mudada Xogta La Keydinayo</h3>
          <p className="text-sm text-muted-foreground">
            Log-yada iyo dalabyada duugoobay ayaa otomaatig ah la tirtiraa maalin walba.
            Xisaabta dalabyada weligeed lama tirtirayo, sidoo kale xogta aasaasiga (macaamiisha,
            offline registration, USSD codes) iyo ogeysiisyada.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => (
          <Button
            key={opt}
            size="sm"
            variant={days === opt ? 'default' : 'outline'}
            disabled={saving !== null}
            onClick={() => save(opt)}
            className="min-w-[92px]"
          >
            {saving === opt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `${opt} maalmood`}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-border">
        <Badge variant="secondary">
          Hadda: {days === null ? '...' : `${days} maalmood`}
        </Badge>
        <Button size="sm" variant="destructive" onClick={runNow} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
          Nadiifi Hadda
        </Button>
      </div>
    </Card>
  );
};

export default DataRetentionSettings;
