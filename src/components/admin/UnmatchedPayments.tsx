// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, UserX, Package, HelpCircle, Send, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ResendDialog } from './ResendDialog';

/**
 * Normalize Somali phone to canonical 9-digit local format
 */
function normalizeSomaliPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('252') && digits.length >= 12) {
    digits = digits.substring(3);
  }
  if (digits.startsWith('0') && digits.length === 10) {
    digits = digits.substring(1);
  }
  return digits.slice(-9);
}

/**
 * Extract sender phone from SMS body
 */
function extractSenderFromSmsBody(smsBody: string): string | null {
  if (!smsBody) return null;
  const patterns = [
    /ka\s+heshay\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /waxaad.*?ka\s+heshay\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /received\s+from\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /lacag\s+ayaad\s+ka\s+heshay\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /received\s+airtime\s+from\s+(\+?252\d{9}|\d{9,12})/i,
    /ka.*?heshay.*?(\+?252\d{9}|\d{9,12})/i,
  ];
  for (const pattern of patterns) {
    const match = smsBody.match(pattern);
    if (match) return normalizeSomaliPhone(match[1]);
  }
  return null;
}

/**
 * Analyze why a payment was unmatched based on admin_notes from edge function
 */
function getUnmatchedReason(payment: any): { icon: React.ReactNode; title: string; detail: string } {
  const notes = (payment.admin_notes || '').toLowerCase();
  
  // AMOUNT MISMATCH (Fraud Protection)
  if (notes.includes('amount mismatch')) {
    // Parse structured admin_notes for full intent display
    const extractField = (field: string) => {
      const regex = new RegExp(`${field}:\\s*([^|]+)`, 'i');
      const match = (payment.admin_notes || '').match(regex);
      return match ? match[1].trim() : null;
    };
    const paid = extractField('Paid') || `$${payment.amount}`;
    const expected = extractField('Expected');
    const intendedPackage = extractField('Intended Package');
    const receiver = extractField('Receiver entered');
    const provider = extractField('Provider');
    
    const detailParts = [`Lacag la bixiyay: ${paid}`];
    if (expected) detailParts.push(`La filayay: ${expected}`);
    if (intendedPackage) detailParts.push(`Xirmo: ${intendedPackage}`);
    if (provider) detailParts.push(`Provider: ${provider}`);
    if (receiver) detailParts.push(`Receiver: ${receiver}`);
    
    return {
      icon: <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />,
      title: '⚠️ Lacagtu kama ekayn dalabka (Fraud Check)',
      detail: detailParts.join(' | ')
    };
  }
  
  if (notes.includes('no offline registration')) {
    return {
      icon: <UserX className="h-4 w-4 text-destructive mt-0.5 shrink-0" />,
      title: 'Lambarkaan system-ka kuma jiro',
      detail: `Lambarka ${payment.sender_phone} ma jiro system-ka. Macmiilku wuu u baahan yahay inuu marka hore isdiiwaangeliyo.`
    };
  }
  
  if (notes.includes('no package found') || notes.includes('no package for')) {
    const crossMatch = notes.match(/waa xirmo (.+?) ah \((.+?)\)/);
    if (crossMatch) {
      return {
        icon: <Package className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />,
        title: 'Provider-ka qaldan ayuu ku isdiiwaangeliyay',
        detail: `$${payment.amount} - waa xirmo ${crossMatch[1]} ah (${crossMatch[2]}), laakiin macmiilku wuxuu isdiiwaangeliyay provider kale.`
      };
    }
    // Parse "No package for $X on Provider (prefix: XX)" format
    const packageMatch = (payment.admin_notes || '').match(/No package for \$?([\d.]+) on (\w+)/i);
    if (packageMatch) {
      return {
        icon: <Package className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />,
        title: `Ma jiro xirmo $${packageMatch[1]} - ${packageMatch[2]}`,
        detail: `$${payment.amount} - ${packageMatch[2]} xirmo qiimahaan la iibiyo ma jiro. SIM: ${payment.receiver_sim || 'N/A'}`
      };
    }
    return {
      icon: <Package className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />,
      title: 'Ma jiro xirmo qiimahaan la iibiyo',
      detail: `$${payment.amount} - ma jiro xirmo qiimahaan ah oo active ah.`
    };
  }
  
  // Fallback: show admin_notes if available
  return {
    icon: <HelpCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />,
    title: 'Sabab la garaneyn',
    detail: payment.admin_notes || `Dalab la mid ah lama helin lambarka ${payment.sender_phone}`
  };
}

