// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2, Send, MessageSquare, Smartphone, Users, Radio, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';

interface Device {
  id: string;
  device_id: string;
  device_name: string;
  sim1_provider: string | null;
  sim2_provider: string | null;
  sim_number: string;
  sim2_number: string | null;
}

interface Campaign {
  id: string;
  message: string;
  target_type: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  status: string;
  device_id: string | null;
  sim_slot: number | null;
  created_at: string;
}

const prefixMap: Record<string, string[]> = {
  hormuud: ['61', '77'],
  somtel: ['62'],
  somnet: ['68'],
  amtel: ['71'],
  somlink: ['64'],
};

function filterByProvider(phones: string[], provider: string): string[] {
  const prefixes = prefixMap[provider] || [];
  if (prefixes.length === 0) return phones;
  return phones.filter(p => {
    if (!p) return false;
    const digits = String(p).replace(/\D/g, '').replace(/^252/, '').replace(/^0/, '');
    return prefixes.some(px => digits.startsWith(px));
  });
}

export function BulkSmsManager() {
  const { language } = useLanguage();
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState('all');
  const [manualPhones, setManualPhones] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [selectedSim, setSelectedSim] = useState('1');
  const [devices, setDevices] = useState<Device[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // All unique phones for count display
  const [allPhones, setAllPhones] = useState<string[]>([]);
  const [phonesLoading, setPhonesLoading] = useState(true);

  // Drawer state
  const [openCampaign, setOpenCampaign] = useState<Campaign | null>(null);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const loadQueueItems = useCallback(async (campaignId: string) => {
    setQueueLoading(true);
    const { data } = await supabase
      .from('bulk_sms_queue')
      .select('id, phone_number, status, error, error_message, sent_at, sim_slot, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })
      .limit(1000);
    setQueueItems(data || []);
    setQueueLoading(false);
  }, []);

  useEffect(() => {
    if (!openCampaign) return;
    loadQueueItems(openCampaign.id);
    const ch = supabase
      .channel(`bulk-queue-${openCampaign.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bulk_sms_queue',
        filter: `campaign_id=eq.${openCampaign.id}`,
      }, () => loadQueueItems(openCampaign.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [openCampaign, loadQueueItems]);

  const handleRetryFailed = async () => {
    if (!openCampaign) return;
    setRetrying(true);
    try {
      const { data, error } = await supabase.rpc('retry_bulk_sms_campaign', { p_campaign_id: openCampaign.id });
      if (error) throw error;
      const reset = (data as any)?.reset ?? 0;
      toast({ title: language === 'so' ? 'Dib-u-dirid' : 'Retry', description: `${reset} ${language === 'so' ? 'fariin la dib u qoray' : 'messages requeued'}` });
      loadQueueItems(openCampaign.id);
      loadCampaigns();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setRetrying(false);
  };

  const queueStats = React.useMemo(() => {
    const sent = queueItems.filter(q => q.status === 'sent').length;
    const failed = queueItems.filter(q => q.status === 'failed').length;
    const pending = queueItems.filter(q => q.status === 'pending' || q.status === 'sending').length;
    const errors = Array.from(new Set(queueItems.map(q => q.error_message || q.error).filter(Boolean)));
    return { sent, failed, pending, errors };
  }, [queueItems]);

  const loadDevices = useCallback(async () => {
    const { data } = await supabase
      .from('android_devices')
      .select('id, device_id, device_name, sim1_provider, sim2_provider, sim_number, sim2_number')
      .is('archived_at', null)
      .eq('is_active', true);
    if (data) setDevices(data);
  }, []);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bulk_sms_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setCampaigns(data as Campaign[]);
    setLoading(false);
  }, []);

  const loadAllPhones = useCallback(async () => {
    setPhonesLoading(true);
    const { data: orderPhones } = await supabase
      .from('orders')
      .select('customer_phone')
      .limit(5000);
    const { data: verifiedPhones } = await supabase
      .from('verified_phones')
      .select('phone_number')
      .limit(5000);

    const set = new Set<string>();
    orderPhones?.forEach(o => set.add(o.customer_phone));
    verifiedPhones?.forEach(v => set.add(v.phone_number));
    setAllPhones(Array.from(set));
    setPhonesLoading(false);
  }, []);

  useEffect(() => { loadDevices(); loadCampaigns(); loadAllPhones(); }, [loadDevices, loadCampaigns, loadAllPhones]);

  // Realtime subscription for live campaign counter updates
  useEffect(() => {
    const channel = supabase
      .channel('bulk-sms-live')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bulk_sms_campaigns',
      }, (payload) => {
        const updated = payload.new as Campaign;
        setCampaigns(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bulk_sms_campaigns',
      }, (payload) => {
        const newCampaign = payload.new as Campaign;
        setCampaigns(prev => [newCampaign, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const getRecipientPhones = (): string[] => {
    if (targetType === 'manual') {
      return manualPhones
        .split(/[\n,;]+/)
        .map(p => p.trim())
        .filter(p => p.length >= 6);
    }
    if (targetType === 'all') return allPhones;
    return filterByProvider(allPhones, targetType);
  };

  // Compute current recipient count for display
  const recipientCount = targetType === 'manual'
    ? manualPhones.split(/[\n,;]+/).map(p => p.trim()).filter(p => p.length >= 6).length
    : targetType === 'all'
      ? allPhones.length
      : filterByProvider(allPhones, targetType).length;

  const handleSend = async () => {
    if (!message.trim() || !selectedDevice) {
      toast({ title: 'Error', description: 'Message and device are required', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      const phones = getRecipientPhones();
      if (phones.length === 0) {
        toast({ title: 'No recipients', description: 'No matching phone numbers found', variant: 'destructive' });
        setSending(false);
        return;
      }

      const { data: campaign, error: campErr } = await supabase
        .from('bulk_sms_campaigns')
        .insert({
          campaign_name: `Campaign ${new Date().toLocaleString()}`,
          message: message.trim(),
          target_type: targetType === 'manual' ? 'manual' : targetType,
          device_id: selectedDevice,
          sim_slot: parseInt(selectedSim),
          total_recipients: phones.length,
          status: 'sending',
        })
        .select()
        .single();

      if (campErr || !campaign) throw campErr;

      const batchSize = 500;
      for (let i = 0; i < phones.length; i += batchSize) {
        const batch = phones.slice(i, i + batchSize).map(phone => ({
          campaign_id: campaign.id,
          phone_number: phone,
          device_id: selectedDevice,
          sim_slot: parseInt(selectedSim),
          status: 'pending',
        }));
        const { error: queueErr } = await supabase.from('bulk_sms_queue').insert(batch);
        if (queueErr) {
          await supabase
            .from('bulk_sms_campaigns')
            .update({ status: 'failed' })
            .eq('id', campaign.id);
          throw queueErr;
        }
      }

      const device = devices.find(d => d.device_id === selectedDevice);
      toast({
        title: '📤 Campaign Created',
        description: `${phones.length} SMS queued for ${device?.device_name || selectedDevice} SIM${selectedSim}`,
      });

      setMessage('');
      setManualPhones('');
      loadCampaigns();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSending(false);
  };

  const currentDevice = devices.find(d => d.device_id === selectedDevice);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {language === 'so' ? 'Fariin Cusub Dir' : 'New Bulk SMS Campaign'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{language === 'so' ? 'Fariinta' : 'Message'}</Label>
            <Textarea
              placeholder={language === 'so' ? 'Qor fariinta SMS...' : 'Type your SMS message...'}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">{message.length}/160 chars</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>{language === 'so' ? 'U Dir' : 'Target'}</Label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="hormuud">Hormuud Only</SelectItem>
                  <SelectItem value="somtel">Somtel Only</SelectItem>
                  <SelectItem value="somnet">Somnet Only</SelectItem>
                  <SelectItem value="amtel">Amtel Only</SelectItem>
                  <SelectItem value="manual">📝 Lambar Gaar ah</SelectItem>
                </SelectContent>
              </Select>
              {/* Recipient count */}
              {targetType !== 'manual' && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {phonesLoading ? '...' : `${recipientCount} customer`}
                </p>
              )}
            </div>

            <div>
              <Label>{language === 'so' ? 'Device-ka' : 'Device'}</Label>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                <SelectContent>
                  {devices.map(d => (
                    <SelectItem key={d.device_id} value={d.device_id}>
                      <span className="flex items-center gap-1">
                        <Smartphone className="h-3 w-3" /> {d.device_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>SIM Slot</Label>
              <Select value={selectedSim} onValueChange={setSelectedSim}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">
                    SIM 1 {currentDevice?.sim1_provider ? `(${currentDevice.sim1_provider})` : ''}
                  </SelectItem>
                  <SelectItem value="2">
                    SIM 2 {currentDevice?.sim2_provider ? `(${currentDevice.sim2_provider})` : ''}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Manual phone input */}
          {targetType === 'manual' && (
            <div>
              <Label>{language === 'so' ? 'Lambarada (mid kasta line cusub)' : 'Phone numbers (one per line)'}</Label>
              <Textarea
                placeholder="615123456&#10;625987654&#10;617555111"
                value={manualPhones}
                onChange={(e) => setManualPhones(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Users className="h-3 w-3" />
                {recipientCount} {language === 'so' ? 'lambar' : 'numbers'}
              </p>
            </div>
          )}

          <Button onClick={handleSend} disabled={sending || !message.trim() || !selectedDevice || recipientCount === 0}>
            {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            {language === 'so' ? `Dir (${recipientCount})` : `Send (${recipientCount})`}
          </Button>
        </CardContent>
      </Card>

      {/* Campaign History */}
      <Card>
        <CardHeader>
          <CardTitle>{language === 'so' ? 'Taariikhda Campaigns' : 'Campaign History'}</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : campaigns.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No campaigns yet</p>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="space-y-2 md:hidden">
                {campaigns.map((c) => {
                  const pct = c.total_recipients > 0
                    ? Math.round(((c.sent_count + c.failed_count) / c.total_recipients) * 100)
                    : 0;
                  return (
                    <div key={c.id} className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(c.created_at), 'MMM dd HH:mm')}
                          </p>
                          <p className="text-sm line-clamp-2 break-words">{c.message}</p>
                        </div>
                        <Badge
                          variant={c.status === 'completed' ? 'default' : c.status === 'sending' ? 'secondary' : 'outline'}
                          className="shrink-0"
                        >
                          {c.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <Badge variant="outline" className="text-[10px]">{c.target_type}</Badge>
                        <div className="flex items-center gap-1.5">
                          {c.status === 'sending' && <Radio className="h-3 w-3 text-green-500 animate-pulse" />}
                          <span className="font-mono">{c.sent_count}/{c.total_recipients}</span>
                          {c.failed_count > 0 && (
                            <span className="text-destructive">({c.failed_count} ❌)</span>
                          )}
                        </div>
                      </div>
                      {c.status === 'sending' && c.total_recipients > 0 && (
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === 'so' ? 'Taariikhda' : 'Date'}</TableHead>
                      <TableHead>{language === 'so' ? 'Fariinta' : 'Message'}</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>{language === 'so' ? 'Xaaladda' : 'Status'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{format(new Date(c.created_at), 'MMM dd HH:mm')}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{c.message}</TableCell>
                        <TableCell><Badge variant="outline">{c.target_type}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {c.status === 'sending' && <Radio className="h-3 w-3 text-green-500 animate-pulse" />}
                            <span className="font-mono text-sm">{c.sent_count}/{c.total_recipients}</span>
                            {c.failed_count > 0 && <span className="text-destructive text-xs">({c.failed_count} ❌)</span>}
                          </div>
                          {c.status === 'sending' && c.total_recipients > 0 && (
                            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                              <div
                                className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                style={{ width: `${Math.round(((c.sent_count + c.failed_count) / c.total_recipients) * 100)}%` }}
                              />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.status === 'completed' ? 'default' : c.status === 'sending' ? 'secondary' : 'outline'}>
                            {c.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}