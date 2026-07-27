import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';
import { z } from 'npm:zod@3.23.8';

const LoginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
});

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const body = await req.json().catch(() => null);
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) return json({ error: 'invalid_body' }, 400);

    const { username, password } = parsed.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: ok, error: vErr } = await supabase.rpc('verify_bank_password', {
      p_username: username,
      p_password: password,
    });
    if (vErr) return json({ error: 'verification_failed' }, 500);
    if (!ok) return json({ error: 'invalid_credentials' }, 401);

    const { data: cred } = await supabase
      .from('bank_credentials')
      .select('id')
      .eq('username', username)
      .eq('is_active', true)
      .maybeSingle();
    if (!cred) return json({ error: 'invalid_credentials' }, 401);

    const iat = getNumericDate(0);
    const exp = getNumericDate(60 * 60 * 24);
    const key = await getJwtKey();
    const token = await create(
      { alg: 'HS256', typ: 'JWT' },
      { sub: username, iss: 'najax-bank', iat, exp },
      key
    );

    const expiresAt = new Date(exp * 1000).toISOString();
    await supabase.from('bank_sessions').insert({
      credential_id: cred.id,
      token,
      expires_at: expiresAt,
    });

    return json({ token, token_type: 'JWT', expires_in: 86400 });
  } catch (e) {
    console.error('bank-login error', e);
    return json({ error: 'internal_error' }, 500);
  }
});