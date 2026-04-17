import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface AddSimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Provider {
  id: string;
  provider_name: string;
}

interface SimInput {
  phone_number: string;
  provider_id: string;
}

export const AddSimDialog = ({ open, onOpenChange, onSuccess }: AddSimDialogProps) => {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [hasDualSim, setHasDualSim] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [formData, setFormData] = useState({
    device_name: '',
    device_id: '',
    sim1: { phone_number: '', provider_id: '' } as SimInput,
    sim2: { phone_number: '', provider_id: '' } as SimInput,
  });

  useEffect(() => {
    const loadProviders = async () => {
      const { data } = await supabase
        .from('providers_config')
        .select('id, provider_name')
        .eq('is_active', true)
        .order('sort_order');
      setProviders(data || []);
    };

    if (open) loadProviders();
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.device_name || !formData.sim1.phone_number || !formData.sim1.provider_id) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Fadlan buuxi SIM 1 xogtiisa' : 'Please fill SIM 1 details',
        variant: 'destructive',
      });
      return;
    }

    if (hasDualSim && (!formData.sim2.phone_number || !formData.sim2.provider_id)) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Fadlan buuxi SIM 2 xogtiisa ama dami' : 'Please fill SIM 2 details or disable it',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const deviceIdValue = formData.device_id || `manual-${Date.now()}`;
      const { data: device, error: deviceError } = await supabase
        .from('android_devices')
        .insert({
          device_id: deviceIdValue,
          device_name: formData.device_name,
          is_active: true,
          status: 'offline',
        })
        .select('id')
        .single();

      if (deviceError) throw deviceError;

      const sims = [
        {
          device_id: device.id,
          phone_number: formData.sim1.phone_number,
          provider_id: formData.sim1.provider_id,
          sim_slot: 1,
          status: 'active' as const,
        },
        ...(hasDualSim
          ? [{
              device_id: device.id,
              phone_number: formData.sim2.phone_number,
              provider_id: formData.sim2.provider_id,
              sim_slot: 2,
              status: 'active' as const,
            }]
          : []),
      ];

      const { error: simError } = await supabase.from('sims').insert(sims);
      if (simError) throw simError;

      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Device-ka iyo SIM-yada waa la daray' : 'Device and SIMs added successfully',
      });

      setFormData({
        device_name: '',
        device_id: '',
        sim1: { phone_number: '', provider_id: '' },
        sim2: { phone_number: '', provider_id: '' },
      });
      setHasDualSim(false);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const SimInputFields = ({ simKey, label }: { simKey: 'sim1' | 'sim2'; label: string }) => (
    <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
      <div className="font-medium text-sm">{label}</div>

      <div className="space-y-2">
        <Label>{language === 'so' ? 'Lambarka SIM' : 'SIM Number'} *</Label>
        <Input
          placeholder="252612345678"
          value={formData[simKey].phone_number}
          onChange={(e) => setFormData({
            ...formData,
            [simKey]: { ...formData[simKey], phone_number: e.target.value },
          })}
        />
      </div>

      <div className="space-y-2">
        <Label>{language === 'so' ? 'Provider-ka' : 'Provider'} *</Label>
        <Select
          value={formData[simKey].provider_id}
          onValueChange={(value) => setFormData({
            ...formData,
            [simKey]: { ...formData[simKey], provider_id: value },
          })}
        >
          <SelectTrigger>
            <SelectValue placeholder={language === 'so' ? 'Dooro' : 'Select'} />
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
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{language === 'so' ? '📱 Device Cusub Ku Dar' : '📱 Add New Device'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{language === 'so' ? 'Magaca Device-ka *' : 'Device Name *'}</Label>
            <Input
              placeholder={language === 'so' ? 'Tusaale: Samsung A54' : 'e.g., Samsung A54'}
              value={formData.device_name}
              onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{language === 'so' ? 'Device ID (ikhtiyaari)' : 'Device ID (optional)'}</Label>
            <Input
              placeholder={language === 'so' ? 'Auto-generated haddii loo daayo' : 'Auto-generated if empty'}
              value={formData.device_id}
              onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <div className="font-medium">{language === 'so' ? 'Dual SIM?' : 'Dual SIM?'}</div>
              <div className="text-sm text-muted-foreground">
                {language === 'so' ? 'Device-kan ma leeyahay 2 SIM?' : 'Does this device have 2 SIMs?'}
              </div>
            </div>
            <Switch checked={hasDualSim} onCheckedChange={setHasDualSim} />
          </div>

          <SimInputFields simKey="sim1" label="SIM 1" />
          {hasDualSim && <SimInputFields simKey="sim2" label="SIM 2" />}

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {language === 'so' ? 'Ka noqo' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'so' ? 'Ku Dar' : 'Add Device'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
