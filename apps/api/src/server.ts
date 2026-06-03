import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import underPressure from '@fastify/under-pressure';
import { onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fastify';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { bindContext, logger } from '@cpq/core/server';
import { contextFromRequest } from './context.js';
import { router } from './router.js';
import { closeSapClient } from './sapClient.js';

export async function buildServer() {
  const app = Fastify({ logger: false });
  await app.register(helmet);
  await app.register(cors);
  await app.register(underPressure);

  // REQUIRED for oRPC: stop Fastify parsing the body so the handlers read the raw stream.
  app.addContentTypeParser('*', (_req, _payload, done) => done(null, undefined));

  // Bind the request context into ALS at the earliest hook (same mechanism as @fastify/request-context).
  app.addHook('onRequest', async (req) => {
    bindContext(contextFromRequest(req));
  });

  app.get('/healthz', async () => ({ ok: true }));

  // Release the SAP keep-alive timer + dispatcher on shutdown.
  app.addHook('onClose', async () => {
    await closeSapClient();
  });

  const rpc = new RPCHandler(router, { interceptors: [onError((e) => logger.error(e))] });
  const api = new OpenAPIHandler(router, {
    interceptors: [onError((e) => logger.error(e))],
    plugins: [
      new OpenAPIReferencePlugin({
        // serves the Scalar reference UI + the OpenAPI spec under the /api prefix
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: { info: { title: 'CPQ API', version: '0.0.0' } },
      }),
    ],
  });

  app.all('/rpc/*', async (req, reply) => {
    const { matched } = await rpc.handle(req, reply, { prefix: '/rpc', context: {} });
    if (!matched) reply.callNotFound();
  });
  app.all('/api/*', async (req, reply) => {
    const { matched } = await api.handle(req, reply, { prefix: '/api', context: {} });
    if (!matched) reply.callNotFound();
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildServer().then((a) => a.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' }));
}
