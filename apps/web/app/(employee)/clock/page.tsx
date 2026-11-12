'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Buildings, CameraRotate, House, MapPin, Warning } from '@phosphor-icons/react';
import {
  ERRORS,
  evaluateClockIn,
  homeAllowed,
  localParts,
  type EffectiveRules,
  type ErrorCode,
  type Zone,
} from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, StatusChip } from '@/components/ui/Chip';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { captureSelfie, openCamera, stopCamera } from '@/lib/camera';
import { getFix, type Fix } from '@/lib/geo';
import { localDate, localTime, queryKeys, useOpenShift, useWorkplace } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';

export default function ClockPage() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { client, profile } = useSession();
  const workplace = useWorkplace();
  const openShift = useOpenShift();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // One id per attempt: a retry after a network error sends the same id, so it is not recorded twice.
  const requestIdRef = useRef<string>(crypto.randomUUID());
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<ErrorCode | null>(null);
  // True once the camera shows a picture; the selfie button waits for it.
  const [cameraReady, setCameraReady] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<ErrorCode | null>(null);
  const [placeChoice, setPlaceChoice] = useState<'office' | 'home'>('office');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  useEffect(() => {
    let cancelled = false;
    openCamera(facing)
      .then((stream) => {
        if (cancelled) return stopCamera(stream);
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraError(null);
      })
      .catch(() => setCameraError('CAMERA_DENIED'));
    return () => {
      cancelled = true;
      stopCamera(streamRef.current);
      streamRef.current = null;
    };
  }, [facing]);

  // Location is read once, here, only for this clock event.
  useEffect(() => {
    getFix()
      .then(setFix)
      .catch((code: ErrorCode) => setGeoError(code));
  }, []);

  const wp = workplace.data;
  const rules: EffectiveRules | null = useMemo(() => {
    if (!wp) return null;
    return {
      workMode: wp.rules?.work_mode_override ?? wp.office.work_mode,
      timezone: wp.office.timezone,
      shiftStart: wp.rules?.shift_start ?? wp.office.shift_start,
      graceMinutes: wp.rules?.grace_minutes ?? wp.office.grace_minutes,
      homeDays: wp.rules?.home_days ?? wp.office.home_days,
    };
  }, [wp]);

  const homeZone: Zone | null = useMemo(
    () =>
      wp?.rules?.home_status === 'approved' && wp.rules.home_lat != null && wp.rules.home_lng != null
        ? { id: 'home', kind: 'home', lat: Number(wp.rules.home_lat), lng: Number(wp.rules.home_lng), radiusM: wp.rules.home_radius_m }
        : null,
    [wp],
  );
  const today = rules ? localParts(new Date(), rules.timezone).isoWeekday : 1;
  const offerHome = !!rules && (rules.workMode === 'hybrid' || rules.workMode === 'remote');

  // Preview of what the server will decide. The server recomputes with its own time.
  const preview = useMemo(() => {
    if (!fix || !rules || !wp) return null;
    const now = new Date();
    return evaluateClockIn(
      {
        serverTime: now,
        deviceTime: now,
        position: fix,
        accuracyM: fix.accuracyM,
        sites: wp.sites.map((s) => ({ id: s.id, kind: 'site' as const, lat: s.lat, lng: s.lng, radiusM: s.radius_m })),
        home: placeChoice === 'home' ? homeZone : null,
      },
      rules,
    );
  }, [fix, rules, wp, placeChoice, homeZone]);

  const isOut = !!openShift.data;
  const siteName = preview?.zoneId ? wp?.sites.find((s) => s.id === preview.zoneId)?.name : null;
  const nearest = wp?.sites[0]?.name ?? '-';

  const submit = async () => {
    if (!profile || !wp || !rules) return;
    setError(null);
    if (!fix) {
      setError(geoError ?? 'LOCATION_DENIED');
      return;
    }
    setBusy(true);
    try {
      let selfiePath: string | null = null;
      if (videoRef.current && !cameraError) {
        let blob: Blob;
        try {
          blob = await captureSelfie(videoRef.current);
        } catch {
          // The camera had no picture yet: ask again rather than report a server problem.
          setError('SELFIE_REQUIRED');
          return;
        }
        const path = `${profile.company_id}/${profile.user_id}/${localDate(new Date(), rules.timezone)}/${crypto.randomUUID()}.webp`;
        const up = await client.storage.from('selfies').upload(path, blob, { contentType: 'image/webp', upsert: false });
        if (up.error) {
          setError('SERVER_ERROR');
          return;
        }
        selfiePath = path;
      } else if (wp.office.require_selfie) {
        setError(cameraError ?? 'SELFIE_REQUIRED');
        return;
      }

      const res = await callFunction<{ status: string }>(client, isOut ? 'clock-out' : 'clock-in', {
        client_request_id: requestIdRef.current,
        lat: fix.lat,
        lng: fix.lng,
        accuracy_m: fix.accuracyM,
        selfie_path: selfiePath,
        place_choice: placeChoice,
        device_time: new Date().toISOString(),
      });
      if (!res.ok) {
        // A new attempt after a definite answer gets a new id.
        requestIdRef.current = crypto.randomUUID();
        setError(res.code);
        if (res.code === 'ALREADY_CLOCKED_IN' || res.code === 'NOT_CLOCKED_IN') {
          await queryClient.invalidateQueries({ queryKey: queryKeys.openShift(profile.user_id) });
        }
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.openShift(profile.user_id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.attendance(profile.user_id) }),
      ]);
      toast(isOut ? `Clocked out at ${localTime(new Date(), rules.timezone)}.` : `Clocked in at ${localTime(new Date(), rules.timezone)}.`);
      router.push('/home/');
    } catch {
      setError('SERVER_ERROR');
    } finally {
      setBusy(false);
    }
  };

  if (workplace.isLoading || openShift.isLoading) return <ListSkeleton rows={4} />;
  if (!profile?.office_id || workplace.isError || !wp || !rules) {
    return (
      <Card>
        <p className="font-semibold">No office set up for you yet</p>
        <p className="text-sm text-muted">Ask your HR team to assign you to an office before you clock in.</p>
      </Card>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-2xl">{isOut ? 'Clock out' : 'Clock in'}</h1>
      <p className="mb-4 text-sm text-muted">
        {isOut && openShift.data
          ? `Clocked in at ${localTime(openShift.data.clock_in_at, rules.timezone)}`
          : `${wp.office.name} office. Shift ${wp.office.shift_start.slice(0, 5)} to ${wp.office.shift_end.slice(0, 5)}`}
      </p>

      {offerHome && !isOut ? (
        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-semibold">Where are you working today?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['office', 'home'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={placeChoice === choice}
                onClick={() => setPlaceChoice(choice)}
                className={cn(
                  'flex min-h-12 items-center justify-center gap-2 rounded-full border text-sm font-semibold',
                  placeChoice === choice ? 'border-fg bg-solid text-on-solid' : 'border-line-strong bg-surface',
                )}
              >
                {choice === 'office' ? <Buildings size={18} aria-hidden /> : <House size={18} aria-hidden />}
                {choice === 'office' ? 'Office' : 'Home'}
              </button>
            ))}
          </div>
          {placeChoice === 'home' ? (
            <p className="mt-2 text-sm text-muted">
              {!homeZone
                ? 'Your home location is not approved yet, so this will show as outside. Ask HR to approve it.'
                : homeAllowed(rules, today)
                  ? 'Checked against your registered home location.'
                  : 'Today is not one of your home days. HR will see a note.'}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className="relative mb-4 aspect-[3/4] overflow-hidden rounded-card bg-solid">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedData={() => setCameraReady(true)}
          className="size-full object-cover"
          style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 h-[58%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-on-solid/80"
        />
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-on-solid">
            <Warning size={28} aria-hidden />
            <p className="font-semibold">{ERRORS[cameraError].message}</p>
            <p className="text-sm opacity-80">{ERRORS[cameraError].nextStep}</p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setCameraReady(false);
            setFacing((f) => (f === 'user' ? 'environment' : 'user'));
          }}
          aria-label="Switch camera"
          className="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-full bg-on-solid text-solid"
        >
          <CameraRotate size={22} aria-hidden />
        </button>
      </div>

      <Card className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 font-semibold">
            <MapPin size={18} aria-hidden /> Location
          </p>
          {preview ? (
            preview.place === 'outside' ? (
              <Chip tone="danger">Outside {placeChoice === 'home' ? 'home' : 'site'}</Chip>
            ) : (
              <Chip>{preview.place === 'home' ? 'At home' : 'Inside site'}</Chip>
            )
          ) : null}
        </div>
        {geoError ? (
          <p className="text-sm text-danger">
            {ERRORS[geoError].message} {ERRORS[geoError].nextStep}
          </p>
        ) : fix && preview ? (
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted">Lat, lng</dt>
            <dd className="text-right font-mono">
              {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}
            </dd>
            <dt className="text-muted">Accuracy</dt>
            <dd className="text-right font-mono">{Math.round(fix.accuracyM)} m</dd>
            <dt className="text-muted">{preview.place === 'home' ? 'Place' : 'Nearest site'}</dt>
            <dd className="text-right">{preview.place === 'home' ? 'Home' : (siteName ?? nearest)}</dd>
            <dt className="text-muted">Distance</dt>
            <dd className="text-right font-mono">
              {preview.distanceM === null ? '-' : `${preview.distanceM.toLocaleString('en-SG')} m`}
            </dd>
            {isOut ? null : (
              <>
                <dt className="text-muted">Status now</dt>
                <dd className="text-right">
                  <StatusChip status={preview.status} />
                </dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-sm text-muted">Finding your location</p>
        )}
        {preview?.flags.includes('gps_weak') ? (
          <p className="mt-2 text-sm text-muted">{ERRORS.GPS_WEAK.nextStep}</p>
        ) : null}
      </Card>

      {error ? (
        <p role="alert" className="mb-3 rounded-box bg-danger-soft px-3 py-2 text-sm text-danger">
          {ERRORS[error].message} {ERRORS[error].nextStep}
        </p>
      ) : null}

      <Button
        block
        onClick={submit}
        loading={busy}
        // Wait for a picture when a selfie is needed; if the camera is blocked, the press explains why.
        disabled={wp.office.require_selfie && !cameraReady && !cameraError}
      >
        {wp.office.require_selfie && !cameraReady && !cameraError
          ? 'Starting camera'
          : isOut
            ? 'Take selfie and clock out'
            : 'Take selfie and clock in'}
      </Button>
      <p className="mt-3 text-center text-xs text-muted">Time is recorded by the server.</p>
    </>
  );
}
