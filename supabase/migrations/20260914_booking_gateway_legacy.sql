-- Compatibility command boundary while legacy booking tables are migrated.
-- The RPC is callable only by the service role used by the Edge Function.
create table if not exists public.booking_commands (
  idempotency_key uuid primary key,
  student_id uuid not null references auth.users(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.book_request') is not null then
    alter table public.book_request add column if not exists idempotency_key uuid;
    create unique index if not exists book_request_student_idempotency_idx
      on public.book_request (student_id, idempotency_key)
      where idempotency_key is not null;
  end if;
end;
$$;

create or replace function public.book_legacy_session(
  p_student_id uuid,
  p_expert_id uuid,
  p_slot_id text,
  p_expert_registration_number text,
  p_expert_name text,
  p_date date,
  p_time time,
  p_mode text,
  p_type text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_slot_table text := case when p_type = 'PEER' then 'student_schedule' else 'expert_schedule' end;
  v_registration_column text := case when p_type = 'PEER' then 'peer_registration_number' else 'expert_registration_number' end;
  v_request_id uuid;
  v_result jsonb;
  v_slot_available boolean;
begin
  select result into v_existing
  from public.booking_commands
  where idempotency_key = p_idempotency_key and student_id = p_student_id;

  if v_existing is not null then return v_existing; end if;

  -- Serializes two students attempting the same legacy slot at once.
  perform pg_advisory_xact_lock(hashtextextended(p_type || ':' || p_slot_id::text, 0));

  execute format('select exists (select 1 from public.%I where id::text = $1 and %I = $2 and date = $3 and start_time = $4 and is_available = true for update)', v_slot_table, v_registration_column)
    into v_slot_available
    using p_slot_id, p_expert_registration_number, p_date, p_time;

  if not v_slot_available then
    raise exception 'INVALID_SLOT';
  end if;

  execute 'select id from public.book_request where student_id = $1 and idempotency_key = $2 limit 1'
    into v_request_id using p_student_id, p_idempotency_key;

  if v_request_id is null then
    execute format('insert into public.book_request (student_id, expert_name, expert_registration_number, expert_id, session_date, session_time, booking_mode, status, session_type, idempotency_key) values ($1, $2, $3, $4, $5, $6, $7, ''pending'', $8, $9) returning id')
      into v_request_id
      using p_student_id, p_expert_name, p_expert_registration_number, p_expert_id, p_date, p_time, p_mode, lower(case when p_type = 'PEER' then 'peer_listener' else 'expert' end), p_idempotency_key;
  end if;

  execute format('update public.%I set is_available = false, booked_by = $1 where id::text = $2', v_slot_table)
    using p_student_id, p_slot_id;

  v_result := jsonb_build_object('id', v_request_id, 'status', 'pending', 'idempotencyKey', p_idempotency_key);
  insert into public.booking_commands (idempotency_key, student_id, result)
  values (p_idempotency_key, p_student_id, v_result);
  return v_result;
exception
  when unique_violation then
    raise exception 'SLOT_ALREADY_BOOKED';
end;
$$;

revoke all on function public.book_legacy_session(uuid, uuid, text, text, text, date, time, text, text, uuid) from public, anon, authenticated;
grant execute on function public.book_legacy_session(uuid, uuid, text, text, text, date, time, text, text, uuid) to service_role;