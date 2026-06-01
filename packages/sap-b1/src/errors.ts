import { z } from 'zod';
export const ODataErrorSchema = z.object({ error: z.object({
  code: z.union([z.string(), z.number()]).optional(),
  message: z.union([z.string(), z.object({ value: z.string() })]).optional(),
}) });
function odataMessage(b: unknown): string | undefined { const p = ODataErrorSchema.safeParse(b); if (!p.success) return; const m = p.data.error.message; return typeof m === 'string' ? m : m?.value; }
function odataCode(b: unknown): string | undefined { const p = ODataErrorSchema.safeParse(b); return p.success && p.data.error.code !== undefined ? String(p.data.error.code) : undefined; }
export class SapHttpError extends Error {
  constructor(readonly status: number, readonly path: string, readonly body: unknown, readonly odataCode?: string) {
    super(`SAP ${status} ${path}${odataCode ? ` (${odataCode})` : ''}: ${odataMessage(body) ?? ''}`); this.name = 'SapHttpError';
  }
}
export class SapAuthError extends SapHttpError { constructor(s: number, p: string, b: unknown, c?: string) { super(s, p, b, c); this.name = 'SapAuthError'; } }
export class SapConfigError extends Error { constructor(m: string) { super(m); this.name = 'SapConfigError'; } }
export function classifyHttpError(status: number, path: string, body: unknown): SapHttpError {
  const code = odataCode(body); const msg = (odataMessage(body) ?? '').toLowerCase();
  const isSession = status === 401 || code === '-304' || msg.includes('session') || msg.includes('expired');
  return isSession ? new SapAuthError(status, path, body, code) : new SapHttpError(status, path, body, code);
}
