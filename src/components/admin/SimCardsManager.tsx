// @ts-nocheck
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Pencil, CreditCard, ShoppingBag, X } from 'lucide-react';

interface ProviderOpt {
  provider: string;
  price: string;
  free: boolean;
}

interface SimRow {
  id: string;
  name: string;
  sim_type: string;
  number: string;
  features: string;
  popular: boolean;
  is_active: boolean;
  providers: ProviderOpt[];
  sort_order: number;
  created_at?: string;
}

const SIM_TYPES = ['PREPAID', 'STANDARD', 'GOLD NUMBER', 'VIP'];
const DEFAULT_PROVIDERS = ['Hormuud', 'Somtel', 'Somnet', 'Amtel', 'Somlink'];

const emptyForm = (): SimRow => ({
  id: '',
  name: '',
  sim_type: 'STANDARD',
  number: '',
  features: '',
  popular: false,
  is_active: true,
  providers: [{ provider: 'Hormuud', price: '$2.00', free: false }],
  sort_order: 0,
});

export function SimCardsManager() {
  const [tab, setTab] = useState('catalog');
  const [rows, setRows] = useState<SimRow[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<SimRow>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sim_cards_catalog')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) toast({ title: 'Cilad', description: error.message, variant: 'destructive' });
    setRows((data as any) || []);
    setLoading(false);
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    const { data, error } = await supabase
      .from('sim_card_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) toast({ title: 'Cilad', description: error.message, variant: 'destructive' });
    setOrders(data || []);
    setOrdersLoading(false);
  };

  useEffect(() => {
    load();
    loadOrders();
  }, []);

  const openAdd = () => {
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (row: SimRow) => {
    setForm({
      ...row,
      providers: Array.isArray(row.providers) ? row.providers : [],
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.number.trim()) {
      toast({ title: 'Lambar waa loo baahan yahay', variant: 'destructive' });
      return;
    }
    if (!form.providers.length) {
      toast({ title: 'Ugu yaraan hal shirkad ku dar', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload: any = {
      name: form.name?.trim() || null,
      sim_type: form.sim_type,
      number: form.number.trim(),
      features: form.features || '',
      popular: form.popular,
      is_active: form.is_active,
      providers: form.providers,
      sort_order: Number(form.sort_order) || 0,
    };
    const { error } = form.id
      ? await supabase.from('sim_cards_catalog').update(payload).eq('id', form.id)
      : await supabase.from('sim_cards_catalog').insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: 'Cilad', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: form.id ? 'La cusbooneysiiyay' : 'La daray' });
    setDialogOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Ma hubtaa inaad tirtirto SIM kan?')) return;
    const { error } = await supabase.from('sim_cards_catalog').delete().eq('id', id);
    if (error) toast({ title: 'Cilad', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Waa la tirtiray' });
      load();
    }
  };

  const toggleActive = async (row: SimRow) => {
    const { error } = await supabase
      .from('sim_cards_catalog')
      .update({ is_active: !row.is_active })
      .eq('id', row.id);
    if (error) toast({ title: 'Cilad', description: error.message, variant: 'destructive' });
    else load();
  };

  const addProviderRow = () => {
    setForm((f) => ({
      ...f,
      providers: [...f.providers, { provider: 'Somtel', price: 'Free', free: true }],
    }));
  };

  const updateProviderRow = (idx: number, patch: Partial<ProviderOpt>) => {
    setForm((f) => {
      const next = [...f.providers];
      next[idx] = { ...next[idx], ...patch };
      if (patch.free === true) next[idx].price = 'Free';
      if (patch.free === false && next[idx].price === 'Free') next[idx].price = '$1.00';
      return { ...f, providers: next };
    });
  };

  const removeProviderRow = (idx: number) => {
    setForm((f) => ({ ...f, providers: f.providers.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" /> SIM Cards Management
          </h2>
          <p className="text-xs md:text-sm text-muted-foreground">
            Maamul SIM-yada la iibinayo iyo dalabyada iman jira.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="catalog">
            <CreditCard className="w-4 h-4 mr-1.5" /> Catalog
          </TabsTrigger>
          <TabsTrigger value="orders">
            <ShoppingBag className="w-4 h-4 mr-1.5" /> Dalabyada ({orders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={openAdd} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Ku dar SIM
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Wali ma jiro SIM la daray.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rows.map((row) => (
                <Card key={row.id} className={row.is_active ? '' : 'opacity-60'}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">{row.sim_type}</Badge>
                          {row.popular && <Badge className="text-[10px] bg-primary">POPULAR</Badge>}
                          {!row.is_active && <Badge variant="outline" className="text-[10px]">Hidden</Badge>}
                        </div>
                        {row.name && <p className="text-xs font-semibold text-primary">{row.name}</p>}
                        <p className="font-bold text-sm">{row.number}</p>
                        <p className="text-xs text-muted-foreground">{row.features}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Switch checked={row.is_active} onCheckedChange={() => toggleActive(row)} />
                        <span className="text-[10px] text-muted-foreground">#{row.sort_order}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t">
                      {(row.providers || []).map((p, i) => (
                        <span
                          key={i}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            p.free
                              ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
                              : 'bg-primary/10 text-primary'
                          }`}
                        >
                          {p.provider}: {p.price}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(row)}>
                        <Pencil className="w-3.5 h-3.5 mr-1" /> Wax ka bedel
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => remove(row.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders">
          {ordersLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Wali ma jiraan dalabyo.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Taariikh</TableHead>
                      <TableHead>Macaamil</TableHead>
                      <TableHead>SIM</TableHead>
                      <TableHead>Shirkad</TableHead>
                      <TableHead>Qiime</TableHead>
                      <TableHead>Lacag</TableHead>
                      <TableHead>Dalabka</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(o.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{o.full_name}</div>
                          <div className="text-muted-foreground">{o.payment_phone}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{o.sim_number}</div>
                          <Badge variant="outline" className="text-[10px]">{o.sim_type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{o.sim_provider}</TableCell>
                        <TableCell className="text-xs font-bold">${Number(o.price || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={o.payment_status === 'paid' ? 'default' : o.payment_status === 'failed' ? 'destructive' : 'secondary'}
                            className="text-[10px]"
                          >
                            {o.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{o.order_status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Wax ka bedel SIM' : 'Ku dar SIM cusub'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Magaca SIM (Label)</Label>
              <Input
                value={form.name || ''}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Tusaale: VIP Diamond, Gold #1..."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Nooca</Label>
                <Select value={form.sim_type} onValueChange={(v) => setForm((f) => ({ ...f, sim_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SIM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kaalinta (order)</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div>
              <Label>Lambarka SIM</Label>
              <Input
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                placeholder="+252 61 789 4432"
              />
            </div>
            <div>
              <Label>Sifooyin</Label>
              <Input
                value={form.features}
                onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
                placeholder="5G Ready • Instant Activation"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.popular} onCheckedChange={(v) => setForm((f) => ({ ...f, popular: v }))} />
                Popular
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                Firirsan
              </label>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label>Shirkadaha (Providers)</Label>
                <Button size="sm" variant="outline" type="button" onClick={addProviderRow}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Ku dar shirkad
                </Button>
              </div>
              <div className="space-y-2">
                {form.providers.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 border rounded-lg">
                    <Select value={p.provider} onValueChange={(v) => updateProviderRow(i, { provider: v })}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DEFAULT_PROVIDERS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      className="flex-1"
                      value={p.price}
                      onChange={(e) => updateProviderRow(i, { price: e.target.value, free: e.target.value.toLowerCase() === 'free' })}
                      placeholder="$2.00 ama Free"
                      disabled={p.free}
                    />
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <Switch checked={p.free} onCheckedChange={(v) => updateProviderRow(i, { free: v })} />
                      Free
                    </label>
                    <Button size="icon" variant="ghost" onClick={() => removeProviderRow(i)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Jooji</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Kaydi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SimCardsManager;