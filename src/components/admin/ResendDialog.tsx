// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Clock } from 'lucide-react';
import { toast } from 'sonner';

function normalizeSomaliPhone(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('252') && digits.length >= 12) digits = digits.substring(3);
  if (digits.startsWith('0') && digits.length === 10) digits = digits.substring(1);
  return digits.slice(-9);
}

export interface ResendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSender?: string;
  defaultAmount?: number;
  defaultReceiver?: string;
  defaultReceiverSim?: string;
  defaultProviderId?: string;
  paymentReceiptId?: string; // if set, mark this receipt matched on success
  onSuccess?: (orderId: string) => void;
}

export const ResendDialog: React.FC<ResendDialogProps> = ({
  open,
  onOpenChange,
  defaultSender = '',
  defaultAmount = 0,
  defaultReceiver = '',
  defaultReceiverSim,
  defaultProviderId = '',
  paymentReceiptId,
  onSuccess,
}) => {
  const [providers, setProviders] = useState<any[]>([]);
  const [providerId, setProviderId] = useState(defaultProviderId);
  const [categoryId, setCategoryId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [receiver, setReceiver] = useState(normalizeSomaliPhone(defaultReceiver));
  const [amount, setAmount] = useState<number>(Number(defaultAmount) || 0);
  const [categories, setCategories] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>('');

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setProviderId(defaultProviderId || '');
      setCategoryId('');
      setPackageId('');
      setReceiver(normalizeSomaliPhone(defaultReceiver || ''));
      setAmount(Number(defaultAmount) || 0);
      setScheduleEnabled(false);
      setScheduleAt('');
    }
  }, [open, defaultProviderId, defaultReceiver, defaultAmount]);

  useEffect(() => {
    supabase.from('providers_config').select('id, display_name, provider_name').order('sort_order')
      .then(({ data }) => setProviders(data || []));
  }, []);

  useEffect(() => {
    if (!providerId) { setCategories([]); setPackages([]); return; }
    supabase
      .from('package_categories')
      .select('id, category_name')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setCategories(data || []));
    setCategoryId('');
  }, [providerId]);

  useEffect(() => {
    if (!providerId) return;
    let q = supabase
      .from('data_packages_config')
      .select('id, package_name, data_amount, price, cost_price, ussd_template, category_id, provider_id')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('sort_order');
    if (categoryId) q = q.eq('category_id', categoryId);
    q.then(({ data }) => setPackages(data || []));
    setPackageId('');
  }, [providerId, categoryId]);

  const submit = async () => {
    if (!providerId) { toast.error('Dooro provider'); return; }
    if (!packageId) { toast.error('Dooro package'); return; }
    if (!receiver || receiver.replace(/\D/g, '').length < 7) {
      toast.error('Buuxi numberka qaataha'); return;
    }
    let scheduledAtIso: string | null = null;
    let delaySeconds = 0;
    if (scheduleEnabled) {
      if (!scheduleAt) { toast.error('Dooro waqtiga jadwalka'); return; }
      const dt = new Date(scheduleAt);
      if (isNaN(dt.getTime())) { toast.error('Waqti khalad ah'); return; }
      const diffMs = dt.getTime() - Date.now();
      if (diffMs < 0) { toast.error('Waqtiga waa inuu mustaqbalka ahaadaa'); return; }
      scheduledAtIso = dt.toISOString();
      delaySeconds = Math.floor(diffMs / 1000);
    }
    setSaving(true);
    try {
      const pkg = packages.find((p) => p.id === packageId);
      if (!pkg) throw new Error('Package not found');
      const provider = providers.find((p) => p.id === providerId);
      const providerSlug = (provider?.provider_name || '').toLowerCase().trim();

      const normalizePhone = (s: string) => {
        let p = s.replace(/\D/g, '');
        if (p.startsWith('252')) p = p.slice(3);
        if (p.startsWith('0')) p = p.slice(1);
        return p;
      };
      const formatAmount = (n: number) =>
        Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', '*');
      const sanitize = (c: string) => c.replace(/\s+/g, '').replace(/##+/g, '#');
      const renderTpl = (tpl: string, simPwd: string) =>
        sanitize(
          tpl
            .replace(/\{receiver_phone\}|\{phone\}|\{number\}|\{receiver\}/g, normalizePhone(receiver))
            .replace(/\{cost_price\}|\{amount\}|\{price\}/g, formatAmount(Number(pkg.cost_price ?? pkg.price ?? 0)))
            .replace(/\{sim_password\}/g, simPwd || '5516')
            .replace(/\{package_code\}/g, '')
        );

      let ussd: string | null = null;
      const { data: instrPkg } = await supabase
        .from('delivery_instructions')
        .select('code_template, sim_password')
        .eq('provider_id', providerId)
        .eq('package_id', pkg.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (instrPkg?.code_template) ussd = renderTpl(instrPkg.code_template, instrPkg.sim_password || '5516');
      if (!ussd && pkg.category_id) {
        const { data: instrCat } = await supabase
          .from('delivery_instructions')
          .select('code_template, sim_password')
          .eq('provider_id', providerId)
          .eq('category_id', pkg.category_id)
          .is('package_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (instrCat?.code_template) ussd = renderTpl(instrCat.code_template, instrCat.sim_password || '5516');
      }
      if (!ussd) {
        const { data: instrProv } = await supabase
          .from('delivery_instructions')
          .select('code_template, sim_password')
          .eq('provider_id', providerId)
          .is('category_id', null)
          .is('package_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (instrProv?.code_template) ussd = renderTpl(instrProv.code_template, instrProv.sim_password || '5516');
      }
      if (!ussd && pkg.ussd_template) ussd = renderTpl(pkg.ussd_template, '5516');
      if (!ussd) throw new Error('USSD template lama helin package-kaan');

      const receiverFormatted = (() => {
        let p = receiver.replace(/\D/g, '');
        if (!p.startsWith('252')) p = '252' + p;
        return p;
      })();

      const { data: devices } = await supabase
        .from('android_devices')
        .select('sim1_provider, sim2_provider')
        .eq('is_active', true)
        .is('archived_at', null);
      let simSlot = 1;
      for (const d of devices || []) {
        const p1 = (d.sim1_provider || '').toLowerCase();
        const p2 = (d.sim2_provider || '').toLowerCase();
        if (p1 && (p1.includes(providerSlug) || providerSlug.includes(p1))) { simSlot = 1; break; }
        if (p2 && (p2.includes(providerSlug) || providerSlug.includes(p2))) { simSlot = 2; break; }
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          amount: Number(amount) || Number(pkg.price) || 0,
          receiver_phone: receiverFormatted,
          sender_phone: defaultSender || null,
          package_id: pkg.id,
          provider_id: providerId,
          payment_status: 'matched',
          status: scheduleEnabled ? 'pending' : 'processing',
          is_manual: true,
          is_offline: false,
          delivery_notes: scheduleEnabled
            ? `Dib u dir (Scheduled @ ${scheduledAtIso})`
            : 'Dib u dir (manual)',
        })
        .select('id')
        .single();
      if (orderError) throw orderError;

      const queuePayload: any = {
        order_id: order.id,
        package_id: pkg.id,
        execution_order: 1,
        delay_seconds: delaySeconds,
        status: 'pending',
        ussd_command: ussd,
        ussd_code: ussd,
        provider_name: providerSlug,
        receiver_phone: receiver,
        sim_slot: simSlot,
      };
      if (scheduledAtIso) queuePayload.scheduled_at = scheduledAtIso;
      const { error: queueError } = await supabase.from('delivery_queue').insert(queuePayload);
      if (queueError) throw queueError;

      if (paymentReceiptId) {
        await supabase
          .from('payment_receipts')
          .update({ status: 'matched', matched_order_id: order.id })
          .eq('id', paymentReceiptId);
      }

      toast.success(scheduleEnabled ? 'Waa la jadwaleeyay' : 'Dalabka waa la diray');
      onSuccess?.(order.id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Khalad: ' + (e?.message || 'failed'));
    } finally {
      setSaving(false);
    }
  };

  // Default schedule value: now + 5 min
  const defaultScheduleValue = () => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" /> Dib u Dir Dalabka
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {defaultSender && <>Sender: <span className="font-mono">{defaultSender}</span>{' • '}</>}
            Lacag: <span className="font-semibold">${amount}</span>
            {defaultReceiverSim && <> {' • '}SIM: {defaultReceiverSim}</>}
          </p>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Provider / Shirkadda</label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm"
            >
              <option value="">Dooro provider</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name || p.provider_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">
              Category <span className="text-muted-foreground">(ikhtiyaari)</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={!providerId}
              className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm disabled:opacity-50"
            >
              <option value="">Dhammaan</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.category_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">Package</label>
            <select
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
              disabled={!providerId || packages.length === 0}
              className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm disabled:opacity-50"
            >
              <option value="">Dooro package</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.package_name}{p.data_amount ? ` - ${p.data_amount}` : ''} (${p.price})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">Numberka Qaataha</label>
            <Input
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              placeholder="61XXXXXXX"
              className="font-mono mt-1"
            />
          </div>

          {/* Schedule section */}
          <div className="border-t pt-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => {
                  setScheduleEnabled(e.target.checked);
                  if (e.target.checked && !scheduleAt) setScheduleAt(defaultScheduleValue());
                }}
                className="h-4 w-4"
              />
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Jadwalee (Schedule) — dir markii waqtiga la gaaro</span>
            </label>
            {scheduleEnabled && (
              <div className="mt-2">
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Dalabku wuxuu toos u dirmi doonaa marka waqtigaan la gaaro.
                </p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Ka noqo
          </Button>
          <Button onClick={submit} disabled={saving} className="flex-1 gap-1">
            {scheduleEnabled ? <Clock className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {saving ? 'Sugaya...' : scheduleEnabled ? 'Jadwalee' : 'Dib u Dir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ResendDialog;