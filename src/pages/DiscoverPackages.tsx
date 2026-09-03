// @ts-nocheck
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';

const digits9 = (v: string) => v.replace(/\D/g, '').slice(-9);

const DiscoverPackages: React.FC = () => {
  const navigate = useNavigate();
  const { provider } = useParams();
  const { state } = useLocation() as any;

  const rootId: string | undefined = state?.rootId;
  const rootName: string = state?.rootName || 'Xirmooyinka';
  const providerName: string = state?.providerName || '';

  const [phone, setPhone] = useState<string>(() => digits9(localStorage.getItem('verifiedPhone') || ''));
  const [payProviders, setPayProviders] = useState<any[]>([]);
  const [payProviderId, setPayProviderId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_active_payment_providers');
      const list = Array.isArray(data) ? data : [];
      setPayProviders(list);
      if (list.length === 1) setPayProviderId(list[0].id);
    })();
  }, []);
  const [status, setStatus] = useState<'idle' | 'queued' | 'dialing' | 'ready' | 'none'>('idle');
  const [items, setItems] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<any>(null);
  const sessionRef = useRef<string | null>(null);

  useEffect(() => { sessionRef.current = sessionId; }, [sessionId]);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const poll = useCallback(async (p: string) => {
    const { data, error } = await supabase.rpc('get_package_discovery', {
      p_phone: p,
      p_max_age_seconds: 1800,
    });
    if (error) return;
    const res: any = data || {};
    if (res.session_id) setSessionId(res.session_id);
    setStatus(res.status || 'none');
    if (res.status === 'ready') {
      setItems(Array.isArray(res.items) ? res.items : []);
      stopPolling();
    }
  }, []);

  const startDiscovery = async () => {
    const p = digits9(phone);
    if (p.length !== 9) { toast.error('Geli lambar 9 god ah'); return; }
    if (!rootId) { toast.error('Nooca xirmada lama helin'); return; }
    if (!payProviderId) { toast.error('Fadlan dooro shirkadda lacag bixinta'); return; }
    setBusy(true);
    setItems([]);
    const { data, error } = await supabase.rpc('request_package_discovery', { p_root_id: rootId, p_phone: p });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const res: any = data || {};
    if (res.status === 'error') { toast.error(res.message || 'Khalad'); return; }
    setSessionId(res.session_id || null);
    setStatus(res.status === 'ready' ? 'ready' : 'queued');
    await poll(p);
    stopPolling();
    pollRef.current = setInterval(() => poll(p), 3000);
  };

  // cleanup: release held session when leaving the page
  useEffect(() => {
    return () => {
      stopPolling();
      const sid = sessionRef.current;
      if (sid) supabase.rpc('release_discovery_session', { p_session_id: sid });
    };
  }, []);

  const choose = (item: any) => {
    if (!item.sellable || item.price == null) return;
    navigate(`/payment/${provider}`, {
      state: {
        providerName,
        categoryName: rootName,
        package: {
          id: rootId,
          providerId: provider,
          name: item.raw_label,
          price: `$${Number(item.price).toFixed(2)}`,
          data: item.data_amount || '',
          validity: null,
        },
        preselectedPaymentProviderId: payProviderId,
        discovery: {
          sessionId,
          menuLabel: item.raw_label,
          menuIndex: item.index ?? null,
          receiverPhone: digits9(phone),
        },
      },
    });
  };

  const sellable = items.filter((i) => i.sellable && i.price != null);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Ka noqo"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0">
          <h1 className="text-base font-bold truncate">{rootName}</h1>
          <p className="text-[11px] opacity-80">Xirmooyinka adiga kuu gaar ah</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Card className="p-4 space-y-3">
          <label className="text-xs font-medium text-muted-foreground">Dooro shirkadda lacag bixinta</label>
          <div className="grid grid-cols-2 gap-2">
            {payProviders.map((pp: any) => {
              const active = payProviderId === pp.id;
              return (
                <button
                  key={pp.id}
                  onClick={() => setPayProviderId(pp.id)}
                  className={`rounded-xl border px-3 py-3 flex items-center gap-2 text-left transition-all ${
                    active ? 'border-primary bg-primary/10 ring-2 ring-primary/30' : 'border-border bg-card'
                  }`}
                >
                  {(pp.provider_logo || pp.logo_url) && (
                    <img
                      src={pp.provider_logo || pp.logo_url}
                      alt={`${pp.display_name || pp.provider_name} logo`}
                      className="w-7 h-7 rounded-md object-cover shrink-0"
                      loading="lazy"
                    />
                  )}
                  <span className="text-sm font-semibold truncate">
                    {pp.display_name || pp.provider_name}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <label className="text-xs font-medium text-muted-foreground">Lambarka aad rabto in la baaro</label>
          <Input
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="61xxxxxxx"
            className="h-11 text-base font-mono"
          />
          <Button className="w-full h-11 gap-2" onClick={startDiscovery} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Baar xirmooyinka
          </Button>
        </Card>

        {(status === 'queued' || status === 'dialing') && (
          <Card className="p-6 text-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            <p className="text-sm font-medium">Waan baarayaa xirmooyinka...</p>
            <p className="text-[11px] text-muted-foreground">
              {status === 'queued' ? 'Saf ku jira — waa la sugayaa taleefan' : 'Shirkadda ayaa la weydiinayaa'}
            </p>
          </Card>
        )}

        {status === 'ready' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{sellable.length} xirmo oo diyaar ah</p>
              <Button size="sm" variant="ghost" onClick={startDiscovery}><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>
            {sellable.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                Xirmooyin qiimo leh lama helin. Fadlan isku day mar kale.
              </Card>
            ) : sellable.map((item, idx) => (
              <Card
                key={`${item.index}-${idx}`}
                onClick={() => choose(item)}
                className="p-4 flex items-center justify-between gap-3 active:scale-[0.99] transition-transform cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{item.raw_label}</p>
                  {item.data_amount && <p className="text-[11px] text-muted-foreground">{item.data_amount}</p>}
                </div>
                <span className="text-base font-extrabold text-primary shrink-0">
                  ${Number(item.price).toFixed(2)}
                </span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverPackages;
