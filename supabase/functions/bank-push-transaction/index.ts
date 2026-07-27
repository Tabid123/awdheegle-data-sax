import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';
import { z } from 'npm:zod@3.23.8';

const TxSchema = z.object({
  tran_no: z.string().min(1),
  tran_amt: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  tran_date: z.string().optional().nullable(),
  tran_date_time: z.string().optional().nullable(),
  acc_no: z.string().optional().nullable(),
  customer_name: z.string().optional().nullable(),
  narration: z.string().optional().nullable(),
  dr_cr: z.string().optional().nullable(),
  uti: z.string().optional().nullable(),
  currency_code: z.string().optional().nullable(),
  rrp_no: z.string().optional().nullable(),
  tran_desc: z.string().optional().nullable(),
  tran_type: z.string().optional().nullable(),
  user_id_field: z.string().optional().nullable(),
  charge_amt: z.union([z.number(), z.string()]).optional().nullable().transform((v) =>
    v === null || v === undefined || v === '' ? null : Number(v)
  ),
}).passthrough();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getJwtKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('BANK_JWT_SECRET');
  if (!secret) throw new Error('BANK_JWT_SECRET not configured');
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function last9(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

function parsePhones(narration: string | null | undefined): { sender: string | null; receiver: string | null } {
  if (!narration) return { sender: null, receiver: null };
  const re = /(?:\+?252)?[0-9]{9,12}/g;
  const matches = narration.match(re) || [];
  const cleaned = matches.map((m) => m.replace(/^\+?252/, '')).filter((d) => d.length >= 9);
  return { sender: cleaned[0] || null, receiver: cleaned[1] || null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader?.toLowerCase().startsWith('bearer ')) {
      return json({ error: 'unauthorized' }, 401);
    }
    const token = authHeader.slice(7).trim();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Try JWT verify first
    let authed = false;
    try {
      const key = await getJwtKey();
      await verify(token, key);
      authed = true;
    } catch (_e) {
      // fall back to bank_sessions
      const { data: sess } = await supabase
        .from('bank_sessions')
        .select('id, expires_at')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (sess) {
        authed = true;
        await supabase.from('bank_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', sess.id);
      }
    }

    if (!authed) return json({ error: 'unauthorized' }, 401);

    const raw = await req.json().catch(() => null);
    const parsed = TxSchema.safeParse(raw);
    if (!parsed.success) return json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
    const p = parsed.data;

    const drCr = (p.dr_cr || '').toString().toLowerCase();
    const { sender, receiver } = parsePhones(p.narration);

    // Common row payload
    const row: Record<string, unknown> = {
      tran_no: p.tran_no,
      tran_date: p.tran_date ?? null,
      tran_date_time: p.tran_date_time ?? null,
      acc_no: p.acc_no ?? null,
      customer_name: p.customer_name ?? null,
      tran_amt: p.tran_amt,
      narration: p.narration ?? null,
      dr_cr: p.dr_cr ?? null,
      uti: p.uti ?? null,
      currency_code: p.currency_code ?? null,
      rrp_no: p.rrp_no ?? null,
      tran_desc: p.tran_desc ?? null,
      tran_type: p.tran_type ?? null,
      user_id_field: p.user_id_field ?? null,
      charge_amt: p.charge_amt ?? null,
      raw_payload: raw,
      parsed_sender_phone: sender,
      parsed_receiver_phone: receiver,
      match_status: drCr === 'dr' ? 'ignored_debit' : 'unmatched',
    };

    // Idempotent upsert on tran_no. Only insert if it doesn't exist.
    const { data: existing } = await supabase
      .from('bank_transactions')
      .select('id, match_status')
      .eq('tran_no', p.tran_no)
      .maybeSingle();

    if (existing) {
      return json({ ok: true, tran_no: p.tran_no, match_status: existing.match_status, duplicate: true });
    }

    const { data: inserted, error: insErr } = await supabase
      .from('bank_transactions')
      .insert(row)
      .select('id, match_status')
      .single();

    if (insErr) {
      console.error('insert bank_transactions failed', insErr);
      return json({ error: 'insert_failed' }, 500);
    }

    // For debits, done here
    if (drCr === 'dr') {
      return json({ ok: true, tran_no: p.tran_no, match_status: 'ignored_debit' });
    }

    // Auto-match for credits
    let finalStatus = 'unmatched';
    if (sender) {
      const senderLast9 = last9(sender);
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: pendings } = await supabase
        .from('pending_online_payments')
        .select('id, sender_phone, expected_amount, created_at')
        .eq('status', 'pending')
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);

      const match = (pendings || []).find((r) => {
        const l = last9(r.sender_phone);
        return l && l === senderLast9 && Math.abs(Number(r.expected_amount) - Number(p.tran_amt)) <= 0.01;
      });

      if (match) {
        await supabase
          .from('pending_online_payments')
          .update({ status: 'matched', matched_at: new Date().toISOString() })
          .eq('id', match.id);

        await supabase
          .from('bank_transactions')
          .update({
            match_status: 'matched',
            matched_payment_id: match.id,
            processed_at: new Date().toISOString(),
          })
          .eq('id', inserted.id);

        finalStatus = 'matched';

        // Fire-and-forget activate-package
        supabase.functions
          .invoke('activate-package', {
            body: { pendingPaymentId: match.id, source: 'bank_auto', tranNo: p.tran_no },
          })
          .catch((e) => console.error('activate-package invoke failed', e));
      }
    }

    return json({ ok: true, tran_no: p.tran_no, match_status: finalStatus });
  } catch (e) {
    console.error('bank-push-transaction error', e);
    return json({ error: 'internal_error' }, 500);
  }
});