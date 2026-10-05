import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SMSData {
  sender_phone: string;
  receiver_sim: string;
  amount: number;
  sms_body: string;
  tx_id?: string;
  sms_timestamp?: number;
}

/**
 * Normalize Somali phone number to canonical 9-digit local format
 */
function normalizeSomaliPhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("252") && digits.length >= 12) {
    digits = digits.substring(3);
  }
  if (digits.startsWith("0") && digits.length === 10) {
    digits = digits.substring(1);
  }
  return digits.slice(-9);
}

/**
 * Extract sender phone from SMS body text
 */
function extractSenderFromSmsBody(smsBody: string): string | null {
  if (!smsBody) return null;
  const patterns = [
    /ka\s+heshay\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /waxaad.*?ka\s+heshay\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /received\s+from\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /lacag\s+ayaad\s+ka\s+heshay\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /received\s+airtime\s+from\s+(\+?252\d{9}|\d{9,12})/i,
    /ka.*?heshay.*?(\+?252\d{9}|\d{9,12})/i,
  ];
  for (const pattern of patterns) {
    const match = smsBody.match(pattern);
    if (match) return normalizeSomaliPhone(match[1]);
  }
  return null;
}

function normalizeSmsBodyForFingerprint(smsBody: string): string {
  return (smsBody || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeAmountForFingerprint(amount: number): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "0";
  return String(Math.round(numericAmount * 100));
}

async function sha256Hex(value: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function extractTransactionReference(smsBody: string): string | null {
  if (!smsBody) return null;

  const patterns = [
    /(?:transaction|trans(?:action)?|trx|tx)\s*(?:id|ref|reference|number|no|#)?\s*[:=#-]?\s*([a-z0-9-]{6,})/i,
    /(?:ref|reference|tixraac)\s*(?:id|number|no|#)?\s*[:=#-]?\s*([a-z0-9-]{6,})/i,
  ];

  for (const pattern of patterns) {
    const match = smsBody.match(pattern);
    if (match?.[1]) {
      return match[1].trim().toUpperCase();
    }
  }

  return null;
}

async function buildStableReceiptTxId(
  senderPhone: string,
  amount: number,
  smsBody: string,
  _smsTimestamp?: number,
): Promise<string | null> {
  // CRITICAL: smsTimestamp is NOT included in the hash.
  // SmsReceiver and UssdDialerService report slightly different timestamps
  // for the same SMS, so including it would produce different tx_ids and
  // bypass deduplication. Hash is based on sender + amount + body only.
  if (!smsBody) return null;

  const payload = [
    normalizeSomaliPhone(senderPhone),
    normalizeAmountForFingerprint(amount),
    normalizeSmsBodyForFingerprint(smsBody),
  ].join("|");

  const hash = await sha256Hex(payload);
  return `sms_${hash.slice(0, 24)}`;
}

async function resolveExistingOrderByTxId(supabase: any, txId: string | null) {
  if (!txId) return null;

  const { data } = await supabase
    .from("orders")
    .select("id, status, delivery_status")
    .eq("tx_id", txId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

async function queueDirectDeliveryIfMissing(supabase: any, queueItem: Record<string, any>): Promise<boolean> {
  if (await hasActiveDelivery(supabase, queueItem.order_id)) {
    console.log("⚠️ Direct queue skipped — active delivery already exists for order:", queueItem.order_id);
    return false;
  }

  const { error } = await supabase.from("delivery_queue").insert(queueItem);
  if (error) throw error;
  return true;
}

async function hasActiveDelivery(supabase: any, orderId: string): Promise<boolean> {
  const { data } = await supabase
    .from("delivery_queue")
    .select("id")
    .eq("order_id", orderId)
    .in("status", ["pending", "processing", "completed"])
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function pendingAlreadyMatched(supabase: any, pendingId: string): Promise<boolean> {
  const { data } = await supabase.from("pending_online_payments").select("id, status").eq("id", pendingId).single();
  return data?.status === "matched";
}

function normalizeProviderSlug(name: string | null | undefined): string {
  if (!name || typeof name !== "string") return "";
  const lower = name.toLowerCase().trim();
  if (!lower) return "";
  if (lower.includes("hormuud")) return "hormuud";
  if (lower.includes("somnet")) return "somnet";
  if (lower.includes("somtel")) return "somtel";
  if (lower.includes("amtel")) return "amtel";
  if (lower.includes("somlink")) return "somlink";
  return lower.split(" ")[0] || "";
}

/**
 * Resolve the provider slug given an optional name AND a provider_id.
 * `provider_id` is ALWAYS the source of truth (FK → providers_config).
 * `provider_name` is a free-text label that can drift out of sync with the id
 * (e.g. an offline_registration row whose name says "Somnet" but whose id
 * points to Hormuud). Trusting the name in that case routes USSD to the
 * wrong SIM and the carrier replies "Unrecognized mobile number".
 *
 * Strategy: prefer provider_id lookup; only fall back to the name when no id.
 */
async function resolveProviderSlug(
  supabase: any,
  providerId: string | null | undefined,
  providerName: string | null | undefined,
): Promise<string> {
  if (providerId) {
    const { data: prov } = await supabase
      .from("providers_config")
      .select("provider_name, display_name")
      .eq("id", providerId)
      .maybeSingle();
    const fromId =
      normalizeProviderSlug(prov?.provider_name) ||
      normalizeProviderSlug(prov?.display_name);
    if (fromId) {
      const fromName = normalizeProviderSlug(providerName);
      if (fromName && fromName !== fromId) {
        console.warn(
          `⚠️ provider_name "${providerName}" (slug=${fromName}) disagrees with provider_id ${providerId} (slug=${fromId}). Trusting provider_id.`,
        );
      }
      return fromId;
    }
  }
  // No id (or id not found) — fall back to the name.
  return normalizeProviderSlug(providerName);
}

async function routeSomlinkApiIfNeeded(
  supabase: any,
  orderId: string,
  providerId: string | null | undefined,
  providerName: string | null | undefined,
): Promise<string | null> {
  const providerSlug = await resolveProviderSlug(supabase, providerId, providerName);
  if (providerSlug !== "somlink") return null;

  const { data: queueId, error: enqueueError } = await supabase.rpc("enqueue_somlink_delivery", {
    p_order_id: orderId,
  });
  if (enqueueError) throw enqueueError;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  try {
    const dispatchResponse = await fetch(supabaseUrl + "/functions/v1/somlink-dispatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + serviceKey,
        "apikey": serviceKey,
      },
      body: JSON.stringify({ queue_id: queueId }),
      signal: AbortSignal.timeout(35000),
    });
    if (!dispatchResponse.ok) {
      console.error("Somlink dispatcher returned HTTP", dispatchResponse.status);
    }
  } catch (error) {
    console.error("Somlink dispatcher invoke failed; queue remains pending", error);
  }

  return String(queueId);
}

function formatAmountForUssd(amount: number): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "0";
  if (Math.abs(numericAmount - Math.round(numericAmount)) < 0.000001) {
    return String(Math.round(numericAmount));
  }
  if (numericAmount < 1) {
    return numericAmount.toFixed(2).replace(".", "");
  }
  // For amounts >= 1 with decimals (e.g. 4.25 → "4*25")
  const wholePart = Math.floor(numericAmount);
  const fracPart = Math.round((numericAmount - wholePart) * 100);
  return `${wholePart}*${fracPart}`;
}

function splitMixedAmount(amount: number): number[] {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return [0];
  const wholePart = Math.floor(numericAmount);
  const fracPart = Math.round((numericAmount - wholePart) * 100) / 100;
  if (fracPart < 0.001) return [numericAmount];
  if (wholePart === 0) return [numericAmount];
  return [wholePart, fracPart];
}

function normalizePhoneForProvider(phone: string): string {
  let digits = (phone || "").replace(/^\+/, "");
  if (digits.startsWith("252")) digits = digits.substring(3);
  return digits.slice(-9);
}

function sanitizeUssdCode(ussd: string): string {
  const [rawDial, ...menuParts] = (ussd || "").split("|");
  let dial = rawDial.replace(/\s+/g, "").trim();
  dial = dial.replace(/^(\*\d+?)(\d{9})(\*)/, "$1*$2$3");
  dial = dial.replace(/\*{2,}/g, "*");
  if (dial && !dial.endsWith("#")) dial += "#";
  const menuPath = menuParts.join("|").trim();
  return menuPath ? `${dial}|${menuPath}` : dial;
}

function buildUssdCode(
  template: string,
  receiverPhone: string,
  costPrice: number,
  simPassword: string,
  packageCode = "",
): string {
  return sanitizeUssdCode(
    template
      .replace(/\{receiver_phone\}/g, normalizePhoneForProvider(receiverPhone))
      .replace(/\{package_code\}/g, packageCode || "")
      .replace(/\{cost_price\}/g, formatAmountForUssd(Number(costPrice)))
      .replace(/\{sim_password\}/g, simPassword || "5516"),
  );
}

async function getDeliveryInstruction(
  supabase: any,
  providerId: string,
  packageId?: string | null,
  categoryId?: string | null,
) {
  const getSingleInstruction = async (query: any, scope: string) => {
    const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error && error.code !== "PGRST116") {
      console.error(`❌ Delivery instruction lookup failed (${scope}):`, error);
      return null;
    }
    return data?.code_template ? data : null;
  };

  if (packageId) {
    const packageInstruction = await getSingleInstruction(
      supabase
        .from("delivery_instructions")
        .select("code_template, sim_password")
        .eq("provider_id", providerId)
        .eq("package_id", packageId),
      "package",
    );
    if (packageInstruction) return packageInstruction;
  }

  if (categoryId) {
    const categoryInstruction = await getSingleInstruction(
      supabase
        .from("delivery_instructions")
        .select("code_template, sim_password")
        .eq("provider_id", providerId)
        .eq("category_id", categoryId)
        .is("package_id", null),
      "category",
    );
    if (categoryInstruction) return categoryInstruction;
  }

  return getSingleInstruction(
    supabase
      .from("delivery_instructions")
      .select("code_template, sim_password")
      .eq("provider_id", providerId)
      .is("category_id", null)
      .is("package_id", null),
    "provider",
  );
}

async function queueDeliveryWithBundling(
  supabase: any,
  orderId: string,
  sourcePackageId: string,
  providerId: string,
  receiverPhone: string,
  providerSlug: string,
) {
  if (await hasActiveDelivery(supabase, orderId)) {
    console.log("⚠️ Skipping bundled queue — active delivery already exists for order:", orderId);
    return [];
  }

  const { data: rules } = await supabase
    .from("package_delivery_rules")
    .select("*")
    .eq("source_package_id", sourcePackageId)
    .eq("is_active", true)
    .order("execution_order", { ascending: true });

  if (!rules || rules.length === 0) return null;

  console.log(`📦 Bundling rules found: ${rules.length} rules for package ${sourcePackageId}`);

  // Resolve which SIM slot owns this provider so the right SIM dials USSD.
  // STRICT: if no matching SIM exists, refuse to queue — wrong SIM = "Unrecognized mobile number".
  const slotInfo = await resolveSimSlotForProvider(supabase, providerSlug);
  if (!slotInfo) {
    console.error(
      `❌ queueDeliveryWithBundling: no SIM slot for provider "${providerSlug}". Refusing to queue (would dial from wrong carrier).`,
    );
    await supabase
      .from("orders")
      .update({
        delivery_status: "failed",
        delivery_notes: `No ${providerSlug.toUpperCase()} SIM available on any active device.`,
      })
      .eq("id", orderId);
    return [];
  }
  console.log(`✅ Bundling via device ${slotInfo.android_device_id} sim_slot=${slotInfo.sim_slot} (${providerSlug})`);

  const queueItems: any[] = [];

  for (const rule of rules) {
    const { data: targetPkg } = await supabase
      .from("data_packages_config")
      .select("*, category_id")
      .eq("id", rule.target_package_id)
      .single();
    if (!targetPkg) continue;

    const instruction = await getDeliveryInstruction(
      supabase,
      providerId,
      rule.target_package_id,
      targetPkg.category_id,
    );
    if (!instruction?.code_template) continue;

    const costParts = splitMixedAmount(Number(targetPkg.cost_price));
    for (const costPart of costParts) {
      const ussd = buildUssdCode(
        instruction.code_template,
        receiverPhone,
        costPart,
        instruction.sim_password || "5516",
        targetPkg.ussd_code || "",
      );
      for (let i = 0; i < rule.delivery_count; i++) {
        // If delay_minutes is 0 but delivery_count > 1, stagger by 1 minute each to prevent duplicate pending entries
        const effectiveDelayMs =
          rule.delay_minutes > 0 ? rule.delay_minutes * i * 60000 : rule.delivery_count > 1 ? i * 60000 : 0;
        queueItems.push({
          order_id: orderId,
          provider_name: providerSlug,
          ussd_code: ussd,
          receiver_phone: receiverPhone,
          package_code: targetPkg.ussd_code,
          status: effectiveDelayMs === 0 ? "pending" : "scheduled",
          scheduled_at: new Date(Date.now() + effectiveDelayMs).toISOString(),
          sim_slot: slotInfo.sim_slot,
        });
      }
    }
  }

  if (queueItems.length > 0) {
    const { data: inserted, error: qErr } = await supabase.from("delivery_queue").insert(queueItems).select();
    if (qErr) console.error("❌ Bundled queue error:", qErr);
    else console.log(`📬 Bundled: ${inserted.length} deliveries queued (provider=${providerSlug}, sim_slot=${slotInfo.sim_slot})`);
    return inserted;
  }
  return null;
}

/**
 * Resolve the actual receiving SIM phone number AND its provider.
 * Looks up android_devices to find the SIM slot that owns this number/provider
 * and returns the matching sim1_provider or sim2_provider.
 */
async function resolveReceiverSimInfo(
  supabase: any,
  receiverSim: string,
): Promise<{ simNumber: string; provider: string | null }> {
  const normalized = normalizeSomaliPhone(receiverSim);
  const receiverLower = (receiverSim || "").toLowerCase().trim();

  const { data: devices } = await supabase
    .from("android_devices")
    .select("sim_number, sim2_number, sim1_provider, sim2_provider")
    .eq("is_active", true)
    .is("archived_at", null);

  // CASE 1: receiver_sim is a phone number — find matching slot to get its provider
  if (normalized.length === 9 && /^[0-9]/.test(normalized)) {
    const firstTwo = normalized.substring(0, 2);
    const looksLikePhone = ["61", "62", "63", "64", "68", "69", "71", "77"].includes(firstTwo);

    if (looksLikePhone && devices) {
      for (const device of devices) {
        const sim1 = normalizeSomaliPhone(device.sim_number || "");
        const sim2 = normalizeSomaliPhone(device.sim2_number || "");
        if (sim1 === normalized && device.sim1_provider) {
          console.log(`✅ Resolved SIM ${normalized} → slot 1, provider: ${device.sim1_provider}`);
          return { simNumber: normalized, provider: device.sim1_provider };
        }
        if (sim2 === normalized && device.sim2_provider) {
          console.log(`✅ Resolved SIM ${normalized} → slot 2, provider: ${device.sim2_provider}`);
          return { simNumber: normalized, provider: device.sim2_provider };
        }
      }
      console.log(`⚠️ SIM ${normalized} is a phone number but not found in android_devices`);
      return { simNumber: normalized, provider: null };
    }
  }

  // CASE 2: receiver_sim is a provider name — find a SIM slot with that provider
  console.log(`📡 receiver_sim "${receiverSim}" looks like a provider name, resolving to SIM number`);
  if (devices) {
    for (const device of devices) {
      if (device.sim1_provider && device.sim1_provider.toLowerCase().includes(receiverLower) && device.sim_number) {
        const simNum = normalizeSomaliPhone(device.sim_number);
        if (simNum.length === 9) {
          console.log(`✅ Resolved provider "${receiverSim}" → SIM1 ${simNum} (${device.sim1_provider})`);
          return { simNumber: simNum, provider: device.sim1_provider };
        }
      }
      if (device.sim2_provider && device.sim2_provider.toLowerCase().includes(receiverLower) && device.sim2_number) {
        const simNum = normalizeSomaliPhone(device.sim2_number);
        if (simNum.length === 9) {
          console.log(`✅ Resolved provider "${receiverSim}" → SIM2 ${simNum} (${device.sim2_provider})`);
          return { simNumber: simNum, provider: device.sim2_provider };
        }
      }
    }
  }

  console.log(`⚠️ Could not resolve receiver_sim "${receiverSim}"`);
  return { simNumber: receiverLower, provider: null };
}

// Backwards-compat shim for callers that only need the SIM number.
async function resolveReceiverSimNumber(supabase: any, receiverSim: string): Promise<string> {
  const info = await resolveReceiverSimInfo(supabase, receiverSim);
  return info.simNumber;
}

/**
 * Find the SIM slot (1 or 2) on any active android device that matches the
 * given provider slug (e.g. "somnet", "hormuud"). Returns null if no slot found.
 *
 * This guarantees that USSD codes for a Somnet package are dialed from the
 * Somnet SIM, not from a Hormuud SIM (which would return "Unrecognized
 * mobile number").
 */
async function resolveSimSlotForProvider(
  supabase: any,
  providerSlug: string,
): Promise<{ sim_slot: number; android_device_id: string } | null> {
  const slug = (providerSlug || "").toLowerCase().trim();
  if (!slug) return null;

  const { data: devices } = await supabase
    .from("android_devices")
    .select("id, sim1_provider, sim2_provider, status, last_heartbeat")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("status", { ascending: true }) // 'online' < 'offline' alphabetically? we'll re-sort below
    .order("last_heartbeat", { ascending: false });

  if (!devices || devices.length === 0) {
    console.log(`⚠️ resolveSimSlotForProvider("${slug}"): no active devices`);
    return null;
  }

  // Prefer online devices first
  const sorted = [...devices].sort((a: any, b: any) => {
    if (a.status === "online" && b.status !== "online") return -1;
    if (b.status === "online" && a.status !== "online") return 1;
    return 0;
  });

  for (const d of sorted) {
    const p1 = (d.sim1_provider || "").toLowerCase().trim();
    const p2 = (d.sim2_provider || "").toLowerCase().trim();
    if (p1 === slug || p1.includes(slug)) {
      console.log(`✅ Provider "${slug}" → device ${d.id} sim_slot=1 (status=${d.status})`);
      return { sim_slot: 1, android_device_id: d.id };
    }
    if (p2 === slug || p2.includes(slug)) {
      console.log(`✅ Provider "${slug}" → device ${d.id} sim_slot=2 (status=${d.status})`);
      return { sim_slot: 2, android_device_id: d.id };
    }
  }

  console.log(`⚠️ resolveSimSlotForProvider("${slug}"): no matching SIM slot found on any device`);
  return null;
}

/**
 * Determine the ROUTE for this SMS based on which SIM received it.
 * Returns: 'auto_topup' | 'payment' | 'unknown'
 */
async function determineRoute(supabase: any, resolvedSimNumber: string): Promise<"auto_topup" | "payment" | "unknown"> {
  const simVariants = [
    resolvedSimNumber,
    `0${resolvedSimNumber}`,
    `252${resolvedSimNumber}`,
    `+252${resolvedSimNumber}`,
  ];

  // Check auto_topup_numbers FIRST
  const { data: autoTopupMatch } = await supabase
    .from("auto_topup_numbers")
    .select("id, phone_number")
    .in("phone_number", simVariants)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (autoTopupMatch) {
    console.log(
      `🔀 ROUTE: auto_topup (SIM ${resolvedSimNumber} matches auto_topup_number ${autoTopupMatch.phone_number})`,
    );
    return "auto_topup";
  }

  // Check payment_providers_config
  const { data: paymentMatch } = await supabase
    .from("payment_providers_config")
    .select("id, payment_number")
    .in("payment_number", simVariants)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (paymentMatch) {
    console.log(`🔀 ROUTE: payment (SIM ${resolvedSimNumber} matches payment_number ${paymentMatch.payment_number})`);
    return "payment";
  }

  // Also check if the original provider name matches
  // (fallback for when we couldn't resolve to a number)
  if (resolvedSimNumber.length < 7) {
    // It's still a provider name, check payment_providers by name
    const { data: paymentByName } = await supabase
      .from("payment_providers_config")
      .select("id, payment_number, provider_name")
      .eq("is_active", true);

    if (paymentByName) {
      for (const pp of paymentByName) {
        if (pp.provider_name && pp.provider_name.toLowerCase().includes(resolvedSimNumber)) {
          console.log(
            `🔀 ROUTE: payment (provider name "${resolvedSimNumber}" matches payment provider "${pp.provider_name}")`,
          );
          return "payment";
        }
      }
    }

    // Check auto_topup by trying all active numbers
    const { data: allAutoTopup } = await supabase
      .from("auto_topup_numbers")
      .select("id, phone_number")
      .eq("is_active", true);

    if (allAutoTopup && allAutoTopup.length > 0) {
      console.log(
        `🔀 ROUTE: auto_topup (provider name "${resolvedSimNumber}", found ${allAutoTopup.length} active auto_topup numbers)`,
      );
      return "auto_topup";
    }
  }

  console.log(`🔀 ROUTE: unknown (SIM ${resolvedSimNumber} not found in auto_topup_numbers or payment_providers)`);
  return "unknown";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { sender_phone, receiver_sim, amount, sms_body, tx_id, sms_timestamp }: SMSData = await req.json();

    // ========================================
    // NORMALIZE SENDER PHONE
    // ========================================
    let normalizedSender = normalizeSomaliPhone(sender_phone);

    if (normalizedSender.length < 9) {
      const bodyExtracted = extractSenderFromSmsBody(sms_body);
      if (bodyExtracted && bodyExtracted.length === 9) {
        console.log("🔧 Sender extracted from SMS body:", { original: sender_phone, extracted: bodyExtracted });
        normalizedSender = bodyExtracted;
      }
    }

    const bodyExtracted = extractSenderFromSmsBody(sms_body);
    if (bodyExtracted && bodyExtracted.length === 9 && bodyExtracted !== normalizedSender) {
      console.log("🔧 Sender corrected from SMS body:", { metadata: normalizedSender, smsBody: bodyExtracted });
      normalizedSender = bodyExtracted;
    }

    const incomingTxId = tx_id?.trim() || null;
    const extractedTxReference = extractTransactionReference(sms_body);
    const stableTxId = await buildStableReceiptTxId(normalizedSender, amount, sms_body);
    // Priority: provider reference > stable content hash > client-sent tx_id
    const effectiveTxId = extractedTxReference || stableTxId || incomingTxId;

    // ========================================
    // RESOLVE RECEIVER SIM TO ACTUAL NUMBER + PROVIDER
    // ========================================
    const simInfo = await resolveReceiverSimInfo(supabase, receiver_sim);
    const resolvedSimNumber = simInfo.simNumber;
    const resolvedSimProvider = simInfo.provider; // e.g. 'hormuud', 'Somnet'
    console.log("📱 SMS Received:", {
      sender_phone,
      normalizedSender,
      receiver_sim,
      resolvedSimNumber,
      resolvedSimProvider,
      amount,
      tx_id: incomingTxId,
      effectiveTxId,
      extractedTxReference,
    });

    // ========================================
    // DETERMINE ROUTE: auto_topup vs payment vs unknown
    // ========================================
    const route = await determineRoute(supabase, resolvedSimNumber);
    console.log(`🛤️ Route determined: ${route}`);

    // ========================================
    // DUPLICATE CHECK 1: Check by tx_id
    // ========================================
    if (effectiveTxId) {
      const { data: existingByTxId } = await supabase
        .from("payment_receipts")
        .select("id, matched_order_id")
        .eq("tx_id", effectiveTxId)
        .maybeSingle();

      if (existingByTxId) {
        const existingOrder = existingByTxId.matched_order_id
          ? { id: existingByTxId.matched_order_id }
          : await resolveExistingOrderByTxId(supabase, effectiveTxId);
        console.log("⚠️ Duplicate detected by tx_id:", effectiveTxId);
        return new Response(
          JSON.stringify({
            success: true,
            message: "SMS already processed (tx_id duplicate)",
            duplicate: true,
            order_id: existingOrder?.id || null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
    }

    // TX_ID-based deduplication only — time-based checks removed
    // Duplicate prevention is handled by:
    // 1. DUPLICATE CHECK 1 above (tx_id on payment_receipts)
    // 2. DB unique index on payment_receipts.tx_id
    // 3. tx_id saved in orders table (unique_tx_id index)

    // STEP 1: Insert payment receipt with NORMALIZED sender + route info
    const { data: receipt, error: receiptError } = await supabase
      .from("payment_receipts")
      .insert({
        sender_phone: normalizedSender,
        receiver_sim: resolvedSimNumber.length >= 7 ? resolvedSimNumber : receiver_sim.toLowerCase(),
        amount,
        sms_body,
        raw_sms: sms_body,
        tx_id: effectiveTxId,
        status: "pending",
      })
      .select()
      .single();

    if (receiptError) {
      if (receiptError.code === "23505") {
        const existingOrder = await resolveExistingOrderByTxId(supabase, effectiveTxId);
        console.log("⚠️ Duplicate detected on insert (tx_id):", { effectiveTxId });
        return new Response(
          JSON.stringify({
            success: true,
            message: "SMS already processed (duplicate constraint)",
            duplicate: true,
            order_id: existingOrder?.id || null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
      console.error("❌ Receipt insert error:", receiptError);
      throw receiptError;
    }

    console.log("💾 Receipt saved:", receipt.id);

    // ========================================
    // BLOCK CHECK
    // ========================================
    const { data: isBlocked } = await supabase.rpc("is_phone_blocked", { p_phone: normalizedSender });
    if (isBlocked) {
      console.log("🚫 Blocked user:", normalizedSender);
      const { data: blockInfo } = await supabase
        .from("blocked_users")
        .select("reason")
        .eq("phone_number", normalizedSender)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      await supabase
        .from("payment_receipts")
        .update({
          status: "blocked",
          admin_notes: `Blocked user: ${blockInfo?.reason || "No reason"} | Route: ${route} | Sender: ${normalizedSender} | Receiver SIM: ${resolvedSimNumber} | Amount: $${amount}`,
        })
        .eq("id", receipt.id);

      return new Response(
        JSON.stringify({ success: true, blocked: true, message: "Sender is blocked - receipt saved" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ========================================
    // FRAUD DETECTION CHECK
    // ========================================
    try {
      await supabase.rpc("check_fraud_rules", {
        p_sender_phone: normalizedSender,
        p_amount: amount,
        p_receipt_id: receipt.id,
      });
      console.log("🔍 Fraud check completed");
    } catch (fraudErr) {
      console.error("⚠️ Fraud check error (non-blocking):", fraudErr);
    }

    // ========================================
    // Helper: sender variants for matching
    // ========================================
    const senderVariants = [
      normalizedSender,
      `0${normalizedSender}`,
      `252${normalizedSender}`,
      `+252${normalizedSender}`,
    ];

    // ==========================================
    // ROUTE A: AUTO TOP-UP ONLY
    // SMS received on auto_topup_numbers SIM
    // → Return credit to sender, NEVER check online/offline orders
    // ==========================================
    if (route === "auto_topup") {
      console.log("🔄 AUTO TOP-UP ROUTE — processing auto top-up only");

      // Find the auto_topup_number that matched
      const simVariants = [
        resolvedSimNumber,
        `0${resolvedSimNumber}`,
        `252${resolvedSimNumber}`,
        `+252${resolvedSimNumber}`,
      ];
      const { data: autoTopup } = await supabase
        .from("auto_topup_numbers")
        .select("*")
        .in("phone_number", simVariants)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      // Fallback: if resolved sim was provider name, get first active auto_topup_number
      let autoTopupRecord = autoTopup;
      if (!autoTopupRecord) {
        const { data: fallbackAutoTopup } = await supabase
          .from("auto_topup_numbers")
          .select("*")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        autoTopupRecord = fallbackAutoTopup;
      }

      if (!autoTopupRecord) {
        console.log("❌ No active auto_topup_number found");
        await supabase
          .from("payment_receipts")
          .update({
            status: "unmatched",
            admin_notes: `Route: auto_topup | No active auto_topup_number found | SIM: ${resolvedSimNumber}`,
          })
          .eq("id", receipt.id);
        return new Response(JSON.stringify({ success: false, message: "No auto_topup number configured" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Detect provider from sender prefix
      const senderPrefix2 = normalizedSender.substring(0, 2);
      let providerSearch = "";
      if (senderPrefix2 === "61" || senderPrefix2 === "77") providerSearch = "hormuud";
      else if (senderPrefix2 === "68") providerSearch = "somnet";
      else if (senderPrefix2 === "62") providerSearch = "somtel";
      else if (senderPrefix2 === "71") providerSearch = "amtel";
      else providerSearch = "hormuud";
      console.log(`📡 Sender prefix "${senderPrefix2}" → provider: ${providerSearch}`);

      const { data: detectedProvider } = await supabase
        .from("providers_config")
        .select("id, provider_name")
        .ilike("provider_name", `%${providerSearch}%`)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!detectedProvider) {
        console.log(`⚠️ Auto top-up: provider not found for prefix "${senderPrefix2}"`);
        await supabase
          .from("payment_receipts")
          .update({
            status: "unmatched",
            admin_notes: `Route: auto_topup | Provider not found for sender prefix "${senderPrefix2}" | SIM: ${resolvedSimNumber}`,
          })
          .eq("id", receipt.id);
        return new Response(
          JSON.stringify({
            success: true,
            message: "Auto top-up: provider not detected",
            matching_strategy: "auto_topup_no_provider",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      // ===== PHONE-PACKAGE MAPPING CHECK (before general price matching) =====
      const { data: phoneMappings } = await supabase
        .from("auto_topup_phone_mappings")
        .select("*")
        .in("phone_number", senderVariants)
        .eq("is_active", true);

      let customPkg: any = null;

      if (phoneMappings && phoneMappings.length > 0) {
        // Collect all mapped package IDs
        const mappedPkgIds = phoneMappings.filter((m: any) => m.package_id).map((m: any) => m.package_id);

        if (mappedPkgIds.length > 0) {
          // Fetch all mapped packages
          const { data: mappedPkgs } = await supabase
            .from("auto_topup_packages")
            .select("*")
            .in("id", mappedPkgIds)
            .eq("is_active", true);

          console.log(`📌 Phone multi-mapping found: ${normalizedSender} → ${mappedPkgIds.length} packages`);

          // Match using custom_amount (comma-separated) if set, otherwise fall back to selling_price
          const matchedMapping = phoneMappings.find((m: any) => {
            const pkg = (mappedPkgs || []).find((p: any) => p.id === m.package_id);
            if (!pkg) return false;
            if (m.custom_amount) {
              // Parse comma-separated custom amounts
              const customAmounts = String(m.custom_amount)
                .split(",")
                .map((a: string) => parseFloat(a.trim()))
                .filter((a: number) => !isNaN(a));
              return customAmounts.some((ca: number) => Math.abs(ca - Number(amount)) < 0.01);
            }
            return Math.abs(Number(pkg.selling_price) - Number(amount)) < 0.01;
          });
          const matchedPkg = matchedMapping
            ? (mappedPkgs || []).find((p: any) => p.id === matchedMapping.package_id)
            : null;
          if (matchedPkg) {
            customPkg = matchedPkg;
            console.log(
              `✅ Multi-mapping match: amount $${amount} == ${matchedPkg.package_name} (custom: ${matchedMapping.custom_amount || "none"}, selling: $${matchedPkg.selling_price})`,
            );
          } else {
            const priceList = phoneMappings
              .filter((m: any) => m.package_id)
              .map((m: any) => {
                const pkg = (mappedPkgs || []).find((p: any) => p.id === m.package_id);
                const expected = m.custom_amount ? `custom:$${m.custom_amount}` : `$${pkg?.selling_price}`;
                return `${pkg?.package_name || "?"}(${expected})`;
              })
              .join(", ");
            console.log(`❌ Multi-mapping mismatch: amount $${amount} not in [${priceList}] → UNMATCHED`);
            await supabase
              .from("payment_receipts")
              .update({
                status: "unmatched",
                admin_notes: `Route: auto_topup | Phone mapping: ${normalizedSender} → [${priceList}] but received $${amount} | SIM: ${resolvedSimNumber}`,
              })
              .eq("id", receipt.id);
            return new Response(
              JSON.stringify({
                success: true,
                message: "Phone mapped but amount mismatch",
                matching_strategy: "auto_topup_mapping_mismatch",
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
            );
          }
        }
      } else {
        // No mapping → use existing price-matching logic
        // Fetch all packages on this topup_number_id+provider then match with floating-point tolerance
        // (fixes $1.25/$1.30 packages where exact eq() fails due to numeric precision)
        const { data: providerCustomPkgs } = await supabase
          .from("auto_topup_packages")
          .select("*")
          .eq("topup_number_id", autoTopupRecord.id)
          .eq("is_active", true)
          .ilike("provider_name", `%${providerSearch}%`);

        customPkg =
          (providerCustomPkgs || []).find(
            (p: any) => Math.abs(Number(p.selling_price) - Number(amount)) < 0.01,
          ) || null;
        console.log(
          `🔎 Auto top-up provider lookup: amount=$${amount}, candidates=${(providerCustomPkgs || []).length}, matched=${customPkg?.package_name || "none"}`,
        );
        if (!customPkg) {
          const { data: allFallbackPkgs } = await supabase
            .from("auto_topup_packages")
            .select("*")
            .eq("topup_number_id", autoTopupRecord.id)
            .eq("is_active", true);
          customPkg =
            (allFallbackPkgs || []).find(
              (p: any) => Math.abs(Number(p.selling_price) - Number(amount)) < 0.01,
            ) || null;
          console.log(
            `🔎 Auto top-up fallback lookup (no provider filter): amount=$${amount}, candidates=${(allFallbackPkgs || []).length}, matched=${customPkg?.package_name || "none"}`,
          );
        }
      }

      if (!customPkg) {
        console.log(`⚠️ Auto top-up: no package found for $${amount} on ${detectedProvider.provider_name}`);
        console.log(`🛑 AUTO TOP-UP is isolated — NOT falling back to payment/offline_reg flows`);

        await supabase
          .from("payment_receipts")
          .update({
            status: "unmatched",
            admin_notes: `Route: auto_topup | No auto_topup_package for $${amount} on ${detectedProvider.provider_name} (sender prefix: ${senderPrefix2}) | SIM: ${resolvedSimNumber}`,
          })
          .eq("id", receipt.id);
        return new Response(
          JSON.stringify({
            success: true,
            message: `Auto top-up: no package configured for $${amount} on ${detectedProvider.provider_name}`,
            matching_strategy: "auto_topup_no_package",
            route: "auto_topup",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      // Look up real data_packages_config for delivery instructions
      const { data: realPkgs } = await supabase
        .from("data_packages_config")
        .select("*, category_id")
        .eq("provider_id", detectedProvider.id)
        .ilike("package_name", customPkg.package_name)
        .eq("is_active", true)
        .limit(1);

      const pkg = realPkgs && realPkgs.length > 0 ? realPkgs[0] : null;
      const packageName = customPkg.package_name;
      const dataAmount = customPkg.data_amount || pkg?.data_amount || "";
      const packageId = pkg?.id || null;
      const categoryId = pkg?.category_id || null;
      const ussdCode = customPkg.ussd_code || pkg?.ussd_code || "";
      const costPrice =
        customPkg.cost_price && customPkg.cost_price > 0
          ? customPkg.cost_price
          : pkg?.cost_price || customPkg.selling_price || amount;

      console.log(
        `✅ Auto top-up match: ${packageName} ($${amount}) for ${detectedProvider.provider_name} → receiver: ${normalizedSender} (sender)`,
      );

      const { data: paymentProv } = await supabase
        .from("payment_providers_config")
        .select("id")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      // Create order — receiver_phone = sender_phone (return credit to sender)
      const { data: autoOrder, error: autoOrderErr } = await supabase
        .from("orders")
        .insert({
          customer_phone: normalizedSender,
          sender_phone: normalizedSender,
          receiver_phone: normalizedSender,
          provider_id: detectedProvider.id,
          package_id: packageId,
          package_name: packageName,
          data_amount: dataAmount,
          amount,
          selling_price: amount,
          cost_price: costPrice,
          payment_provider_id: paymentProv?.id,
          payment_number: autoTopupRecord.phone_number,
          payment_source: "auto_topup",
          tx_id: effectiveTxId || null,
          payment_reference: effectiveTxId || null,
          payment_status: "matched",
          status: "pending",
          delivery_status: "queued",
          is_offline: true,
        })
        .select()
        .single();

      if (autoOrderErr) {
        if (autoOrderErr.code === "23505") {
          const existingOrder = await resolveExistingOrderByTxId(supabase, effectiveTxId);
          if (existingOrder) {
            await supabase
              .from("payment_receipts")
              .update({
                status: "matched",
                matched_order_id: existingOrder.id,
                matching_strategy: "auto_topup_duplicate_tx",
                processed_at: new Date().toISOString(),
                admin_notes: `Route: auto_topup | Duplicate tx_id reused existing order ${existingOrder.id} | SIM: ${resolvedSimNumber}`,
              })
              .eq("id", receipt.id);

            return new Response(
              JSON.stringify({
                success: true,
                duplicate: true,
                message: "Auto top-up already processed",
                order_id: existingOrder.id,
                route: "auto_topup",
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
            );
          }
        }
        console.error("❌ Auto top-up order error:", autoOrderErr);
        throw autoOrderErr;
      }

      console.log("📝 Auto top-up order created:", autoOrder.id);

      await supabase
        .from("payment_receipts")
        .update({
          status: "matched",
          matched_order_id: autoOrder.id,
          matching_strategy: "auto_topup",
          processed_at: new Date().toISOString(),
          admin_notes: `Route: auto_topup | ${packageName} for sender ${normalizedSender} via ${detectedProvider.provider_name} | SIM: ${resolvedSimNumber}`,
        })
        .eq("id", receipt.id);

      // Queue delivery — Somlink always uses API, never Android/USSD.
      const providerSlug = normalizeProviderSlug(detectedProvider.provider_name);
      const autoSomlinkQueueId = await routeSomlinkApiIfNeeded(
        supabase, autoOrder.id, detectedProvider.id, detectedProvider.provider_name,
      );
      if (autoSomlinkQueueId) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Auto top-up matched and routed through Somlink API",
            order_id: autoOrder.id,
            delivery_queue_id: autoSomlinkQueueId,
            route: "auto_topup",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      const { data: chainingRules } = await supabase
        .from("auto_topup_delivery_rules")
        .select("*")
        .eq("source_package_id", customPkg.id)
        .eq("is_active", true)
        .order("execution_order", { ascending: true });

      if (chainingRules && chainingRules.length > 0) {
        console.log(`🔗 Auto top-up rules found: ${chainingRules.length} targets — skipping source delivery`);
        const chainQueueItems: any[] = [];

        for (const rule of chainingRules) {
          const { data: targetPkg } = await supabase
            .from("auto_topup_packages")
            .select("*")
            .eq("id", rule.target_package_id)
            .single();
          if (!targetPkg) continue;

          const targetCostPrice =
            targetPkg.cost_price && targetPkg.cost_price > 0 ? targetPkg.cost_price : targetPkg.selling_price;

          const { data: targetRealPkgs } = await supabase
            .from("data_packages_config")
            .select("*, category_id")
            .eq("provider_id", detectedProvider.id)
            .ilike("package_name", targetPkg.package_name)
            .eq("is_active", true)
            .limit(1);

          const targetRealPkg = targetRealPkgs && targetRealPkgs.length > 0 ? targetRealPkgs[0] : null;
          const targetUssdCode = targetPkg.ussd_code || targetRealPkg?.ussd_code || "";

          const targetInstruction = targetRealPkg
            ? await getDeliveryInstruction(supabase, detectedProvider.id, targetRealPkg.id, targetRealPkg.category_id)
            : await getDeliveryInstruction(supabase, detectedProvider.id, null, null);

          let targetFinalUssd = "";
          if (targetPkg.ussd_code) {
            targetFinalUssd = buildUssdCode(
              targetPkg.ussd_code,
              normalizedSender,
              Number(targetCostPrice),
              targetPkg.sim_password || targetInstruction?.sim_password || "5516",
              targetUssdCode,
            );
          } else if (targetInstruction?.code_template) {
            targetFinalUssd = buildUssdCode(
              targetInstruction.code_template,
              normalizedSender,
              Number(targetCostPrice),
              targetPkg.sim_password || targetInstruction?.sim_password || "5516",
              targetUssdCode,
            );
          }

          if (!targetFinalUssd) continue;

          for (let i = 0; i < rule.delivery_count; i++) {
            const totalDelayMs = rule.delay_minutes * 60000 + i * rule.delay_minutes * 60000;
            chainQueueItems.push({
              order_id: autoOrder.id,
              provider_name: providerSlug,
              ussd_code: targetFinalUssd,
              receiver_phone: normalizedSender,
              package_code: targetUssdCode,
              status: totalDelayMs === 0 ? "pending" : "scheduled",
              scheduled_at: new Date(Date.now() + totalDelayMs).toISOString(),
              sim_slot: (await resolveSimSlotForProvider(supabase, providerSlug))?.sim_slot ?? null,
            });
          }
        }

        let totalChainedCost = 0;
        for (const rule of chainingRules) {
          const { data: tPkg } = await supabase
            .from("auto_topup_packages")
            .select("cost_price, selling_price")
            .eq("id", rule.target_package_id)
            .single();
          if (tPkg)
            totalChainedCost +=
              (tPkg.cost_price && tPkg.cost_price > 0 ? tPkg.cost_price : tPkg.selling_price) * rule.delivery_count;
        }

        if (chainQueueItems.length > 0) {
          const { data: inserted, error: qErr } = await supabase
            .from("delivery_queue")
            .insert(chainQueueItems)
            .select();
          if (qErr) console.error("❌ Auto top-up chained queue error:", qErr);
          else {
            console.log(`📬 Auto top-up: ${inserted.length} target deliveries queued (source skipped)`);
            if (totalChainedCost > 0) {
              await supabase.from("orders").update({ cost_price: totalChainedCost }).eq("id", autoOrder.id);
            }
          }
        } else {
          await supabase
            .from("orders")
            .update({ delivery_status: "failed", delivery_notes: "Delivery rules exist but no valid targets resolved" })
            .eq("id", autoOrder.id);
        }
      } else {
        // NO RULES → deliver source package directly
        console.log("ℹ️ No chaining rules — delivering source package directly");
        const instruction = packageId
          ? await getDeliveryInstruction(supabase, detectedProvider.id, packageId, categoryId)
          : null;
        let finalUssd = "";
        if (customPkg.ussd_code) {
          finalUssd = buildUssdCode(
            customPkg.ussd_code,
            normalizedSender,
            Number(costPrice),
            customPkg.sim_password || instruction?.sim_password || "5516",
            ussdCode || "",
          );
        } else if (instruction?.code_template) {
          finalUssd = buildUssdCode(
            instruction.code_template,
            normalizedSender,
            Number(costPrice),
            customPkg.sim_password || instruction.sim_password || "5516",
            ussdCode || "",
          );
        }
        if (finalUssd) {
          const autoSlotInfo = await resolveSimSlotForProvider(supabase, providerSlug);
          const queued = await queueDirectDeliveryIfMissing(supabase, {
            order_id: autoOrder.id,
            provider_name: providerSlug,
            ussd_code: finalUssd,
            receiver_phone: normalizedSender,
            package_code: ussdCode,
            status: "pending",
            sim_slot: autoSlotInfo?.sim_slot ?? null,
          });
          if (queued) console.log(`📬 Auto top-up delivery queued (direct, sim_slot=${autoSlotInfo?.sim_slot ?? "any"})`);
        } else {
          await supabase
            .from("orders")
            .update({ delivery_status: "failed", delivery_notes: "No delivery instruction configured" })
            .eq("id", autoOrder.id);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Auto top-up matched and delivered",
          order_id: autoOrder.id,
          matching_strategy: "auto_topup",
          route: "auto_topup",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // ==========================================
    // ROUTE B: PAYMENT FLOW ONLY
    // SMS received on payment provider SIM
    // → Check pending_online_payments, legacy orders, offline_registrations
    // → NEVER do auto top-up
    // ==========================================
    if (route === "payment") {
      console.log("💳 PAYMENT ROUTE — processing payment flow only");
    }

    // For payment route AND unknown route, proceed with payment matching
    // (unknown route also tries payment flow as best-effort)

    // ========================================
    // PRIORITY 0: Check pending_online_payments
    // ========================================
    const thirtyMinutesAgo = new Date(Date.now() - 1800000).toISOString();

    let pendingOnline = null;
    let pendingOnlineError = null;

    const { data: pendingBySenderPhone, error: err1 } = await supabase
      .from("pending_online_payments")
      .select("*")
      .in("sender_phone", senderVariants)
      .eq("status", "pending")
      .gte("created_at", thirtyMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingBySenderPhone) {
      pendingOnline = pendingBySenderPhone;
    } else {
      const { data: pendingBySender, error: err2 } = await supabase
        .from("pending_online_payments")
        .select("*")
        .in("verified_phone", senderVariants)
        .eq("status", "pending")
        .gte("created_at", thirtyMinutesAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      pendingOnline = pendingBySender;
      pendingOnlineError = err2;
    }
    if (err1) pendingOnlineError = err1;

    if (pendingOnlineError) {
      console.error("❌ Error checking pending_online_payments:", pendingOnlineError);
    }

    if (pendingOnline) {
      const expectedAmount = Number(pendingOnline.expected_amount);
      const smsAmount = Number(amount);
      const amountMatches = Math.abs(expectedAmount - smsAmount) < 0.01;

      if (amountMatches) {
        if (await pendingAlreadyMatched(supabase, pendingOnline.id)) {
          await supabase
            .from("payment_receipts")
            .update({
              status: "duplicate",
              admin_notes: `Route: ${route} | Concurrent match - pending already processed`,
            })
            .eq("id", receipt.id);
          return new Response(
            JSON.stringify({ success: true, message: "Already matched (concurrent)", duplicate: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
          );
        }

        const { data: lockResult } = await supabase
          .from("pending_online_payments")
          .update({ status: "matched" })
          .eq("id", pendingOnline.id)
          .eq("status", "pending")
          .select("id");

        if (!lockResult || lockResult.length === 0) {
          await supabase
            .from("payment_receipts")
            .update({ status: "duplicate", admin_notes: `Route: ${route} | Failed to lock pending payment` })
            .eq("id", receipt.id);
          return new Response(JSON.stringify({ success: true, message: "Already claimed", duplicate: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }

        console.log("✅ Found pending online payment:", pendingOnline.id);

        const { data: packageData } = await supabase
          .from("data_packages_config")
          .select("*, category_id")
          .eq("id", pendingOnline.package_id)
          .single();
        const { data: providerData } = await supabase
          .from("providers_config")
          .select("provider_name")
          .eq("id", pendingOnline.provider_id)
          .single();
        const { data: paymentProvider } = await supabase
          .from("payment_providers_config")
          .select("id, payment_number")
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        const { data: newOrder, error: orderError } = await supabase
          .from("orders")
          .insert({
            customer_phone: normalizeSomaliPhone(pendingOnline.verified_phone || pendingOnline.sender_phone),
            sender_phone: normalizeSomaliPhone(pendingOnline.sender_phone || pendingOnline.verified_phone),
            receiver_phone: pendingOnline.receiver_phone,
            provider_id: pendingOnline.provider_id,
            package_id: pendingOnline.package_id,
            // *212 discovery: the customer's chosen live menu label drives the delivery
            package_name: pendingOnline.discovery_menu_label || packageData?.package_name || "Data Package",
            data_amount: packageData?.data_amount || "",
            selling_price: smsAmount,
            payment_provider_id: paymentProvider?.id,
            payment_number: paymentProvider?.payment_number || "",
            payment_source: "ussd_online",
            tx_id: effectiveTxId || null,
            status: "completed",
            delivery_status: "queued",
          })
          .select()
          .single();

        if (orderError) {
          if (orderError.code === "23505") {
            const existingOrder = await resolveExistingOrderByTxId(supabase, effectiveTxId);
            if (existingOrder) {
              await supabase
                .from("payment_receipts")
                .update({
                  status: "matched",
                  matched_order_id: existingOrder.id,
                  matching_strategy: "pending_online_duplicate_tx",
                  processed_at: new Date().toISOString(),
                  admin_notes: `Route: ${route} | Duplicate tx_id reused existing order ${existingOrder.id} | SIM: ${resolvedSimNumber}`,
                })
                .eq("id", receipt.id);

              return new Response(
                JSON.stringify({
                  success: true,
                  duplicate: true,
                  message: "Online payment already processed",
                  order_id: existingOrder.id,
                  route,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
              );
            }
          }

          console.error("❌ Error creating order:", orderError);
          throw orderError;
        }

        console.log("📝 Order created from pending payment:", newOrder.id);

        await supabase
          .from("payment_receipts")
          .update({
            status: "matched",
            matched_order_id: newOrder.id,
            matching_strategy: "pending_online_payment",
            processed_at: new Date().toISOString(),
            admin_notes: `Route: ${route} | ${packageData?.package_name} for ${pendingOnline.receiver_phone} | SIM: ${resolvedSimNumber}`,
          })
          .eq("id", receipt.id);

        // ===== *212 discovery: deliver EXACTLY the bundle the customer picked =====
        const discMenuIndex = pendingOnline.discovery_menu_index ?? null;
        const discSessionId = pendingOnline.discovery_session_id ?? null;
        const discMenuLabel = pendingOnline.discovery_menu_label ?? null;

        if (discMenuIndex !== null || discSessionId) {
          console.log(
            `🎯 *212 discovery delivery → order=${newOrder.id} index=${discMenuIndex} session=${discSessionId} label=${discMenuLabel}`,
          );
          const { data: discQueueId, error: discErr } = await supabase.rpc("enqueue_discovery_delivery", {
            p_order_id: newOrder.id,
            p_menu_label: discMenuLabel,
            p_menu_index: discMenuIndex,
            p_session_id: discSessionId,
          });

          if (discErr) {
            console.error("❌ enqueue_discovery_delivery failed:", discErr);
            await supabase
              .from("orders")
              .update({
                delivery_status: "failed",
                delivery_notes: `Discovery enqueue failed: ${discErr.message}`,
              })
              .eq("id", newOrder.id);
          } else {
            console.log(`📬 Discovery delivery queued: ${discQueueId}`);
          }

          return new Response(
            JSON.stringify({
              success: true,
              message: "Pending online payment matched (*212 discovery)",
              order_id: newOrder.id,
              delivery_queue_id: discQueueId ?? null,
              matching_strategy: "pending_online_payment_discovery",
              route,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
          );
        }


        const onlineSomlinkQueueId = await routeSomlinkApiIfNeeded(
          supabase, newOrder.id, pendingOnline.provider_id, providerData?.provider_name,
        );
        if (onlineSomlinkQueueId) {
          return new Response(
            JSON.stringify({
              success: true,
              message: "Pending online payment matched via Somlink API",
              order_id: newOrder.id,
              delivery_queue_id: onlineSomlinkQueueId,
              matching_strategy: "pending_online_payment_somlink_api",
              route,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
          );
        }

        const instruction = await getDeliveryInstruction(
          supabase,
          pendingOnline.provider_id,
          pendingOnline.package_id,
          packageData?.category_id,
        );

        if (instruction && packageData) {
          const providerSlug = await resolveProviderSlug(
            supabase,
            pendingOnline.provider_id,
            providerData?.provider_name,
          );
          console.log(`🎯 Online payment providerSlug: "${providerSlug}" (id=${pendingOnline.provider_id})`);

          const onlineSlotInfo = providerSlug
            ? await resolveSimSlotForProvider(supabase, providerSlug)
            : null;

          if (!providerSlug || !onlineSlotInfo) {
            console.error(`❌ No SIM for "${providerSlug}" — refusing to dial from wrong carrier`);
            await supabase
              .from("orders")
              .update({
                delivery_status: "failed",
                delivery_notes: providerSlug
                  ? `No ${providerSlug.toUpperCase()} SIM available on any active device.`
                  : `Provider unresolved for provider_id ${pendingOnline.provider_id}`,
              })
              .eq("id", newOrder.id);
          } else {
            const bundled = await queueDeliveryWithBundling(
              supabase,
              newOrder.id,
              pendingOnline.package_id,
              pendingOnline.provider_id,
              pendingOnline.receiver_phone,
              providerSlug,
            );

            if (!bundled) {
              const ussdCode = buildUssdCode(
                instruction.code_template,
                normalizePhoneForProvider(pendingOnline.receiver_phone),
                Number(packageData.cost_price),
                instruction.sim_password || "5516",
                packageData.ussd_code || "",
              );
              try {
                const queued = await queueDirectDeliveryIfMissing(supabase, {
                  order_id: newOrder.id,
                  provider_name: providerSlug,
                  ussd_code: ussdCode,
                  receiver_phone: pendingOnline.receiver_phone,
                  package_code: packageData.ussd_code,
                  status: "pending",
                  sim_slot: onlineSlotInfo.sim_slot,
                });
                if (queued) console.log(`📬 Online payment queued (provider=${providerSlug}, sim_slot=${onlineSlotInfo.sim_slot})`);
              } catch (queueError) {
                console.error("❌ Queue error:", queueError);
              }
            }
          }
        } else {
          await supabase
            .from("orders")
            .update({ delivery_status: "failed", delivery_notes: "No delivery instruction configured" })
            .eq("id", newOrder.id);
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Pending online payment matched",
            order_id: newOrder.id,
            matching_strategy: "pending_online_payment",
            route,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      } else {
        // AMOUNT MISMATCH — before failing, try SECRET PRICE match for the intended package
        console.log("🚫 AMOUNT MISMATCH:", { expectedAmount, smsAmount });

        let secretMatched = false;
        if (pendingOnline.package_id) {
          const { data: secretPkg } = await supabase
            .from("data_packages_config")
            .select("id, secret_price, package_name, data_amount, ussd_code, cost_price, category_id")
            .eq("id", pendingOnline.package_id)
            .maybeSingle();

          const secretArr: number[] = Array.isArray(secretPkg?.secret_price)
            ? (secretPkg!.secret_price as any[]).map((x) => Number(x)).filter((n) => !isNaN(n))
            : (secretPkg?.secret_price != null ? [Number(secretPkg.secret_price)] : []);
          const secretMatch = secretArr.some((p) => Math.abs(p - smsAmount) < 0.01);

          if (secretPkg && secretMatch) {
            console.log(`🔒 SECRET PRICE MATCH for pending order — package ${secretPkg.package_name} secret_prices=${JSON.stringify(secretArr)} == SMS $${smsAmount}`);

            if (await pendingAlreadyMatched(supabase, pendingOnline.id)) {
              await supabase
                .from("payment_receipts")
                .update({ status: "duplicate", admin_notes: `Route: ${route} | Concurrent secret-price match` })
                .eq("id", receipt.id);
              return new Response(
                JSON.stringify({ success: true, message: "Already matched (concurrent)", duplicate: true }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
              );
            }

            const { data: lockResult } = await supabase
              .from("pending_online_payments")
              .update({ status: "matched" })
              .eq("id", pendingOnline.id)
              .eq("status", "pending")
              .select("id");

            if (lockResult && lockResult.length > 0) {
              const { data: providerData } = await supabase
                .from("providers_config")
                .select("provider_name")
                .eq("id", pendingOnline.provider_id)
                .single();
              const { data: paymentProvider } = await supabase
                .from("payment_providers_config")
                .select("id, payment_number")
                .eq("is_active", true)
                .order("created_at", { ascending: true })
                .limit(1)
                .single();

              const { data: newOrder, error: orderError } = await supabase
                .from("orders")
                .insert({
                  customer_phone: normalizeSomaliPhone(pendingOnline.verified_phone || pendingOnline.sender_phone),
                  sender_phone: normalizeSomaliPhone(pendingOnline.sender_phone || pendingOnline.verified_phone),
                  receiver_phone: pendingOnline.receiver_phone,
                  provider_id: pendingOnline.provider_id,
                  package_id: pendingOnline.package_id,
                  package_name: secretPkg.package_name,
                  data_amount: secretPkg.data_amount || "",
                  selling_price: smsAmount,
                  payment_provider_id: paymentProvider?.id,
                  payment_number: paymentProvider?.payment_number || "",
                  payment_source: "ussd_online",
                  tx_id: effectiveTxId || null,
                  status: "completed",
                  delivery_status: "queued",
                  paid_via_secret_price: true,
                })
                .select()
                .single();

              if (!orderError && newOrder) {
                await supabase
                  .from("payment_receipts")
                  .update({
                    status: "matched",
                    matched_order_id: newOrder.id,
                    matching_strategy: "secret_price_online",
                    processed_at: new Date().toISOString(),
                    admin_notes: `Route: ${route} | 🔒 SECRET PRICE | ${secretPkg.package_name} for ${pendingOnline.receiver_phone} | SIM: ${resolvedSimNumber}`,
                  })
                  .eq("id", receipt.id);

                const secretSomlinkQueueId = await routeSomlinkApiIfNeeded(
                  supabase, newOrder.id, pendingOnline.provider_id, providerData?.provider_name,
                );
                if (secretSomlinkQueueId) {
                  return new Response(
                    JSON.stringify({
                      success: true,
                      message: "Secret price matched via Somlink API",
                      order_id: newOrder.id,
                      delivery_queue_id: secretSomlinkQueueId,
                      matching_strategy: "secret_price_online_somlink_api",
                      route,
                    }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
                  );
                }

                const instruction = await getDeliveryInstruction(
                  supabase,
                  pendingOnline.provider_id,
                  pendingOnline.package_id,
                  secretPkg.category_id,
                );
                if (instruction) {
                  const providerSlug = await resolveProviderSlug(supabase, pendingOnline.provider_id, providerData?.provider_name);
                  const slotInfo = providerSlug ? await resolveSimSlotForProvider(supabase, providerSlug) : null;
                  if (providerSlug && slotInfo) {
                    const bundled = await queueDeliveryWithBundling(
                      supabase, newOrder.id, pendingOnline.package_id, pendingOnline.provider_id,
                      pendingOnline.receiver_phone, providerSlug,
                    );
                    if (!bundled) {
                      const ussdCode = buildUssdCode(
                        instruction.code_template,
                        normalizePhoneForProvider(pendingOnline.receiver_phone),
                        Number(secretPkg.cost_price),
                        instruction.sim_password || "5516",
                        secretPkg.ussd_code || "",
                      );
                      await queueDirectDeliveryIfMissing(supabase, {
                        order_id: newOrder.id,
                        provider_name: providerSlug,
                        ussd_code: ussdCode,
                        receiver_phone: pendingOnline.receiver_phone,
                        package_code: secretPkg.ussd_code,
                        status: "pending",
                        sim_slot: slotInfo.sim_slot,
                      });
                    }
                  }
                }
                secretMatched = true;
                return new Response(
                  JSON.stringify({
                    success: true,
                    message: "Secret price matched (online)",
                    order_id: newOrder.id,
                    matching_strategy: "secret_price_online",
                    route,
                  }),
                  { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
                );
              }
            }
          }
        }

        if (secretMatched) return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });

        let intendedPackageName = "Unknown";
        let intendedProviderName = "Unknown";
        if (pendingOnline.package_id) {
          const { data: intendedPkg } = await supabase
            .from("data_packages_config")
            .select("package_name, data_amount")
            .eq("id", pendingOnline.package_id)
            .maybeSingle();
          if (intendedPkg) intendedPackageName = `${intendedPkg.package_name} (${intendedPkg.data_amount})`;
        }
        if (pendingOnline.provider_id) {
          const { data: intendedProv } = await supabase
            .from("providers_config")
            .select("provider_name")
            .eq("id", pendingOnline.provider_id)
            .maybeSingle();
          if (intendedProv) intendedProviderName = intendedProv.provider_name;
        }

        await supabase
          .from("payment_receipts")
          .update({
            status: "unmatched",
            admin_notes: `Route: ${route} | AMOUNT MISMATCH | Paid: $${smsAmount} | Expected: $${expectedAmount} | Intended Package: ${intendedPackageName} | Provider: ${intendedProviderName} | Receiver entered: ${pendingOnline.receiver_phone} | SIM: ${resolvedSimNumber}`,
            processed_at: new Date().toISOString(),
          })
          .eq("id", receipt.id);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Amount mismatch — marked as unmatched",
            matching_strategy: "amount_mismatch_blocked",
            route,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
    }

    // ========================================
    // PRIORITY 1: Legacy pending_payment orders
    // ========================================
    const { data: pendingOrder } = await supabase
      .from("orders")
      .select("*")
      .in("sender_phone", senderVariants)
      .eq("status", "pending_payment")
      .gte("created_at", thirtyMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingOrder) {
      const orderAmount = Number(pendingOrder.selling_price);
      const smsAmount = Number(amount);
      const amountMatches = Math.abs(orderAmount - smsAmount) < 0.01;

      if (amountMatches) {
        console.log("✅ Found pending online order:", pendingOrder.id);

        await supabase
          .from("payment_receipts")
          .update({
            status: "matched",
            matched_order_id: pendingOrder.id,
            matching_strategy: "online_order_first",
            processed_at: new Date().toISOString(),
            admin_notes: `Route: ${route} | Legacy order ${pendingOrder.id} - ${pendingOrder.package_name} for ${pendingOrder.receiver_phone} | SIM: ${resolvedSimNumber}`,
          })
          .eq("id", receipt.id);

        const { data: lockedLegacyOrder } = await supabase
          .from("orders")
          .update({
            status: "completed",
            delivery_status: "queued",
            tx_id: pendingOrder.tx_id || effectiveTxId || null,
          })
          .eq("id", pendingOrder.id)
          .eq("status", "pending_payment")
          .select("id")
          .maybeSingle();

        if (!lockedLegacyOrder) {
          await supabase
            .from("payment_receipts")
            .update({
              status: "duplicate",
              matched_order_id: pendingOrder.id,
              matching_strategy: "legacy_order_already_claimed",
              processed_at: new Date().toISOString(),
              admin_notes: `Route: ${route} | Legacy order ${pendingOrder.id} was already claimed | SIM: ${resolvedSimNumber}`,
            })
            .eq("id", receipt.id);

          return new Response(
            JSON.stringify({
              success: true,
              duplicate: true,
              message: "Legacy order already claimed",
              order_id: pendingOrder.id,
              route,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
          );
        }

        const { data: orderPackage } = await supabase
          .from("data_packages_config")
          .select("*, category_id")
          .eq("id", pendingOrder.package_id)
          .single();
        const { data: legacyProviderData } = await supabase
          .from("providers_config")
          .select("provider_name")
          .eq("id", pendingOrder.provider_id)
          .maybeSingle();

        const legacySomlinkQueueId = await routeSomlinkApiIfNeeded(
          supabase, pendingOrder.id, pendingOrder.provider_id, legacyProviderData?.provider_name,
        );
        if (legacySomlinkQueueId) {
          return new Response(
            JSON.stringify({
              success: true,
              message: "Online order matched via Somlink API",
              order_id: pendingOrder.id,
              delivery_queue_id: legacySomlinkQueueId,
              matching_strategy: "online_order_somlink_api",
              route,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
          );
        }

        const instruction = await getDeliveryInstruction(
          supabase,
          pendingOrder.provider_id,
          pendingOrder.package_id,
          orderPackage?.category_id,
        );

        if (instruction && orderPackage) {
          const { data: providerData } = await supabase
            .from("providers_config")
            .select("provider_name")
            .eq("id", pendingOrder.provider_id)
            .single();
          const providerSlug = await resolveProviderSlug(
            supabase,
            pendingOrder.provider_id,
            providerData?.provider_name,
          );
          console.log(`🎯 Pending order providerSlug: "${providerSlug}" (id=${pendingOrder.provider_id})`);

          const orderSlotInfo = providerSlug
            ? await resolveSimSlotForProvider(supabase, providerSlug)
            : null;

          if (!providerSlug || !orderSlotInfo) {
            console.error(`❌ No SIM for "${providerSlug}" — refusing to dial from wrong carrier`);
            await supabase
              .from("orders")
              .update({
                delivery_status: "failed",
                delivery_notes: providerSlug
                  ? `No ${providerSlug.toUpperCase()} SIM available on any active device.`
                  : `Provider unresolved for provider_id ${pendingOrder.provider_id}`,
              })
              .eq("id", pendingOrder.id);
          } else {
            const bundled = await queueDeliveryWithBundling(
              supabase,
              pendingOrder.id,
              pendingOrder.package_id,
              pendingOrder.provider_id,
              pendingOrder.receiver_phone,
              providerSlug,
            );
            if (!bundled) {
              const ussdCode = buildUssdCode(
                instruction.code_template,
                normalizePhoneForProvider(pendingOrder.receiver_phone),
                Number(orderPackage.cost_price),
                instruction.sim_password || "5516",
                orderPackage.ussd_code || "",
              );
              await queueDirectDeliveryIfMissing(supabase, {
                order_id: pendingOrder.id,
                provider_name: providerSlug,
                ussd_code: ussdCode,
                receiver_phone: pendingOrder.receiver_phone,
                package_code: orderPackage.ussd_code,
                status: "pending",
                sim_slot: orderSlotInfo.sim_slot,
              });
              console.log(`📬 Online order queued (provider=${providerSlug}, sim_slot=${orderSlotInfo.sim_slot})`);
            }
          }
        } else {
          await supabase
            .from("orders")
            .update({ delivery_status: "failed", delivery_notes: "No delivery instruction configured" })
            .eq("id", pendingOrder.id);
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Online order matched",
            order_id: pendingOrder.id,
            matching_strategy: "online_order_first",
            route,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
    }

    // PRIORITY 1.5 (broad_pending_match) REMOVED — caused duplicate deliveries
    // Amount-only matching without sender verification is unsafe

    // ========================================
    // PRIORITY 2: Offline registrations
    // ========================================
    console.log("🔍 Checking offline registrations...");

    const { data: registration } = await supabase
      .from("offline_registrations")
      .select("*")
      .in("sender_phone", senderVariants)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!registration) {
      console.log("❌ No registration found for sender:", normalizedSender);
      await supabase
        .from("payment_receipts")
        .update({
          status: "unmatched",
          admin_notes: `Route: ${route} | No offline registration for sender ${normalizedSender} | SIM: ${resolvedSimNumber}`,
        })
        .eq("id", receipt.id);

      return new Response(JSON.stringify({ success: false, message: "No registration found for this sender", route }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve provider name (case-insensitive) — fall back to providers_config join
    // when offline_registrations.provider_name column is null but provider_id is set.
    let registrationProviderName: string | null = registration.provider_name || null;
    if (!registrationProviderName && registration.provider_id) {
      const { data: provRow } = await supabase
        .from("providers_config")
        .select("provider_name")
        .eq("id", registration.provider_id)
        .maybeSingle();
      registrationProviderName = provRow?.provider_name || null;
    }

    console.log("✅ Registration found:", {
      sender: registration.sender_phone,
      receiver: registration.receiver_phone,
      provider_id: registration.provider_id,
      provider_name: registrationProviderName,
      sim_provider: resolvedSimProvider,
    });
    console.log(
      `🔎 Resolved Provider for package lookup: ${registrationProviderName || "(unknown)"} (id: ${registration.provider_id})`,
    );

    // Find matching package by provider_id (strict link)
    const price = Number(amount);
    const min = Number((price - 0.005).toFixed(3));
    const max = Number((price + 0.005).toFixed(3));
    let matchedViaSecretPrice = false;

    let { data: packages } = await supabase
      .from("data_packages_config")
      .select("*")
      .eq("provider_id", registration.provider_id)
      .eq("selling_price", price)
      .eq("is_active", true);

    if (!packages || packages.length === 0) {
      const rangeRes = await supabase
        .from("data_packages_config")
        .select("*")
        .eq("provider_id", registration.provider_id)
        .eq("is_active", true)
        .gte("selling_price", min)
        .lte("selling_price", max)
        .order("selling_price", { ascending: true });
      packages = rangeRes.data ?? [];
    }

    // 🔒 SECRET PRICE fallback for offline auto-match (supports numeric[] arrays)
    if (!packages || packages.length === 0) {
      const { data: allActivePkgs } = await supabase
        .from("data_packages_config")
        .select("*")
        .eq("provider_id", registration.provider_id)
        .eq("is_active", true)
        .not("secret_price", "is", null);
      const secretPkgs = (allActivePkgs || []).filter((pkg: any) => {
        const arr = Array.isArray(pkg.secret_price)
          ? pkg.secret_price.map((x: any) => Number(x))
          : (pkg.secret_price != null ? [Number(pkg.secret_price)] : []);
        return arr.some((p: number) => !isNaN(p) && Math.abs(p - price) < 0.01);
      });
      if (secretPkgs.length > 0) {
        packages = secretPkgs;
        matchedViaSecretPrice = true;
        console.log(`🔒 SECRET PRICE MATCH (offline) — package ${secretPkgs[0].package_name} secret_prices=${JSON.stringify(secretPkgs[0].secret_price)} matched $${price}`);
      }
    }

    if (!packages || packages.length === 0) {
      let crossProviderHint = "";
      const { data: otherPkgs } = await supabase
        .from("data_packages_config")
        .select("*, providers_config!inner(provider_name)")
        .eq("selling_price", price)
        .eq("is_active", true)
        .neq("provider_id", registration.provider_id)
        .limit(3);

      if (otherPkgs && otherPkgs.length > 0) {
        const otherProviders = [...new Set(otherPkgs.map((p: any) => p.providers_config?.provider_name))].join(", ");
        const pkgNames = otherPkgs.map((p: any) => p.package_name).join(", ");
        crossProviderHint = ` | ⚠️ waa xirmo ${otherProviders} ah (${pkgNames})`;
      }

      const providerLabel = registrationProviderName || "(unknown provider)";
      console.log(`❌ Package Found: NONE for $${amount} on provider "${providerLabel}"`);

      await supabase
        .from("payment_receipts")
        .update({
          status: "unmatched",
          admin_notes: `Route: ${route} | No package for $${amount} on ${providerLabel}${crossProviderHint} | SIM: ${resolvedSimNumber} (${resolvedSimProvider || "?"})`,
        })
        .eq("id", receipt.id);

      return new Response(JSON.stringify({ success: false, message: `No package available for $${amount}`, route }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Package Found: ${packages[0].package_name} ($${packages[0].selling_price}) for provider_id ${registration.provider_id}${matchedViaSecretPrice ? ' [SECRET]' : ''}`);

    const selectedPackage = packages[0];
    console.log("📦 Package found:", selectedPackage.package_name);

    const { data: paymentProvider } = await supabase
      .from("payment_providers_config")
      .select("id, payment_number")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    const verifiedPhone = await (async () => {
      const { data: vp } = await supabase
        .from("verified_phones")
        .select("phone_number")
        .in("phone_number", senderVariants)
        .limit(1)
        .maybeSingle();
      return vp?.phone_number ? normalizeSomaliPhone(vp.phone_number) : normalizeSomaliPhone(registration.sender_phone);
    })();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_phone: verifiedPhone,
        sender_phone: normalizeSomaliPhone(registration.sender_phone),
        receiver_phone: registration.receiver_phone,
        provider_id: registration.provider_id,
        package_id: selectedPackage.id,
        package_name: selectedPackage.package_name,
        data_amount: selectedPackage.data_amount,
        selling_price: amount,
        payment_provider_id: paymentProvider?.id,
        payment_number: paymentProvider?.payment_number || "",
        payment_source: "sms_offline",
        tx_id: effectiveTxId || null,
        status: "completed",
        delivery_status: "queued",
        is_offline: true,
        paid_via_secret_price: matchedViaSecretPrice,
      })
      .select()
      .single();

    if (orderError) {
      if (orderError.code === "23505") {
        const existingOrder = await resolveExistingOrderByTxId(supabase, effectiveTxId);
        if (existingOrder) {
          await supabase
            .from("payment_receipts")
            .update({
              status: "matched",
              matched_order_id: existingOrder.id,
              matching_strategy: "offline_duplicate_tx",
              processed_at: new Date().toISOString(),
              admin_notes: `Route: ${route} | Duplicate tx_id reused existing order ${existingOrder.id} | SIM: ${resolvedSimNumber}`,
            })
            .eq("id", receipt.id);

          return new Response(
            JSON.stringify({
              success: true,
              duplicate: true,
              message: "Offline order already processed",
              order_id: existingOrder.id,
              route,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
          );
        }
      }

      console.error("❌ Order creation error:", orderError);
      throw orderError;
    }

    console.log("📝 Order created:", order.id);

    const offlineSomlinkQueueId = await routeSomlinkApiIfNeeded(
      supabase, order.id, registration.provider_id, registration.provider_name,
    );
    if (offlineSomlinkQueueId) {
      await supabase
        .from("payment_receipts")
        .update({
          status: "matched",
          matched_order_id: order.id,
          matching_strategy: matchedViaSecretPrice ? "secret_price_offline_somlink_api" : "offline_somlink_api",
          processed_at: new Date().toISOString(),
          admin_notes: `Route: ${route} | Somlink API | ${selectedPackage.package_name} for ${registration.receiver_phone} | SIM: ${resolvedSimNumber}`,
        })
        .eq("id", receipt.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Order created and routed through Somlink API",
          order_id: order.id,
          delivery_queue_id: offlineSomlinkQueueId,
          package_name: selectedPackage.package_name,
          receiver_phone: registration.receiver_phone,
          route,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const instruction = await getDeliveryInstruction(
      supabase,
      registration.provider_id,
      selectedPackage.id,
      selectedPackage.category_id,
    );

    if (!instruction) {
      await supabase
        .from("orders")
        .update({ delivery_status: "failed", delivery_notes: "No delivery instruction configured" })
        .eq("id", order.id);
      return new Response(JSON.stringify({ success: false, message: "Delivery instruction not configured", route }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const providerSlug = await resolveProviderSlug(
      supabase,
      registration.provider_id,
      registration.provider_name,
    );
    console.log(`🎯 Offline reg providerSlug resolved: "${providerSlug}" (id=${registration.provider_id})`);

    if (!providerSlug) {
      await supabase
        .from("orders")
        .update({
          delivery_status: "failed",
          delivery_notes: `Cannot route: provider unknown for provider_id ${registration.provider_id}`,
        })
        .eq("id", order.id);
      return new Response(
        JSON.stringify({ success: false, message: "Provider not resolvable", route }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // STRICT SIM ROUTING: must find a SIM slot matching this provider — NO fallback
    const offlineSlotInfo = await resolveSimSlotForProvider(supabase, providerSlug);
    if (!offlineSlotInfo) {
      console.error(`❌ No active device has a SIM for provider "${providerSlug}". Refusing to dial from wrong SIM.`);
      await supabase
        .from("orders")
        .update({
          delivery_status: "failed",
          delivery_notes: `No ${providerSlug.toUpperCase()} SIM available on any active device. Configure a SIM with sim1_provider/sim2_provider='${providerSlug}'.`,
        })
        .eq("id", order.id);
      return new Response(
        JSON.stringify({
          success: false,
          message: `No SIM available for ${providerSlug}`,
          order_id: order.id,
          route,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }
    console.log(`✅ Routing to device ${offlineSlotInfo.android_device_id} sim_slot=${offlineSlotInfo.sim_slot}`);

    const bundled = await queueDeliveryWithBundling(
      supabase,
      order.id,
      selectedPackage.id,
      registration.provider_id,
      registration.receiver_phone,
      providerSlug,
    );

    if (!bundled) {
      const ussdCode = buildUssdCode(
        instruction.code_template,
        normalizePhoneForProvider(registration.receiver_phone),
        Number(selectedPackage.cost_price),
        instruction.sim_password || "5516",
        selectedPackage.ussd_code || "",
      );
      try {
        await queueDirectDeliveryIfMissing(supabase, {
          order_id: order.id,
          provider_name: providerSlug,
          ussd_code: ussdCode,
          receiver_phone: registration.receiver_phone,
          package_code: selectedPackage.ussd_code,
          status: "pending",
          sim_slot: offlineSlotInfo.sim_slot,
        });
        console.log(`📬 Offline reg queued (provider=${providerSlug}, sim_slot=${offlineSlotInfo.sim_slot})`);
      } catch (queueError) {
        console.error("❌ Queue error:", queueError);
        throw queueError;
      }
    }

    await supabase
      .from("payment_receipts")
      .update({
        status: "matched",
        matched_order_id: order.id,
        matching_strategy: matchedViaSecretPrice ? "secret_price_offline" : "offline_auto",
        processed_at: new Date().toISOString(),
        admin_notes: `Route: ${route} | ${matchedViaSecretPrice ? '🔒 SECRET PRICE | ' : ''}${selectedPackage.package_name} for ${registration.receiver_phone} | SIM: ${resolvedSimNumber}`,
      })
      .eq("id", receipt.id);

    console.log("✅ Payment receipt matched");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Order created and queued for delivery",
        order_id: order.id,
        package_name: selectedPackage.package_name,
        receiver_phone: registration.receiver_phone,
        route,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    console.error("❌ Error processing payment:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
