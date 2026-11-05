export const ERROR_CODES = [
  'INVALID_CREDENTIALS',
  'MFA_REQUIRED',
  'NOT_ACTIVE',
  'COMPANY_SUSPENDED',
  'FORBIDDEN',
  'VALIDATION_FAILED',
  'CAMERA_DENIED',
  'LOCATION_DENIED',
  'GPS_WEAK',
  'OUTSIDE_ZONE',
  'SELFIE_REQUIRED',
  'ALREADY_CLOCKED_IN',
  'NOT_CLOCKED_IN',
  'LEAVE_OVERLAP',
  'LEAVE_BALANCE_LOW',
  'CLAIM_LIMIT',
  'SEAT_LIMIT',
  'FEATURE_OFF',
  'SUPPORT_GRANT_REQUIRED',
  'UPDATE_REQUIRED',
  'RATE_LIMITED',
  'SERVER_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorInfo {
  message: string;
  nextStep: string;
  httpStatus: number;
}

export const ERRORS: Record<ErrorCode, ErrorInfo> = {
  INVALID_CREDENTIALS: {
    message: 'The username or password is not right.',
    nextStep: 'Check both and try again, or reset your password.',
    httpStatus: 401,
  },
  MFA_REQUIRED: {
    message: 'Two-step sign-in is needed for this page.',
    nextStep: 'Enter the code from your authenticator app.',
    httpStatus: 403,
  },
  NOT_ACTIVE: {
    message: 'Your account is not active.',
    nextStep: 'Contact your HR team.',
    httpStatus: 403,
  },
  COMPANY_SUSPENDED: {
    message: 'This account is paused.',
    nextStep: 'Contact your HR team.',
    httpStatus: 403,
  },
  FORBIDDEN: {
    message: 'You do not have access to this.',
    nextStep: 'Go back, or ask your HR team for access.',
    httpStatus: 403,
  },
  VALIDATION_FAILED: {
    message: 'Some details are missing or not valid.',
    nextStep: 'Check the highlighted fields and try again.',
    httpStatus: 400,
  },
  CAMERA_DENIED: {
    message: 'The camera is blocked.',
    nextStep: 'Allow camera access in your browser settings, then try again.',
    httpStatus: 400,
  },
  LOCATION_DENIED: {
    message: 'Location is blocked.',
    nextStep: 'Allow location access in your browser settings, then try again.',
    httpStatus: 400,
  },
  GPS_WEAK: {
    message: 'Your GPS signal is weak.',
    nextStep: 'Move near a window or outside for a better signal. You can still clock in.',
    httpStatus: 200,
  },
  OUTSIDE_ZONE: {
    message: 'You seem to be outside your work site.',
    nextStep: 'You can still clock in. HR will see a location flag.',
    httpStatus: 200,
  },
  SELFIE_REQUIRED: {
    message: 'A selfie is needed to clock in.',
    nextStep: 'Take a selfie, then try again.',
    httpStatus: 400,
  },
  ALREADY_CLOCKED_IN: {
    message: 'You are already clocked in.',
    nextStep: 'Clock out when your shift ends.',
    httpStatus: 409,
  },
  NOT_CLOCKED_IN: {
    message: 'You are not clocked in.',
    nextStep: 'Clock in first.',
    httpStatus: 409,
  },
  LEAVE_OVERLAP: {
    message: 'These dates overlap with another leave request.',
    nextStep: 'Choose different dates or cancel the other request.',
    httpStatus: 409,
  },
  LEAVE_BALANCE_LOW: {
    message: 'You do not have enough leave left.',
    nextStep: 'Choose fewer days or another leave type.',
    httpStatus: 409,
  },
  CLAIM_LIMIT: {
    message: 'This claim is over your limit.',
    nextStep: 'Lower the amount or contact your HR team.',
    httpStatus: 409,
  },
  SEAT_LIMIT: {
    message: 'Your plan has no seats left.',
    nextStep: 'Offboard someone or ask to raise the seat limit.',
    httpStatus: 409,
  },
  FEATURE_OFF: {
    message: 'This feature is turned off for your company.',
    nextStep: 'Contact your HR team.',
    httpStatus: 403,
  },
  SUPPORT_GRANT_REQUIRED: {
    message: 'Support access has not been granted.',
    nextStep: 'Ask the company HR team to grant support access.',
    httpStatus: 403,
  },
  UPDATE_REQUIRED: {
    message: 'A new version of the app is available.',
    nextStep: 'The app will reload now.',
    httpStatus: 426,
  },
  RATE_LIMITED: {
    message: 'Too many attempts.',
    nextStep: 'Wait 15 minutes and try again.',
    httpStatus: 429,
  },
  SERVER_ERROR: {
    message: 'Something went wrong on our side.',
    nextStep: 'Try again in a moment.',
    httpStatus: 500,
  },
};

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

/** Maps any unknown code (or a raw error) to a safe shared code. */
export function toErrorCode(value: unknown): ErrorCode {
  return isErrorCode(value) ? value : 'SERVER_ERROR';
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };
