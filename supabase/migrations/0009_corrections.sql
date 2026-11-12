-- 0009: attendance corrections (PRD 2.5). Original server times are never edited; a correction is a
-- separate row and attendance_effective shows the latest approved one.
-- Exception: a shift that was never clocked out has no original clock-out time. Approving a clock-out
-- correction for it closes the shift with the corrected time, so the person can clock in again.

-- Checks a corrected time against the other end of the shift (effective times) and the 24-hour window.
create or replace function private.check_correction(p_attendance uuid, p_field public.correction_field, p_at timestamptz)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  e record;
begin
  select effective_clock_in_at, effective_clock_out_at, clock_in_at into e
    from public.attendance_effective where id = p_attendance;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_at > now() then raise exception 'VALIDATION_FAILED' using errcode = 'P0001'; end if;
  if abs(extract(epoch from (p_at - e.clock_in_at))) > 24 * 3600 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if p_field = 'clock_in' and e.effective_clock_out_at is not null and p_at >= e.effective_clock_out_at then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if p_field = 'clock_out' and p_at <= e.effective_clock_in_at then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
end $$;

-- Applies an approved clock-out correction to a shift that was never closed.
create or replace function private.close_open_shift(p_attendance uuid, p_at timestamptz) returns void
language sql security definer set search_path = '' as $$
  update public.attendance set clock_out_at = p_at where id = p_attendance and clock_out_at is null
$$;

-- Employee asks for a time fix on their own shift. One pending request per shift and field.
create or replace function public.request_correction(
  p_company uuid, p_user uuid, p_attendance uuid, p_field public.correction_field,
  p_at timestamptz, p_reason public.correction_reason, p_note text
) returns public.attendance_corrections
language plpgsql security definer set search_path = '' as $$
declare
  a public.attendance;
  c public.attendance_corrections;
begin
  select * into a from public.attendance where id = p_attendance and company_id = p_company and user_id = p_user;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if exists (select 1 from public.attendance_corrections
              where attendance_id = p_attendance and field = p_field and status = 'pending') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  perform private.check_correction(p_attendance, p_field, p_at);

  insert into public.attendance_corrections
    (company_id, attendance_id, field, original_at, corrected_at, reason_code, note, requested_by, status)
  values (p_company, p_attendance, p_field,
          case when p_field = 'clock_in' then a.clock_in_at else a.clock_out_at end,
          p_at, p_reason, nullif(trim(p_note), ''), p_user, 'pending')
  returning * into c;

  insert into public.audit_log (company_id, actor_id, actor_type, action, target_table, target_id)
  values (p_company, p_user, 'employee', 'correction.requested', 'attendance_corrections', c.id::text);
  return c;
end $$;

-- HR approves or rejects a pending request.
create or replace function public.decide_correction(
  p_company uuid, p_correction uuid, p_decider uuid, p_approve boolean
) returns public.attendance_corrections
language plpgsql security definer set search_path = '' as $$
declare
  c public.attendance_corrections;
begin
  select * into c from public.attendance_corrections
   where id = p_correction and company_id = p_company for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if c.status <> 'pending' then raise exception 'VALIDATION_FAILED' using errcode = 'P0001'; end if;
  if c.requested_by = p_decider then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;

  if p_approve then
    perform private.check_correction(c.attendance_id, c.field, c.corrected_at);
    if c.field = 'clock_out' then perform private.close_open_shift(c.attendance_id, c.corrected_at); end if;
  end if;

  update public.attendance_corrections
     set status = case when p_approve then 'approved' else 'rejected' end::public.decision_status,
         decided_by = p_decider, decided_at = now()
   where id = p_correction
  returning * into c;

  insert into public.audit_log (company_id, actor_id, actor_type, action, target_table, target_id)
  values (p_company, p_decider, 'hr', case when p_approve then 'correction.approved' else 'correction.rejected' end,
          'attendance_corrections', p_correction::text);
  return c;
end $$;

-- HR adjusts a shift directly. Recorded as an approved correction with HR's reason and note.
create or replace function public.adjust_attendance(
  p_company uuid, p_decider uuid, p_attendance uuid, p_field public.correction_field,
  p_at timestamptz, p_reason public.correction_reason, p_note text
) returns public.attendance_corrections
language plpgsql security definer set search_path = '' as $$
declare
  a public.attendance;
  c public.attendance_corrections;
begin
  select * into a from public.attendance where id = p_attendance and company_id = p_company for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if a.user_id = p_decider then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform private.check_correction(p_attendance, p_field, p_at);
  if p_field = 'clock_out' then perform private.close_open_shift(p_attendance, p_at); end if;

  -- A direct adjustment settles any pending request for the same field.
  update public.attendance_corrections set status = 'rejected', decided_by = p_decider, decided_at = now()
   where attendance_id = p_attendance and field = p_field and status = 'pending';

  insert into public.attendance_corrections
    (company_id, attendance_id, field, original_at, corrected_at, reason_code, note, requested_by,
     decided_by, status, decided_at)
  values (p_company, p_attendance, p_field,
          case when p_field = 'clock_in' then a.clock_in_at else a.clock_out_at end,
          p_at, p_reason, nullif(trim(p_note), ''), p_decider, p_decider, 'approved', now())
  returning * into c;

  insert into public.audit_log (company_id, actor_id, actor_type, action, target_table, target_id)
  values (p_company, p_decider, 'hr', 'correction.adjusted', 'attendance_corrections', c.id::text);
  return c;
end $$;

-- Employees see corrections on their own shifts, including ones HR made.
drop policy if exists corrections_read on public.attendance_corrections;
create policy corrections_read on public.attendance_corrections for select to authenticated
  using (
    company_id = private.company_id()
    and (private.is_hr()
         or requested_by = auth.uid()
         or exists (select 1 from public.attendance a where a.id = attendance_id and a.user_id = auth.uid()))
  );

revoke all on function public.request_correction(uuid, uuid, uuid, public.correction_field, timestamptz, public.correction_reason, text) from public, anon, authenticated;
revoke all on function public.decide_correction(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.adjust_attendance(uuid, uuid, uuid, public.correction_field, timestamptz, public.correction_reason, text) from public, anon, authenticated;
grant execute on function public.request_correction(uuid, uuid, uuid, public.correction_field, timestamptz, public.correction_reason, text) to service_role;
grant execute on function public.decide_correction(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.adjust_attendance(uuid, uuid, uuid, public.correction_field, timestamptz, public.correction_reason, text) to service_role;
