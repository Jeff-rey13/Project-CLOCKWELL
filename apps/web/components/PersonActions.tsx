'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, PencilSimple, UserMinus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Chip, StatusChip } from '@/components/ui/Chip';
import type { Employee } from '@/lib/hr-queries';
import { localDate, localTime } from '@/lib/queries';
import { useSession } from '@/lib/session';
import type { AttendanceFlag, AttendanceStatus } from '@app/shared';

const TZ = 'Asia/Singapore';

/** Phone action sheet for one person: adjust time, view today's selfie and location, edit, offboard. */
export function PersonActions({
  employee,
  canOffboard,
  onEdit,
  onOffboard,
}: {
  employee: Employee;
  canOffboard: boolean;
  onEdit: () => void;
  onOffboard: () => void;
}) {
  const { client } = useSession();
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [showing, setShowing] = useState(false);

  const shift = useQuery({
    queryKey: ['hr-person-today', employee.user_id],
    queryFn: async () => {
      const { data, error } = await client
        .from('attendance')
        .select('id, clock_in_at, clock_out_at, clock_in_lat, clock_in_lng, clock_in_accuracy_m, clock_in_distance_m, clock_in_place, clock_in_selfie_path, status, flags')
        .eq('user_id', employee.user_id)
        .eq('work_date', localDate(new Date(), TZ))
        .order('clock_in_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error('load failed');
      return data as null | {
        id: string;
        clock_in_at: string;
        clock_out_at: string | null;
        clock_in_lat: number | null;
        clock_in_lng: number | null;
        clock_in_accuracy_m: number | null;
        clock_in_distance_m: number | null;
        clock_in_place: string;
        clock_in_selfie_path: string | null;
        status: AttendanceStatus;
        flags: AttendanceFlag[];
      };
    },
  });

  const viewSelfie = async () => {
    setShowing(true);
    const path = shift.data?.clock_in_selfie_path;
    if (!path) return;
    // Private file: short-lived signed URL (5 minutes).
    const { data } = await client.storage.from('selfies').createSignedUrl(path, 300);
    setSelfieUrl(data?.signedUrl ?? null);
  };

  const s = shift.data;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {employee.employee_code} · {employee.username}
        {employee.department ? ` · ${employee.department}` : ''}
      </p>

      <Link
        href="/hr/attendance/"
        className="flex min-h-12 items-center gap-3 rounded-box border border-line px-4 text-[15px] font-semibold"
      >
        <Clock size={20} aria-hidden /> Adjust time
      </Link>

      <button
        type="button"
        onClick={viewSelfie}
        disabled={!s}
        className="flex min-h-12 items-center gap-3 rounded-box border border-line px-4 text-left text-[15px] font-semibold disabled:opacity-50"
      >
        <MapPin size={20} aria-hidden /> {s ? 'View selfie and location' : 'No clock-in today'}
      </button>

      {showing && s ? (
        <div className="flex flex-col gap-2 rounded-box bg-soft p-3 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono">
              {localTime(s.clock_in_at, TZ)}
              {s.clock_out_at ? ` to ${localTime(s.clock_out_at, TZ)}` : ''}
            </span>
            <StatusChip status={s.status} />
            {s.flags.includes('outside_zone') ? <Chip tone="danger">Check location</Chip> : null}
          </div>
          <p className="font-mono text-xs">
            {s.clock_in_lat ?? '-'}, {s.clock_in_lng ?? '-'} · ±{s.clock_in_accuracy_m ?? '-'} m ·{' '}
            {s.clock_in_place === 'outside' ? 'outside' : s.clock_in_place}
            {s.clock_in_distance_m !== null ? `, ${s.clock_in_distance_m} m from site` : ''}
          </p>
          {s.clock_in_selfie_path ? (
            selfieUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selfieUrl} alt={`Clock-in selfie of ${employee.full_name}`} className="max-h-72 w-full rounded-box object-cover" />
            ) : (
              <p className="text-muted">Loading selfie</p>
            )
          ) : (
            <p className="text-muted">No selfie for this clock-in.</p>
          )}
        </div>
      ) : null}

      {employee.status !== 'offboarded' ? (
        <Button variant="outline" block onClick={onEdit}>
          <PencilSimple size={18} aria-hidden /> Edit
        </Button>
      ) : null}
      {canOffboard ? (
        <Button variant="ghost" block onClick={onOffboard} className="text-danger">
          <UserMinus size={18} aria-hidden /> Offboard
        </Button>
      ) : null}
    </div>
  );
}
