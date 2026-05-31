// Node-only surface (@cpq/core/server). Carries AsyncLocalStorage + pino so the
// pure root entry stays browser-safe. apps/web is forbidden from importing this
// (eslint-plugin-boundaries + no-restricted-imports).
import { AsyncLocalStorage } from 'node:async_hooks';
import pino from 'pino';
import { ContextMissingError } from './index.js';

export interface RequestContext {
  tenantId: string;
  userId?: string;
  requestId: string;
}

export const als = new AsyncLocalStorage<RequestContext>();
export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => als.run(ctx, fn);
export const bindContext = (ctx: RequestContext): void => als.enterWith(ctx); // for onRequest hooks
export const getContext = (): RequestContext => {
  const c = als.getStore();
  if (!c) throw new ContextMissingError();
  return c;
};
export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
