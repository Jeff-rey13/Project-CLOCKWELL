-- 0004: clock-out is idempotent on its own client_request_id (PRD 0.2).
alter table public.attendance add column clock_out_request_id uuid;
create unique index attendance_clock_out_request on public.attendance (user_id, clock_out_request_id)
  where clock_out_request_id is not null;
