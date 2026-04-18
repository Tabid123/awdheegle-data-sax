// @ts-nocheck
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Phone, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const AutoTopUpDeliveryRules = () => {
  const [numbers, setNumbers] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [n, p] = await Promise.all([
        supabase.from('auto_topup_numbers').select('*').order('phone_number'),
        supabase.from('auto_topup_packages').select('*').order('selling_price'),
      ]);
      setNumbers((n.data as any) || []);
      setPackages((p.data as any) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Auto Top-Up Delivery Rules</h2>
        <p className="text-sm text-muted-foreground">Eeg sida lacaguhu si automatic ah ugu noqdaan packages.</p>
      </div>

      {numbers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Wali lambar Auto Top-Up lama abuurin. Ku dar tab-ka 'Auto Top-Up Settings'.</CardContent></Card>
      ) : numbers.map(num => {
        const numPkgs = packages.filter(p => p.topup_number_id === num.id);
        return (
          <Card key={num.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                {num.phone_number}
                {!num.is_active && <Badge variant="secondary">Inactive</Badge>}
              </CardTitle>
              {num.label && <p className="text-xs text-muted-foreground">{num.label}</p>}
            </CardHeader>
            <CardContent>
              {numPkgs.length === 0 ? (
                <p className="text-xs text-muted-foreground">Lambarkan wali wax package ah lama xirin.</p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground mb-2">
                    Marka lacag laga helo lambarkan, qiimaha SMS-ka ayaa la barbar dhigayaa packages-ka hoose:
                  </p>
                  {numPkgs.map(pkg => (
                    <div key={pkg.id} className="flex items-center justify-between border rounded-md p-2 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        <div>
                          <span className="text-sm font-semibold">{pkg.package_name}</span>
                          {pkg.data_amount && <span className="ml-2 text-xs text-muted-foreground">{pkg.data_amount}</span>}
                          {pkg.ussd_code && <p className="text-[10px] text-muted-foreground">USSD: {pkg.ussd_code}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-green-600 font-bold text-sm">${pkg.selling_price}</span>
                        {pkg.is_active ? (
                          <Badge variant="outline" className="text-[10px] border-green-500 text-green-600">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Off</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Sida ay u shaqayso:</p>
          <p>1. Lacag waxay ka soo gashay lambar Auto Top-Up.</p>
          <p>2. System wuxuu raadiyaa package-ka qiimihiisu la mid yahay lacagta.</p>
          <p>3. Haddii la helo → USSD-ga ayaa automatic ahaan loo diraa lambarka.</p>
          <p>4. Haddii qiimaha aan match-garayn package → Unmatched.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AutoTopUpDeliveryRules;
