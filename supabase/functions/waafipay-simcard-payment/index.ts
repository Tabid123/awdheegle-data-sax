import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaymentRequest {
  orderId: string;
  amount: number;
  paymentPhone: string;
  paymentProvider: string; // evc | edahab | sahal
}

function normalizeMsisdn(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('252')) return digits;
  if (digits.startsWith('0')) return '252' + digits.slice(1);
  return '252' + digits;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = (await req.json()) as PaymentRequest;
    const { orderId, amount, paymentPhone, paymentProvider } = body || ({} as PaymentRequest);
    if (!orderId || !paymentPhone || !paymentProvider || amount === undefined || amount === null || Number(amount) <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Xogta lacag-bixinta way dhiman tahay (qiimo, lambar, ama adeeg)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Load order and confirm ownership
    const { data: order, error: orderErr } = await admin
      .from('sim_card_orders')
      .select('id, user_id, price, payment_status')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (order.payment_status === 'paid') {
      return new Response(
        JSON.stringify({ success: true, message: 'Already paid' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const WAAFIPAY_API_USER_ID = Deno.env.get('WAAFIPAY_API_USER_ID');
    const WAAFIPAY_API_KEY = Deno.env.get('WAAFIPAY_API_KEY');
    const WAAFIPAY_MERCHANT_UID = Deno.env.get('WAAFIPAY_MERCHANT_UID');
    if (!WAAFIPAY_API_USER_ID || !WAAFIPAY_API_KEY || !WAAFIPAY_MERCHANT_UID) {
      return new Response(
        JSON.stringify({ success: false, error: 'WaafiPay credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const msisdn = normalizeMsisdn(paymentPhone);
    const amountStr = Number(amount).toFixed(2);
    const referenceId = `SIM-${orderId.slice(0, 8)}-${Date.now()}`;
    const invoiceId = `INV-${orderId.slice(0, 8)}-${Date.now()}`;

    const waafiPayload = {
      schemaVersion: '1.0',
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      channelName: 'WEB',
      serviceName: 'API_PURCHASE',
      serviceParams: {
        merchantUid: WAAFIPAY_MERCHANT_UID,
        apiUserId: WAAFIPAY_API_USER_ID,
        apiKey: WAAFIPAY_API_KEY,
        paymentMethod: 'MWALLET_ACCOUNT',
        payerInfo: { accountNo: msisdn },
        transactionInfo: {
          referenceId,
          invoiceId,
          amount: amountStr,
          currency: 'USD',
          description: `SIM Card Order ${orderId.slice(0, 8)}`,
        },
      },
    };

    console.log('[waafipay] sending', { orderId, msisdn, amountStr, paymentProvider });

    let waafiResp: any = null;
    let httpStatus = 0;
    try {
      const resp = await fetch('https://api.waafipay.net/asm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(waafiPayload),
      });
      httpStatus = resp.status;
      const text = await resp.text();
      console.log('[waafipay] response', { httpStatus, text });
      try {
        waafiResp = JSON.parse(text);
      } catch {
        waafiResp = { raw: text };
      }
    } catch (err) {
      console.error('[waafipay] network error', err);
      await admin
        .from('sim_card_orders')
        .update({
          payment_status: 'failed',
          error_message: `Network error: ${(err as Error).message}`,
          waafipay_response: { error: (err as Error).message },
        })
        .eq('id', orderId);
      return new Response(
        JSON.stringify({ success: false, error: 'Network error contacting WaafiPay' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const responseCode: string | undefined = waafiResp?.responseCode;
    const responseMsg: string | undefined =
      waafiResp?.responseMsg || waafiResp?.errorCode || 'Unknown response';
    const txId: string | undefined =
      waafiResp?.params?.transactionId || waafiResp?.params?.txId;
    const refId: string | undefined =
      waafiResp?.params?.referenceId || referenceId;

    const isSuccess = responseCode === '2001';

    await admin
      .from('sim_card_orders')
      .update({
        payment_status: isSuccess ? 'paid' : 'failed',
        waafipay_transaction_id: txId || null,
        waafipay_reference_id: refId || null,
        waafipay_response: waafiResp,
        error_message: isSuccess ? null : responseMsg,
      })
      .eq('id', orderId);

    if (isSuccess) {
      // Mark the catalog SIM as sold so it shows as "WAA LA IIBSADAY"
      const { data: orderRow } = await admin
        .from('sim_card_orders')
        .select('sim_number')
        .eq('id', orderId)
        .maybeSingle();
      if (orderRow?.sim_number) {
        await admin
          .from('sim_cards_catalog')
          .update({ sold_at: new Date().toISOString() })
          .eq('number', orderRow.sim_number)
          .is('sold_at', null);
      }
    }

    if (!isSuccess) {
      return new Response(
        JSON.stringify({
          success: false,
          error: responseMsg,
          responseCode,
          httpStatus,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment successful',
        transactionId: txId,
        referenceId: refId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[waafipay] fatal', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});