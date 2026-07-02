import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Pencil, CreditCard, User, Users, ShieldCheck, Send, Info, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

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

  if (!sim || !customer || !mother || !guarantor) {
    // Missing data — bounce back
    navigate('/sim-cards', { replace: true });
    return null;
  }

  const handleConfirm = () => {
    setSubmitting(true);
    const msg = encodeURIComponent(
      `*Dalab SIM Card Cusub*\n\n` +
        `Nooca: ${sim.type || '-'}\n` +
        `Shirkadda: ${sim.provider || '-'}\n` +
        `Lambarka SIM: ${sim.number || '-'}\n` +
        `Qiimaha: ${sim.price || '-'}\n\n` +
        `*Magaca Macaamilka:*\n${customer.first} ${customer.father} ${customer.grandfather}\n\n` +
        `*Magaca Hooyada:*\n${mother.first} ${mother.father} ${mother.grandfather}\n\n` +
        `*Lambarka Damiinka:*\n${guarantor}`,
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
          onClick={handleConfirm}
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
    </div>
  );
};

export default SimCardConfirm;