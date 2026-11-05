import { z } from 'zod';

export const clientRequestId = z.string().uuid();

export const clockEventSchema = z.object({
  client_request_id: clientRequestId,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().nonnegative().max(100_000),
  selfie_path: z.string().min(1).max(300).nullable(),
  place_choice: z.enum(['office', 'home']).default('office'),
  device_time: z.string().datetime({ offset: true }),
});

export type ClockEventInput = z.infer<typeof clockEventSchema>;
