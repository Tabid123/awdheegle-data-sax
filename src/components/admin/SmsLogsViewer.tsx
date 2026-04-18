// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, ArrowDownLeft, ArrowUpRight, Smartphone, RefreshCw, MessageSquare, CalendarDays, ArrowLeft, ChevronRight, Search, Trash2 } from 'lucide-react';

interface SmsLog {
  id: string;
  device_id: string | null;
  sim_slot: number;
  sim_number: string | null;
  sms_type: string;       // direction
  sms_sender: string | null; // phone_number
  sms_body: string;       // message
  amount: number | null;
  tx_type: string | null;
  tx_id: string | null;
  counterpart_phone: string | null;
  created_at: string;
  received_at: string;
  source: 'sms_logs' | 'payment_sms_log';
}

const getProviderFromSender = (sender: string): string | null => {
  const s = sender?.toLowerCase()?.trim() || '';
  if (['801', '898', 'somnet'].includes(s)) return 'Somnet';
  if (['192', '740'].includes(s)) return 'Hormuud';
  if (['reseller', '252888', 'edahab'].includes(s)) return 'Somtel';
  if (s === '913') return 'Amtel';
  return null;
};

const getProviderColor = (provider: string | null): string => {
  switch (provider) {
    case 'Somnet': return 'from-purple-500/20 to-purple-600/10 border-purple-300 dark:border-purple-700';
    case 'Hormuud': return 'from-orange-500/20 to-orange-600/10 border-orange-300 dark:border-orange-700';
    case 'Somtel': return 'from-blue-500/20 to-blue-600/10 border-blue-300 dark:border-blue-700';
    case 'Amtel': return 'from-green-500/20 to-green-600/10 border-green-300 dark:border-green-700';
    default: return 'from-muted/50 to-muted/30 border-border';
  }
};

const getProviderTextColor = (provider: string | null): string => {
  switch (provider) {
    case 'Somnet': return 'text-purple-700 dark:text-purple-300';
    case 'Hormuud': return 'text-orange-700 dark:text-orange-300';
    case 'Somtel': return 'text-blue-700 dark:text-blue-300';
    case 'Amtel': return 'text-green-700 dark:text-green-300';
    default: return 'text-foreground';
  }
};

