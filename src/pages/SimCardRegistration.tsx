import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, User, Users, ShieldCheck, Phone, ChevronRight, CreditCard } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface SimInfo {
  type?: string;
  provider?: string;
  number?: string;
  price?: string;
}

const SimCardRegistration = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const sim: SimInfo = (location.state as any)?.sim || {};

  const [customer1, setCustomer1] = useState('');
  const [customer2, setCustomer2] = useState('');
  const [customer3, setCustomer3] = useState('');
  const [mother1, setMother1] = useState('');
  const [mother2, setMother2] = useState('');
  const [mother3, setMother3] = useState('');
  const [guarantor, setGuarantor] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!customer1.trim() || !customer2.trim() || !customer3.trim()) {
      toast({ title: 'Khalad', description: 'Fadlan buuxi magaca macaamilka (3 qaybood)', variant: 'destructive' });
      return;
    }
    if (!mother1.trim() || !mother2.trim() || !mother3.trim()) {
      toast({ title: 'Khalad', description: 'Fadlan buuxi magaca hooyada (3 qaybood)', variant: 'destructive' });
      return;
    }
    if (!guarantor.trim() || guarantor.trim().length < 9) {
      toast({ title: 'Khalad', description: 'Fadlan geli lambar damiin sax ah', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const msg = encodeURIComponent(
      `*Dalab SIM Card Cusub*\n\n` +
      `Nooca: ${sim.type || '-'}\n` +
      `Shirkadda: ${sim.provider || '-'}\n` +
      `Lambarka SIM: ${sim.number || '-'}\n` +
      `Qiimaha: ${sim.price || '-'}\n\n` +
      `*Magaca Macaamilka:*\n${customer1} ${customer2} ${customer3}\n\n` +
      `*Magaca Hooyada:*\n${mother1} ${mother2} ${mother3}\n\n` +
      `*Lambarka Damiinka:*\n${guarantor}`
    );
    window.open(`https://wa.me/252615555495?text=${msg}`, '_blank');
    setTimeout(() => {
      setSubmitting(false);
      toast({ title: 'Guul', description: 'Dalabkaaga waa la diray. Waan kula soo xiriiri doonaa.' });
      navigate('/sim-cards');
    }, 600);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
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
          <h1 className="text-base font-bold text-primary">Diiwaangelinta Macmiilka</h1>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: 'calc(4.5rem + var(--effective-safe-area-top, 0px))',
          paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Hero banner */}
        <div className="px-4 pt-2">
          <div className="relative rounded-2xl bg-primary text-primary-foreground p-5 shadow-elegant overflow-hidden">
            <h2 className="text-xl font-extrabold">Ku soo dhawaaw</h2>
            <p className="text-sm text-primary-foreground/85 mt-1.5 leading-snug max-w-[75%]">
              Fadlan buuxi macluumaadka hoose si aad u hesho SIM card-kaaga.
            </p>
            <CreditCard className="w-20 h-20 absolute -right-2 -bottom-2 text-primary-foreground/15" />
          </div>
        </div>

        {sim.number && (
          <div className="px-4 mt-3">
            <div className="rounded-xl border border-border/60 bg-card p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground tracking-widest">SIM LA DOORTAY</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{sim.number}</p>
                <p className="text-xs text-muted-foreground">{sim.provider} • {sim.type}</p>
              </div>
              <span className="text-lg font-extrabold text-primary">{sim.price}</span>
            </div>
          </div>
        )}

        {/* Customer name */}
        <div className="px-4 mt-5">
          <div className="rounded-2xl bg-card border border-border/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Magaca Macaamilka (3 qaybood)</h3>
            </div>
            <div className="space-y-3">
              <FieldGroup label="Magaca Koowaad" placeholder="Tusaale: Axmed" value={customer1} onChange={setCustomer1} />
              <FieldGroup label="Magaca Aabbaha" placeholder="Tusaale: Cali" value={customer2} onChange={setCustomer2} />
              <FieldGroup label="Magaca Awoowga" placeholder="Tusaale: Warsame" value={customer3} onChange={setCustomer3} />
            </div>
          </div>
        </div>

        {/* Mother name */}
        <div className="px-4 mt-5">
          <div className="rounded-2xl bg-card border border-border/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Magaca Hooyada (3 qaybood)</h3>
            </div>
            <div className="space-y-3">
              <FieldGroup label="Magaca Koowaad" placeholder="Hooyo" value={mother1} onChange={setMother1} />
              <FieldGroup label="Magaca Aabbaha" placeholder="Aabbe" value={mother2} onChange={setMother2} />
              <FieldGroup label="Magaca Awoowga" placeholder="Awoowe" value={mother3} onChange={setMother3} />
            </div>
          </div>
        </div>

        {/* Guarantor */}
        <div className="px-4 mt-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Macluumaadka Damiinka</h3>
          </div>
          <div className="rounded-2xl border border-dashed border-border p-4">
            <label className="text-xs font-medium text-foreground">Lambarka Damiinka</label>
            <div className="mt-1.5 relative">
              <Phone className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                inputMode="tel"
                placeholder="252..."
                value={guarantor}
                onChange={(e) => setGuarantor(e.target.value)}
                className="w-full pl-9 pr-3 py-3 rounded-xl bg-muted/60 text-sm font-medium text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Hubi in lambarku yahay mid shaqaynaya.</p>
          </div>
        </div>

        {/* Reassurance */}
        <div className="px-4 mt-4">
          <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Xaqiijinta Aqoonsiga</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Macluumaadkaaga waxaa loo xafidi doonaa si ammaan ah.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-background border-t border-border/60 p-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-primary text-primary-foreground text-base font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {submitting ? 'Waa la dirayaa...' : 'Dhammaystir Dalabka'}
          {!submitting && <ChevronRight className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};

const FieldGroup = ({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <div>
    <label className="text-xs font-medium text-foreground">{label}</label>
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={40}
      className="mt-1.5 w-full px-3 py-3 rounded-xl bg-muted/60 text-sm font-medium text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 focus:ring-primary/30"
    />
  </div>
);

export default SimCardRegistration;