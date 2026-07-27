// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import {
  Banknote, RefreshCw, KeyRound, Search, CheckCircle2, XCircle, AlertCircle, Copy,
} from 'lucide-react';

type BankTx = {
  id: string;
  tran_no: string;
  tran_date_time: string | null;
  tran_amt: number;
  customer_name: string | null;
  narration: string | null;
  dr_cr: string | null;
  parsed_sender_phone: string | null;
  parsed_receiver_phone: string | null;
  match_status: string;
  matched_payment_id: string | null;
  created_at: string;
};

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'all';
type StatusFilter = 'all' | 'matched' | 'unmatched' | 'ignored_debit' | 'failed_parse';

const startOf = (p: Period): Date | null => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === 'today') return d;
  if (p === 'yesterday') { const y = new Date(d); y.setDate(y.getDate() - 1); return y; }
  if (p === 'week') { const w = new Date(d); w.setDate(w.getDate() - 7); return w; }
  if (p === 'month') { const m = new Date(d); m.setDate(m.getDate() - 30); return m; }
  return null;
};
const endOf = (p: Period): Date | null => {
  if (p !== 'yesterday') return null;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export default function BankTransactions() {
  const { language } = useLanguage();
  const isSo = language === 'so';
  const { toast } = useToast();

  const [rows, setRows] = useState<BankTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<Period>('today');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');

  const [credOpen, setCredOpen] = useState(false);
  const [credUser, setCredUser] = useState('');
  const [credPass, setCredPass] = useState('');
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [savingCred, setSavingCred] = useState(false);

  const [matchOpen, setMatchOpen] = useState(false);
  const [matchTx, setMatchTx] = useState<BankTx | null>(null);
  const [pendings, setPendings] = useState<any[]>([]);
  const [matchingId, setMatchingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('bank_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      const s = startOf(period); const e = endOf(period);
      if (s) query = query.gte('created_at', s.toISOString());
      if (e) query = query.lt('created_at', e.toISOString());
      if (status !== 'all') {
        if (status === 'matched') query = query.in('match_status', ['matched', 'manual_matched']);
        else query = query.eq('match_status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRows((data || []) as BankTx[]);
    } catch (e: any) {
      toast({ title: isSo ? 'Qalad' : 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadUsername = async () => {
    const { data } = await supabase
      .from('bank_credentials')
      .select('username')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.username) setCurrentUsername(data.username);
  };

  useEffect(() => { load(); }, [period, status]); // eslint-disable-line
  useEffect(() => { loadUsername(); }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('bank-transactions-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_transactions' }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      return (
        (r.tran_no || '').toLowerCase().includes(term) ||
        (r.customer_name || '').toLowerCase().includes(term) ||
        (r.parsed_sender_phone || '').toLowerCase().includes(term) ||
        (r.parsed_receiver_phone || '').toLowerCase().includes(term) ||
        (r.narration || '').toLowerCase().includes(term)
      );
    });
  }, [rows, q]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const matched = filtered.filter((r) => r.match_status === 'matched' || r.match_status === 'manual_matched').length;
    const unmatched = filtered.filter((r) => r.match_status === 'unmatched').length;
    const totalAmount = filtered
      .filter((r) => (r.dr_cr || '').toLowerCase() === 'cr')
      .reduce((sum, r) => sum + Number(r.tran_amt || 0), 0);
    return { total, matched, unmatched, totalAmount };
  }, [filtered]);

  const base = (() => {
    try {
      const publishedHosts = ['awdheegledata.com', 'www.awdheegledata.com', 'awdhegledata.lovable.app'];
      const host = window.location.hostname;
      if (publishedHosts.includes(host)) return `https://${host}`;
    } catch {}
    return 'https://xpqvfcmalgvrpoqwbqtv.supabase.co';
  })();
  const loginUrl = `${base.includes('supabase.co') ? base : 'https://xpqvfcmalgvrpoqwbqtv.supabase.co'}/functions/v1/bank-login`;
  const pushUrl = `${base.includes('supabase.co') ? base : 'https://xpqvfcmalgvrpoqwbqtv.supabase.co'}/functions/v1/bank-push-transaction`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: isSo ? 'La koobiyay' : 'Copied' });
    } catch {}
  };

  const saveCred = async () => {
    if (!credUser.trim() || credPass.length < 6) {
      toast({ title: isSo ? 'Qalad' : 'Error', description: isSo ? 'Password ha ka yaraan 6' : 'Password must be at least 6 chars', variant: 'destructive' });
      return;
    }
    setSavingCred(true);
    try {
      const { error } = await supabase.rpc('set_bank_credential', { p_username: credUser.trim(), p_password: credPass });
      if (error) throw error;
      toast({ title: isSo ? 'La kaydiyay' : 'Saved' });
      setCredPass('');
      setCredOpen(false);
      loadUsername();
    } catch (e: any) {
      toast({ title: isSo ? 'Qalad' : 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingCred(false);
    }
  };

  const openManualMatch = async (tx: BankTx) => {
    setMatchTx(tx);
    setMatchOpen(true);
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('pending_online_payments')
      .select('id, sender_phone, receiver_phone, expected_amount, created_at, payment_provider')
      .eq('status', 'pending')
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);
    setPendings(data || []);
  };

  const performManualMatch = async (paymentId: string) => {
    if (!matchTx) return;
    setMatchingId(paymentId);
    try {
      const { error: e1 } = await supabase
        .from('pending_online_payments')
        .update({ status: 'matched', matched_at: new Date().toISOString() })
        .eq('id', paymentId);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from('bank_transactions')
        .update({
          match_status: 'manual_matched',
          matched_payment_id: paymentId,
          match_notes: 'Manually matched by admin',
          processed_at: new Date().toISOString(),
        })
        .eq('id', matchTx.id);
      if (e2) throw e2;

      supabase.functions.invoke('activate-package', {
        body: { pendingPaymentId: paymentId, source: 'bank_manual', tranNo: matchTx.tran_no },
      }).catch((e) => console.error('activate-package invoke failed', e));

      toast({ title: isSo ? 'La isku laablabay' : 'Matched' });
      setMatchOpen(false);
      setMatchTx(null);
      load();
    } catch (e: any) {
      toast({ title: isSo ? 'Qalad' : 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setMatchingId(null);
    }
  };

  const StatusBadge = ({ s }: { s: string }) => {
    if (s === 'matched' || s === 'manual_matched')
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1"><CheckCircle2 className="h-3 w-3" />{s === 'manual_matched' ? (isSo ? 'Manual' : 'Manual') : (isSo ? 'Match' : 'Matched')}</Badge>;
    if (s === 'unmatched')
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 gap-1"><AlertCircle className="h-3 w-3" />{isSo ? 'Lama Helin' : 'Unmatched'}</Badge>;
    if (s === 'ignored_debit')
      return <Badge variant="outline" className="gap-1"><XCircle className="h-3 w-3" />Debit</Badge>;
    return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />{s}</Badge>;
  };

  const periodLabel = (p: Period) =>
    p === 'today' ? (isSo ? 'Maanta' : 'Today')
    : p === 'yesterday' ? (isSo ? 'Shalay' : 'Yesterday')
    : p === 'week' ? (isSo ? 'Isbuucan' : 'Week')
    : p === 'month' ? (isSo ? 'Bishaan' : 'Month')
    : (isSo ? 'Dhammaan' : 'All');

  return (
    <div className="space-y-3">
      {/* Header */}
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Banknote className="h-6 w-6 text-blue-600" />
            <div>
              <div className="font-bold text-base">{isSo ? 'Lacagaha Bank-ka' : 'Bank Transactions'}</div>
              {currentUsername && <div className="text-xs text-muted-foreground">User: {currentUsername}</div>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline ml-1">{isSo ? 'Cusboonaysii' : 'Refresh'}</span>
            </Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => { setCredUser(currentUsername || ''); setCredOpen(true); }}>
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Bank Credentials</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="bg-blue-50 dark:bg-blue-950/40 border-blue-200">
          <CardContent className="p-3">
            <div className="text-xs text-blue-700 dark:text-blue-300">{isSo ? 'Wadarta' : 'Total'}</div>
            <div className="text-xl font-bold text-blue-900 dark:text-blue-100">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 dark:bg-green-950/40 border-green-200">
          <CardContent className="p-3">
            <div className="text-xs text-green-700 dark:text-green-300">Match</div>
            <div className="text-xl font-bold text-green-900 dark:text-green-100">{stats.matched}</div>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200">
          <CardContent className="p-3">
            <div className="text-xs text-yellow-700 dark:text-yellow-300">{isSo ? 'Lama Helin' : 'Unmatched'}</div>
            <div className="text-xl font-bold text-yellow-900 dark:text-yellow-100">{stats.unmatched}</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200">
          <CardContent className="p-3">
            <div className="text-xs text-emerald-700 dark:text-emerald-300">{isSo ? 'Lacagta' : 'Amount'}</div>
            <div className="text-xl font-bold text-emerald-900 dark:text-emerald-100">${stats.totalAmount.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap gap-1">
            {(['today','yesterday','week','month','all'] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium ${period === p ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                {periodLabel(p)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {(['all','matched','unmatched','ignored_debit','failed_parse'] as StatusFilter[]).map((s) => (
              <button key={s} onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium ${status === s ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={isSo ? 'Raadi...' : 'Search...'} value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
        </CardContent>
      </Card>

      {/* API URLs */}
      <Card>
        <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">API URLs</CardTitle></CardHeader>
        <CardContent className="p-3 pt-1 bg-gray-50 dark:bg-gray-900/50 space-y-2">
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground mb-1">Login:</div>
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded px-2 py-1.5 border">
              <code className="text-[11px] flex-1 break-all">{loginUrl}</code>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(loginUrl)}><Copy className="h-3 w-3" /></Button>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground mb-1">Push:</div>
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded px-2 py-1.5 border">
              <code className="text-[11px] flex-1 break-all">{pushUrl}</code>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(pushUrl)}><Copy className="h-3 w-3" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tran No</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Receiver</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{isSo ? 'Wax lama helin' : 'No transactions'}</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.tran_no}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {r.tran_date_time ? format(new Date(r.tran_date_time), 'MMM d, HH:mm') : format(new Date(r.created_at), 'MMM d, HH:mm')}
                  </TableCell>
                  <TableCell className="text-right font-bold">${Number(r.tran_amt).toFixed(2)}</TableCell>
                  <TableCell className="text-xs">{r.parsed_sender_phone || '—'}</TableCell>
                  <TableCell className="text-xs">{r.parsed_receiver_phone || '—'}</TableCell>
                  <TableCell><StatusBadge s={r.match_status} /></TableCell>
                  <TableCell>
                    {r.match_status === 'unmatched' && (
                      <Button size="sm" variant="outline" onClick={() => openManualMatch(r)}>Manual Match</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Credentials Dialog */}
      <Dialog open={credOpen} onOpenChange={setCredOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bank Credentials</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {currentUsername && (
              <div className="text-xs text-muted-foreground">{isSo ? 'Isticmaale hadda' : 'Current user'}: <b>{currentUsername}</b></div>
            )}
            <div>
              <label className="text-xs font-medium">Username</label>
              <Input value={credUser} onChange={(e) => setCredUser(e.target.value)} placeholder="bankuser" />
            </div>
            <div>
              <label className="text-xs font-medium">New Password (min 6)</label>
              <Input type="password" value={credPass} onChange={(e) => setCredPass(e.target.value)} placeholder="••••••••" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredOpen(false)}>{isSo ? 'Jooji' : 'Cancel'}</Button>
            <Button onClick={saveCred} disabled={savingCred}>{savingCred ? '...' : (isSo ? 'Kaydi' : 'Save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Match Dialog */}
      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manual Match</DialogTitle>
          </DialogHeader>
          {matchTx && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 text-sm bg-gray-50 dark:bg-gray-900/50">
                <div><b>Tran:</b> <span className="font-mono">{matchTx.tran_no}</span></div>
                <div><b>Amount:</b> ${Number(matchTx.tran_amt).toFixed(2)}</div>
                <div><b>Sender:</b> {matchTx.parsed_sender_phone || '—'}</div>
                <div><b>Narration:</b> {matchTx.narration || '—'}</div>
              </div>
              <div className="text-xs font-semibold text-muted-foreground">{isSo ? 'Lacago sugaya (48h)' : 'Pending payments (48h)'}</div>
              <div className="max-h-80 overflow-y-auto space-y-2">
                {pendings.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-4">{isSo ? 'Wax sugaya majiro' : 'No pending payments'}</div>
                ) : pendings.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border rounded p-2 text-xs">
                    <div>
                      <div><b>{p.sender_phone}</b> → {p.receiver_phone}</div>
                      <div className="text-muted-foreground">${Number(p.expected_amount).toFixed(2)} · {p.payment_provider || '—'} · {format(new Date(p.created_at), 'MMM d, HH:mm')}</div>
                    </div>
                    <Button size="sm" onClick={() => performManualMatch(p.id)} disabled={matchingId === p.id}>
                      {matchingId === p.id ? '...' : 'Match'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}