const SmsLogsViewer = () => {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [devices, setDevices] = useState<{ device_id: string; device_name: string; sim_number: string; sim2_number: string | null; id: string }[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [selectedSmsType, setSelectedSmsType] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSenderCode, setSelectedSenderCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const toggleSelect = (key: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Tirtir ${selectedIds.size} SMS? Tani ma laga noqon karo.`)) return;
    setDeleting(true);
    try {
      const smsLogIds: string[] = [];
      const paySmsIds: string[] = [];
      selectedIds.forEach(key => {
        const [source, id] = key.split('::');
        if (source === 'sms_logs') smsLogIds.push(id);
        else if (source === 'payment_sms_log') paySmsIds.push(id);
      });
      if (smsLogIds.length > 0) {
        const { error } = await supabase.from('sms_logs').delete().in('id', smsLogIds);
        if (error) throw error;
      }
      if (paySmsIds.length > 0) {
        const { error } = await supabase.from('payment_sms_log').delete().in('id', paySmsIds);
        if (error) throw error;
      }
      toast.success(`Waa la tirtiray ${selectedIds.size} SMS`);
      clearSelection();
      fetchLogs();
    } catch (e: any) {
      console.error('Delete error:', e);
      toast.error(e?.message || 'Khalad ayaa dhacay');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    const fetchDevices = async () => {
      const { data } = await supabase
        .from('android_devices')
        .select('id, device_id, device_name, sim_number, sim2_number')
        .eq('is_active', true);
      setDevices(data || []);
    };
    fetchDevices();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      // Fetch from both sms_logs and payment_sms_log in parallel
      const startOfDay = selectedDate ? `${selectedDate}T00:00:00.000Z` : null;
      const endOfDay = selectedDate ? `${selectedDate}T23:59:59.999Z` : null;

      let smsQuery = supabase.from('sms_logs')
        .select('id, device_id, direction, phone_number, message, status, created_at')
        .order('created_at', { ascending: false }).limit(300);
      let paySmsQuery = supabase.from('payment_sms_log')
        .select('id, device_id, sender_phone, raw_sms, amount, reference, status, created_at, received_at')
        .order('created_at', { ascending: false }).limit(300);

      if (selectedDevice !== 'all') {
        // device_id in sms_logs/payment_sms_log is the android_devices.id (UUID)
        const dev = devices.find(d => d.device_id === selectedDevice);
        const deviceUuid = dev?.id || selectedDevice;
        smsQuery = smsQuery.eq('device_id', deviceUuid);
        paySmsQuery = paySmsQuery.eq('device_id', deviceUuid);
      }
      if (selectedSmsType !== 'all') {
        smsQuery = smsQuery.eq('direction', selectedSmsType);
      }
      if (startOfDay && endOfDay) {
        smsQuery = smsQuery.gte('created_at', startOfDay).lte('created_at', endOfDay);
        paySmsQuery = paySmsQuery.gte('created_at', startOfDay).lte('created_at', endOfDay);
      }

      const [smsRes, payRes] = await Promise.all([smsQuery, paySmsQuery]);

      const smsLogs: SmsLog[] = (smsRes.data || []).map((r: any) => ({
        id: r.id,
        device_id: r.device_id,
        sim_slot: 1,
        sim_number: null,
        sms_type: r.direction || 'incoming',
        sms_sender: r.phone_number,
        sms_body: r.message || '',
        amount: null,
        tx_type: null,
        tx_id: null,
        counterpart_phone: r.phone_number,
        created_at: r.created_at,
        received_at: r.created_at,
        source: 'sms_logs',
      }));

      const paySmsLogs: SmsLog[] = (payRes.data || []).map((r: any) => ({
        id: r.id,
        device_id: r.device_id,
        sim_slot: 1,
        sim_number: null,
        sms_type: 'incoming',
        sms_sender: r.sender_phone,
        sms_body: r.raw_sms || '',
        amount: r.amount,
        tx_type: 'payment',
        tx_id: r.reference,
        counterpart_phone: r.sender_phone,
        created_at: r.created_at,
        received_at: r.received_at || r.created_at,
        source: 'payment_sms_log',
      }));

      const combined = [...smsLogs, ...paySmsLogs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setLogs(combined.slice(0, 500));
    } catch (err) {
      console.error('Error fetching SMS logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedDevice, selectedSmsType, selectedDate, devices.length]);

  // Realtime subscription for both tables
  useEffect(() => {
    const channel = supabase
      .channel('sms-combined-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_logs' }, () => fetchLogs())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payment_sms_log' }, () => fetchLogs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedDevice, selectedSmsType, selectedDate]);

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
  };

  const getDeviceName = (deviceId: string | null) => {
    if (!deviceId) return 'Unknown';
    const device = devices.find(d => d.id === deviceId || d.device_id === deviceId);
    return device?.device_name || deviceId.slice(0, 8);
  };

  const getSmartDirection = (log: SmsLog): string => {
    const body = log.sms_body?.toLowerCase() || '';
    if (body.includes('ugu shubtay')) return 'outgoing';
    if (body.includes('ka heshay')) return 'incoming';
    return log.sms_type;
  };

  const searchFilteredLogs = searchQuery
    ? logs.filter(l => {
        const q = searchQuery.toLowerCase();
        return (l.counterpart_phone?.toLowerCase().includes(q)) ||
               (l.sms_body?.toLowerCase().includes(q)) ||
               (l.tx_id?.toLowerCase().includes(q)) ||
               (l.sms_sender?.toLowerCase().includes(q));
      })
    : logs;

  const senderGroups2 = searchFilteredLogs.reduce<Record<string, SmsLog[]>>((acc, log) => {
    const sender = log.sms_sender || 'Unknown';
    if (!acc[sender]) acc[sender] = [];
    acc[sender].push(log);
    return acc;
  }, {});

  const sortedCodes2 = Object.keys(senderGroups2).sort((a, b) => {
    const provA = getProviderFromSender(a);
    const provB = getProviderFromSender(b);
    if (provA && !provB) return -1;
    if (!provA && provB) return 1;
    return senderGroups2[b].length - senderGroups2[a].length;
  });

  const filteredLogs = selectedSenderCode ? (senderGroups2[selectedSenderCode] || []) : [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Lambar raadi... (phone, TX ID)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 text-xs pl-8"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Select value={selectedDevice} onValueChange={setSelectedDevice}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Device" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Devices</SelectItem>
            {devices.map(d => (
              <SelectItem key={d.device_id} value={d.device_id}>{d.device_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedSmsType} onValueChange={setSelectedSmsType}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Direction" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="incoming">Soo galay</SelectItem>
            <SelectItem value="outgoing">Ka baxay</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative h-9 rounded-md border border-input bg-background hover:bg-accent flex items-center justify-center overflow-hidden">
          <CalendarDays className="h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{logs.length} SMS logs</p>
        <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={isLoading} className="h-8 text-xs">
          <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Wali SMS kama soo gelin</p>
          </CardContent>
        </Card>
      ) : !selectedSenderCode ? (
        <div className="space-y-2">
          {sortedCodes2.map(code => {
            const provider = getProviderFromSender(code);
            const count = senderGroups2[code].length;
            const lastLog = senderGroups2[code][0];
            const totalAmount = senderGroups2[code].reduce((sum, l) => sum + (l.amount || 0), 0);

            return (
              <div
                key={code}
                className="cursor-pointer hover:scale-[1.02] transition-transform"
                onClick={() => setSelectedSenderCode(code)}
              >
                <div className={`rounded-t-lg bg-gradient-to-r ${getProviderColor(provider)} px-4 py-3 flex items-center justify-between`}>
                  <span className={`text-2xl font-extrabold ${getProviderTextColor(provider)}`}>{code}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{count} SMS</Badge>
                    {totalAmount > 0 && (
                      <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                        ${totalAmount.toLocaleString()}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="rounded-b-lg bg-muted/60 dark:bg-muted/30 border border-t-0 border-border px-4 py-1.5">
                  <span className={`text-xs font-semibold ${getProviderTextColor(provider)}`}>
                    {provider || 'Aan la aqoon'}
                  </span>
                  <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                    {lastLog.sms_body.substring(0, 70)}...
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedSenderCode(null)} className="h-8 text-xs gap-1 -ml-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Dhamaan Codes
          </Button>

          <div className={`rounded-lg p-2 bg-gradient-to-r ${getProviderColor(getProviderFromSender(selectedSenderCode))}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Checkbox
                  checked={filteredLogs.length > 0 && filteredLogs.every(l => selectedIds.has(`${l.source}::${l.id}`))}
                  onCheckedChange={(v) => {
                    if (v) {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        filteredLogs.forEach(l => next.add(`${l.source}::${l.id}`));
                        return next;
                      });
                    } else {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        filteredLogs.forEach(l => next.delete(`${l.source}::${l.id}`));
                        return next;
                      });
                    }
                  }}
                />
                <span className={`text-lg font-bold ${getProviderTextColor(getProviderFromSender(selectedSenderCode))} truncate`}>
                  {selectedSenderCode}
                </span>
                {getProviderFromSender(selectedSenderCode) && (
                  <Badge variant="secondary" className="text-[10px]">
                    {getProviderFromSender(selectedSenderCode)}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px]">{filteredLogs.length} SMS</Badge>
              </div>
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="h-7 text-[11px] gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Tirtir ({selectedIds.size})
                </Button>
              )}
            </div>
          </div>

          {filteredLogs.map(log => {
            const key = `${log.source}::${log.id}`;
            const isSelected = selectedIds.has(key);
            return (
            <Card key={key} className={`overflow-hidden ${isSelected ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(key)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`p-1.5 rounded-full shrink-0 ${
                          getSmartDirection(log) === 'incoming' 
                            ? 'bg-green-100 dark:bg-green-900/40' 
                            : 'bg-red-100 dark:bg-red-900/40'
                        }`}>
                          {getSmartDirection(log) === 'incoming' 
                            ? <ArrowDownLeft className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                            : <ArrowUpRight className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                          }
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {log.counterpart_phone && (
                              <span className="text-sm font-semibold truncate">{log.counterpart_phone}</span>
                            )}
                            {log.amount != null && (
                              <span className="text-sm font-bold text-green-600 dark:text-green-400">${log.amount}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                              {log.source === 'payment_sms_log' ? 'Payment' : 'SMS'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{formatTime(log.created_at)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-2 bg-muted/50 rounded-md px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">{log.sms_body}</p>
                </div>

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Smartphone className="h-3 w-3" />
                    {getDeviceName(log.device_id)}
                  </div>
                  {log.tx_id && (
                    <span className="text-[10px] text-muted-foreground">TX: {log.tx_id}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
          })}
        </div>
      )}
    </div>
  );
};

export default SmsLogsViewer;
