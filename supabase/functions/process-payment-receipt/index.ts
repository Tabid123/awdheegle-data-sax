import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SMSData {
  sender_phone: string;
  receiver_sim?: string;
  amount: number;
  sms_body: string;
  tx_id?: string;
  sms_timestamp?: number;
}

function normalizeSomaliPhone(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('252') && digits.length >= 12) digits = digits.substring(3);
  if (digits.startsWith('0') && digits.length === 10) digits = digits.substring(1);
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body: SMSData = await req.json();
    const { sender_phone, amount, sms_body, tx_id } = body;

    if (!sender_phone || !amount || !sms_body) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const normalizedSender = normalizeSomaliPhone(sender_phone);
    console.log('📱 SMS:', { normalizedSender, amount, tx_id });

    // Log raw SMS
    const { data: smsLog } = await supabase
      .from('payment_sms_log')
      .insert({ sender_phone: normalizedSender, amount, raw_sms: sms_body, reference: tx_id || null, status: 'pending' })
      .select().single();
    const { data: receipt } = await supabase
      .from('payment_receipts')
      .insert({ sender_phone: normalizedSender, amount, raw_sms: sms_body, reference: tx_id || null, status: 'pending', matched: false })
      .select().single();

    const markUnmatched = async (reason: string) => {
      if (smsLog?.id) await supabase.from('payment_sms_log').update({ status: 'unmatched' }).eq('id', smsLog.id);
      if (receipt?.id) await supabase.from('payment_receipts').update({ status: 'unmatched' }).eq('id', receipt.id);
      await supabase.from('unmatched_payments').insert({
        payment_sms_id: smsLog?.id || null,
        sender_phone: normalizedSender,
        amount,
        reason,
      });
    };
    const markMatched = async (orderId: string) => {
      if (smsLog?.id) await supabase.from('payment_sms_log').update({ status: 'matched', matched_order_id: orderId }).eq('id', smsLog.id);
      if (receipt?.id) await supabase.from('payment_receipts').update({ status: 'matched', matched: true, order_id: orderId }).eq('id', receipt.id);
    };

    // ===== LOGIC KALIYA: AUTO TOP-UP =====
    // 1) Hel dhamman auto-topup numbers (firfircoon).
    // 2) Hel dhamman packages-ka ku xiran qiimaha = amount.
    // 3) Sender prefix (61=Hormuud, 68=Somnet, 90=Somtel, ...) → dooro package provider-ka u dhigma.
    // 4) Abuur order + queue USSD. Receiver = sender (auto top-up = isku lambar).

    const { data: topupNumbers } = await supabase
      .from('auto_topup_numbers')
      .select('id, phone_number, is_active')
      .eq('is_active', true);

    if (!topupNumbers || topupNumbers.length === 0) {
      await markUnmatched('No active auto top-up numbers configured');
      return new Response(JSON.stringify({ success: true, matched: false, reason: 'no_topup_numbers' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const topupNumberIds = topupNumbers.map((t: any) => t.id);
    const { data: candidatePkgs } = await supabase
      .from('auto_topup_packages')
      .select('*')
      .in('topup_number_id', topupNumberIds)
      .eq('is_active', true)
      .eq('selling_price', amount);

    if (!candidatePkgs || candidatePkgs.length === 0) {
      await markUnmatched(`No auto top-up package matches $${amount}`);
      return new Response(JSON.stringify({ success: true, matched: false, reason: 'no_package_for_amount' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Sender prefix → provider
    const { data: providersList } = await supabase
      .from('providers_config')
      .select('provider_name, phone_prefixes')
      .eq('is_active', true);

    const senderPrefix2 = normalizedSender.substring(0, 2);
    let senderProvider: string | null = null;
    for (const p of (providersList || [])) {
      const prefixes: string[] = (p.phone_prefixes || []).map((x: string) => String(x));
      if (prefixes.includes(senderPrefix2)) {
        senderProvider = (p.provider_name || '').toLowerCase();
        break;
      }
    }
    console.log('🎯 Prefix:', senderPrefix2, '→ provider:', senderProvider, '| candidates:', candidatePkgs.length);

    if (!senderProvider) {
      await markUnmatched(`Unknown sender prefix ${senderPrefix2}`);
      return new Response(JSON.stringify({ success: true, matched: false, reason: 'unknown_prefix' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const pkg = candidatePkgs.find((p: any) => (p.provider_name || '').toLowerCase() === senderProvider);
    if (!pkg) {
      await markUnmatched(`No ${senderProvider} package matches $${amount}`);
      return new Response(JSON.stringify({ success: true, matched: false, reason: 'no_provider_package' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    console.log('✅ Matched package:', pkg.package_name, '(', pkg.provider_name, ')');

    // Hel provider_id
    let providerId: string | null = null;
    if (pkg.provider_name) {
      const { data: prov } = await supabase
        .from('providers_config').select('id').ilike('provider_name', pkg.provider_name).maybeSingle();
      providerId = prov?.id || null;
    }

    const { data: order, error: orderError } = await supabase
      .from('orders').insert({
        sender_phone: normalizedSender,
        receiver_phone: normalizedSender,
        amount,
        status: 'pending',
        payment_status: 'matched',
        payment_reference: tx_id || null,
        is_offline: false,
        provider_id: providerId,
        delivery_notes: `Auto top-up: ${pkg.package_name}`,
      }).select().single();
    if (orderError) throw orderError;
    await markMatched(order.id);

    // Render USSD
    const renderedUssd = String(pkg.ussd_code || '')
      .replace(/\{receiver_phone\}/g, normalizedSender)
      .replace(/\{cost_price\}/g, String(pkg.cost_price ?? amount))
      .replace(/\{amount\}/g, String(amount))
      .replace(/\{sim_password\}/g, pkg.sim_password || '')
      .replace(/\{pin\}/g, pkg.sim_password || '');

    await supabase.from('delivery_queue').insert({
      order_id: order.id,
      ussd_command: renderedUssd || null,
      ussd_code: renderedUssd || null,
      provider_name: (pkg.provider_name || '').toLowerCase() || null,
      receiver_phone: normalizedSender,
      package_code: pkg.package_name,
      pin_code: pkg.sim_password || null,
      status: 'pending',
    });

    return new Response(JSON.stringify({ success: true, matched: true, order_id: order.id, package: pkg.package_name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
