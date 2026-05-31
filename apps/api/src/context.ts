import type { FastifyRequest } from 'fastify';
import { newId } from '@cpq/core';
import type { RequestContext } from '@cpq/core/server';

// Build the per-request context bound into ALS. In P0 the tenant comes from a
// header; auth/JWT resolution layers on later.
export function contextFromRequest(req: FastifyRequest): RequestContext {
  const tenantId = String(req.headers['x-tenant-id'] ?? 'demo');
  return { tenantId, requestId: req.id ?? newId() };
}
