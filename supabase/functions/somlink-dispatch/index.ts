import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    return keys.default || '';
  } catch {
    return '';
  }
}

function cleanPhone(value: unknown): string {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('252')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

async function somlinkLogin() {
  const phone = Deno.env.get('SOMLINK_WALLET_PHONE') || '';
  const password = Deno.env.get('SOMLINK_PASSWORD') || '';
  if (!phone || !password) throw new Error('somlink_credentials_missing');

  const res = await fetch('https://api.data.somlink.net/auth/data_v3_login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ phone, password }),
  });
  const text = await res.text();
  let payload: any = {};
  try { payload = JSON.parse(text); } catch {}
  const token = payload?.token || payload?.access_token || payload?.data?.token || payload?.data?.access_token;
  if (!res.ok || !token) throw new Error('somlink_login_failed');
  return String(token).replace(/^Bearer\s+/i, '').trim();
}

async function sendSomlink(token: string, bundleId: number, receiver: string, amount: number) {
  const walletPhone = cleanPhone(Deno.env.get('SOMLINK_WALLET_PHONE'));
  const dataPhone = '252' + cleanPhone(receiver);
  const res = await fetch('https://api.data.somlink.net/data/send_data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      token,
      data_phone: dataPhone,
      wallet_phone: walletPhone,
      amount,
      bundle_id: bundleId,
    }),
  });
  const text = await res.text();
  let payload: any = {};
  try { payload = JSON.parse(text); } catch {}
  const ok = res.ok &&
    payload?.success !== false &&
    payload?.status !== 'failed' &&
    payload?.status !== 'error' &&
    (payload?.code === undefined || Number(payload.code) === 200);
  return { ok, payload, message: payload?.message || (ok ? 'OK' : 'Somlink returned failure') };
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const key = serviceKey();
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key || bearer !== key) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: any = {};
  try { body = await req.json(); } catch {}

  if (body.health === true) {
    const configured = Boolean(Deno.env.get('SOMLINK_WALLET_PHONE') && Deno.env.get('SOMLINK_PASSWORD'));
    if (!configured) return json({ configured: false, login_ok: false }, 503);
    try {
      await somlinkLogin();
      return json({ configured: true, login_ok: true });
    } catch {
      return json({ configured: true, login_ok: false }, 503);
    }
  }

  const now = new Date().toISOString();
  let query = admin
    .from('delivery_queue')
    .select('id,order_id,receiver_phone,scheduled_at,status')
    .eq('status', 'pending')
    .ilike('provider_name', '%somlink%')
    .or('scheduled_at.is.null,scheduled_at.lte.' + now)
    .order('created_at', { ascending: true })
    .limit(20);

  if (body.queue_id) query = query.eq('id', String(body.queue_id));
  const { data: rows, error: rowsError } = await query;
  if (rowsError) return json({ error: 'queue_lookup_failed' }, 500);
  if (!rows?.length) return json({ success: true, processed: 0 });

  let token: string;
  try { token = await somlinkLogin(); }
  catch { return json({ error: 'somlink_login_failed' }, 503); }

  const results: any[] = [];
  for (const row of rows) {
    const { data: claimed } = await admin
      .from('delivery_queue')
      .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    try {
      const { data: order, error: orderError } = await admin
        .from('orders')
        .select('id,package_id,receiver_phone,status')
        .eq('id', row.order_id)
        .single();
      if (orderError || !order || !['paid','completed','payment_confirmed'].includes(String(order.status))) {
        throw new Error('paid_order_required');
      }

      const { data: pkg, error: pkgError } = await admin
        .from('data_packages_config')
        .select('somlink_bundle_id,cost_price')
        .eq('id', order.package_id)
        .single();
      if (pkgError || !pkg?.somlink_bundle_id || Number(pkg.cost_price) <= 0) {
        throw new Error('somlink_package_not_configured');
      }

      const receiver = cleanPhone(row.receiver_phone || order.receiver_phone);
      if (!/^\d{7,9}$/.test(receiver)) throw new Error('invalid_receiver');

      const sent = await sendSomlink(token, Number(pkg.somlink_bundle_id), receiver, Number(pkg.cost_price));
      const finished = new Date().toISOString();

      if (!sent.ok) {
        await admin.from('delivery_queue').update({
          status: 'failed',
          last_attempt_at: finished,
          error_message: 'Somlink: ' + sent.message,
          somlink_response: sent.payload,
        }).eq('id', row.id);
        results.push({ id: row.id, ok: false, message: sent.message });
        continue;
      }

      await admin.from('delivery_queue').update({
        status: 'completed',
        completed_at: finished,
        last_attempt_at: finished,
        provider_response: 'Somlink: ' + sent.message,
        somlink_response: sent.payload,
        error_message: null,
      }).eq('id', row.id);

      await admin.from('orders').update({
        delivery_status: 'delivered',
        delivered_at: finished,
        delivery_notes: 'Delivered via Somlink API',
      }).eq('id', row.order_id);

      results.push({ id: row.id, ok: true, message: sent.message });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'somlink_dispatch_error';
      await admin.from('delivery_queue').update({
        status: 'failed',
        last_attempt_at: new Date().toISOString(),
        error_message: 'Somlink: ' + message,
      }).eq('id', row.id);
      results.push({ id: row.id, ok: false, message });
    }
  }

  return json({ success: true, processed: results.length, results });
});
