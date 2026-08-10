// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { LazyFallback, EmptyState, SearchInput, Paginator, usePagedList, formatPhone, formatDate, formatTime } from './shared';
import { CheckCircle, XCircle, RotateCcw, Clock, ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';

interface DeliveryQueueItem {
  id: string;
  order_id: string;
  ussd_code: string;
  provider_response: string | null;
  sim_slot: number | null;
  android_device_id: string | null;
  status: string;
  created_at: string;
  dispatched_at?: string | null;
  matchedSms?: {
    message: string;
    created_at: string;
    direction?: string | null;
  } | null;
}

interface OrderDetail {
  id: string;
  sender_phone: string;
  receiver_phone: string;
  customer_phone: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  cost_price: number;
  status: string;
  delivery_status: string;
  delivery_notes: string | null;
  created_at: string;
  delivered_at: string | null;
  provider_id: string;
  provider_name?: string;
  evoucher_rate?: number;
  // All delivery queue entries for this order
  deliveries: DeliveryQueueItem[];
  device_name?: string;
  sim_number?: string;
}

const DetailRow = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
    <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 min-w-[100px]">{label}</span>
    <span className={`text-[11px] text-right flex-1 ml-2 ${bold ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{value}</span>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const colors = status === 'delivered' ? 'bg-green-500 text-white' :
    status === 'failed' || status === 'timeout' ? 'bg-red-500 text-white' :
    status === 'pending' ? 'bg-yellow-400 text-yellow-900' :
    status === 'processing' ? 'bg-blue-500 text-white' : 'bg-gray-400 text-white';
  const label = status === 'delivered' ? 'Successfully' : status === 'failed' ? 'Failed' :
    status === 'timeout' ? 'Timeout' : status === 'pending' ? 'Pending' :
    status === 'processing' ? 'Processing' : status;
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${colors}`}>{label}</span>;
};

