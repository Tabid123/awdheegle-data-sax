// @ts-nocheck
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Phone, Loader2, Edit, ChevronDown, ChevronRight } from 'lucide-react';

interface TopupNumber {
  id: string;
  phone_number: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
}
interface TopupPackage {
  id: string;
  topup_number_id: string;
  package_name: string;
  selling_price: number;
  cost_price: number;
  data_amount: string | null;
  ussd_code: string | null;
  sim_password: string | null;
  provider_name: string | null;
  is_active: boolean;
}

const AutoTopUpSettings = () => {
  const [numbers, setNumbers] = useState<TopupNumber[]>([]);
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [pkgForm, setPkgForm] = useState<Record<string, Partial<TopupPackage>>>({});

  const load = async () => {
    setLoading(true);
    const [n, p] = await Promise.all([
      supabase.from('auto_topup_numbers').select('*').order('created_at', { ascending: false }),
      supabase.from('auto_topup_packages').select('*').order('selling_price'),
    ]);
    setNumbers((n.data as any) || []);
    setPackages((p.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addNumber = async () => {
    const phone = newPhone.replace(/\D/g, '').slice(-9);
    if (phone.length < 9) { toast.error('Lambar sax ah gali (9 digits)'); return; }
    const { error } = await supabase.from('auto_topup_numbers').insert({
      phone_number: phone,
      label: newLabel || null,
      is_active: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Lambar la keydiyay');
    setNewPhone(''); setNewLabel('');
    load();
  };

  const toggleNumber = async (id: string, is_active: boolean) => {
    await supabase.from('auto_topup_numbers').update({ is_active }).eq('id', id);
    load();
  };

  const deleteNumber = async (id: string) => {
    if (!confirm('Tirtir lambarkan iyo dhammaan packages-kiisa?')) return;
    await supabase.from('auto_topup_numbers').delete().eq('id', id);
    toast.success('La tirtiray');
    load();
  };

  const addPackage = async (numberId: string) => {
    const f = pkgForm[numberId] || {};
    if (!f.package_name || !f.selling_price) { toast.error('Magaca iyo qiimaha gali'); return; }
    const { error } = await supabase.from('auto_topup_packages').insert({
      topup_number_id: numberId,
      package_name: f.package_name,
      selling_price: Number(f.selling_price),
      cost_price: Number(f.cost_price || 0),
      data_amount: f.data_amount || null,
      ussd_code: f.ussd_code || null,
      sim_password: f.sim_password || null,
      provider_name: f.provider_name || null,
      is_active: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Package la daray');
    setPkgForm({ ...pkgForm, [numberId]: {} });
    load();
  };

  const deletePackage = async (id: string) => {
    await supabase.from('auto_topup_packages').delete().eq('id', id);
    toast.success('Package la tirtiray');
    load();
  };

  const togglePackage = async (id: string, is_active: boolean) => {
    await supabase.from('auto_topup_packages').update({ is_active }).eq('id', id);
    load();
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Auto Top-Up Numbers</h2>
        <p className="text-sm text-muted-foreground">Lambarada marka lacag laga helo, automatic ahaan package la diro.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Ku dar lambar cusub</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input placeholder="Phone (e.g. 612345678)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            <Input placeholder="Label (optional)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <Button onClick={addNumber}><Plus className="h-4 w-4 mr-1" />Ku dar</Button>
          </div>
        </CardContent>
      </Card>

      {numbers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Wali lambar lama keydiyo</CardContent></Card>
      ) : numbers.map(num => {
        const numPkgs = packages.filter(p => p.topup_number_id === num.id);
        const isOpen = !!expanded[num.id];
        const f = pkgForm[num.id] || {};
        const setF = (patch: Partial<TopupPackage>) => setPkgForm({ ...pkgForm, [num.id]: { ...f, ...patch } });
        return (
          <Card key={num.id}>
            <CardHeader className="cursor-pointer" onClick={() => setExpanded({ ...expanded, [num.id]: !isOpen })}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Phone className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">{num.phone_number}</CardTitle>
                    {num.label && <p className="text-xs text-muted-foreground">{num.label}</p>}
                  </div>
                  <Badge variant="outline">{numPkgs.length} packages</Badge>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Switch checked={num.is_active} onCheckedChange={(v) => toggleNumber(num.id, v)} />
                  <Button size="icon" variant="ghost" onClick={() => deleteNumber(num.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className="space-y-3">
                {numPkgs.length > 0 && (
                  <div className="space-y-2">
                    {numPkgs.map(pkg => (
                      <div key={pkg.id} className="flex items-center justify-between border rounded-md p-2 bg-muted/30">
                        <div className="text-sm">
                          <span className="font-semibold">{pkg.package_name}</span>
                          <span className="ml-2 text-green-600 font-bold">${pkg.selling_price}</span>
                          {pkg.data_amount && <span className="ml-2 text-xs text-muted-foreground">{pkg.data_amount}</span>}
                          {pkg.provider_name && <Badge variant="outline" className="ml-2 text-[10px]">{pkg.provider_name}</Badge>}
                          {pkg.ussd_code && <p className="text-[10px] text-muted-foreground">USSD: {pkg.ussd_code}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <Switch checked={pkg.is_active} onCheckedChange={(v) => togglePackage(pkg.id, v)} />
                          <Button size="icon" variant="ghost" onClick={() => deletePackage(pkg.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t pt-3 space-y-2">
                  <Label className="text-xs font-semibold">Ku dar package cusub</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Magaca packagega" value={f.package_name || ''} onChange={(e) => setF({ package_name: e.target.value })} className="h-9 text-xs" />
                    <Input placeholder="Selling price ($)" type="number" step="0.01" value={f.selling_price || ''} onChange={(e) => setF({ selling_price: Number(e.target.value) })} className="h-9 text-xs" />
                    <Input placeholder="Cost price ($)" type="number" step="0.01" value={f.cost_price || ''} onChange={(e) => setF({ cost_price: Number(e.target.value) })} className="h-9 text-xs" />
                    <Input placeholder="Data amount (1GB)" value={f.data_amount || ''} onChange={(e) => setF({ data_amount: e.target.value })} className="h-9 text-xs" />
                    <Input placeholder="USSD code (*712*1#)" value={f.ussd_code || ''} onChange={(e) => setF({ ussd_code: e.target.value })} className="h-9 text-xs" />
                    <Input placeholder="SIM password" value={f.sim_password || ''} onChange={(e) => setF({ sim_password: e.target.value })} className="h-9 text-xs" />
                    <Input placeholder="Provider (hormuud)" value={f.provider_name || ''} onChange={(e) => setF({ provider_name: e.target.value })} className="h-9 text-xs" />
                    <Button size="sm" onClick={() => addPackage(num.id)}><Plus className="h-3 w-3 mr-1" />Ku dar</Button>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default AutoTopUpSettings;
