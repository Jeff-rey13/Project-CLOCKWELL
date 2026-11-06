import { toErrorCode } from './app.ts';
import { AppError } from './http.ts';

/** Database functions raise shared codes as messages (errcode P0001). Anything else is a server error. */
export function rpcError(error: { code?: string; message: string }): Error {
  if (error.code === 'P0001') {
    const code = toErrorCode(error.message);
    if (code !== 'SERVER_ERROR') return new AppError(code);
  }
  return new Error(error.message);
}
