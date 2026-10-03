import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const SimDeliveryToggle = ({ deviceId, slot, enabled, isSo, onUpdate }: {
  deviceId: string; slot: 1 | 2; enabled: boolean; isSo: boolean; onUpdate: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(enabled);
  useEffect(() => setActive(enabled), [enabled]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('android_devices')
        .update({ [`sim${slot}_delivery_enabled`]: !active })
        .eq('id', deviceId).select('id').single();
      if (error || !data) throw error || new Error('Device update failed');
      setActive(!active);
      toast.success(isSo ? (active ? `SIM ${slot}: lacag-dirista waa la xiray` : `SIM ${slot}: lacag-dirista waa la furay`)
        : (active ? `SIM ${slot}: sending disabled` : `SIM ${slot}: sending enabled`));
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || (isSo ? 'Lama kaydin. Mar kale isku day.' : 'Could not save. Try again.'));
    } finally { setBusy(false); }
  };

  return <button type="button" role="switch" aria-checked={active} disabled={busy} onClick={toggle}
    className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${active ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
    SIM {slot} · {isSo ? 'Lacag-dirista' : 'Sending'}: {busy ? '…' : active ? 'ON' : 'OFF'}
  </button>;
};
