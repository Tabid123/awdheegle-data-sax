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

function renderUssd(template: string, vars: Record<string, string | number | null | undefined>): string {
  let out = String(template || '');
  // Add common aliases so templates can use {phone}, {number}, {msisdn}, {pin}, {password}
  const enriched: Record<string, string | number | null | undefined> = { ...vars };
  const recv = vars.receiver_phone;
  if (recv != null) {
    if (enriched.phone == null) enriched.phone = recv;
    if (enriched.number == null) enriched.number = recv;
    if (enriched.msisdn == null) enriched.msisdn = recv;
    if (enriched.receiver == null) enriched.receiver = recv;
  }
  const pwd = vars.sim_password ?? vars.pin;
  if (pwd != null) {
    if (enriched.password == null) enriched.password = pwd;
    if (enriched.pin == null) enriched.pin = pwd;
  }
  if (vars.amount != null && enriched.cost == null) enriched.cost = vars.amount;
  for (const [k, v] of Object.entries(enriched)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v ?? ''));
  }
  return out;
}

// Resolve USSD template + sim_password.
// PRIORITY: delivery_instructions (System Codes) FIRST — package → category → provider,
// then fall back to data_packages_config.ussd_code/ussd_template as a last resort.
async function resolveUssdTemplate(
  supabase: any,
  pkg: { id?: string; provider_id?: string; category_id?: string | null; ussd_code?: string | null; ussd_template?: string | null },
): Promise<{ template: string; sim_password: string }> {
  let template = '';
  let sim_password = '';

  // 1) Always check delivery_instructions FIRST (these are the admin-managed System Codes)
  const { data: rows } = await supabase
    .from('delivery_instructions')
    .select('ussd_template, code_template, sim_password, package_id, category_id, provider_id')
    .or([
      pkg.id ? `package_id.eq.${pkg.id}` : null,
      pkg.category_id ? `category_id.eq.${pkg.category_id}` : null,
      pkg.provider_id ? `provider_id.eq.${pkg.provider_id}` : null,
    ].filter(Boolean).join(','));

  const list = rows || [];
  const pick =
    list.find((r: any) => pkg.id && r.package_id === pkg.id) ||
    list.find((r: any) => pkg.category_id && r.category_id === pkg.category_id) ||
    list.find((r: any) => pkg.provider_id && r.provider_id === pkg.provider_id);

  if (pick) {
    template = pick.ussd_template || pick.code_template || '';
    sim_password = pick.sim_password || '';
  }

  // 2) Fallback to package-level template only if System Codes had nothing
  if (!template) template = pkg.ussd_code || pkg.ussd_template || '';

  return { template, sim_password };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body: SMSData = await req.json();
    const { sender_phone, receiver_sim, amount, sms_body, tx_id } = body;

    if (!sender_phone || !amount || !sms_body) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const normalizedSender = normalizeSomaliPhone(sender_phone);
    let normalizedReceiver = receiver_sim ? normalizeSomaliPhone(receiver_sim) : '';

    // SMS brand tag → provider name (used as fallback when receiver_sim is missing)
    // [-JEEB-]/[-Somnet-] = Somnet, [-EVCPlus-] = Hormuud, [-Somtel-] = Somtel, etc.
    const detectReceiverProviderFromSms = (body: string): string | null => {
      const b = (body || '').toLowerCase();
      if (b.includes('[-jeeb-]') || b.includes('[-somnet-]') || b.includes('somnet telecom')) return 'somnet';
      if (b.includes('[-evcplus-]') || b.includes('[-evc plus-]') || b.includes('evcplus')) return 'hormuud';
      if (b.includes('[-somtel-]') || b.includes('somtel')) return 'somtel';
      if (b.includes('[-amtel-]') || b.includes('amtel')) return 'amtel';
      if (b.includes('[-somlink-]') || b.includes('somlink')) return 'somlink';
      return null;
    };

    // CILAD HORE: fallback-kii hore ee receiver_sim wuxuu ka soo akhrin jiray
    // auto_topup_numbers table-ka, taas oo keentay in DHAMMAAN dalabyada online & offline ay
    // si khaldan ugu galaan Auto Top-up flow-ga (sababtoo ah receiver-ka had iyo jeer waa
    // match auto-topup table). Hadda waxaan ka soocnay:
    //   - normalizedReceiver: kaliya marka Android-ku si rasmi ah u soo diro receiver_sim
    //   - autoTopupReceiverHint: receiver lagu helay auto_topup_numbers (Auto Top-up flow oo keliya)
    let autoTopupReceiverHint = '';
    if (!normalizedReceiver) {
      const recvProvider = detectReceiverProviderFromSms(sms_body);
      const { data: topupNums } = await supabase
        .from('auto_topup_numbers')
        .select('phone_number')
        .eq('is_active', true);

      const providerPrefixes: Record<string, string[]> = {
        somnet: ['615', '687', '686'],
        hormuud: ['61', '619', '612', '613', '617', '618'],
        somtel: ['634', '658'],
        amtel: ['636'],
        somlink: ['680'],
      };

      for (const t of (topupNums || [])) {
        const norm = normalizeSomaliPhone(t.phone_number);
        if (!norm) continue;
        if (recvProvider) {
          const prefixes = providerPrefixes[recvProvider] || [];
          if (prefixes.some((p) => norm.startsWith(p))) {
            autoTopupReceiverHint = norm;
            break;
          }
        } else {
          autoTopupReceiverHint = norm;
          break;
        }
      }
      if (autoTopupReceiverHint) {
        console.log('🔍 Auto-topup receiver hint (NOT used for online/offline):', autoTopupReceiverHint, '(', recvProvider || 'no-provider', ')');
      }
    }

    console.log('📱 SMS:', { sender: normalizedSender, receiver: normalizedReceiver, amount, tx_id });



    // Log raw SMS
    const { data: smsLog } = await supabase
      .from('payment_sms_log')
      .insert({ sender_phone: normalizedSender, amount, raw_sms: sms_body, reference: tx_id || null, status: 'pending' })
      .select().single();
    const { data: receipt } = await supabase
      .from('payment_receipts')
      .insert({ sender_phone: normalizedSender, amount, raw_sms: sms_body, reference: tx_id || null, status: 'pending', matched: false })
      .select().single();

    const ok = (payload: Record<string, unknown>) =>
      new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

    const markUnmatched = async (reason: string) => {
      console.log('❌ Unmatched:', reason);
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

    // ============================================================
    // STRICT PRIORITY ROUTING:
    //   1) Auto Top-up    → receiver_sim matches an auto_topup_number
    //   2) Pending Online → sender + amount matches pending_online_payments
    //   3) Offline Reg    → sender has active offline_registration
    // ============================================================
    const { data: allTopupNumbers } = await supabase
      .from('auto_topup_numbers')
      .select('id, phone_number, is_active')
      .eq('is_active', true);

    // Load providers once (used later for prefix → provider lookup)
    const { data: providersList } = await supabase
      .from('providers_config')
      .select('id, provider_name, phone_prefixes')
      .eq('is_active', true);

    let topupNumber: any = null;

    // PRIORITY 1: Auto Top-up — receiver waa in uu si rasmi ah u match noqdo auto_topup_numbers.
    // Waxaan isticmaalnaa normalizedReceiver (Android) AMA autoTopupReceiverHint (SMS tag fallback).
    // Si kastaba ha noqotee, mar dambe haddii Auto Top-up package aan la helin, online/offline flow
    // ayaa la tijaabin doonaa (sababtoo ah autoTopupReceiverHint waxaa laga yaabaa inuu khalad yahay).
    const autoTopupCandidate = normalizedReceiver || autoTopupReceiverHint;
    if (autoTopupCandidate) {
      topupNumber = (allTopupNumbers || []).find((t: any) => {
        const n = normalizeSomaliPhone(t.phone_number);
        return n === autoTopupCandidate;
      }) || null;
      if (topupNumber) {
        console.log('✅ P1 Auto Top-up matched → topup', topupNumber.phone_number);
      }
    }

    const senderPrefix2 = normalizedSender.substring(0, 2);
    let senderProviderName: string | null = null;
    let senderProviderId: string | null = null;
    for (const p of (providersList || [])) {
      const prefixes: string[] = (p.phone_prefixes || []).map((x: string) => String(x));
      if (prefixes.includes(senderPrefix2)) {
        senderProviderName = (p.provider_name || '').toLowerCase();
        senderProviderId = p.id;
        break;
      }
    }

    // ============================================================
    // FLOW A: AUTO TOP-UP (receiver is in auto_topup_numbers)
    // Haddii Auto Top-up package la waayo OO receiver-ku ka yimid SMS hint (ma rasmi ahayn),
    // waxaan u gudbeynaa Regular flow (pending online / offline reg) si aan u tijaabino.
    // ============================================================
    const receiverIsOfficial = !!normalizedReceiver; // Android-ku rasmi ah ayuu soo diray
    if (topupNumber) {
      console.log('🔁 AUTO TOP-UP FLOW | receiver:', autoTopupCandidate, '| topup_id:', topupNumber.id, '| official:', receiverIsOfficial);

      const { data: candidatePkgs } = await supabase
        .from('auto_topup_packages')
        .select('*')
        .eq('topup_number_id', topupNumber.id)
        .eq('is_active', true)
        .eq('selling_price', amount);

      const pkg = (candidatePkgs && candidatePkgs.length > 0 && senderProviderName)
        ? candidatePkgs.find((p: any) => (p.provider_name || '').toLowerCase() === senderProviderName)
        : null;

      if (pkg) {
        console.log('✅ Auto top-up package:', pkg.package_name, '(', pkg.provider_name, ')');

        const { data: order, error: orderError } = await supabase
          .from('orders').insert({
            sender_phone: normalizedSender,
            receiver_phone: normalizedSender,
            amount,
            status: 'pending',
            payment_status: 'matched',
            payment_reference: tx_id || null,
            is_offline: false,
            provider_id: senderProviderId,
            delivery_notes: `Auto top-up: ${pkg.package_name}`,
          }).select().single();
        if (orderError) throw orderError;
        await markMatched(order.id);

        const renderedUssd = renderUssd(pkg.ussd_code || '', {
          receiver_phone: normalizedSender,
          cost_price: pkg.cost_price ?? amount,
          amount,
          sim_password: pkg.sim_password || '',
          pin: pkg.sim_password || '',
        });

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

        return ok({ success: true, matched: true, flow: 'auto_topup', order_id: order.id, package: pkg.package_name });
      }

      // Auto top-up package lama helin
      if (receiverIsOfficial) {
        const reason = !candidatePkgs || candidatePkgs.length === 0
          ? `Auto top-up: no package matches $${amount} on ${autoTopupCandidate}`
          : !senderProviderName
            ? `Auto top-up: unknown sender prefix ${senderPrefix2}`
            : `Auto top-up: no ${senderProviderName} package for $${amount}`;
        await markUnmatched(reason);
        return ok({ success: true, matched: false, flow: 'auto_topup', reason: 'no_match' });
      }
      console.log('⤵️ Auto top-up package lama helin via SMS hint, tijaabi regular flow (pending online / offline reg)...');
    }

    // ============================================================
    // FLOW B: REGULAR (receiver is NOT auto-topup, or unknown)
    // ============================================================
    console.log('🟢 REGULAR FLOW | receiver:', normalizedReceiver || '(none)');

    // ---- Tier A: Pending Online Payments ----
    const { data: pendingPayments } = await supabase
      .from('pending_online_payments')
      .select('*')
      .eq('sender_phone', normalizedSender)
      .eq('expected_amount', amount)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    const pending = pendingPayments?.[0];
    if (pending) {
      console.log('✅ Tier A match: pending_online_payments', pending.id);

      // Get package details for USSD rendering
      let pkg: any = null;
      if (pending.package_id) {
        const { data: p } = await supabase
          .from('data_packages_config').select('*').eq('id', pending.package_id).maybeSingle();
        pkg = p;
      }

      const receiverPhone = normalizeSomaliPhone(pending.receiver_phone || normalizedSender);

      const { data: order, error: orderError } = await supabase
        .from('orders').insert({
          sender_phone: normalizedSender,
          receiver_phone: receiverPhone,
          amount,
          status: 'pending',
          payment_status: 'matched',
          payment_reference: tx_id || null,
          is_offline: false,
          provider_id: pending.provider_id || null,
          package_id: pending.package_id || null,
          delivery_notes: pkg ? `Online order: ${pkg.package_name}` : 'Online order',
        }).select().single();
      if (orderError) throw orderError;

      await supabase.from('pending_online_payments')
        .update({ status: 'matched', matched_order_id: order.id, matched_at: new Date().toISOString() })
        .eq('id', pending.id);
      await markMatched(order.id);

      if (pkg) {
        const { template, sim_password } = await resolveUssdTemplate(supabase, pkg);
        const renderedUssd = renderUssd(template, {
          receiver_phone: receiverPhone,
          cost_price: pkg.cost_price ?? amount,
          amount,
          sim_password,
          pin: sim_password,
        });
        await supabase.from('delivery_queue').insert({
          order_id: order.id,
          package_id: pkg.id,
          ussd_command: renderedUssd || null,
          ussd_code: renderedUssd || null,
          provider_name: null,
          receiver_phone: receiverPhone,
          package_code: pkg.package_name,
          status: 'pending',
        });
      }

      return ok({ success: true, matched: true, flow: 'pending_online', order_id: order.id });
    }

    // ---- Tier B: Offline Registrations ----
    const { data: regs } = await supabase
      .from('offline_registrations')
      .select('*')
      .eq('sender_phone', normalizedSender)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    const reg = regs?.[0];
    if (reg) {
      const receiverPhone = normalizeSomaliPhone(reg.receiver_phone || normalizedSender);

      // Determine receiver provider via prefix
      const recvPrefix2 = receiverPhone.substring(0, 2);
      let recvProviderId: string | null = reg.provider_id || null;
      let recvProviderName: string | null = (reg.provider_name || '').toLowerCase() || null;
      if (!recvProviderId) {
        for (const p of (providersList || [])) {
          const prefixes: string[] = (p.phone_prefixes || []).map((x: string) => String(x));
          if (prefixes.includes(recvPrefix2)) {
            recvProviderId = p.id;
            recvProviderName = (p.provider_name || '').toLowerCase();
            break;
          }
        }
      }

      if (!recvProviderId) {
        await markUnmatched(`Offline reg: cannot resolve provider for receiver ${receiverPhone}`);
        return ok({ success: true, matched: false, flow: 'offline_reg', reason: 'no_provider' });
      }

      // Find package matching provider + amount
      const { data: pkgs } = await supabase
        .from('data_packages_config')
        .select('*')
        .eq('provider_id', recvProviderId)
        .eq('is_active', true)
        .or(`selling_price.eq.${amount},price.eq.${amount}`);

      const pkg = (pkgs || [])[0];
      if (!pkg) {
        await markUnmatched(`Offline reg: no ${recvProviderName} package for $${amount}`);
        return ok({ success: true, matched: false, flow: 'offline_reg', reason: 'no_package' });
      }

      console.log('✅ Tier B match: offline_registration → package', pkg.package_name);

      const { data: order, error: orderError } = await supabase
        .from('orders').insert({
          sender_phone: normalizedSender,
          receiver_phone: receiverPhone,
          amount,
          status: 'pending',
          payment_status: 'matched',
          payment_reference: tx_id || null,
          is_offline: true,
          provider_id: recvProviderId,
          package_id: pkg.id,
          delivery_notes: `Offline reg: ${pkg.package_name}`,
        }).select().single();
      if (orderError) throw orderError;
      await markMatched(order.id);

      const { template, sim_password } = await resolveUssdTemplate(supabase, pkg);
      const renderedUssd = renderUssd(template, {
        receiver_phone: receiverPhone,
        cost_price: pkg.cost_price ?? amount,
        amount,
        sim_password,
        pin: sim_password,
      });
      await supabase.from('delivery_queue').insert({
        order_id: order.id,
        package_id: pkg.id,
        ussd_command: renderedUssd || null,
        ussd_code: renderedUssd || null,
        provider_name: recvProviderName,
        receiver_phone: receiverPhone,
        package_code: pkg.package_name,
        status: 'pending',
      });

      return ok({ success: true, matched: true, flow: 'offline_reg', order_id: order.id, package: pkg.package_name });
    }

    // ---- Tier C: Unmatched ----
    await markUnmatched(`No pending order or offline registration for sender ${normalizedSender} ($${amount})`);
    return ok({ success: true, matched: false, flow: 'regular', reason: 'no_match' });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
