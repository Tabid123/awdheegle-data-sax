import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Pencil, CreditCard, User, ShieldCheck, Send, Info, Check, CreditCard as CardIcon, Smartphone, Banknote, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PaymentLoadingOverlay } from '@/components/PaymentLoadingOverlay';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface PayProviderRow {
  id: string;
  provider_name: string;
  display_name: string;
  logo_url: string | null;
  prefixes: string[] | null;
  sort_order: number;
}

const FALLBACK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  evc: CardIcon,
  edahab: Banknote,
  sahal: Smartphone,
};

interface ConfirmState {
  sim?: { type?: string; provider?: string; number?: string; price?: string };
  customer?: { first: string; father: string; grandfather: string };
  mother?: { first: string; father: string; grandfather: string };
  guarantor?: string;
  dob?: string;
}

const Stepper = () => (
  <div className="flex items-center justify-between px-2">
    {[
      { n: 1, label: 'Doorashada' },
      { n: 2, label: 'Xogta' },
      { n: 3, label: 'Xaqiijinta' },
    ].map((s, i) => (
      <React.Fragment key={s.n}>
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
            {s.n < 3 ? <Check className="w-4 h-4" /> : s.n}
          </div>
          <span className={`text-[11px] font-semibold ${s.n === 3 ? 'text-primary' : 'text-muted-foreground'}`}>
            {s.label}
          </span>
        </div>
        {i < 2 && <div className="flex-1 h-0.5 bg-primary/60 mx-1 -mt-5" />}
      </React.Fragment>
    ))}
  </div>
);