const UnmatchedPayments = () => {
  const [unmatchedPayments, setUnmatchedPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [registerPayment, setRegisterPayment] = useState<any | null>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [regForm, setRegForm] = useState({ receiver_phone: '', provider_id: '' });
  const [savingReg, setSavingReg] = useState(false);

  // Resend dialog state
  const [resendPayment, setResendPayment] = useState<any | null>(null);

  useEffect(() => {
    supabase.from('providers_config').select('id, display_name, provider_name').order('sort_order')
      .then(({ data }) => setProviders(data || []));
  }, []);

  const openResend = (payment: any) => {
    setResendPayment(payment);
  };

  const openRegister = (payment: any) => {
    setRegisterPayment(payment);
    setRegForm({ receiver_phone: '', provider_id: '' });
  };

  const submitRegister = async () => {
    if (!registerPayment) return;
    if (!regForm.receiver_phone) { toast.error('Buuxi lambarka qaataha'); return; }
    setSavingReg(true);
    try {
      const { error } = await supabase.from('offline_registrations').insert({
        sender_phone: registerPayment.sender_phone,
        receiver_phone: regForm.receiver_phone,
        provider_id: regForm.provider_id || null,
      });
      if (error) throw error;
      toast.success('Waa la diiwaangeliyay');
      setRegisterPayment(null);
    } catch (e: any) {
      toast.error('Khalad: ' + (e?.message || 'failed'));
    } finally {
      setSavingReg(false);
    }
  };

  const ActionButtons = ({ payment, vertical = false }: { payment: any; vertical?: boolean }) => (
    <div className={vertical ? 'grid grid-cols-2 gap-2 pt-1' : 'flex gap-2'}>
      <Button
        size="sm"
        variant="outline"
        className="text-xs gap-1"
        onClick={() => openResend(payment)}
      >
        <Send className="h-3.5 w-3.5" />
        Dib u dir
      </Button>
      <Button
        size="sm"
        variant="default"
        className="text-xs gap-1"
        onClick={() => openRegister(payment)}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Diiwaangeli
      </Button>
    </div>
  );

  useEffect(() => {
    // Initial fetch - one time only
    const fetchUnmatched = async () => {
      try {
        const { data, error } = await supabase
          .from('payment_receipts')
          .select('*')
          .eq('status', 'unmatched')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setUnmatchedPayments(data || []);
      } catch (error) {
        console.error('Error fetching unmatched payments:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUnmatched();

    // Realtime subscription - no polling
    const channel = supabase
      .channel('unmatched-payments-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payment_receipts' },
        (payload) => {
          const newRow = payload.new as any;
          if (newRow.status === 'unmatched') {
            setUnmatchedPayments(prev => [newRow, ...prev]);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'payment_receipts' },
        (payload) => {
          const updated = payload.new as any;
          if (updated.status === 'unmatched') {
            // Add or update in list
            setUnmatchedPayments(prev => {
              const exists = prev.find(p => p.id === updated.id);
              if (exists) return prev.map(p => p.id === updated.id ? updated : p);
              return [updated, ...prev];
            });
          } else {
            // Remove from unmatched list (it got matched)
            setUnmatchedPayments(prev => prev.filter(p => p.id !== updated.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>⚠️ Unmatched Payments ({unmatchedPayments?.length || 0})</CardTitle>
      </CardHeader>
      <CardContent>
        {unmatchedPayments && unmatchedPayments.length > 0 ? (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-2">
              {unmatchedPayments.map((payment) => {
                const reason = getUnmatchedReason(payment);
                return (
                  <div key={payment.id} className="border rounded-lg p-3 bg-card text-xs space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="font-mono font-medium">{payment.sender_phone}</span>
                      <span className="font-semibold">${payment.amount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{payment.receiver_sim}</Badge>
                      <span className="text-muted-foreground">{new Date(payment.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex items-start gap-2 bg-muted/50 rounded p-2">
                      {reason.icon}
                      <div>
                        <p className="font-medium text-xs">{reason.title}</p>
                        <p className="text-[10px] text-muted-foreground">{reason.detail}</p>
                      </div>
                    </div>
                    <ActionButtons payment={payment} vertical />
                  </div>
                );
              })}
            </div>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sender Phone</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>SIM</TableHead>
                    <TableHead>Sababta (Reason)</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatchedPayments.map((payment) => {
                    const reason = getUnmatchedReason(payment);
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="font-mono">{payment.sender_phone}</TableCell>
                        <TableCell className="font-semibold">${payment.amount}</TableCell>
                        <TableCell><Badge variant="outline">{payment.receiver_sim}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-start gap-2 max-w-xs">
                            {reason.icon}
                            <div>
                              <p className="text-sm font-medium">{reason.title}</p>
                              <p className="text-xs text-muted-foreground">{reason.detail}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(payment.created_at).toLocaleString()}</TableCell>
                        <TableCell><ActionButtons payment={payment} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>✅ No unmatched payments</p>
          </div>
        )}
      </CardContent>
      <Dialog open={!!registerPayment} onOpenChange={(o) => !o && setRegisterPayment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Diiwaangeli Macmiil Cusub</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Lambarka Diraha (Sender)</label>
              <Input value={registerPayment?.sender_phone || ''} readOnly className="font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Lambarka Qaataha (Receiver)</label>
              <Input
                value={regForm.receiver_phone}
                onChange={(e) => setRegForm((p) => ({ ...p, receiver_phone: e.target.value }))}
                placeholder="61XXXXXXX"
                className="font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Shirkadda (Provider)</label>
              <select
                value={regForm.provider_id}
                onChange={(e) => setRegForm((p) => ({ ...p, provider_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              >
                <option value="">-- Dooro Shirkad --</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name || p.provider_name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterPayment(null)}>Jooji</Button>
            <Button onClick={submitRegister} disabled={savingReg}>
              {savingReg ? 'Kaydinaya...' : 'Diiwaangeli'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!resendPayment} onOpenChange={(o) => !o && setResendPayment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" /> Dib u Dir Dalabka (Unmatched)
            </DialogTitle>
            {resendPayment && (
              <p className="text-xs text-muted-foreground">
                Sender: <span className="font-mono">{resendPayment.sender_phone}</span>
                {' • '}Lacag: <span className="font-semibold">${resendPayment.amount}</span>
                {resendPayment.receiver_sim && <> {' • '}SIM: {resendPayment.receiver_sim}</>}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Provider / Shirkadda</label>
              <select
                value={resendProviderId}
                onChange={(e) => setResendProviderId(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm"
              >
                <option value="">Dooro provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name || p.provider_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">
                Category <span className="text-muted-foreground">(ikhtiyaari)</span>
              </label>
              <select
                value={resendCategoryId}
                onChange={(e) => setResendCategoryId(e.target.value)}
                disabled={!resendProviderId}
                className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm disabled:opacity-50"
              >
                <option value="">Dhammaan</option>
                {resendCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.category_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Package</label>
              <select
                value={resendPackageId}
                onChange={(e) => setResendPackageId(e.target.value)}
                disabled={!resendProviderId || resendPackages.length === 0}
                className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm disabled:opacity-50"
              >
                <option value="">Dooro package</option>
                {resendPackages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.package_name}{p.data_amount ? ` - ${p.data_amount}` : ''} (${p.price})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Numberka Qaataha</label>
              <Input
                value={resendReceiver}
                onChange={(e) => setResendReceiver(e.target.value)}
                placeholder="61XXXXXXX"
                className="font-mono mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setResendPayment(null)} className="flex-1">
              Ka noqo
            </Button>
            <Button onClick={submitResend} disabled={savingResend} className="flex-1 gap-1">
              <Send className="h-3.5 w-3.5" />
              {savingResend ? 'Diraya...' : 'Dib u Dir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default UnmatchedPayments;