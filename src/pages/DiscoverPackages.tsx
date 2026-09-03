// @ts-nocheck
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Clock, Loader2, RefreshCw, Search, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

const digits9 = (v: string) => (v || '').replace(/\D/g, '').slice(-9);
const normalizeLabel = (value: unknown) => String(value || '')
  .toLowerCase()
  .replace(/\|.*$/, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const ROOT_CATEGORY_LABELS = new Set(['data', 'kuhadal', 'data iyo kuhadal']);
const packageDisplayLabel = (value: unknown) => String(value || '').split('|')[0];
const stripProviderPrice = (value: unknown) => packageDisplayLabel(value)
  .replace(/^\s*\$?\s*\d+(?:[.,]\d+)?\s*(?:=|[-:])\s*/i, '')
  .trim();
// Keep every real package row. Rows without a catalog price are shown dimmed
// ("Qiimo lama helin") instead of producing an empty page.
const visiblePackages = (value: unknown) => (Array.isArray(value) ? value : []).filter((item: any) => {
  const label = normalizeLabel(item?.raw_label);
  return !!label && !ROOT_CATEGORY_LABELS.has(label);
});

class PageErrorBoundary extends React.Component<any, { hasError: boolean }> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <Card className="p-6 text-center space-y-3 max-w-sm">
            <p className="text-sm font-semibold">Khalad ayaa dhacay</p>
            <p className="text-xs text-muted-foreground">Fadlan isku day mar kale.</p>
            <Button className="w-full" onClick={() => window.location.reload()}>Dib u bilow</Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

const DiscoverPackagesInner: React.FC = () => {
  const navigate = useNavigate();
  const { provider } = useParams();
  const { state } = useLocation() as any;

  const rootId: string | undefined = state?.rootId;
  const rootName: string = state?.rootName || 'Xirmooyinka';
  const providerName: string = state?.providerName || '';
  const paymentNumber: string = state?.paymentNumber || '';
  const paymentProviderId: string | null = state?.paymentProviderId || null;

  const [phone, setPhone] = useState<string>(() => digits9(state?.phone || ''));
  const [phoneError, setPhoneError] = useState('');

  // view: input | searching | results
  const [view, setView] = useState<'input' | 'searching' | 'results'>(state?.phone ? 'searching' : 'input');
  const [status, setStatus] = useState<'idle' | 'queued' | 'pending' | 'dialing' | 'processing' | 'ready' | 'none'>('idle');
  const [items, setItems] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ahead, setAhead] = useState(0);
  const [position, setPosition] = useState(1);
  const [claimedAt, setClaimedAt] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [busy, setBusy] = useState(false);

  const pollRef = useRef<any>(null);
  const sessionRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const beganAtRef = useRef<number>(0);
  const purchasedRef = useRef(false);

  useEffect(() => { sessionRef.current = sessionId; }, [sessionId]);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const poll = useCallback(async (p: string, requestedSessionId?: string | null) => {
    const sid = requestedSessionId || sessionRef.current;
    if (!sid) return;
    const { data, error } = await supabase.rpc('get_package_discovery_session', {
      p_phone: p,
      p_session_id: sid,
      p_max_age_seconds: 1800,
    });
    if (error) return;
    const res: any = data || {};
    if (res.session_id) setSessionId(res.session_id);
    setStatus(res.status || 'none');
    setAhead(Number(res.ahead || 0));
    setPosition(Number(res.queue_position || 1));
    setClaimedAt(res.claimed_at || null);

    if (res.status === 'ready') {
      const packages = visiblePackages(res.items);
      // A root category menu is not a valid result. Keep it completely hidden.
      if (packages.length === 0) {
        setItems([]);
        setTimedOut(true);
        setView('searching');
        stopPolling();
        return;
      }
      setItems(packages);
      setSecondsLeft(res.session_seconds_left != null ? Number(res.session_seconds_left) : null);
      setView('results');
      stopPolling();
      return;
    }
    if (res.error_message === 'no_device_available' || res.status === 'no_device_available') {
      stopPolling();
      setTimedOut(true);
      return;
    }
    if (res.status === 'failed') {
      stopPolling();
      setTimedOut(true);
      return;
    }
    // hard stop after 5 minutes
    if (beganAtRef.current && Date.now() - beganAtRef.current > 5 * 60 * 1000) {
      stopPolling();
      setTimedOut(true);
    }
  }, []);

  const startDiscovery = useCallback(async (raw?: string) => {
    const p = digits9(raw ?? phone);
    if (p.length !== 9) { setPhoneError('Fadlan gali lambarka oo dhan'); return; }
    if (!rootId) { toast.error('Nooca xirmada lama helin'); return; }
    setPhoneError('');
    setBusy(true);
    setItems([]);
    setTimedOut(false);
    setElapsed(0);
    setView('searching');
    beganAtRef.current = Date.now();

    const { data, error } = await supabase.rpc('request_package_discovery', { p_root_id: rootId, p_phone: p });
    setBusy(false);
    if (error) { toast.error(error.message); setView('input'); return; }
    const res: any = data || {};
    if (res.status === 'error') { toast.error(res.message || 'Khalad'); setView('input'); return; }

    const newSessionId = res.session_id || null;
    setSessionId(newSessionId);
    sessionRef.current = newSessionId;
    setStatus(res.status || 'queued');
    await poll(p, newSessionId);
    stopPolling();
    pollRef.current = setInterval(() => poll(p, newSessionId), 2500);
  }, [phone, rootId, poll]);

  // auto-start when the number came from the payment page
  useEffect(() => {
    if (startedRef.current) return;
    if (state?.phone && digits9(state.phone).length === 9) {
      startedRef.current = true;
      startDiscovery(state.phone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // realtime nudge
  useEffect(() => {
    const p = digits9(phone);
    if (!p) return;
    const channel = supabase
      .channel('discovery_queue_client')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ussd_package_discoveries', filter: `phone_number=eq.${p}` }, () => poll(p, sessionRef.current))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [phone, poll]);

  // scanning seconds counter (starts at claimed_at)
  useEffect(() => {
    if (view !== 'searching' || !claimedAt) return;
    const base = new Date(claimedAt).getTime();
    const t = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - base) / 1000))), 1000);
    return () => clearInterval(t);
  }, [view, claimedAt]);

  // session countdown
  useEffect(() => {
    if (view !== 'results' || secondsLeft == null) return;
    const t = setInterval(() => setSecondsLeft((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [view, secondsLeft == null]);

  // release the held session when leaving without buying
  useEffect(() => {
    return () => {
      stopPolling();
      const sid = sessionRef.current;
      if (sid && !purchasedRef.current) supabase.rpc('release_discovery_session', { p_session_id: sid });
    };
  }, []);

  const cancelQueue = () => {
    stopPolling();
    const sid = sessionRef.current;
    if (sid) supabase.rpc('release_discovery_session', { p_session_id: sid });
    setSessionId(null);
    setView('input');
  };

  const choose = (item: any) => {
    if (!item.sellable || item.price == null) return;
    if (secondsLeft === 0) return;
    purchasedRef.current = true;
    navigate(`/payment/${provider}`, {
      state: {
        providerName,
        categoryName: rootName,
        autoConfirm: true,
        paymentNumber,
        preselectedPaymentProviderId: paymentProviderId,
        package: {
          id: rootId,
          providerId: provider,
           name: stripProviderPrice(item.raw_label),
          price: `$${Number(item.price).toFixed(2)}`,
          data: item.data_amount || '',
          validity: null,
        },
        discovery: {
          sessionId,
          menuLabel: item.raw_label,
          menuIndex: item.index ?? null,
          receiverPhone: digits9(phone),
        },
      },
    });
  };

  const expired = secondsLeft === 0;

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
        {/* ---------- INPUT ---------- */}
        {view === 'input' && (
          <Card className="p-4 space-y-3">
            <label className="text-xs font-medium text-muted-foreground">Lambarka la siinayo</label>
            <Input
              inputMode="numeric"
              value={phone}
              onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 9)); setPhoneError(''); }}
              placeholder="61xxxxxxx"
              className="h-11 text-base font-mono"
            />
            {phoneError && <p className="text-[11px] text-destructive">{phoneError}</p>}
            <Button className="w-full h-11 gap-2" onClick={() => startDiscovery()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Soo baar xirmooyinka
            </Button>
          </Card>
        )}

        {/* ---------- SEARCHING ---------- */}
        {view === 'searching' && (
          <Card className="p-6 text-center space-y-3">
            {timedOut ? (
              <>
                <p className="text-sm font-semibold text-destructive">
                  Xiriirada shirkadda way mashquul yihiin, daqiiqad kadib isku day.
                </p>
                <Button className="w-full" onClick={() => startDiscovery()}>Isku day mar kale</Button>
              </>
            ) : (
              <>
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                {claimedAt ? (
                  <>
                    <p className="text-sm font-medium">Waa la baarayaa… Fadlan sug 10–40 ilbiriqsi</p>
                    <p className="text-2xl font-extrabold text-primary tabular-nums">{elapsed}s</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Waxaad ku jirtaa safka — adigu waa #{position}
                      {ahead > 0 ? ` (${ahead} qof hor kaaga jira)` : ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Lacag weli lama bixin — waad joojin kartaa</p>
                    <Button variant="outline" className="w-full" onClick={cancelQueue}>Jooji</Button>
                  </>
                )}
              </>
            )}
          </Card>
        )}

        {/* ---------- RESULTS ---------- */}
        {view === 'results' && (
          <div className="space-y-3">
            {secondsLeft != null && (
              expired ? (
                <Card className="p-3 border-destructive bg-destructive/10 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-destructive">Waqtigii wuu dhamaaday</p>
                  <Button size="sm" variant="outline" onClick={() => startDiscovery()} className="gap-1">
                    <RefreshCw className="h-3.5 w-3.5" /> Dib u baar
                  </Button>
                </Card>
              ) : (
                <Card className="p-3 border-green-500/50 bg-green-500/10">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">
                    Xiriirka shirkadda waa furan yahay — bixi lacagta gudaha <span className="font-extrabold tabular-nums">{secondsLeft}s</span>
                  </p>
                </Card>
              )
            )}

            {items.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                Xirmooyin lama helin. Fadlan isku day mar kale.
              </Card>
            ) : items.map((item: any, idx: number) => {
              const missing = !item.sellable || item.price == null;
              return (
                <Card key={`${item.index}-${idx}`} className="p-4 border-primary/40 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                     <p className="text-sm font-semibold text-foreground min-w-0">{stripProviderPrice(item.raw_label)}</p>
                    <span className="text-xl font-extrabold text-primary shrink-0">
                      {missing ? '—' : `$${Number(item.price).toFixed(2)}`}
                    </span>
                  </div>
                  {(item.info_line1 || item.data_amount) && (
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Smartphone className="h-3.5 w-3.5" /> {item.info_line1 || item.data_amount}
                    </p>
                  )}
                  {(item.info_line2 || item.duration_key) && (
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> {item.info_line2 || item.duration_key}
                    </p>
                  )}
                  <Button
                    className="w-full"
                    disabled={missing || expired}
                    onClick={() => choose(item)}
                  >
                    {missing ? 'Qiimo lama helin' : 'IIBSO'}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const DiscoverPackages: React.FC = () => (
  <PageErrorBoundary>
    <DiscoverPackagesInner />
  </PageErrorBoundary>
);

export default DiscoverPackages;
