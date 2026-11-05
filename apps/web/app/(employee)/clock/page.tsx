'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CameraRotate, MapPin, Warning } from '@phosphor-icons/react';
import { ERRORS, evaluateClockIn, type ClockEvaluation, type ErrorCode } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, StatusChip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { captureSelfie, openCamera, stopCamera } from '@/lib/camera';
import { getFix, type Fix } from '@/lib/geo';
import { demoRules, demoSiteNames, demoSites } from '@/lib/demo-data';

export default function ClockPage() {
  const router = useRouter();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<ErrorCode | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<ErrorCode | null>(null);
  const [preview, setPreview] = useState<ClockEvaluation | null>(null);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    getFix()
      .then((f) => {
        setFix(f);
        // Preview of what the server will decide. The server recomputes with its own time.
        setPreview(
          evaluateClockIn(
            { serverTime: new Date(), deviceTime: new Date(), position: f, accuracyM: f.accuracyM, sites: demoSites, home: null },
            demoRules,
          ),
        );
      })
      .catch((code: ErrorCode) => setGeoError(code));
  }, []);

  const onClockIn = async () => {
    if (!videoRef.current || cameraError) {
      toast(ERRORS.SELFIE_REQUIRED.message, 'danger');
      return;
    }
    setBusy(true);
    try {
      const blob = await captureSelfie(videoRef.current);
      // Preview build: upload and the clock-in function are wired in task 1.7.
      toast(`Clocked in. Selfie ready (${Math.round(blob.size / 1024)} KB).`);
      router.push('/home/');
    } catch {
      toast(ERRORS.SERVER_ERROR.message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const siteName = preview?.zoneId ? demoSiteNames[preview.zoneId] : null;

  return (
    <>
      <h1 className="mb-4 text-2xl">Clock in</h1>

      <div className="relative mb-4 aspect-[3/4] overflow-hidden rounded-card bg-solid">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
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
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
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
              <Chip tone="danger">Outside site</Chip>
            ) : (
              <Chip>Inside site</Chip>
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
            <dt className="text-muted">Nearest site</dt>
            <dd className="text-right">{siteName ?? demoSiteNames['site-hq']}</dd>
            <dt className="text-muted">Distance</dt>
            <dd className="text-right font-mono">
              {preview.distanceM === null ? '-' : `${preview.distanceM.toLocaleString('en-SG')} m`}
            </dd>
            <dt className="text-muted">Status now</dt>
            <dd className="text-right">
              <StatusChip status={preview.status} />
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-muted">Finding your location</p>
        )}
        {preview?.flags.includes('gps_weak') ? (
          <p className="mt-2 text-sm text-muted">{ERRORS.GPS_WEAK.nextStep}</p>
        ) : null}
      </Card>

      <Button block onClick={onClockIn} loading={busy}>
        Take selfie and clock in
      </Button>
      <p className="mt-3 text-center text-xs text-muted">Time is recorded by the server.</p>
    </>
  );
}
