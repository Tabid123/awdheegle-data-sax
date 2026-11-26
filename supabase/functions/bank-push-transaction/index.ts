import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';
import { z } from 'npm:zod@3.23.8';

const TxSchema = z.object({
  tran_no: z.string().min(1),
  tran_amt: z.union([z.number(), z.string().trim().min(1)]).transform((v) => Number(v)).pipe(z.number().finite().positive()),
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

const fieldAliases = {
  TranNo: 'tran_no', TranAmt: 'tran_amt', TranDate: 'tran_date',
  TranDateTime: 'tran_date_time', AccNo: 'acc_no', CustomerName: 'customer_name',
  Narration: 'narration', DrCr: 'dr_cr', UTI: 'uti', CurrencyCode: 'currency_code',
  RrpNo: 'rrp_no', TranDesc: 'tran_desc', TranType: 'tran_type',
  UserId: 'user_id_field', ChargeAmt: 'charge_amt',
} as const;

function normalizeBankPayload(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const source = raw as Record<string, unknown>;
  const result = { ...source };
  for (const [external, internal] of Object.entries(fieldAliases)) {
    if (Object.hasOwn(source, external)) {
      if (Object.hasOwn(source, internal) && String(source[internal]) !== String(source[external])) {
        throw new Error('Conflicting transaction fields');
      }
      result[internal] = source[external];
    }
  }
  for (const key of ['tran_no', 'acc_no', 'uti', 'rrp_no', 'user_id_field']) {
    if (typeof result[key] === 'number' && Number.isSafeInteger(result[key])) result[key] = String(result[key]);
  }
  if (typeof result.tran_no === 'string') result.tran_no = result.tran_no.trim();
  return result;
}

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
  // Salaam Bank: the sender is explicitly identified after By:, not the reference number.
  if (/\bBy\s*:/i.test(narration)) {
    const sender = narration.match(/\bBy\s*:\s*(\+?\d{9,15})(?!\d)/i)?.[1] ?? null;
    const receiver = narration.split('#').map(v => v.trim()).find(v => /^\+?\d{9,15}$/.test(v)) ?? null;
    return { sender, receiver };
  }
  const re = /(?:\+?252)?[0-9]{9,12}/g;
  const matches = narration.match(re) || [];
  const cleaned = matches.map((m) => m.replace(/^\+?252/, '')).filter((d) => d.length >= 9);
  return { sender: cleaned[0] || null, receiver: cleaned[1] || null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (req.method !== 'POST') return json({ status: false, error: 'method_not_allowed' }, 405);

    const auth = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      console.warn('bank-auth: missing or malformed bearer header');
      return json({ error: 'unauthorized', message: 'Unauthorized', status: false }, 401);
    }

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
      console.warn('bank-auth: JWT verification failed');
      // fall back to bank_sessions
      const { data: sess, error: sessionError } = await supabase
        .from('bank_sessions')
        .select('id, expires_at')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (sessionError) console.warn('bank-auth: session lookup error');
      else if (!sess) console.warn('bank-auth: active session not found');
      if (sess) {
        authed = true;
        await supabase.from('bank_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', sess.id);
      }
    }

    if (!authed) return json({ error: 'unauthorized', message: 'Unauthorized', status: false }, 401);

    const raw = await req.json().catch(() => null);
    const bankFormat = !!raw && typeof raw === 'object' && Object.keys(fieldAliases).some(k => Object.hasOwn(raw, k));
    let normalized: unknown;
    try {
      normalized = normalizeBankPayload(raw);
    } catch {
      return json({ message: 'Conflicting transaction fields', status: false }, 400);
    }
    const parsed = TxSchema.safeParse(normalized);
    if (!parsed.success) {
      const details = parsed.error.flatten();
      const message = details.fieldErrors.tran_no ? 'TranNo required' : 'Invalid transaction body';
      return json({ message, status: false, error: 'invalid_body', details }, 400);
    }
    const p = parsed.data;

    const drCr = (p.dr_cr || '').trim().toLowerCase();
    const currency = (p.currency_code || '').trim().toUpperCase();
    const ignored = (drCr !== '' && drCr !== 'cr') || (currency !== '' && currency !== 'USD') || (bankFormat && (drCr !== 'cr' || currency !== 'USD'));
    const { sender, receiver } = parsePhones(p.narration);
    const success = (extra: Record<string, unknown>) => json(bankFormat
      ? { message: 'Success', status: true }
      : { status: true, message: 'Success', ok: true, tran_no: p.tran_no, ...extra });

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
      match_status: ignored ? 'ignored_debit' : 'unmatched',
    };

    // Idempotent upsert on tran_no. Only insert if it doesn't exist.
    const { data: existing, error: lookupError } = await supabase
      .from('bank_transactions')
      .select('id, match_status')
      .eq('tran_no', p.tran_no)
      .maybeSingle();

    if (lookupError) return json({ message: 'Server error', status: false }, 500);
    if (existing) {
      return success({ match_status: existing.match_status, duplicate: true });
    }

    const { data: inserted, error: insErr } = await supabase
      .from('bank_transactions')
      .insert(row)
      .select('id, match_status')
      .single();

    if (insErr) {
      if (insErr.code === '23505') {
        const { data: duplicate } = await supabase.from('bank_transactions')
          .select('id, match_status').eq('tran_no', p.tran_no).maybeSingle();
        if (duplicate) return success({ match_status: duplicate.match_status, duplicate: true });
      }
      console.error('insert bank_transactions failed', insErr);
      return json({ status: false, error: 'insert_failed' }, 500);
    }

    // For debits, done here
    if (ignored) {
      return success({ match_status: 'ignored_debit' });
    }

    // Auto-match for credits
    let finalStatus = 'unmatched';
    if (sender && last9(sender)) {
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

    return success({ match_status: finalStatus });
  } catch (e) {
    console.error('bank-push-transaction error', e);
    return json({ status: false, error: 'internal_error' }, 500);
  }
});