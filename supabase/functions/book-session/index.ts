import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const json = (body: Record<string, unknown>, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'UNAUTHORIZED' }, 401)

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return json({ error: 'UNAUTHORIZED' }, 401)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('type')
      .eq('id', authData.user.id)
      .single()

    if (profileError || profile?.type !== 'STUDENT') return json({ error: 'PERMISSION_DENIED' }, 403)

    const body = await req.json()
    const requiredStrings = ['expertId', 'slotId', 'expertRegistrationNumber', 'expertName', 'date', 'time', 'idempotencyKey']
    if (requiredStrings.some((field) => typeof body[field] !== 'string' || body[field].length === 0)) {
      return json({ error: 'INVALID_REQUEST' }, 400)
    }
    if (!UUID_PATTERN.test(body.expertId) || !UUID_PATTERN.test(body.idempotencyKey)) {
      return json({ error: 'INVALID_REQUEST' }, 400)
    }
    if (body.type !== 'EXPERT' && body.type !== 'PEER') return json({ error: 'INVALID_REQUEST' }, 400)
    if (body.mode !== null && body.mode !== 'online' && body.mode !== 'offline') return json({ error: 'INVALID_REQUEST' }, 400)

    const { data, error } = await supabase.rpc('book_legacy_session', {
      p_student_id: authData.user.id,
      p_expert_id: body.expertId,
      p_slot_id: body.slotId,
      p_expert_registration_number: body.expertRegistrationNumber,
      p_expert_name: body.expertName,
      p_date: body.date,
      p_time: body.time,
      p_mode: body.mode,
      p_type: body.type,
      p_idempotency_key: body.idempotencyKey,
    })

    if (error) {
      if (error.message.includes('SLOT_ALREADY_BOOKED')) return json({ error: 'SLOT_ALREADY_BOOKED' }, 409)
      if (error.message.includes('INVALID_SLOT')) return json({ error: 'INVALID_SLOT' }, 400)
      throw error
    }

    return json(data ?? {}, 201)
  } catch (error) {
    console.error('book-session failed', error)
    return json({ error: 'INTERNAL_SERVER_ERROR' }, 500)
  }
})