import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    const action = url.searchParams.get('action');

    // Route: Get device SIM configuration (for dynamic SIM slot routing)
    if (req.method === 'GET' && (path === 'device-config' || action === 'device-config')) {
      const deviceId = url.searchParams.get('deviceId');
      
      if (!deviceId) {
        return new Response(
          JSON.stringify({ error: 'deviceId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('📱 Fetching SIM config for device:', deviceId);
      
      const { data: device, error } = await supabase
        .from('android_devices')
        .select('sim1_provider, sim2_provider')
        .eq('device_id', deviceId)
        .is('archived_at', null)
        .maybeSingle();
      
      if (error) {
        console.error('Device config fetch error:', error);
      }
      
      const config = {
        sim1Provider: device?.sim1_provider || null,
        sim2Provider: device?.sim2_provider || null
      };
      
      console.log('📱 SIM config response:', config);
      
      return new Response(
        JSON.stringify(config),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Queue activation request
    if (req.method === 'POST' && path === 'activate-package') {
      const { orderId, providerName, receiverPhone } = await req.json();

      console.log('Queueing activation:', { orderId, providerName, receiverPhone });

      // Block check: reject if receiver phone is blocked
      const normalizedReceiver = receiverPhone?.replace(/\D/g, '').replace(/^252/, '').slice(-9) || '';
      const { data: isBlocked } = await supabase.rpc('is_phone_blocked', { p_phone: normalizedReceiver });
      if (isBlocked) {
        console.log('🚫 Blocked user attempted activation:', receiverPhone);
        // Get block reason
        const { data: blockInfo } = await supabase
          .from('blocked_users')
          .select('reason')
          .eq('phone_number', normalizedReceiver)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        const blockReason = blockInfo?.reason || 'Phone number is blocked';
        // Update order with blocked status
        await supabase.from('orders').update({
          delivery_status: 'blocked',
          delivery_notes: `Blocked: ${blockReason}`
        }).eq('id', orderId);
        return new Response(
          JSON.stringify({ error: 'This phone number is blocked', blocked: true, reason: blockReason }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 1. Get order details to retrieve package_id
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('package_id, provider_id')
        .eq('id', orderId)
        .single();

      if (orderErr || !order) {
        console.error('Order not found:', orderErr);
        throw new Error('Order not found');
      }

      // 2. Get package selling_price (qiimaha iibka oo macmiilka la siiyo) & category_id
      const { data: pkg, error: pkgErr } = await supabase
        .from('data_packages_config')
        .select('cost_price, selling_price, price, category_id')
        .eq('id', order.package_id)
        .single();

      if (pkgErr || !pkg) {
        console.error('Package not found:', pkgErr);
        throw new Error('Package not found');
      }

      // USSD waxaa lagu diraa COST PRICE (qiimaha Android-ka uu USSD ku diro),
      // MA AHA selling_price (taas waa qiimaha customer-ka bixiyo).
      const ussdAmount = Number(pkg.cost_price ?? pkg.price ?? pkg.selling_price);

      console.log('Package from DB:', { 
        packageId: order.package_id,
        costPrice: pkg.cost_price,
        sellingPrice: pkg.selling_price,
        price: pkg.price,
        ussdAmount,
        categoryId: pkg.category_id 
      });

      // 3. Get delivery instruction template with priority: Package > Category > Provider default
      let instruction: { code_template: string | null; sim_password: string | null } | null = null;

      // First: Try package-specific instruction
      const { data: packageInstr } = await supabase
        .from('delivery_instructions')
        .select('code_template, sim_password')
        .eq('provider_id', order.provider_id)
        .eq('package_id', order.package_id)
        .maybeSingle();

      if (packageInstr?.code_template) {
        instruction = packageInstr;
        console.log('Using package-specific instruction for package:', order.package_id);
      } else if (pkg.category_id) {
        // Second: Try category-specific instruction (without package_id)
        const { data: categoryInstr } = await supabase
          .from('delivery_instructions')
          .select('code_template, sim_password')
          .eq('provider_id', order.provider_id)
          .eq('category_id', pkg.category_id)
          .is('package_id', null)
          .maybeSingle();

        if (categoryInstr?.code_template) {
          instruction = categoryInstr;
          console.log('Using category-specific instruction for category:', pkg.category_id);
        }
      }

      // Third: Fall back to provider default (no category, no package)
      if (!instruction) {
        const { data: providerInstr } = await supabase
          .from('delivery_instructions')
          .select('code_template, sim_password')
          .eq('provider_id', order.provider_id)
          .is('category_id', null)
          .is('package_id', null)
          .maybeSingle();

        if (providerInstr?.code_template) {
          instruction = providerInstr;
          console.log('Using provider default instruction');
        }
      }

      if (!instruction || !instruction.code_template) {
        console.error('No delivery instruction found for order:', orderId);
        throw new Error('Delivery instruction not configured for this package/category/provider');
      }

      // 4. Build final USSD code - format amount correctly
      // Integers: 4 -> "4", 20 -> "20"
      // Sub-dollar (cents only): KEEP leading zero. 0.10 -> "010", 0.01 -> "001", 0.25 -> "025"
      // Decimals >= $1: use * separator. 4.25 -> "4*25", 1.50 -> "1*50"
      const formatAmountForUssd = (amount: number) => {
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount)) return '0';
        if (Math.abs(numericAmount - Math.round(numericAmount)) < 0.000001) {
          return String(Math.round(numericAmount));
        }
        const parts = numericAmount.toFixed(2).split('.');
        // Sub-dollar amounts (0.xx): keep leading zero -> "0xx"
        if (parts[0] === '0') {
          return `0${parts[1]}`;
        }
        // Dollar+ amounts: use * separator -> "X*YY"
        return `${parts[0]}*${parts[1]}`;
      };

      // No longer split amounts — send full amount in single USSD
      const splitMixedAmount = (amount: number): number[] => {
        return [Number(amount)];
      };

      const sanitizeUssdCode = (ussdCode: string) => {
        let cleaned = (ussdCode || '').replace(/\s+/g, '').trim();
        cleaned = cleaned.replace(/^(\*\d+?)(\d{9})(\*)/, '$1*$2$3');
        cleaned = cleaned.replace(/\*{2,}/g, '*');
        if (cleaned && !cleaned.endsWith('#')) {
          cleaned += '#';
        }
        return cleaned;
      };

      // Normalize phone to 9 digits - remove 252 prefix (ALL providers reject 252!)
      const normalizePhoneForUssd = (phone: string): string => {
        let p = (phone || '').replace(/^\+/, '').replace(/\D/g, '');
        // Ka saar 252 prefix - shirkadaha DHAN wey diidayaan!
        if (p.startsWith('252')) {
          p = p.substring(3);
        }
        return p.slice(-9);
      };

      const receiverForUssd = normalizePhoneForUssd(receiverPhone);
      const costParts = splitMixedAmount(ussdAmount);
      
      // Build USSD for a specific amount part
      const buildUssd = (amountPart: number) => {
        const amountFormatted = formatAmountForUssd(amountPart);
        return sanitizeUssdCode(
          (instruction.code_template ?? '')
            .replace('{receiver_phone}', receiverForUssd)
            .replace('{cost_price}', amountFormatted)
            .replace('{selling_price}', amountFormatted)
            .replace('{amount}', amountFormatted)
            .replace('{sim_password}', instruction.sim_password || '5516')
        );
      };

      console.log('💰 USSD amount split:', { costPrice: ussdAmount, parts: costParts, ussds: costParts.map(p => buildUssd(p)) });

      // 5. Idempotent insert into delivery_queue (avoid duplicates)
      let queueData: any = null;
      let queueError: any = null;

      const { data: existingQueues, error: existingErr } = await supabase
        .from('delivery_queue')
        .select('id, status')
        .eq('order_id', orderId)
        .in('status', ['pending', 'processing', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingErr) {
        console.warn('Existing queue fetch error:', existingErr);
      }

      const existingQueue = existingQueues && existingQueues.length > 0 ? existingQueues[0] : null;
      if (existingQueue) {
        console.log(`⚠️ Idempotency: delivery_queue already has active entry for order ${orderId} (status: ${existingQueue.status}). Skipping insert.`);
        queueData = existingQueue;
      } else {
        // Normalize provider name to slug format
        const normalizeProviderSlug = (name: string) => {
          const lower = name.toLowerCase();
          if (lower.includes('hormuud')) return 'hormuud';
          if (lower.includes('somnet')) return 'somnet';
          if (lower.includes('somtel')) return 'somtel';
          if (lower.includes('amtel')) return 'amtel';
          if (lower.includes('somlink')) return 'somlink';
          return lower.split(' ')[0];
        };

        const providerSlug = normalizeProviderSlug(providerName || '');

        // Find device with this provider and determine correct sim_slot
        const { data: deviceWithProvider } = await supabase
          .from('android_devices')
          .select('device_id, sim1_provider, sim2_provider')
          .is('archived_at', null)
          .or(`sim1_provider.ilike.%${providerSlug}%,sim2_provider.ilike.%${providerSlug}%`)
          .limit(1)
          .maybeSingle();

        // Calculate sim_slot: 0 = SIM1, 1 = SIM2
        let simSlot = 0;
        if (deviceWithProvider) {
          if (deviceWithProvider.sim1_provider?.toLowerCase().includes(providerSlug)) {
            simSlot = 0;
          } else if (deviceWithProvider.sim2_provider?.toLowerCase().includes(providerSlug)) {
            simSlot = 1;
          }
        }
        console.log('📱 Calculated sim_slot:', simSlot, 'for provider:', providerSlug);

        // Auto-split mixed amounts into separate delivery queue entries.
        // NOTE: ussd_command is the canonical column; ussd_code is mirrored by trigger.
        const queueItems = costParts.map((part, idx) => ({
          order_id: orderId,
          package_id: order.package_id,
          provider_name: providerSlug,
          ussd_command: buildUssd(part),
          ussd_code: buildUssd(part),
          receiver_phone: receiverPhone,
          status: idx === 0 ? 'pending' : 'scheduled',
          sim_slot: simSlot,
          execution_order: idx + 1,
          delay_seconds: idx * 15,
          ...(idx > 0 ? { scheduled_at: new Date(Date.now() + idx * 15000).toISOString() } : {}),
        }));

        if (queueItems.length > 1) {
          console.log(`📦 Auto-splitting $${pkg.cost_price} into ${queueItems.length} separate USSD deliveries`);
        }

        const insertRes = await supabase
          .from('delivery_queue')
          .insert(queueItems.length === 1 ? queueItems[0] : queueItems)
          .select();
        
        queueData = Array.isArray(insertRes.data) ? insertRes.data[0] : insertRes.data;
        queueError = insertRes.error;
      }

      if (queueError) {
        console.error('Queue insertion error:', queueError);
        throw queueError;
      }

      // 6. Update order status
      const { error: orderError } = await supabase
        .from('orders')
        .update({ delivery_status: 'queued' })
        .eq('id', orderId);

      if (orderError) {
        console.error('Order update error:', orderError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          queueId: queueData.id,
          estimatedTime: '10-30 seconds',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Get pending orders (Android app polls this)
    if (req.method === 'GET' && path === 'pending') {
      const deviceId = url.searchParams.get('deviceId');
      const batteryParam = url.searchParams.get('battery');
      const chargingParam = url.searchParams.get('charging');

      console.log('Fetching pending orders for deviceId:', deviceId);

      // Update last_ping_at ALWAYS when deviceId exists (battery is optional)
      if (deviceId) {
        const pingUpdate: Record<string, unknown> = {
          last_ping_at: new Date().toISOString(),
        };
        if (batteryParam) {
          pingUpdate.battery_level = parseInt(batteryParam);
          pingUpdate.is_charging = chargingParam === 'true';
        }
        await supabase
          .from('android_devices')
          .update(pingUpdate)
          .eq('device_id', deviceId)
          .is('archived_at', null);
        console.log(`🔋 Ping merged: device=${deviceId} battery=${batteryParam || 'N/A'}% charging=${chargingParam}`);
      }

      // Look up device to get UUID + configured providers
      // Android sends hardware device_id (text); RPC needs the UUID primary key
      const { data: device, error: deviceError } = await supabase
        .from('android_devices')
        .select('id, sim1_provider, sim2_provider')
        .eq('device_id', deviceId)
        .is('archived_at', null)
        .maybeSingle();

      if (deviceError) {
        console.error('Device lookup error:', deviceError);
      }

      if (!device?.id) {
        console.log('⚠️ Device not registered yet:', deviceId);
        return new Response(
          JSON.stringify({ orders: [], nextPollMs: 20000 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Build list of providers this device can handle
      const deviceProviders: string[] = [];
      if (device?.sim1_provider) {
        deviceProviders.push(device.sim1_provider.toLowerCase());
      }
      if (device?.sim2_provider) {
        deviceProviders.push(device.sim2_provider.toLowerCase());
      }

      console.log('Device providers:', deviceProviders, 'UUID:', device.id);

      // If no providers configured, return empty
      if (deviceProviders.length === 0) {
        console.log('No providers configured for device:', deviceId);
        return new Response(
          JSON.stringify({ orders: [], nextPollMs: 20000 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Promote scheduled deliveries whose time has arrived
      await supabase
        .from('delivery_queue')
        .update({ status: 'pending' })
        .eq('status', 'scheduled')
        .lte('scheduled_at', new Date().toISOString());

      // ATOMIC CLAIM: pass UUID (not hardware device_id string)
      const { data: claimed, error } = await supabase
        .rpc('claim_next_delivery', {
          p_device_id: device.id,
          p_providers: deviceProviders
        });

      if (error) {
        console.error('Claim error:', error);
        throw error;
      }

      // claim_next_delivery returns rows (TABLE) — supabase-js gives an array
      const claimedRow = Array.isArray(claimed) ? claimed[0] : claimed;
      if (claimedRow && claimedRow.id) {
        const order = claimedRow;

        console.log('✅ Claimed delivery:', { id: order.id, provider_name: order.provider_name });

      return new Response(
          JSON.stringify({
            orders: [{
              id: order.id,
              orderId: order.order_id,
              ussdCode: order.ussd_code || order.ussd_command,
              receiverPhone: order.receiver_phone,
              packageCode: order.package_code,
              attempts: order.attempts ?? 1,
              simSlot: order.sim_slot ?? 0,
              provider: order.provider_name,
              pinCode: order.pin_code || '',
            }],
            nextPollMs: 3000,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ orders: [], nextPollMs: 12000 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Update delivery status (Android app reports back)
    if (req.method === 'POST' && path === 'status') {
      const { queueId, status, errorMessage, providerResponse } = await req.json();

      console.log('Updating delivery status:', { queueId, status, errorMessage });

      // Idempotency: if this queue already finalized, ignore further updates
      const { data: existingQueue, error: existingQueueErr } = await supabase
        .from('delivery_queue')
        .select('id, status, order_id, dispatched_at')
        .eq('id', queueId)
        .maybeSingle();
      if (existingQueueErr) {
        console.warn('Queue fetch error:', existingQueueErr);
      }
      if (!existingQueue) {
        return new Response(
          JSON.stringify({ success: false, message: 'Queue not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (['completed', 'failed', 'verification_required'].includes(existingQueue.status as string)) {
        return new Response(
          JSON.stringify({ success: true, message: 'Already finalized' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Enhanced logging for debugging
      console.log('📊 Status update received:', { 
        queueId, 
        status, 
        errorMessage: errorMessage?.slice(0, 100),
        hasProviderResponse: !!providerResponse 
      });
      
      if (providerResponse) {
        console.log('🔍 Hormuud Response:', String(providerResponse).slice(0, 300));
      } else {
        console.log('⚠️  No provider response received from Android');
      }
      
      // Determine final status with provider response heuristics
      const text = String(providerResponse || '').toLowerCase();
      const successKeywords = [
        'ugu shubtay', 'u shubtay', 'success', 'successful',
        'approved', 'confirm', 'confirmed', 'activated',
        'ku guulaysatay', 'u wareejiso', 'u dirto', 'transcation id',
        'transaction id', 'lacagta waa la diray', 'successfully sent'
      ];
      const failureKeywords = [
        'khalad', 'fail', 'failed', 'error', 'reject', 'rejected',
        'insufficient', 'invalid', 'unknown', 'denied', 'declined',
        'cancelled', 'canceled',
        'service error', 'try again', 'please try again', 'internal',
        'temporarily', 'unavailable', 'not available', 'time out',
        'connection', 'network error', 'waxba kama dhicin'
      ];

      const providerIndicatesFailure = text.length > 0 && failureKeywords.some(k => text.includes(k));
      const providerIndicatesSuccess = text.length > 0 && successKeywords.some(k => text.includes(k));

      // Fetch current attempts for auto-retry logic
      const { data: existingAttempts, error: attemptsErr } = await supabase
        .from('delivery_queue')
        .select('attempts, provider_response')
        .eq('id', queueId)
        .maybeSingle();
      if (attemptsErr) {
        console.warn('Attempts fetch error:', attemptsErr);
      }
      const currentAttempts = ((existingAttempts?.attempts as number | null) ?? 0);

      // 🛡️ PRIOR-SUCCESS GUARD: if a previous attempt for THIS queue id already
      // captured a successful provider response, never retry again. This stops
      // duplicate USSD dials (= money loss) when the Android dialer reports
      // a false "timeout" even though Hormuud actually completed the transfer.
      const priorResponse = String(existingAttempts?.provider_response || '').toLowerCase();
      const priorIndicatesSuccess = priorResponse.length > 0 && successKeywords.some(k => priorResponse.includes(k));

      // Priority: failure keywords override Android status; success keywords override failure
      let normalizedStatus = 'failed';
      let isAutoRetry = false;

      // 🛡️ DISPATCH GUARD: once USSD has been dispatched, ambiguous failures
      // (timeout, connection problem, invalid MMI, no response) MUST NOT auto-retry —
      // provider may have already delivered. Send to verification queue instead.
      const wasDispatched = !!(existingQueue as any).dispatched_at;
      const ambiguousMarkers = [
        'timeout', 'time out', 'no response', 'connection problem', 'connection',
        'invalid mmi', 'mmi', 'unknown', 'service error', 'try again',
        'temporarily', 'unavailable', 'not available', 'network'
      ];
      const isAmbiguous = (text.length === 0)
        || ambiguousMarkers.some(k => text.includes(k))
        || status === 'timeout';

      if (providerIndicatesFailure && !providerIndicatesSuccess) {
        // Check for Somtel-specific "horey" + "furtay" keywords → 60s cooldown, MAX 10 attempts
        const isSomtelRetry = text.includes('horey') && text.includes('furtay');
        
        if (isSomtelRetry) {
          if (currentAttempts < 10) {
            normalizedStatus = 'pending';
            isAutoRetry = true;
            console.log(`🔄 Somtel retry: attempt ${currentAttempts + 1}/10 for queue ${queueId} - 60s cooldown`);
          } else {
            normalizedStatus = 'failed';
            console.log(`❌ Somtel: max retries (10) exceeded for queue ${queueId}`);
          }
        } else if (wasDispatched && isAmbiguous) {
          normalizedStatus = 'verification_required';
          console.log(`🛡️ Dispatch guard: queue ${queueId} already dispatched + ambiguous failure → verification_required (no retry)`);
        } else if (currentAttempts < 2) {
          normalizedStatus = 'pending'; // requeue
          isAutoRetry = true;
          console.log(`🔄 Auto-retry: attempt ${currentAttempts + 1}/3 for queue ${queueId}`);
        } else {
          normalizedStatus = 'failed'; // final after 3 attempts
          console.log(`❌ Final failure after 3 attempts for queue ${queueId}`);
        }
      } else if (providerIndicatesSuccess) {
        // Duplicate delivery prevention: check if a NEW delivered delivery exists for same receiver + order
        const { data: existingDelivered } = await supabase
          .from('delivery_queue')
          .select('id')
          .eq('order_id', existingQueue.order_id)
          .eq('status', 'completed')
          .neq('id', queueId)
          .limit(1)
          .maybeSingle();
        
        if (existingDelivered) {
          console.log(`⚠️ Duplicate delivery detected - another delivery already completed for order ${existingQueue.order_id}`);
        }
        
        normalizedStatus = 'completed';
        console.log('✅ Overriding status to COMPLETED based on provider message keywords');
      } else if (status === 'completed' && providerIndicatesSuccess) {
        normalizedStatus = 'completed';
      } else if (status === 'timeout' || (status === 'completed' && !providerIndicatesSuccess)) {
        // 🛡️ If a PRIOR attempt for this same queue id already had a success
        // marker in the captured response, do NOT retry. Mark as completed.
        // This prevents duplicate USSD dials (= money loss) when the Android
        // dialer falsely reports a timeout for an already-completed transfer.
        if (priorIndicatesSuccess) {
          normalizedStatus = 'completed';
          console.log(`🛡️ Prior-success guard: queue ${queueId} already had success markers - marking completed (no retry)`);
        } else if (wasDispatched) {
          normalizedStatus = 'verification_required';
          console.log(`🛡️ Dispatch guard: queue ${queueId} dispatched but ambiguous status="${status}" → verification_required`);
        } else {
          normalizedStatus = currentAttempts < 2 ? 'pending' : 'failed';
          isAutoRetry = currentAttempts < 2;
        }
      } else if (status === 'failed') {
        // Pure dial-side failure (e.g. SIM locked) BEFORE dispatch → safe to retry once
        if (!wasDispatched && currentAttempts < 2) {
          normalizedStatus = 'pending';
          isAutoRetry = true;
        } else if (wasDispatched) {
          normalizedStatus = 'verification_required';
          console.log(`🛡️ Dispatch guard: queue ${queueId} dispatched + status=failed → verification_required`);
        } else {
          normalizedStatus = 'failed';
        }
      }

      // Prepare update data
      const updateData: any = {
        status: normalizedStatus,
        last_attempt_at: new Date().toISOString(),
        attempts: currentAttempts + 1,
      };

      // Save provider response
      if (providerResponse) {
        updateData.provider_response = providerResponse;
      }

      if (isAutoRetry) {
        // Somtel retry uses 60s cooldown, others use 15s
        const isSomtelRetry = text.includes('horey') && text.includes('furtay');
        const cooldownMs = isSomtelRetry ? 60000 : 15000;
        // Release device and schedule retry
        updateData.android_device_id = null;
        updateData.scheduled_at = new Date(Date.now() + cooldownMs).toISOString();
        updateData.error_message = isSomtelRetry 
          ? `Somtel auto-retry attempt ${currentAttempts + 1}/10 (60s cooldown)`
          : `Auto-retry attempt ${currentAttempts + 1}/3`;
        console.log(`⏰ Scheduled retry in ${cooldownMs/1000}s for queue ${queueId}`);
      } else if (normalizedStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      // Update delivery queue
      const { data: queueData, error: queueError } = await supabase
        .from('delivery_queue')
        .update(updateData)
        .eq('id', queueId)
        .select()
        .single();

      if (queueError) {
        console.error('Queue update error:', queueError);
        throw queueError;
      }

      // Update order based on final delivery queue status
      // Skip order update for auto-retry (status='pending')
      const finalDeliveryStatus = queueData.status;
      
      if (finalDeliveryStatus !== 'pending') {
        const orderUpdate: any = {};
        
        if (finalDeliveryStatus === 'completed') {
          orderUpdate.status = 'completed';
          orderUpdate.delivery_status = 'delivered';
          orderUpdate.delivered_at = new Date().toISOString();
          orderUpdate.delivery_notes = providerResponse || 'Package activated successfully';
        } else if (finalDeliveryStatus === 'verification_required') {
          // Do NOT mark order as failed — provider may have delivered.
          orderUpdate.delivery_status = 'verification_required';
          orderUpdate.delivery_notes = (`Needs manual verification: USSD dispatched but response was ambiguous. ${providerResponse || errorMessage || ''}`).slice(0, 500);
        } else if (finalDeliveryStatus === 'failed') {
          orderUpdate.status = 'failed';
          orderUpdate.delivery_status = 'failed';
          const isSomtelMaxRetries = text.includes('horey') && text.includes('furtay') && currentAttempts >= 10;
          orderUpdate.delivery_notes = isSomtelMaxRetries 
            ? `Somtel: max retries (10) exceeded - ${errorMessage || providerResponse || 'Activation failed'}`
            : (errorMessage || 'Activation failed');
        }

        await supabase
          .from('orders')
          .update(orderUpdate)
          .eq('id', queueData.order_id);
      }

      // Update device counters
      if (queueData.android_device_id) {
        const { data: device, error: devErr } = await supabase
          .from('android_devices')
          .select('id, total_deliveries, failed_deliveries, device_id')
          .eq('device_id', queueData.android_device_id)
          .is('archived_at', null)
          .maybeSingle();
        if (devErr) {
          console.warn('Device fetch error:', devErr);
        } else if (device) {
          const updates: any = {};
          if (normalizedStatus === 'completed') {
            updates.total_deliveries = ((device.total_deliveries as number | null) ?? 0) + 1;
          } else {
            updates.failed_deliveries = ((device.failed_deliveries as number | null) ?? 0) + 1;
          }
          await supabase
            .from('android_devices')
            .update(updates)
            .eq('id', device.id);
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Device heartbeat
    if (req.method === 'POST' && path === 'ping') {
      const { deviceId, batteryLevel, isCharging, queueSize } = await req.json();

      // Try to update existing device with battery level (only non-archived)
      const { error: updateErr, count: updateCount } = await supabase
        .from('android_devices')
        .update({ 
          last_ping_at: new Date().toISOString(),
          battery_level: typeof batteryLevel === 'number' ? batteryLevel : null
        })
        .eq('device_id', deviceId)
        .is('archived_at', null);

      // If no rows updated and no error, device doesn't exist - auto-register
      if ((updateCount === 0 || updateCount === null) && !updateErr) {
        // Double-check: device may exist but updateCount is null (no count header)
        const { data: existingDevice } = await supabase
          .from('android_devices')
          .select('id')
          .eq('device_id', deviceId)
          .is('archived_at', null)
          .maybeSingle();

        if (!existingDevice) {
          console.log('📱 New device detected, auto-registering:', deviceId);
          const { data: insertedDevice, error: insertErr } = await supabase
            .from('android_devices')
            .insert({
              device_id: deviceId,
              device_name: `Auto-registered ${new Date().toISOString().split('T')[0]}`,
              provider_name: 'Unknown',
              sim_number: 'Unknown',
              is_active: true,
              last_ping_at: new Date().toISOString()
            })
            .select()
            .single();
          
          if (insertErr) {
            console.error('Auto-register error:', insertErr);
          } else {
            console.log('✅ Device auto-registered successfully:', deviceId);
            
            // Auto-create default sim_balances for new device
            const { error: balanceErr } = await supabase
              .from('sim_balances')
              .insert([
                { sim_id: insertedDevice.id, balance: 0, balance_type: 'evc_plus', balance_source: 'manual' },
                { sim_id: insertedDevice.id, balance: 0, balance_type: 'evoucher', balance_source: 'manual' }
              ]);
            
            if (balanceErr) {
              console.error('Auto-create balances error:', balanceErr);
            } else {
              console.log('✅ Created default sim_balances for new device');
            }
          }
        }
      }

      // Sweep stuck 'processing' deliveries for this device (timeout 5min)
      // Re-queue as 'pending' so they get retried when device is back online
      try {
        const timeoutMs = 300000; // 5 minutes
        const now = Date.now();
        const { data: processingRows, error: procErr } = await supabase
          .from('delivery_queue')
          .select('id, order_id, last_attempt_at, created_at, attempts')
          .eq('status', 'processing')
          .eq('android_device_id', deviceId);

        if (procErr) {
          console.warn('Processing fetch error:', procErr);
        } else {
          for (const row of processingRows ?? []) {
            const last = row.last_attempt_at ? new Date(row.last_attempt_at as string).getTime() : 0;
            const created = row.created_at ? new Date(row.created_at as string).getTime() : 0;
            const age = Math.max(now - last, now - created);
            if (age > timeoutMs) {
              const currentAttempts = ((row.attempts as number | null) ?? 0);
              
              if (currentAttempts < 3) {
                // Re-queue for retry (release device claim so any device can pick it up)
                console.log(`🔄 Re-queuing stuck delivery queueId=${row.id} (attempt ${currentAttempts + 1}/3, age=${age}ms)`);
                await supabase
                  .from('delivery_queue')
                  .update({
                    status: 'pending',
                    android_device_id: null,
                    error_message: `Auto-requeued after device timeout (attempt ${currentAttempts + 1}/3)`,
                    last_attempt_at: new Date().toISOString(),
                  })
                  .eq('id', row.id as string);
                
                // Update order to show it's being retried
                await supabase
                  .from('orders')
                  .update({
                    delivery_status: 'pending',
                    delivery_notes: `Auto-requeued: device went offline (attempt ${currentAttempts + 1}/3)`,
                  })
                  .eq('id', row.order_id as string);
              } else {
                // After 3 attempts, mark as timeout for manual review
                console.log(`⏰ Final timeout queueId=${row.id} after ${currentAttempts} attempts (age=${age}ms)`);
                const { data: updated, error: updErr } = await supabase
                  .from('delivery_queue')
                  .update({
                    status: 'timeout',
                    error_message: 'Device timeout after 3 attempts: awaiting manual verification',
                    last_attempt_at: new Date().toISOString(),
                    attempts: currentAttempts + 1,
                  })
                  .eq('id', row.id as string)
                  .select()
                  .single();
                if (updErr) {
                  console.error('Timeout update error:', updErr);
                } else if (updated) {
                  await supabase
                    .from('orders')
                    .update({
                      delivery_status: 'timeout',
                      delivery_notes: 'Device timeout after 3 attempts: USSD sent but no callback. Verify customer received bundle.',
                    })
                    .eq('id', updated.order_id as string);
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('Ping sweep error:', e);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== OTP SMS ROUTES ====================
    
    // Route: Get pending OTP tasks for Android device (filtered by provider)
    if (req.method === 'GET' && path === 'otp-pending') {
      const deviceId = url.searchParams.get('deviceId');
      
      console.log('📱 Fetching pending OTP tasks for device:', deviceId);

      // Get device's configured providers (sim1_provider, sim2_provider)
      const { data: device, error: deviceError } = await supabase
        .from('android_devices')
        .select('sim1_provider, sim2_provider')
        .eq('device_id', deviceId)
        .is('archived_at', null)
        .maybeSingle();

      if (deviceError) {
        console.error('Device lookup error:', deviceError);
      }

      // Build list of providers this device can handle
      const deviceProviders: string[] = [];
      if (device?.sim1_provider) {
        deviceProviders.push(device.sim1_provider.toLowerCase());
      }
      if (device?.sim2_provider) {
        deviceProviders.push(device.sim2_provider.toLowerCase());
      }

      console.log('📱 Device providers for OTP:', deviceProviders);

      // If no providers configured, return empty
      if (deviceProviders.length === 0) {
        console.log('No providers configured for device:', deviceId);
        return new Response(
          JSON.stringify({ tasks: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get pending OTP tasks matching device's providers (oldest first, limit 5)
      const { data: tasks, error } = await supabase
        .from('sms_otp_queue')
        .select('id, phone_number, otp_code, provider')
        .eq('status', 'pending')
        .in('provider', deviceProviders)
        .order('created_at', { ascending: true })
        .limit(5);

      if (error) {
        console.error('OTP fetch error:', error);
        throw error;
      }

      // Mark fetched tasks as processing
      if (tasks && tasks.length > 0) {
        const taskIds = tasks.map(t => t.id);
        await supabase
          .from('sms_otp_queue')
          .update({ 
            status: 'processing',
            device_id: deviceId 
          })
          .in('id', taskIds);
        
        console.log(`✅ Found ${tasks.length} pending OTP tasks for providers:`, deviceProviders);
      } else {
        console.log('📭 No pending OTP tasks for providers:', deviceProviders);
      }

      return new Response(
        JSON.stringify({ 
          tasks: tasks?.map(t => ({
            id: t.id,
            phoneNumber: t.phone_number,
            otpCode: t.otp_code,
            provider: t.provider
          })) || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Update OTP task status
    if (req.method === 'POST' && path === 'otp-status') {
      const { taskId, status, errorMessage } = await req.json();

      console.log('📱 Updating OTP status:', { taskId, status });

      const updateData: any = {
        status: status,
        processed_at: new Date().toISOString()
      };

      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      const { error } = await supabase
        .from('sms_otp_queue')
        .update(updateData)
        .eq('id', taskId);

      if (error) {
        console.error('OTP status update error:', error);
        throw error;
      }

      console.log(`✅ OTP task ${taskId} marked as ${status}`);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== COMBINED POLL ROUTE ====================
    // Combines /pending + /ping + /otp-pending into a single call to reduce Edge Function invocations
    if (req.method === 'POST' && path === 'poll') {
      const { deviceId, batteryLevel } = await req.json();
      
      if (!deviceId) {
        return new Response(
          JSON.stringify({ error: 'deviceId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 1. Ping / heartbeat
      const { data: updatedDevice } = await supabase
        .from('android_devices')
        .update({ 
          last_ping_at: new Date().toISOString(),
          battery_level: typeof batteryLevel === 'number' ? batteryLevel : null
        })
        .eq('device_id', deviceId)
        .is('archived_at', null)
        .select('sim1_provider, sim2_provider')
        .maybeSingle();

      // Auto-register if not found
      if (!updatedDevice) {
        const { data: insertedDevice } = await supabase
          .from('android_devices')
          .insert({
            device_id: deviceId,
            device_name: `Auto-registered ${new Date().toISOString().split('T')[0]}`,
            provider_name: 'Unknown',
            sim_number: 'Unknown',
            is_active: true,
            last_ping_at: new Date().toISOString()
          })
          .select('id, sim1_provider, sim2_provider')
          .maybeSingle();
        
        if (insertedDevice) {
          await supabase.from('sim_balances').insert([
            { sim_id: insertedDevice.id, balance: 0, balance_type: 'evc_plus', balance_source: 'manual' },
            { sim_id: insertedDevice.id, balance: 0, balance_type: 'evoucher', balance_source: 'manual' }
          ]);
        }
      }

      const device = updatedDevice || { sim1_provider: null, sim2_provider: null };
      const deviceProviders: string[] = [];
      if (device.sim1_provider) deviceProviders.push(device.sim1_provider.toLowerCase());
      if (device.sim2_provider) deviceProviders.push(device.sim2_provider.toLowerCase());

      let deliveryOrder = null;
      let otpTasks: any[] = [];

      if (deviceProviders.length > 0) {
        // Promote scheduled deliveries whose time has arrived
        await supabase
          .from('delivery_queue')
          .update({ status: 'pending' })
          .eq('status', 'scheduled')
          .lte('scheduled_at', new Date().toISOString());

        // 2. ATOMIC CLAIM: Pending delivery (prevents race condition)
        const { data: claimed } = await supabase
          .rpc('claim_next_delivery', {
            p_device_id: deviceId,
            p_providers: deviceProviders
          });

        if (claimed && claimed.length > 0) {
          const order = claimed[0];
          deliveryOrder = {
            id: order.id,
            orderId: order.order_id,
            ussdCode: order.ussd_code,
            receiverPhone: order.receiver_phone,
            packageCode: order.package_code,
            attempts: order.attempts,
            simSlot: order.sim_slot ?? 0,
            provider: order.provider_name,
          };
        }

        // 3. OTP tasks removed - OTP is now shown on-screen, no SMS needed
      }

      // 4. Sweep stuck processing deliveries (timeout 5min)
      try {
        const timeoutMs = 300000;
        const now = Date.now();
        const { data: processingRows } = await supabase
          .from('delivery_queue')
          .select('id, order_id, last_attempt_at, created_at, attempts')
          .eq('status', 'processing')
          .eq('android_device_id', deviceId);

        for (const row of processingRows ?? []) {
          const last = row.last_attempt_at ? new Date(row.last_attempt_at as string).getTime() : 0;
          const created = row.created_at ? new Date(row.created_at as string).getTime() : 0;
          const age = Math.max(now - last, now - created);
          if (age > timeoutMs) {
            const newAttempts = ((row.attempts as number | null) ?? 0) + 1;
            const { data: updated } = await supabase
              .from('delivery_queue')
              .update({ status: 'timeout', error_message: 'Device timeout', last_attempt_at: new Date().toISOString(), attempts: newAttempts })
              .eq('id', row.id as string)
              .select()
              .single();
            if (updated) {
              await supabase.from('orders').update({ delivery_status: 'timeout', delivery_notes: 'Device timeout: verify customer received bundle.' }).eq('id', updated.order_id as string);
            }
          }
        }
      } catch (_e) { /* sweep error, non-critical */ }

      // Dynamic poll interval: 3s when busy, 10s when idle
      const hasPendingWork = deliveryOrder !== null;
      const nextPollMs = hasPendingWork ? 3000 : 10000;

      return new Response(
        JSON.stringify({
          success: true,
          orders: deliveryOrder ? [deliveryOrder] : [],
          tasks: [],
          nextPollMs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Route not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