const Row = ({
  icon,
  title,
  onEdit,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) => (
  <div className="rounded-2xl bg-card border border-border/60 p-4">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">{icon}</div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      <button
        onClick={onEdit}
        className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"
        aria-label="Wax ka beddel"
      >
        <Pencil className="w-4 h-4 text-primary" />
      </button>
    </div>
    <div className="pl-10">{children}</div>
  </div>
);

const SimCardConfirm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as ConfirmState) || {};
  const { sim, customer, mother, guarantor, dob } = state;
  const [submitting, setSubmitting] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [payProvider, setPayProvider] = useState<string>('');
  const [payNumber, setPayNumber] = useState('');
  const [providers, setProviders] = useState<PayProviderRow[]>([]);
  const [prefixError, setPrefixError] = useState<string>('');

  const selectedProvider = providers.find((p) => p.provider_name === payProvider);
  const activePrefixes = (selectedProvider?.prefixes || []).filter(Boolean);
  const prefixHint = activePrefixes.length ? activePrefixes.join(' / ') : '';
  const placeholderPrefix = activePrefixes[0] || '61';

  // Reset entered number whenever provider changes
  useEffect(() => {
    setPayNumber('');
    setPrefixError('');
  }, [payProvider]);

  const handleNumberChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 9);
    if (!digits) {
      setPayNumber('');
      setPrefixError('');
      return;
    }
    if (activePrefixes.length) {
      const matches = activePrefixes.some((pfx) => {
        const len = Math.min(pfx.length, digits.length);
        return digits.slice(0, len) === pfx.slice(0, len);
      });
      if (!matches) {
        // Reject the typed digit entirely – keep prior value, show clear error
        const provName = selectedProvider?.display_name || payProvider || 'Shirkadda';
        setPrefixError(
          `❌ Lambarkani kuma habboona ${provName}. Waa inuu ku bilowdaa: ${activePrefixes.join(' ama ')}. Tusaale: ${activePrefixes[0]}xxxxxxx`
        );
        return;
      }
    }
    setPayNumber(digits);
    setPrefixError('');
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('payment_providers_config')
        .select('id, provider_name, display_name, logo_url, prefixes, sort_order, is_active, enabled_for_sim_cards')
        .eq('is_active', true)
        .eq('enabled_for_sim_cards', true)
        .order('sort_order', { ascending: true });
      const rows = (data as any[] as PayProviderRow[]) || [];
      setProviders(rows);
      if (rows.length && !payProvider) setPayProvider(rows[0].provider_name);
    })();
  }, []);

  if (!sim || !sim.number || !customer || !mother || !guarantor) {
    // Missing data — bounce back
    navigate('/sim-cards', { replace: true });
    return null;
  }

  const openPayment = () => {
    setPayOpen(true);
  };

  const parsePrice = (raw?: string): number => {
    if (!raw) return 0;
    const digits = String(raw).replace(/[^\d.]/g, '');
    const n = parseFloat(digits);
    return isNaN(n) ? 0 : n;
  };

  const handleConfirm = async () => {
    const cleanPhone = payNumber.replace(/\D/g, '');
    if (cleanPhone.length !== 9) {
      toast({ title: 'Khalad', description: 'Lambarku waa inuu ahaadaa 9 lambar', variant: 'destructive' });
      return;
    }
    const selected = providers.find((p) => p.provider_name === payProvider);
    const prefixes = (selected?.prefixes || []).filter(Boolean);
    if (prefixes.length && !prefixes.some((pfx) => cleanPhone.startsWith(pfx))) {
      toast({
        title: 'Lambar aan la aqbali karin',
        description: `${selected?.display_name || payProvider} wuxuu aqbalaa kaliya: ${prefixes.join(', ')}`,
        variant: 'destructive',
      });
      return;
    }
    const priceNum = parsePrice(sim.price);
    if (!priceNum || priceNum <= 0) {
      toast({
        title: 'Qiimo lama helin',
        description: 'Fadlan ka noqo oo dooro SIM card leh qiime sax ah.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const fullName = `${customer.first} ${customer.father} ${customer.grandfather}`.trim();
      const motherFull = `${mother.first} ${mother.father} ${mother.grandfather}`.trim();

      // 1) Insert order row — generate ID client-side so we don't need SELECT-after-insert
      const newOrderId = (globalThis.crypto?.randomUUID?.() as string) ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const { error: insErr } = await (supabase as any)
        .from('sim_card_orders')
        .insert({
          id: newOrderId,
          user_id: user?.id ?? null,
          full_name: fullName,
          mother_name: motherFull,
          guarantor_phone: guarantor,
          date_of_birth: dob ?? null,
          sim_provider: sim.provider ?? null,
          sim_number: sim.number ?? '',
          sim_type: sim.type ?? null,
          price: priceNum,
          payment_provider: payProvider,
          payment_phone: cleanPhone,
          payment_status: 'pending',
          order_status: 'new',
        });

      if (insErr) {
        throw new Error(insErr.message || 'Ma suurta gelin abuurista dalabka');
      }

      // 2) Trigger WaafiPay via edge function
      const { data, error } = await supabase.functions.invoke('waafipay-simcard-payment', {
        body: {
          orderId: newOrderId,
          amount: priceNum,
          paymentPhone: cleanPhone,
          paymentProvider: payProvider,
        },
      });

      if (error) {
        throw new Error(error.message || 'Khalad ayaa dhacay');
      }

      if (data?.success) {
        setOrderId(newOrderId);
        setPayOpen(false);
        setSuccessOpen(true);
      } else {
        const msg = data?.error || 'Lacag bixintu way fashilantay';
        const code = data?.responseCode ? ` (code ${data.responseCode})` : '';
        toast({
          title: '❌ Lacag bixintu way fashilantay',
          description: `${msg}${code}. Fadlan hubi hadhaagaaga & lambarka, kadibna isku day mar kale.`,
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Khalad',
        description: err?.message || 'Khalad aan la garaneyn ayaa dhacay',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PaymentLoadingOverlay isLoading={submitting} />
      <div
        className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border/60"
        style={{ paddingTop: 'var(--effective-safe-area-top, 0px)' }}
      >
        <div className="p-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-primary" />
          </button>
          <h1 className="text-base font-bold text-primary">Xaqiijinta Dalabka</h1>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: 'calc(4.5rem + var(--effective-safe-area-top, 0px))',
          paddingBottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="px-4 pt-3">
          <Stepper />
        </div>

        <div className="px-4 mt-5">
          <h2 className="text-2xl font-extrabold text-foreground">Hubi Xogtaada</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-snug">
            Fadlan iska hubi in xogta hoos ku qoran ay sax tahay ka hor inta aadan gudbin dalabkaaga.
          </p>
        </div>

        <div className="px-4 mt-4 space-y-3">
          <Row
            icon={<CreditCard className="w-4 h-4 text-primary" />}
            title=""
            onEdit={() => navigate('/sim-cards')}
          >
            <div className="-mt-8 pl-0">
              <p className="text-[10px] font-bold text-muted-foreground tracking-widest">LAMBARKA LA DOORTAY</p>
              <p className="text-lg font-extrabold text-primary mt-0.5">{sim.number}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300">
                  {sim.type}
                </span>
                <span className="text-xs font-semibold text-foreground">{sim.price}</span>
              </div>
            </div>
          </Row>

          <Row
            icon={<User className="w-4 h-4 text-primary" />}
            title="Xogta Macaamilka"
            onEdit={() => navigate(-1)}
          >
            <p className="text-[11px] text-muted-foreground">Magaca Macaamilka</p>
            <p className="text-sm font-bold text-foreground">
              {customer.first} {customer.father} {customer.grandfather}
            </p>
            <p className="text-[11px] text-muted-foreground mt-2">Magaca Hooyada</p>
            <p className="text-sm font-bold text-foreground">
              {mother.first} {mother.father} {mother.grandfather}
            </p>
          </Row>

          <Row
            icon={<ShieldCheck className="w-4 h-4 text-primary" />}
            title="Lambarka Damiinka"
            onEdit={() => navigate(-1)}
          >
            <p className="text-sm font-bold text-foreground">{guarantor}</p>
          </Row>

          {dob && (
            <Row
              icon={<User className="w-4 h-4 text-primary" />}
              title="Taariikhda Dhalashada"
              onEdit={() => navigate(-1)}
            >
              <p className="text-sm font-bold text-foreground">{dob}</p>
            </Row>
          )}
        </div>

        <div className="px-4 mt-4">
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground leading-relaxed">
              Markaad xaqiijiso dalabka, waxaad heli doontaa SMS xaqiijin ah. Fadlan hubi in taleefankaagu uu shidan yahay.
            </p>
          </div>
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 bg-background border-t border-border/60 p-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          onClick={openPayment}
          disabled={submitting}
          className="w-full bg-primary text-primary-foreground text-base font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {submitting ? 'Waa la dirayaa...' : 'Xaqiiji oo Gudbi'}
          {!submitting && <Send className="w-5 h-5" />}
        </button>
        <p className="text-[11px] text-center text-muted-foreground mt-2">
          Markaad rixdo "Xaqiiji", waxaad ogolaatay Shuruudaha Adeegga.
        </p>
      </div>

      {/* Payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm rounded-2xl p-5 gap-0 border-border/60">
          <DialogTitle className="text-lg font-extrabold text-foreground mb-4 pr-8">
            Bixinta Lacagta
          </DialogTitle>

          <DialogDescription className="sr-only">
            Dooro adeegga lacag-bixinta oo geli lambarkaaga.
          </DialogDescription>

          <p className="text-[10px] font-bold tracking-widest text-muted-foreground mb-2">DOORO ADEEGGA</p>
          <div className="grid grid-cols-3 gap-2.5 mb-5">
            {providers.map((p) => {
              const active = payProvider === p.provider_name;
              const key = (p.provider_name || '').toLowerCase();
              const Icon = FALLBACK_ICONS[key] || CardIcon;
              return (
                <button
                  key={p.id}
                  onClick={() => setPayProvider(p.provider_name)}
                  className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-3 px-1 transition-all ${
                    active
                      ? 'border-primary bg-primary/5'
                      : 'border-border/70 bg-card hover:bg-muted/40'
                  }`}
                >
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden ${
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    }`}
                  >
                    {p.logo_url ? (
                      <img src={p.logo_url} alt={p.display_name} className="w-full h-full object-cover" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <span className={`text-[11px] font-bold ${active ? 'text-primary' : 'text-foreground'}`}>
                    {p.display_name}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-[10px] font-bold tracking-widest text-muted-foreground mb-2">LAMBARKA LACAG BIXINTA</p>
          <input
            type="tel"
            inputMode="tel"
            placeholder={`${placeholderPrefix} xxx xxxx`}
            maxLength={9}
            value={payNumber}
            onChange={(e) => handleNumberChange(e.target.value)}
            className={`w-full px-4 py-3.5 rounded-xl bg-muted/60 text-sm font-medium text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 ${
              prefixError ? 'ring-2 ring-destructive/60 focus:ring-destructive/60' : 'focus:ring-primary/30'
            }`}
          />
          {prefixError ? (
            <div className="mt-2 mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
              <p className="text-[12px] font-semibold text-destructive leading-snug">
                {prefixError}
              </p>
            </div>
          ) : prefixHint ? (
            <p className="text-[11px] text-muted-foreground mt-1.5 mb-4">
              Waa inuu ku bilowdaa: <span className="font-bold text-primary">{prefixHint}</span>
              {activePrefixes[0] && (
                <span className="text-muted-foreground/70"> · Tusaale: {activePrefixes[0]}xxxxxxx</span>
              )}
            </p>
          ) : (
            <div className="mb-5" />
          )}

          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full bg-primary text-primary-foreground text-base font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {submitting ? 'Waa la dirayaa...' : 'Bixi Hadda'}
            {!submitting && <CheckCircle2 className="w-5 h-5" />}
          </button>

          <button
            onClick={() => setPayOpen(false)}
            disabled={submitting}
            className="w-full text-center text-sm font-semibold text-primary mt-3 hover:underline"
          >
            Cancel
          </button>
        </DialogContent>
      </Dialog>

      {/* Success + WhatsApp dialog */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-sm rounded-2xl p-0 gap-0 border-border/60 overflow-hidden">
          <div className="bg-muted/40 p-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-9 h-9 text-green-600 dark:text-green-400" />
            </div>
            <DialogTitle className="text-lg font-extrabold text-foreground">
              Lacag-bixintu Way Guulaysatay
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Mahadsanid! Dalabkaaga waa la helay. Fadlan la xiriir nagala soo xiriir WhatsApp-kan kuu muuqda, si aad u dhameystirto dalakaaga. mahadsanid.
            </DialogDescription>
          </div>
          <div className="p-5 space-y-3 bg-card">
            <button
              onClick={() => {
                const fullName = `${customer.first} ${customer.father} ${customer.grandfather}`.trim();
                const motherFull = `${mother.first} ${mother.father} ${mother.grandfather}`.trim();
                const formatPhone = (raw?: string) => {
                  if (!raw) return '';
                  const digits = raw.replace(/\D/g, '');
                  if (digits.startsWith('252')) {
                    return `+252 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
                  }
                  if (digits.startsWith('0')) {
                    return `+252 ${digits.slice(1, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
                  }
                  return `+252 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
                };
                const text = `Asc, Waxaan iibsaday SIM card. Dalabkaygu: ${formatPhone(sim.number)}\n\nMagaca qofka oo sadaxan: ${fullName}\n\nMagaca hooyo o sadaxan: ${motherFull}\n\nTaariikhda dhalashada: ${dob || 'N/A'}\n\nLambarka damiinka: ${guarantor}\n\nQiimaha: ${sim.price}\n\n(${sim.type} - ${sim.provider}). Order ID: ${orderId}`;
                window.open(`https://wa.me/252615555495?text=${encodeURIComponent(text)}`, '_blank');
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white text-base font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.447-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Nagala soo xiriir WhatsApp
            </button>
            <button
              onClick={() => {
                setSuccessOpen(false);
                navigate('/sim-cards');
              }}
              className="w-full text-center text-sm font-semibold text-primary hover:underline"
            >
              Xir
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SimCardConfirm;