export const AbdiqafarView = ({ isSo }: { isSo: boolean }) => {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'delivered' | 'failed'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryDialog, setRetryDialog] = useState<{ id: string; receiver: string } | null>(null);
  const [retryPhone, setRetryPhone] = useState('');
  const [retrySaving, setRetrySaving] = useState(false);
  const todayStr = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const [fromDate, setFromDate] = useState<string>(todayStr());
  const [toDate, setToDate] = useState<string>(todayStr());

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      // Get orders within selected date range
      const start = new Date(fromDate + 'T00:00:00');
      const end = new Date(toDate + 'T23:59:59.999');

      const [ordersRes, deliveryRes, providersRes, devicesRes] = await Promise.all([
        supabase.from('orders')
          .select('id, order_number, status, delivery_status, sender_phone, receiver_phone, customer_phone, package_name, data_amount, selling_price, cost_price, provider_id, created_at, delivered_at')
          .gte('created_at', start.toISOString()).lte('created_at', end.toISOString())
          .order('created_at', { ascending: false }).limit(200),
        supabase.from('delivery_queue').select('id, order_id, ussd_code, provider_response, sim_slot, android_device_id, status, created_at, dispatched_at').gte('created_at', start.toISOString()).lte('created_at', end.toISOString()),
        supabase.from('providers_config').select('id, provider_name, evoucher_rate'),
        supabase.from('android_devices').select('id, device_id, device_name, sim_number, sim2_number'),
      ]);

      const deliveries = (deliveryRes.data || []) as DeliveryQueueItem[];
      const providers = providersRes.data || [];
      const devices = devicesRes.data || [];

      // ----- Match missing USSD responses against sms_logs -----
      // Any delivery lacking provider_response gets an SMS lookup.
      const missingDeliveries = deliveries.filter(d => !d.provider_response && d.android_device_id);
      let smsLogs: any[] = [];
      if (missingDeliveries.length > 0) {
        // Map string device_id → UUID via android_devices
        const deviceUuidByStrId: Record<string, string> = {};
        devices.forEach((d: any) => { if (d.device_id && d.id) deviceUuidByStrId[d.device_id] = d.id; });
        const deviceUuids = Array.from(new Set(
          missingDeliveries.map(d => deviceUuidByStrId[d.android_device_id as string]).filter(Boolean)
        ));
        if (deviceUuids.length > 0) {
          // Earliest window: 30s before earliest dispatched_at / created_at
          const earliestTs = missingDeliveries.reduce((min, d) => {
            const t = new Date(d.dispatched_at || d.created_at).getTime() - 30_000;
            return t < min ? t : min;
          }, Date.now());
          const { data: smsRows } = await supabase
            .from('sms_logs')
            .select('device_id, message, created_at, direction, phone_number, amount')
            .in('device_id', deviceUuids)
            .not('direction', 'in', '("sms_out","outgoing")')
            .gte('created_at', new Date(earliestTs).toISOString())
            .order('created_at', { ascending: true })
            .limit(300);
          smsLogs = smsRows || [];
          // Attach best match per delivery
          missingDeliveries.forEach(dq => {
            const uuid = deviceUuidByStrId[dq.android_device_id as string];
            if (!uuid) return;
            const order = (ordersRes.data || []).find((o: any) => o.id === dq.order_id);
            if (!order) return;
            const dispatchTs = new Date(dq.dispatched_at || dq.created_at).getTime();
            const winStart = dispatchTs - 30_000;
            const winEnd = dispatchTs + 5 * 60_000;
            const receiverDigits = String(order.receiver_phone || '').replace(/\D/g, '');
            const receiverTail = receiverDigits.slice(-7);
            const priceStrs = [order.selling_price, order.cost_price]
              .filter(v => v != null)
              .map(v => Number(v).toFixed(2));
            let best: any = null;
            let bestScore = 0;
            for (const s of smsLogs) {
              if (s.device_id !== uuid) continue;
              const t = new Date(s.created_at).getTime();
              if (t < winStart || t > winEnd) continue;
              const dir = String(s.direction || '').toLowerCase();
              if (dir === 'sms_out' || dir === 'outgoing') continue;
              const body = String(s.message || '');
              let score = 0;
              if (receiverTail && body.replace(/\D/g, '').includes(receiverTail)) score += 2;
              if (priceStrs.some(p => body.includes(p))) score += 1;
              // Prefer closest to dispatch time as tiebreaker
              if (score > bestScore || (score === bestScore && score > 0 && best && Math.abs(t - dispatchTs) < Math.abs(new Date(best.created_at).getTime() - dispatchTs))) {
                if (score >= 1) { best = s; bestScore = score; }
              }
            }
            if (best) {
              dq.matchedSms = { message: best.message, created_at: best.created_at, direction: best.direction };
            }
          });
        }
      }

      const enriched: OrderDetail[] = (ordersRes.data || []).map(o => {
        // Get ALL delivery queue entries for this order (not just first)
        const orderDeliveries = deliveries.filter(d => d.order_id === o.id);
        const firstDq = orderDeliveries[0];
        const prov = providers.find(p => p.id === o.provider_id);
        const dev = firstDq ? devices.find(d => d.device_id === firstDq.android_device_id) : null;
        return {
          ...o,
          provider_name: prov?.provider_name || 'Unknown',
          evoucher_rate: prov?.evoucher_rate || 0,
          deliveries: orderDeliveries,
          device_name: dev?.device_name,
          sim_number: firstDq?.sim_slot === 2 ? dev?.sim2_number : dev?.sim_number,
        };
      });

      setOrders(enriched);
    } catch (err) {
      console.error('Abdiqafar load error:', err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useRealtimeRefresh(['orders', 'delivery_queue'], loadOrders, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const filtered = orders.filter(o => {
    if (filter === 'pending') return o.delivery_status === 'pending' || o.delivery_status === 'processing';
    if (filter === 'delivered') return o.delivery_status === 'delivered';
    if (filter === 'failed') return o.delivery_status === 'failed' || o.delivery_status === 'timeout';
    return true;
  }).filter(o => !search || 
    o.receiver_phone?.includes(search) || 
    o.sender_phone?.includes(search) || 
    o.customer_phone?.includes(search) ||
    o.package_name?.toLowerCase().includes(search.toLowerCase())
  );

  const paged = usePagedList(filtered);

  const markDelivered = async (id: string) => {
    const now = new Date().toISOString();
    await supabase.from('orders').update({
      status: 'completed',
      delivery_status: 'delivered',
      delivered_at: now,
      delivery_notes: 'Manually verified - Abdiqafar',
    }).eq('id', id);
    await supabase.from('delivery_queue').update({
      status: 'completed',
      completed_at: now,
    }).eq('order_id', id).neq('status', 'completed');
    toast.success(isSo ? 'Waa la dhameeyay' : 'Marked as delivered');
    loadOrders();
  };

  const openRetryDialog = (id: string) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    setRetryDialog({ id, receiver: order.receiver_phone });
    setRetryPhone(order.receiver_phone || '');
  };

  const confirmRetry = async () => {
    if (!retryDialog) return;
    const phone = (retryPhone || '').trim();
    if (!phone) { toast.error(isSo ? 'Lambarka geli' : 'Enter phone'); return; }
    const order = orders.find(o => o.id === retryDialog.id);
    setRetrySaving(true);
    try {
      const update: any = {
        delivery_status: 'pending',
        status: 'pending',
        payment_status: 'matched',
        delivered_at: null,
        delivery_notes: null,
      };
      if (phone !== retryDialog.receiver) update.receiver_phone = phone;
      const { error } = await supabase.from('orders').update(update).eq('id', retryDialog.id);
      if (error) { toast.error(error.message); return; }

      const { error: invokeError } = await supabase.functions.invoke('activate-package', {
        body: {
          orderId: retryDialog.id,
          providerName: order?.provider_name || '',
          receiverPhone: phone,
        },
      });
      if (invokeError) { toast.error(invokeError.message); return; }

      toast.success(isSo ? 'Dib loo diray' : 'Retrying...');
      setRetryDialog(null);
      loadOrders();
    } finally {
      setRetrySaving(false);
    }
  };

  const pendingCount = orders.filter(o => o.delivery_status === 'pending' || o.delivery_status === 'processing').length;
  const deliveredCount = orders.filter(o => o.delivery_status === 'delivered').length;
  const failedCount = orders.filter(o => o.delivery_status === 'failed' || o.delivery_status === 'timeout').length;

  return (
    <div className="space-y-3">
      {/* Date range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 block">
            {isSo ? 'Laga bilaabo' : 'From'}
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border text-xs outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 block">
            {isSo ? 'Ilaa' : 'To'}
          </label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border text-xs outline-none"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => setFilter('all')} className={`p-2 rounded-lg text-center text-[10px] font-bold border ${filter === 'all' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          <div className="text-lg">{orders.length}</div>
          Wadarta
        </button>
        <button onClick={() => setFilter('pending')} className={`p-2 rounded-lg text-center text-[10px] font-bold border ${filter === 'pending' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          <div className="text-lg">{pendingCount}</div>
          Sugaya
        </button>
        <button onClick={() => setFilter('delivered')} className={`p-2 rounded-lg text-center text-[10px] font-bold border ${filter === 'delivered' ? 'bg-green-500 text-white border-green-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          <div className="text-lg">{deliveredCount}</div>
          Guul
        </button>
        <button onClick={() => setFilter('failed')} className={`p-2 rounded-lg text-center text-[10px] font-bold border ${filter === 'failed' ? 'bg-red-500 text-white border-red-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          <div className="text-lg">{failedCount}</div>
          Fashil
        </button>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi lambarka...' : 'Search phone...'} />

      {loading ? <LazyFallback /> : filtered.length === 0 ? <EmptyState message={isSo ? 'Wax dalab ah lama helin' : 'No orders found'} /> : (
        <div className="space-y-3">
          {/* Table header - Dire System style */}
          <div className="bg-blue-500 text-white px-3 py-2 rounded-t-lg grid grid-cols-3 text-[10px] font-bold">
            <span>Sender</span>
            <span className="text-center">Recharge</span>
            <span className="text-right">Price</span>
          </div>

          {filtered.map((order, idx) => {
            const profit = (order.selling_price * (1 + (order.evoucher_rate || 0))) - (order.cost_price || 0);
            const displayStatus = order.delivery_status || order.status;
            const isExpanded = expandedId === order.id;
            
            return (
              <div key={order.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Collapsed row - tap to expand */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full grid grid-cols-3 items-center px-3 py-2.5 text-left active:bg-gray-50 dark:active:bg-gray-750"
                >
                  <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${displayStatus === 'delivered' ? 'bg-green-500' : displayStatus === 'failed' || displayStatus === 'timeout' ? 'bg-red-500' : 'bg-yellow-400'}`} />
                    <span className="text-[11px] font-medium text-gray-800 dark:text-white truncate">{formatPhone(order.sender_phone || order.customer_phone)}</span>
                  </div>
                  <span className="text-[11px] text-center font-medium text-gray-800 dark:text-white">{formatPhone(order.receiver_phone)}</span>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">${Number(order.selling_price).toFixed(2)}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <>
                    <div className="px-3 border-t border-gray-100 dark:border-gray-700">
                      <DetailRow label="Business" value={order.provider_name || 'N/A'} />
                      {order.sim_number && <DetailRow label="AccNo" value={`SIM_${order.sim_number}`} />}
                      <DetailRow label="Data" value={`$${Number(order.cost_price || 0).toFixed(2)}`} />
                      <DetailRow label="Network" value={order.package_name} bold />
                      <DetailRow label="Profit" value={`$${profit < 0.01 && profit > 0 ? profit.toFixed(3) : profit.toFixed(2)}`} bold />
                      {order.device_name && <DetailRow label="Device" value={order.device_name} />}
                      {order.sim_number && <DetailRow label="SimNO" value={order.sim_number} />}
                      <div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                        <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400">Status</span>
                        <StatusBadge status={displayStatus} />
                      </div>
                      <DetailRow label="Process Time" value={order.delivered_at ? `${formatTime(order.delivered_at)} ${formatDate(order.delivered_at)}` : '—'} />
                      
                      {/* Show ALL delivery SMS responses */}
                      {order.deliveries.length > 0 && (
                        <div className="py-2 border-b border-gray-100 dark:border-gray-700">
                          <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400">
                            📩 SMS ({order.deliveries.length})
                          </span>
                          <div className="space-y-1.5 mt-1">
                            {order.deliveries.map((dq, i) => (
                              <div key={dq.id} className={`p-2 rounded border text-[10px] whitespace-pre-wrap ${
                                dq.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-gray-700 dark:text-gray-300' :
                                dq.status === 'failed' || dq.status === 'timeout' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-gray-700 dark:text-gray-300' :
                                'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-gray-700 dark:text-gray-300'
                              }`}>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-bold text-gray-500">USSD: {dq.ussd_code}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                    dq.status === 'completed' ? 'bg-green-500 text-white' :
                                    dq.status === 'failed' || dq.status === 'timeout' ? 'bg-red-500 text-white' :
                                    'bg-yellow-400 text-yellow-900'
                                  }`}>{dq.status}</span>
                                </div>
                                {dq.provider_response ? (
                                  <span>"{dq.provider_response}"</span>
                                ) : dq.matchedSms ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1">
                                      <span className="px-1.5 py-0.5 rounded bg-blue-500 text-white text-[8px] font-bold">📥 SMS-ka la helay</span>
                                      <span className="text-[9px] text-gray-500">{formatTime(dq.matchedSms.created_at)}</span>
                                    </div>
                                    <span>"{dq.matchedSms.message}"</span>
                                  </div>
                                ) : (
                                  <span className="italic text-gray-400">Jawaab lama helin</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <DetailRow label="Create Time" value={`${formatTime(order.created_at)} ${formatDate(order.created_at)}`} />
                      <DetailRow label="ID" value={order.id.slice(0, 8)} />
                    </div>

                    {displayStatus !== 'delivered' && (
                      <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700 flex gap-2">
                        <button onClick={() => markDelivered(order.id)} className="flex items-center gap-1 px-2 py-1 bg-green-500 text-white rounded text-[10px] font-bold">
                          <CheckCircle className="w-3 h-3" /> Dhamme
                        </button>
                        {(displayStatus === 'failed' || displayStatus === 'timeout') && (
                          <button onClick={() => openRetryDialog(order.id)} className="flex items-center gap-1 px-2 py-1 bg-orange-500 text-white rounded text-[10px] font-bold">
                            <RotateCcw className="w-3 h-3" /> Dib u Dir
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {retryDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setRetryDialog(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                {isSo ? 'Dib u Dir Dalabka' : 'Resend Order'}
              </h3>
              <button onClick={() => setRetryDialog(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400">
                {isSo ? 'Lambarka lacagta lagu shubaayo' : 'Receiver phone'}
              </label>
              <input
                type="tel"
                value={retryPhone}
                onChange={e => setRetryPhone(e.target.value)}
                placeholder="61XXXXXXX"
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-orange-400"
              />
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {isSo ? 'Hubi lambarka, kadibna riix Dib u Dir.' : 'Verify the number, then tap Resend.'}
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setRetryDialog(null)}
                className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-bold"
              >
                {isSo ? 'Jooji' : 'Cancel'}
              </button>
              <button
                onClick={confirmRetry}
                disabled={retrySaving}
                className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-1 disabled:opacity-60"
              >
                <RotateCcw className="w-3.5 h-3.5" /> {isSo ? 'Dib u Dir' : 'Resend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};