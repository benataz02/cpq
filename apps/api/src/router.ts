import { implement } from '@orpc/server';
import { contract, validate } from '@cpq/contract';
import { getContext, logger } from '@cpq/core/server';

// IMPLEMENT the shared contract. Both the RPC and OpenAPI handlers serve this
// single router — one router, two surfaces, zero drift.
const os = implement(contract);

export const router = os.router({
  system: {
    ping: os.system.ping.handler(({ input }) => {
      const { requestId, tenantId } = getContext(); // reads ALS — throws if not bound (proves acceptance #2)
      logger.info({ requestId, tenantId, ping: input.msg }, 'system.ping');
      return { pong: input.msg, at: Date.now() };
    }),
  },
  framework: {
    validate: os.framework.validate.handler(({ input }) => validate(input.framework, input.state)),
  },
});
export type AppRouter = typeof router;
