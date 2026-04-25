import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeviceRegistrationRequest {
  deviceId: string
  deviceName?: string
  sim1Number?: string
  sim2Number?: string
  batteryLevel?: number
  isCharging?: boolean
  appVersion?: string
  androidVersion?: string
  model?: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeText(value?: string | null): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function getProviderFromSimNumber(simNumber?: string | null): string | null {
  const normalized = simNumber?.replace(/^\+/, '')
  if (!normalized) return null
  if (normalized.startsWith('619') || normalized.startsWith('61619') || normalized.startsWith('252619')) return 'hormuud'
  if (normalized.startsWith('615') || normalized.startsWith('61615') || normalized.startsWith('252615')) return 'somnet'
  if (normalized.startsWith('634') || normalized.startsWith('61634') || normalized.startsWith('252634')) return 'somtel'
  if (normalized.startsWith('636') || normalized.startsWith('61636') || normalized.startsWith('252636')) return 'amtel'
  if (normalized.startsWith('680') || normalized.startsWith('61680') || normalized.startsWith('252680')) return 'somlink'
  return 'unknown'
}

async function ensureBalanceRows(
  supabase: ReturnType<typeof createClient>,
  androidDeviceId: string,
  sim1Provider: string | null,
  sim2Provider: string | null,
) {
  const { data: existingBalances, error: balancesError } = await supabase
    .from('sim_balances')
    .select('sim_slot, provider')
    .eq('device_id', androidDeviceId)

  if (balancesError) {
    console.error('Error checking sim_balances:', balancesError)
    return
  }

  const wantedRows: Array<{ device_id: string; sim_slot: number; balance: number; provider: string | null }> = [
    { device_id: androidDeviceId, sim_slot: 1, balance: 0, provider: sim1Provider },
  ]
  if (sim2Provider) {
    wantedRows.push({ device_id: androidDeviceId, sim_slot: 2, balance: 0, provider: sim2Provider })
  }

  const missingRows = wantedRows.filter((row) => {
    return !existingBalances?.some((b: any) => b.sim_slot === row.sim_slot)
  })

  if (!missingRows.length) return

  const { error: insertError } = await supabase.from('sim_balances').insert(missingRows as any)
  if (insertError) {
    console.error('Error creating sim_balances rows:', insertError)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Supabase secrets are missing' }, 500)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const requestData: DeviceRegistrationRequest = await req.json()

    console.log('Device registration request:', requestData)

    const deviceId = normalizeText(requestData.deviceId)
    const deviceName = normalizeText(requestData.deviceName) ?? 'Android Device'
    const sim1Number = normalizeText(requestData.sim1Number)
    const sim2Number = normalizeText(requestData.sim2Number)

    if (!deviceId) {
      return jsonResponse({ error: 'Device ID is required' }, 400)
    }

    const sim1Provider = getProviderFromSimNumber(sim1Number)
    const sim2Provider = getProviderFromSimNumber(sim2Number)
    const now = new Date().toISOString()

    const { data: existingById, error: existingByIdError } = await supabase
      .from('android_devices')
      .select('*')
      .eq('device_id', deviceId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingByIdError) throw existingByIdError
    let existingDevice: any = existingById

    if (!existingDevice) {
      const { data: existingArchivedById, error: existingArchivedByIdError } = await supabase
        .from('android_devices')
        .select('*')
        .eq('device_id', deviceId)
        .not('archived_at', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existingArchivedByIdError) throw existingArchivedByIdError
      existingDevice = existingArchivedById
    }

    if (!existingDevice) {
      const { data: existingByName, error: existingByNameError } = await supabase
        .from('android_devices')
        .select('*')
        .eq('device_name', deviceName)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existingByNameError) throw existingByNameError
      existingDevice = existingByName
    }

    const payload: Record<string, any> = {
      device_id: deviceId,
      device_name: deviceName,
      sim_number: sim1Number ?? existingDevice?.sim_number ?? '',
      sim2_number: sim2Number ?? existingDevice?.sim2_number ?? null,
      provider_name: sim1Provider ?? existingDevice?.provider_name ?? sim2Provider ?? 'unknown',
      sim1_provider: sim1Provider ?? existingDevice?.sim1_provider ?? null,
      sim2_provider: sim2Provider ?? existingDevice?.sim2_provider ?? null,
      last_ping_at: now,
      last_heartbeat: now,
      status: 'online',
      is_active: true,
      archived_at: null,
    }

    if (typeof requestData.batteryLevel === 'number') payload.battery_level = requestData.batteryLevel
    if (typeof requestData.isCharging === 'boolean') payload.is_charging = requestData.isCharging
    if (requestData.appVersion) payload.app_version = requestData.appVersion
    if (requestData.androidVersion) payload.android_version = requestData.androidVersion
    if (requestData.model) payload.model = requestData.model

    const deviceQuery = existingDevice
      ? supabase.from('android_devices').update(payload).eq('id', existingDevice.id).select().single()
      : supabase.from('android_devices').insert(payload).select().single()

    const { data: androidDevice, error: upsertError } = await deviceQuery
    if (upsertError) {
      console.error('Error saving android device:', upsertError)
      throw upsertError
    }

    await ensureBalanceRows(supabase as any, androidDevice.id, sim1Provider, sim2Provider)

    return jsonResponse({
      success: true,
      device: androidDevice,
      message: existingDevice ? 'Device updated successfully' : 'Device registered successfully',
    })
  } catch (error: any) {
    console.error('Error in device registration:', error)
    return jsonResponse(
      { error: error?.message || 'Internal server error', details: error?.toString?.() || 'Unknown error' },
      500,
    )
  }
})
