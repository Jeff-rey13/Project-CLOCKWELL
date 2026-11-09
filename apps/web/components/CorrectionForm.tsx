'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CORRECTION_REASONS, ERRORS, correctionReasonLabel, zonedToIso } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { localDate, localTime } from '@/lib/queries';
import { useSession } from '@/lib/session';

export interface ShiftForFix {
  id: string;
  work_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  effective_clock_in_at: string;
  effective_clock_out_at: string | null;
}

/**
 * Time fix form. `mode="request"` is the employee asking HR; `mode="adjust"` is HR changing it directly.
 * The original server time is always shown and never edited.
 */
export function CorrectionForm({
  shift,
  mode,
  timezone,
  onDone,
}: {
  shift: ShiftForFix;
  mode: 'request' | 'adjust';
  timezone: string;
  onDone: () => void;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [field, setField] = useState<'clock_in' | 'clock_out'>(shift.clock_out_at ? 'clock_in' : 'clock_out');
  const current = field === 'clock_in' ? shift.effective_clock_in_at : shift.effective_clock_out_at;
  const server = field === 'clock_in' ? shift.clock_in_at : shift.clock_out_at;
  const [date, setDate] = useState(localDate(new Date(current ?? shift.clock_in_at), timezone));
  const [time, setTime] = useState(current ? localTime(current, timezone) : localTime(new Date(), timezone));
  const [reason, setReason] = useState<(typeof CORRECTION_REASONS)[number]>(mode === 'adjust' ? 'manager_approved' : 'device_delay');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeField = (f: 'clock_in' | 'clock_out') => {
    setField(f);
    const at = f === 'clock_in' ? shift.effective_clock_in_at : shift.effective_clock_out_at;
    setDate(localDate(new Date(at ?? shift.clock_in_at), timezone));
    setTime(at ? localTime(at, timezone) : localTime(new Date(), timezone));
  };

  const submit = async () => {
    setError(null);
    if (!/^\d\d:\d\d$/.test(time)) return setError('Enter a time.');
    setBusy(true);
    const res = await callFunction(client, mode === 'request' ? 'request-correction' : 'correct-attendance', {
      attendance_id: shift.id,
      field,
      corrected_at: zonedToIso(date, time, timezone),
      reason_code: reason,
      note,
    });
    setBusy(false);
    if (!res.ok) {
      setError(
        res.code === 'VALIDATION_FAILED'
          ? 'That time does not fit this shift, or a fix is already waiting for HR.'
          : `${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`,
      );
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['my-corrections'] }),
      queryClient.invalidateQueries({ queryKey: ['hr-corrections'] }),
      queryClient.invalidateQueries({ queryKey: ['attendance'] }),
      queryClient.invalidateQueries({ queryKey: ['open-shift'] }),
      queryClient.invalidateQueries({ queryKey: ['hr-day-log'] }),
    ]);
    toast(mode === 'request' ? 'Time fix sent to HR.' : 'Attendance adjusted.');
    onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <Select
        label="Which time"
        value={field}
        onChange={(e) => changeField(e.target.value as 'clock_in' | 'clock_out')}
        options={[
          { value: 'clock_in', label: 'Clock-in' },
          { value: 'clock_out', label: 'Clock-out' },
        ]}
      />
      <p className="rounded-box bg-soft px-3 py-2 text-sm">
        Server time:{' '}
        <span className="font-mono">{server ? `${localDate(new Date(server), timezone)} ${localTime(server, timezone)}` : 'not recorded'}</span>
        {current && current !== server ? (
          <>
            <br />
            Currently shown: <span className="font-mono">{localTime(current, timezone)}</span>
          </>
        ) : null}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Change to" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <Select
        label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value as (typeof CORRECTION_REASONS)[number])}
        options={CORRECTION_REASONS.map((r) => ({ value: r, label: correctionReasonLabel[r] }))}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="fix-note" className="text-sm font-medium">
          {mode === 'adjust' ? 'Note visible to employee (optional)' : 'Note to HR (optional)'}
        </label>
        <textarea
          id="fix-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-box border border-line-strong bg-surface px-3.5 py-2.5 text-base outline-none focus:border-fg"
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-box bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button block onClick={submit} loading={busy}>
        {mode === 'request' ? 'Send to HR' : 'Save adjustment'}
      </Button>
    </div>
  );
}
