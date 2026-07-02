import React, { useState } from 'react';
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

const PAYMENT_PROVIDERS: { id: string; name: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'evc', name: 'EVC Plus', Icon: CardIcon },
  { id: 'edahab', name: 'e-Dahab', Icon: Banknote },
  { id: 'sahal', name: 'Sahal', Icon: Smartphone },
];

interface ConfirmState {
  sim?: { type?: string; provider?: string; number?: string; price?: string };
  customer?: { first: string; father: string; grandfather: string };
  mother?: { first: string; father: string; grandfather: string };
  guarantor?: string;
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
  const { sim, customer, mother, guarantor } = state;
  const [submitting, setSubmitting] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payProvider, setPayProvider] = useState<string>('evc');
  const [payNumber, setPayNumber] = useState('');

  if (!sim || !customer || !mother || !guarantor) {
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
    if (cleanPhone.length < 9) {
      toast({ title: 'Khalad', description: 'Fadlan geli lambar lacag-bixin sax ah', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const priceNum = parsePrice(sim.price);
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
        setPayOpen(false);
        toast({
          title: 'Lacagta waa la helay',
          description: 'Waan kula soo xiriiri doonaa 24 saacadood gudahood.',
        });
        navigate('/sim-cards');
      } else {
        const msg = data?.error || 'Lacag bixintu way fashilantay';
        toast({ title: 'Lacag bixintu way fashilantay', description: msg, variant: 'destructive' });
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
            {PAYMENT_PROVIDERS.map((p) => {
              const active = payProvider === p.id;
              const Icon = p.Icon;
              return (
                <button
                  key={p.id}
                  onClick={() => setPayProvider(p.id)}
                  className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-3 px-1 transition-all ${
                    active
                      ? 'border-primary bg-primary/5'
                      : 'border-border/70 bg-card hover:bg-muted/40'
                  }`}
                >
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`text-[11px] font-bold ${active ? 'text-primary' : 'text-foreground'}`}>
                    {p.name}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-[10px] font-bold tracking-widest text-muted-foreground mb-2">LAMBARKA LACAG BIXINTA</p>
          <input
            type="tel"
            inputMode="tel"
            placeholder="252..."
            value={payNumber}
            onChange={(e) => setPayNumber(e.target.value)}
            className="w-full px-4 py-3.5 rounded-xl bg-muted/60 text-sm font-medium text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 focus:ring-primary/30 mb-5"
          />

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
    </div>
  );
};

export default SimCardConfirm;