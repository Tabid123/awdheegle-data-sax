import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Package, Send, FileText, CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

function normalizePhoneForUssd(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('252')) p = p.slice(3);
  if (p.startsWith('0')) p = p.slice(1);
  return p;
}

function formatPhoneForStorage(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (!p.startsWith('252')) p = '252' + p;
  return p;
}

interface Provider {
  id: string;
  provider_name: string;
}

interface DataPackage {
  id: string;
  package_name: string;
  data_amount: string | null;
  price: number;
  ussd_template: string | null;
  cost_price?: number | null;
  category_id?: string | null;
  provider_id?: string | null;
}

interface DeliveryRule {
  id: string;
  target_package_id: string;
  delay_seconds: number;
  execution_order: number;
  target_package?: DataPackage;
}

interface AddManualDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
  deviceName: string;
  simSlot: 1 | 2;
  providerName: string;
  onSuccess: () => void;
}

export const AddManualDeliveryDialog: React.FC<AddManualDeliveryDialogProps> = ({
  open,
  onOpenChange,
  deviceName,
  simSlot,
  providerName,
  onSuccess,
}) => {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [packages, setPackages] = useState<DataPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [bundleRules, setBundleRules] = useState<DeliveryRule[]>([]);
  const [autoDeliver, setAutoDeliver] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const loadProviders = async () => {
      const { data } = await supabase
        .from('providers_config')
        .select('id, provider_name')
        .eq('is_active', true)
        .order('sort_order');

      if (data) {
        setProviders(data);
        const matchingProvider = data.find(
          (provider) => provider.provider_name.toLowerCase() === providerName.toLowerCase()
        );
        if (matchingProvider) {
          setSelectedProviderId(matchingProvider.id);
        }
      }
    };

    if (open) {
      loadProviders();
    }
  }, [open, providerName]);

  useEffect(() => {
    const loadPackages = async () => {
      if (!selectedProviderId) {
        setPackages([]);
        return;
      }

      setLoadingPackages(true);
      const { data } = await supabase
        .from('data_packages_config')
        .select('id, package_name, data_amount, price, ussd_template, cost_price, category_id, provider_id')
        .eq('provider_id', selectedProviderId)
        .eq('is_active', true)
        .order('price');

      setPackages((data ?? []) as DataPackage[]);
      setLoadingPackages(false);
    };

    loadPackages();
  }, [selectedProviderId]);

  useEffect(() => {
    const loadBundleRules = async () => {
      if (!selectedPackageId) {
        setBundleRules([]);
        return;
      }

      const { data: rules } = await supabase
        .from('package_delivery_rules')
        .select('id, target_package_id, delay_seconds, execution_order')
        .eq('source_package_id', selectedPackageId)
        .order('execution_order');

      if (!rules || rules.length === 0) {
        setBundleRules([]);
        return;
      }

      const targetIds = rules.map((rule) => rule.target_package_id);
      const { data: targetPackages } = await supabase
        .from('data_packages_config')
        .select('id, package_name, data_amount, price, ussd_template, cost_price, category_id, provider_id')
        .in('id', targetIds);

      const packageMap = new Map((targetPackages ?? []).map((pkg) => [pkg.id, pkg as DataPackage]));
      const normalizedRules = rules.map((rule) => ({
        ...rule,
        target_package: packageMap.get(rule.target_package_id),
      }));

      setBundleRules(normalizedRules as DeliveryRule[]);
    };

    loadBundleRules();
  }, [selectedPackageId]);

  useEffect(() => {
    if (!open) {
      setSelectedPackageId('');
      setReceiverPhone('');
      setSenderPhone('');
      setDeliveryDate(new Date());
      setNotes('');
      setBundleRules([]);
      setAutoDeliver(true);
    }
  }, [open]);

  const formatAmount = (value: number) => {
    const fixed = Number(value).toFixed(2);
    return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
  };

  const sanitizeUssd = (code: string) =>
    code.replace(/\s+/g, '').replace(/##+/g, '#');

  const lookupDeliveryInstruction = async (
    providerId: string,
    packageId?: string | null,
    categoryId?: string | null,
  ): Promise<{ code_template: string; sim_password: string | null } | null> => {
    // 1. Package-specific
    if (packageId) {
      const { data } = await supabase
        .from('delivery_instructions')
        .select('code_template, sim_password')
        .eq('provider_id', providerId)
        .eq('package_id', packageId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.code_template) return data as any;
    }
    // 2. Category-specific
    if (categoryId) {
      const { data } = await supabase
        .from('delivery_instructions')
        .select('code_template, sim_password')
        .eq('provider_id', providerId)
        .eq('category_id', categoryId)
        .is('package_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.code_template) return data as any;
    }
    // 3. Provider default
    const { data } = await supabase
      .from('delivery_instructions')
      .select('code_template, sim_password')
      .eq('provider_id', providerId)
      .is('category_id', null)
      .is('package_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.code_template ? data : null) as any;
  };

  const buildUssdFromTemplate = (
    template: string,
    receiverRaw: string,
    costPrice: number,
    simPassword: string,
  ) => {
    const normalizedPhone = normalizePhoneForUssd(receiverRaw);
    return sanitizeUssd(
      template
        .replace(/\{receiver_phone\}|\{phone\}|\{number\}|\{receiver\}/g, normalizedPhone)
        .replace(/\{cost_price\}|\{amount\}|\{price\}/g, formatAmount(Number(costPrice)))
        .replace(/\{sim_password\}/g, simPassword || '5516')
        .replace(/\{package_code\}/g, ''),
    );
  };

  const buildUssdCommandAsync = async (pkg: DataPackage, receiverRaw: string): Promise<string | null> => {
    const providerId = pkg.provider_id || selectedProviderId;
    const cost = Number(pkg.cost_price ?? pkg.price ?? 0);
    // Prefer delivery_instructions (matches edge function behavior)
    const instr = await lookupDeliveryInstruction(providerId, pkg.id, pkg.category_id ?? null);
    if (instr?.code_template) {
      return buildUssdFromTemplate(instr.code_template, receiverRaw, cost, instr.sim_password || '5516');
    }
    // Fallback to package's own ussd_template if any
    if (pkg.ussd_template) {
      return buildUssdFromTemplate(pkg.ussd_template, receiverRaw, cost, '5516');
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProviderId || !selectedPackageId || receiverPhone.replace(/\D/g, '').length < 7) {
      toast({
        title: language === 'so' ? 'Fadlan buuxi dhammaan meelaha' : 'Please fill all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (!autoDeliver && deliveryDate > new Date()) {
      toast({
        title: language === 'so' ? 'Taariikhdu ma noqon kartid mustaqbalka' : 'Date cannot be in the future',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const selectedPackage = packages.find((pkg) => pkg.id === selectedPackageId);
      if (!selectedPackage) throw new Error('Package not found');

      const { data: paymentProvider } = await supabase
        .from('payment_providers_config')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      // Resolve provider slug + matching device sim slot so claim_next_delivery picks up the queue rows
      const { data: providerRow } = await supabase
        .from('providers_config')
        .select('provider_name')
        .eq('id', selectedProviderId)
        .maybeSingle();
      const providerSlug = (providerRow?.provider_name || providerName || '').toLowerCase().trim();

      const { data: deviceRows } = await supabase
        .from('android_devices')
        .select('id, sim1_provider, sim2_provider')
        .eq('is_active', true)
        .is('archived_at', null);
      let dialingSimSlot: number = simSlot;
      for (const d of deviceRows || []) {
        const p1 = (d.sim1_provider || '').toLowerCase();
        const p2 = (d.sim2_provider || '').toLowerCase();
        if (p1 && (p1.includes(providerSlug) || providerSlug.includes(p1))) { dialingSimSlot = 1; break; }
        if (p2 && (p2.includes(providerSlug) || providerSlug.includes(p2))) { dialingSimSlot = 2; break; }
      }

      const receiverFormatted = formatPhoneForStorage(receiverPhone);
      const senderFormatted = senderPhone ? formatPhoneForStorage(senderPhone) : receiverFormatted;
      const selectedDateISO = deliveryDate.toISOString();

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          amount: selectedPackage.price,
          receiver_phone: receiverFormatted,
          sender_phone: senderFormatted,
          package_id: selectedPackage.id,
          provider_id: selectedProviderId,
          payment_provider_id: paymentProvider?.id ?? null,
          payment_status: 'matched',
          status: autoDeliver ? 'processing' : 'completed',
          delivered_at: autoDeliver ? null : selectedDateISO,
          is_manual: true,
          is_offline: false,
          delivery_notes: notes || null,
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      const queuePackages = [
        {
          pkg: selectedPackage,
          execution_order: 1,
          delay_seconds: 0,
        },
        ...bundleRules
          .filter((rule) => !!rule.target_package)
          .map((rule) => ({
            pkg: rule.target_package as DataPackage,
            execution_order: rule.execution_order,
            delay_seconds: rule.delay_seconds,
          })),
      ];

      const queueEntries = await Promise.all(
        queuePackages.map(async (item) => {
          const ussd = autoDeliver ? await buildUssdCommandAsync(item.pkg, receiverPhone) : null;
          if (autoDeliver && !ussd) {
            throw new Error(
              language === 'so'
                ? `USSD template lama helin package-ka "${item.pkg.package_name}". Fadlan ku dar Delivery Instruction.`
                : `No USSD template found for package "${item.pkg.package_name}". Please add a Delivery Instruction.`,
            );
          }
          return {
            order_id: order.id,
            package_id: item.pkg.id,
            execution_order: item.execution_order,
            delay_seconds: item.delay_seconds,
            status: autoDeliver ? 'pending' : 'completed',
            ussd_command: autoDeliver ? ussd! : 'MANUAL',
            ussd_code: autoDeliver ? ussd! : 'MANUAL',
            provider_name: providerSlug,
            receiver_phone: receiverPhone,
            sim_slot: dialingSimSlot,
            completed_at: autoDeliver ? null : selectedDateISO,
          };
        }),
      );

      const { error: queueError } = await supabase.from('delivery_queue').insert(queueEntries);
      if (queueError) throw queueError;

      toast({
        title: language === 'so' ? 'Dalabka waa la keydiyay' : 'Delivery saved successfully',
        description: `${selectedPackage.package_name} - ${receiverFormatted}${bundleRules.length > 0 ? ` (+${bundleRules.length} bundled)` : ''}`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error adding manual delivery:', error);
      toast({
        title: language === 'so' ? 'Khalad ayaa dhacay' : 'Error occurred',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {language === 'so' ? 'Ku Dar Dalab Manual' : 'Add Manual Delivery'}
          </DialogTitle>
          <DialogDescription>{`${deviceName} - SIM ${simSlot} (${providerName})`}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              {autoDeliver ? <Send className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">
                  {autoDeliver
                    ? (language === 'so' ? 'Otomaatig u dir' : 'Auto-deliver')
                    : (language === 'so' ? 'Diiwaangeli kaliya' : 'Record only')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {autoDeliver
                    ? (language === 'so' ? 'USSD si otomaatig ah loo diraa' : 'USSD sent automatically via queue')
                    : (language === 'so' ? 'Horey loo diray, keydiye kaliya' : 'Already delivered, just recording')}
                </p>
              </div>
            </div>
            <Switch checked={autoDeliver} onCheckedChange={setAutoDeliver} />
          </div>

          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
              <SelectTrigger>
                <SelectValue placeholder={language === 'so' ? 'Dooro provider' : 'Select provider'} />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.provider_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Package</Label>
            <Select value={selectedPackageId} onValueChange={setSelectedPackageId} disabled={!selectedProviderId || loadingPackages}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingPackages
                      ? (language === 'so' ? 'Waa la soo qaadayaa...' : 'Loading...')
                      : (language === 'so' ? 'Dooro package' : 'Select package')
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {packages.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.package_name} - {pkg.data_amount ?? 'N/A'} (${pkg.price})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {bundleRules.length > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 font-medium mb-1">
                <Package className="h-4 w-4 text-blue-500" />
                {language === 'so' ? 'Xirmad isku xiran' : 'Bundled package'}
              </div>
              <p className="text-xs text-muted-foreground">
                {language === 'so'
                  ? `${bundleRules.length} delivery oo dheeri ah ayaa la sameyn doonaa`
                  : `${bundleRules.length} additional deliveries will be created`}
              </p>
              <div className="mt-2 space-y-1">
                {bundleRules.map((rule) => (
                  <div key={rule.id} className="text-xs flex justify-between">
                    <span>{rule.target_package?.package_name || 'Unknown'}</span>
                    {rule.delay_seconds > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {Math.round(rule.delay_seconds / 60)}m delay
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>{language === 'so' ? 'Numberka Qaataha' : 'Receiver Phone'}</Label>
            <Input type="tel" placeholder="61XXXXXXX" value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} maxLength={12} />
          </div>

          <div className="space-y-2">
            <Label>{language === 'so' ? 'Numberka Macmiilka (ikhtiyaari)' : 'Customer Phone (optional)'}</Label>
            <Input type="tel" placeholder="61XXXXXXX" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} maxLength={12} />
          </div>

          {!autoDeliver && (
            <div className="space-y-2">
              <Label>{language === 'so' ? 'Taariikhda Delivery' : 'Delivery Date'}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !deliveryDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deliveryDate ? format(deliveryDate, 'PPP') : (language === 'so' ? 'Dooro taariikh' : 'Pick a date')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={deliveryDate}
                    onSelect={(date) => date && setDeliveryDate(date)}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="space-y-2">
            <Label>{language === 'so' ? 'Faahfaahin (ikhtiyaari)' : 'Notes (optional)'}</Label>
            <Textarea
              placeholder={language === 'so' ? 'Faahfaahin dheeraad ah...' : 'Additional notes...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              {language === 'so' ? 'Ka noqo' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {language === 'so' ? 'Waa la keydiyaa...' : 'Saving...'}
                </>
              ) : autoDeliver ? (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {language === 'so' ? 'U Dir' : 'Send'}
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  {language === 'so' ? 'Ku Dar' : 'Add'}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
