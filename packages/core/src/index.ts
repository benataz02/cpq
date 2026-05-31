// Pure, isomorphic surface — safe to import from the browser (apps/web).
// No Node built-ins, no IO. crypto.randomUUID exists in Node 24+ and browsers.
export const newId = (): string => globalThis.crypto.randomUUID();

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
export class ContextMissingError extends AppError {
  constructor() {
    super('context_missing', 'No request context bound');
    this.name = 'ContextMissingError';
  }
}
