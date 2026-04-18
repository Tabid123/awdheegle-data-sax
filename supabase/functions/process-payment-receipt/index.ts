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

function senderVariants(p: string): string[] {
  const n = normalizeSomaliPhone(p);
  return [n, `0${n}`, `252${n}`, `+252${n}`];
}

async function callActivatePackage(supabaseUrl: string, serviceKey: string, orderId: string, providerName: string, receiverPhone: string) {
  try {
    const activateUrl = `${supabaseUrl}/functions/v1/activate-package/activate-package`;
    const res = await fetch(activateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
      body: JSON.stringify({ orderId, providerName, receiverPhone }),
    });
    const text = await res.text();
    if (!res.ok) console.error('❌ activate-package failed:', res.status, text);
    else console.log('📬 Delivery queued:', orderId, text);
  } catch (e) {
    console.error('❌ activate-package invoke error:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body: SMSData = await req.json();
    const { sender_phone, receiver_sim, amount, sms_body, tx_id } = body;
    const device_id: string | undefined = (body as any).device_id;

    if (!sender_phone || !amount || !sms_body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const normalizedSender = normalizeSomaliPhone(sender_phone);
    console.log('📱 SMS Received:', { normalizedSender, amount, tx_id });

    // Insert raw logs
    const { data: smsLog } = await supabase
      .from('payment_sms_log')
      .insert({ sender_phone: normalizedSender, amount, raw_sms: sms_body, reference: tx_id || null, status: 'pending' })
      .select().single();

    const { data: receipt } = await supabase
      .from('payment_receipts')
      .insert({ sender_phone: normalizedSender, amount, raw_sms: sms_body, reference: tx_id || null, status: 'pending', matched: false })
      .select().single();

    const variants = senderVariants(normalizedSender);

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

    // ============ TIER 1: AUTO TOP-UP ============
    // Logic FUDUD: Haddii lacagta loo soo diray (receiver_sim) tahay lambar
    // auto top-up la save-gareeyay → raadi xirmo amount-keedu match-gareeyo
    // lambarkaas → dalabka u dir SENDER-ka.
    const normalizedReceiver = receiver_sim ? normalizeSomaliPhone(receiver_sim) : '';
    const receiverVariants = normalizedReceiver
      ? [normalizedReceiver, `0${normalizedReceiver}`, `252${normalizedReceiver}`, `+252${normalizedReceiver}`]
      : [];

    let pkg: any = null;
    if (receiverVariants.length > 0) {
      const { data: topupNum } = await supabase
        .from('auto_topup_numbers')
        .select('id, phone_number, is_active')
        .in('phone_number', receiverVariants)
        .eq('is_active', true)
        .maybeSingle();

      if (topupNum) {
        const { data: matchingPkgs } = await supabase
          .from('auto_topup_packages')
          .select('*')
          .eq('topup_number_id', topupNum.id)
          .eq('is_active', true)
          .eq('selling_price', amount);
        pkg = matchingPkgs?.[0] || null;
        if (!pkg) {
          console.log(`⚠️ Auto top-up number ${topupNum.phone_number} matched, laakiin amount $${amount} ma waafaqsana xirmo.`);
        }
      }
    }

    if (pkg) {
      console.log('🔄 AUTO TOP-UP MATCH: amount $' + amount + ' → ' + pkg.package_name);

      // Hel provider_id ku salaysan magaca provider-ka
      let providerId: string | null = null;
      if (pkg.provider_name) {
        const { data: prov } = await supabase
          .from('providers_config')
          .select('id')
          .ilike('provider_name', pkg.provider_name)
          .maybeSingle();
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

      // Beddel placeholders-ka USSD template
      const rawTemplate: string = pkg.ussd_code || '';
      const costStr = String(pkg.cost_price ?? amount);
      const renderedUssd = rawTemplate
        .replace(/\{receiver_phone\}/g, normalizedSender)
        .replace(/\{cost_price\}/g, costStr)
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

      return new Response(JSON.stringify({ success: true, matched: true, tier: 'auto_topup', order_id: order.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // ============ TIER 2: PENDING ONLINE ORDER ============
    // Raadi pending order sender + amount. Hadii laga helo, dir.
    const { data: pendingPayments } = await supabase
      .from('pending_online_payments')
      .select('*')
      .in('sender_phone', variants)
      .eq('expected_amount', amount)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    const pending = pendingPayments?.[0];
    if (pending) {
      console.log('✅ TIER 2: Pending online order matched:', pending.id);
      const { data: order, error: orderError } = await supabase
        .from('orders').insert({
          sender_phone: pending.sender_phone,
          receiver_phone: pending.receiver_phone,
          amount: pending.expected_amount,
          provider_id: pending.provider_id,
          package_id: pending.package_id,
          status: 'pending',
          payment_status: 'matched',
          payment_reference: tx_id || null,
          is_offline: false,
        }).select().single();
      if (orderError) throw orderError;

      await supabase.from('pending_online_payments')
        .update({ status: 'matched', matched_order_id: order.id, matched_at: new Date().toISOString() })
        .eq('id', pending.id);
      await markMatched(order.id);

      if (pending.package_id) {
        const { data: provider } = await supabase
          .from('providers_config').select('provider_name').eq('id', pending.provider_id).maybeSingle();
        await callActivatePackage(supabaseUrl, serviceKey, order.id, provider?.provider_name || '', pending.receiver_phone);
      }
      return new Response(JSON.stringify({ success: true, matched: true, tier: 'pending_online', order_id: order.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // ============ TIER 3: OFFLINE REGISTRATION ============
    // Hadii sender diiwaan gashan yahay offline mode, raadi package amount-ka, dir. Hadii la waayo, awaiting admin.
    const { data: offlineRegs } = await supabase
      .from('offline_registrations')
      .select('*')
      .in('sender_phone', variants)
      .eq('is_active', true)
      .limit(1);

    const reg = offlineRegs?.[0];
    if (reg) {
      console.log('✅ TIER 3: Offline registration:', reg.id);
      let matchedPkg: any = null;
      if (reg.provider_id) {
        const { data: pkgs } = await supabase
          .from('data_packages_config')
          .select('id, package_name, selling_price, price, provider_id')
          .eq('provider_id', reg.provider_id)
          .eq('is_active', true);
        matchedPkg = (pkgs || []).find((p: any) =>
          Number(p.selling_price ?? p.price) === Number(amount)
        );
      }

      const receiverPhone = reg.receiver_phone || reg.sender_phone;
      const { data: order, error: orderError } = await supabase
        .from('orders').insert({
          sender_phone: reg.sender_phone,
          receiver_phone: receiverPhone,
          amount,
          provider_id: reg.provider_id,
          package_id: matchedPkg?.id || null,
          status: 'pending',
          payment_status: 'matched',
          payment_reference: tx_id || null,
          is_offline: true,
          delivery_notes: matchedPkg
            ? `Offline match: ${matchedPkg.package_name}`
            : `Awaiting admin — no package matches $${amount}`,
        }).select().single();
      if (orderError) throw orderError;
      await markMatched(order.id);

      if (matchedPkg) {
        const { data: provider } = await supabase
          .from('providers_config').select('provider_name').eq('id', reg.provider_id).maybeSingle();
        await callActivatePackage(supabaseUrl, serviceKey, order.id, provider?.provider_name || '', receiverPhone);
      }

      return new Response(JSON.stringify({ success: true, matched: true, tier: matchedPkg ? 'offline_auto_package' : 'offline_awaiting_admin', order_id: order.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // ============ TIER 4: UNMATCHED ============
    console.log('⚠️ No match in any tier');
    await markUnmatched('No matching auto top-up, pending order, or offline registration');
    return new Response(JSON.stringify({ success: true, matched: false, tier: 'unmatched' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
