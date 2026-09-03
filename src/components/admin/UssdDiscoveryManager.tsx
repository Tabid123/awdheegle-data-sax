// @ts-nocheck
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, RefreshCw, Save, Trash2, Search, Radio } from 'lucide-react';
import { toast } from 'sonner';

const DURATIONS = ['', 'hourly', 'daily', '3days', 'weekly', 'monthly'];

const emptyRow = (rootId = '') => ({
  id: null,
  normalized_label: '',
  duration_key: '',
  data_amount: '',
  display_name: '',
  cost_price: 0,
  selling_price: 0,
  is_active: true,
  root_package_id: rootId,
});

const UNGROUPED = '__none__';

export const UssdDiscoveryManager: React.FC = () => {
  const [tab, setTab] = useState('catalog');

  // ---- Price catalog ----
  const [rows, setRows] = useState<any[]>([]);
  const [roots, setRoots] = useState<any[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const loadRoots = useCallback(async () => {
    const { data } = await supabase
      .from('data_packages_config')
      .select('id, package_name, sort_order')
      .eq('is_discovery_root', true)
      .order('sort_order');
    setRoots(data || []);
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ussd_price_catalog')
      .select('id, normalized_label, duration_key, data_amount, display_name, cost_price, selling_price, is_active, root_package_id')
      .order('normalized_label')
      .limit(500);
    if (error) toast.error(error.message);
    setRows(data || []);
    setLoading(false);
  }, []);

  // ---- Unmatched labels ----
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const loadUnmatched = useCallback(async () => {
    const { data } = await supabase
      .from('discovery_unmatched_labels')
      .select('id, raw_label, normalized_label, duration_key, seen_count, last_seen_at')
      .order('seen_count', { ascending: false })
      .limit(200);
    setUnmatched(data || []);
  }, []);

  // ---- Live sessions ----
  const [sessions, setSessions] = useState<any[]>([]);
  const loadSessions = useCallback(async () => {
    const { data } = await supabase
      .from('ussd_package_discoveries')
      .select('id, phone_number, status, session_state, items, error_message, created_at, session_expires_at')
      .order('created_at', { ascending: false })
      .limit(20);
    setSessions(data || []);
  }, []);

  useEffect(() => {
    loadRoots();
    loadCatalog();
    loadUnmatched();
    loadSessions();
  }, [loadRoots, loadCatalog, loadUnmatched, loadSessions]);

  useEffect(() => {
    if (tab !== 'sessions') return;
    const channel = supabase
      .channel('ussd-discoveries-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ussd_package_discoveries' }, () => loadSessions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tab, loadSessions]);

  const save = async () => {
    if (!draft?.normalized_label?.trim()) { toast.error('Gali magaca xirmada'); return; }
    setSaving(true);
    const payload = {
      normalized_label: draft.normalized_label.trim().toLowerCase(),
      duration_key: draft.duration_key || null,
      data_amount: draft.data_amount || null,
      display_name: draft.display_name || null,
      cost_price: Number(draft.cost_price) || 0,
      selling_price: Number(draft.selling_price) || 0,
      is_active: !!draft.is_active,
      root_package_id: draft.root_package_id || null,
    };
    const res = draft.id
      ? await supabase.from('ussd_price_catalog').update(payload).eq('id', draft.id)
      : await supabase.from('ussd_price_catalog').insert(payload);
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success('Waa la keydiyay');
    setDraft(null);
    loadCatalog();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('ussd_price_catalog').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.filter((x) => x.id !== id));
  };

  const promote = (u: any) => {
    setTab('catalog');
    setDraft({
      ...emptyRow(),
      normalized_label: u.normalized_label,
      duration_key: u.duration_key || '',
      display_name: u.raw_label,
    });
  };

  const filtered = rows.filter((r) =>
    !q.trim() || `${r.normalized_label} ${r.display_name || ''}`.toLowerCase().includes(q.toLowerCase())
  );

  // group the catalog by category (discovery root)
  const groups = [
    ...roots.map((root) => ({
      key: root.id,
      name: root.package_name,
      items: filtered.filter((r) => r.root_package_id === root.id),
    })),
    {
      key: UNGROUPED,
      name: 'Category la\'aan',
      items: filtered.filter((r) => !r.root_package_id || !roots.some((x) => x.id === r.root_package_id)),
    },
  ].filter((g) => g.items.length > 0 || g.key !== UNGROUPED);

  const isOpen = (key: string) => openGroups[key] !== false;
  const toggleGroup = (key: string) => setOpenGroups((p) => ({ ...p, [key]: isOpen(key) ? false : true }));


  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3 h-auto">
          <TabsTrigger value="catalog" className="text-[11px] py-2">Qiimaha (*212)</TabsTrigger>
          <TabsTrigger value="unmatched" className="text-[11px] py-2">
            Aan la helin {unmatched.length > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[9px]">{unmatched.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="sessions" className="text-[11px] py-2">Sessions</TabsTrigger>
        </TabsList>

        {/* ---------------- CATALOG ---------------- */}
        <TabsContent value="catalog" className="space-y-3 mt-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Raadi xirmo..." className="pl-7 h-9 text-sm" />
            </div>
            <Button size="sm" variant="outline" onClick={loadCatalog}><RefreshCw className="h-3.5 w-3.5" /></Button>
            <Button size="sm" onClick={() => setDraft(emptyRow())}><Plus className="h-3.5 w-3.5" /></Button>
          </div>

          {draft && (
            <Card className="p-3 space-y-2 border-primary/40">
              <p className="text-xs font-semibold">{draft.id ? 'Tafatir xirmo' : 'Xirmo cusub'}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground">Category (xirmada root)</label>
                  <select
                    value={draft.root_package_id || ''}
                    onChange={(e) => setDraft({ ...draft, root_package_id: e.target.value })}
                    className="w-full h-9 px-2 rounded-md border bg-background text-sm"
                  >
                    <option value="">— Category la'aan —</option>
                    {roots.map((root) => <option key={root.id} value={root.id}>{root.package_name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground">Label (sida menu-ga *212 ka muuqdo)</label>
                  <Input value={draft.normalized_label} onChange={(e) => setDraft({ ...draft, normalized_label: e.target.value })} placeholder="100mb maalin" className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Muddo</label>
                  <select value={draft.duration_key} onChange={(e) => setDraft({ ...draft, duration_key: e.target.value })} className="w-full h-9 px-2 rounded-md border bg-background text-sm">
                    {DURATIONS.map((d) => <option key={d} value={d}>{d || '— (dhammaan)'}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Xogta</label>
                  <Input value={draft.data_amount || ''} onChange={(e) => setDraft({ ...draft, data_amount: e.target.value })} placeholder="1GB" className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Qiimaha aan ku iibsano</label>
                  <Input type="number" step="0.01" value={draft.cost_price} onChange={(e) => setDraft({ ...draft, cost_price: e.target.value })} className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Qiimaha aan ku iibinno</label>
                  <Input type="number" step="0.01" value={draft.selling_price} onChange={(e) => setDraft({ ...draft, selling_price: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="col-span-2 flex items-center justify-between pt-1">
                  <span className="text-xs">Firfircoon</span>
                  <Switch checked={!!draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setDraft(null)}>Ka noqo</Button>
                <Button size="sm" className="flex-1 gap-1" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Keydi
                </Button>
              </div>
            </Card>
          )}

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">Wax xirmo ah lama helin</p>
          ) : (
            <div className="grid gap-2">
              {filtered.map((r) => (
                <Card key={r.id} className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{r.display_name || r.normalized_label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{r.normalized_label}{r.duration_key ? ` • ${r.duration_key}` : ''}{r.data_amount ? ` • ${r.data_amount}` : ''}</p>
                    <p className="text-[11px] mt-0.5">
                      <span className="text-muted-foreground">Cost ${Number(r.cost_price).toFixed(2)}</span>
                      {' → '}
                      <span className="font-semibold text-primary">${Number(r.selling_price).toFixed(2)}</span>
                      {!r.is_active && <Badge variant="secondary" className="ml-2 h-4 px-1 text-[9px]">off</Badge>}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setDraft({ ...r, duration_key: r.duration_key || '' })}>Tafatir</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive" onClick={() => remove(r.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------- UNMATCHED ---------------- */}
        <TabsContent value="unmatched" className="space-y-2 mt-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={loadUnmatched}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
          {unmatched.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">Dhammaan menu-yada waa la helay ✅</p>
          ) : unmatched.map((u) => (
            <Card key={u.id} className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{u.raw_label}</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">{u.normalized_label}{u.duration_key ? ` • ${u.duration_key}` : ''} • {u.seen_count}x</p>
              </div>
              <Button size="sm" className="h-7 text-[10px] shrink-0" onClick={() => promote(u)}>Qiimo saar</Button>
            </Card>
          ))}
        </TabsContent>

        {/* ---------------- SESSIONS ---------------- */}
        <TabsContent value="sessions" className="space-y-2 mt-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Radio className="h-3 w-3 text-green-500" /> Live</span>
            <Button size="sm" variant="outline" onClick={loadSessions}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
          {sessions.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">Wax session ah ma jiro</p>
          ) : sessions.map((s) => (
            <Card key={s.id} className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm">{s.phone_number}</span>
                <Badge variant={s.status === 'ready' ? 'default' : s.status === 'failed' ? 'destructive' : 'secondary'} className="text-[9px] h-4 px-1">
                  {s.status} / {s.session_state}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {Array.isArray(s.items) ? s.items.length : 0} xirmo • {new Date(s.created_at).toLocaleTimeString()}
              </p>
              {s.error_message && <p className="text-[10px] text-destructive">{s.error_message}</p>}
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UssdDiscoveryManager;
