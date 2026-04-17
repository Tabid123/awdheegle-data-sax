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

    if (!sender_phone || !amount || !sms_body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: sender_phone, amount, sms_body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const normalizedSender = normalizeSomaliPhone(sender_phone);
    console.log('📱 SMS Received:', { sender_phone, normalizedSender, receiver_sim, amount, tx_id });

    // 1. Insert into payment_sms_log (raw log)
    const { data: smsLog, error: smsLogError } = await supabase
      .from('payment_sms_log')
      .insert({
        sender_phone: normalizedSender,
        amount,
        raw_sms: sms_body,
        reference: tx_id || null,
        status: 'pending',
      })
      .select()
      .single();

    if (smsLogError) {
      console.error('❌ payment_sms_log insert error:', smsLogError);
    } else {
      console.log('💾 payment_sms_log saved:', smsLog?.id);
    }

    // 2. Insert into payment_receipts (for admin tracking)
    const { data: receipt, error: receiptError } = await supabase
      .from('payment_receipts')
      .insert({
        sender_phone: normalizedSender,
        amount,
        raw_sms: sms_body,
        reference: tx_id || null,
        status: 'pending',
        matched: false,
      })
      .select()
      .single();

    if (receiptError) {
      console.error('❌ payment_receipts insert error:', receiptError);
    } else {
      console.log('💾 payment_receipts saved:', receipt?.id);
    }

    // 3. Try to match against pending_online_payments
    const variants = senderVariants(normalizedSender);
    const { data: pendingPayments, error: pendingError } = await supabase
      .from('pending_online_payments')
      .select('*')
      .in('sender_phone', variants)
      .eq('expected_amount', amount)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (pendingError) {
      console.error('❌ pending_online_payments query error:', pendingError);
    }

    const pending = pendingPayments && pendingPayments.length > 0 ? pendingPayments[0] : null;

    if (!pending) {
      console.log('⚠️ No matching pending_online_payment found for', { normalizedSender, amount });

      // Mark as unmatched
      if (smsLog?.id) {
        await supabase.from('payment_sms_log').update({ status: 'unmatched' }).eq('id', smsLog.id);
      }
      if (receipt?.id) {
        await supabase.from('payment_receipts').update({ status: 'unmatched' }).eq('id', receipt.id);
      }
      await supabase.from('unmatched_payments').insert({
        payment_sms_id: smsLog?.id || null,
        sender_phone: normalizedSender,
        amount,
        reason: 'No matching pending order found',
      });

      return new Response(
        JSON.stringify({ success: true, matched: false, message: 'No matching pending payment' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    console.log('✅ Matched pending payment:', pending.id);

    // 4. Create order from pending_online_payment
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        sender_phone: pending.sender_phone,
        receiver_phone: pending.receiver_phone,
        amount: pending.expected_amount,
        provider_id: pending.provider_id,
        package_id: pending.package_id,
        status: 'pending',
        payment_status: 'matched',
        payment_reference: tx_id || null,
        is_offline: false,
      })
      .select()
      .single();

    if (orderError) {
      console.error('❌ Order create error:', orderError);
      throw orderError;
    }

    console.log('📝 Order created:', order.id);

    // 5. Update pending_online_payments
    await supabase
      .from('pending_online_payments')
      .update({
        status: 'matched',
        matched_order_id: order.id,
        matched_at: new Date().toISOString(),
      })
      .eq('id', pending.id);

    // 6. Update logs to matched
    if (smsLog?.id) {
      await supabase
        .from('payment_sms_log')
        .update({ status: 'matched', matched_order_id: order.id })
        .eq('id', smsLog.id);
    }
    if (receipt?.id) {
      await supabase
        .from('payment_receipts')
        .update({ status: 'matched', matched: true, order_id: order.id })
        .eq('id', receipt.id);
    }

    // 7. Queue delivery via activate-package edge function
    // Si loo isticmaalo logic-ka saxsan: cost_price (MA AHA selling_price),
    // delivery_instructions template, provider_name, sim_slot, receiver_phone normalize.
    if (pending.package_id) {
      try {
        // Get provider name for activate-package
        const { data: provider } = await supabase
          .from('providers_config')
          .select('provider_name, display_name')
          .eq('id', pending.provider_id)
          .maybeSingle();

        const providerName = provider?.provider_name || provider?.display_name || '';

        const activateUrl = `${supabaseUrl}/functions/v1/activate-package/activate-package`;
        const activateRes = await fetch(activateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
          },
          body: JSON.stringify({
            orderId: order.id,
            providerName,
            receiverPhone: pending.receiver_phone,
          }),
        });

        const activateText = await activateRes.text();
        if (!activateRes.ok) {
          console.error('❌ activate-package call failed:', activateRes.status, activateText);
        } else {
          console.log('📬 Delivery queued via activate-package for order:', order.id, activateText);
        }
      } catch (e) {
        console.error('❌ activate-package invocation error:', e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, matched: true, order_id: order.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error: any) {
    console.error('❌ Error processing payment:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal error', details: error?.toString?.() }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
