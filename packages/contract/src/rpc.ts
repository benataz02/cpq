import { oc } from '@orpc/contract';
import { z } from 'zod';
import { FrameworkSchema, ConfigStateSchema, ValidateResultSchema } from './types.js';

export const contract = {
  system: {
    ping: oc
      .route({ method: 'POST', path: '/system/ping' })
      .input(z.object({ msg: z.string() }))
      .output(z.object({ pong: z.string(), at: z.number() })),
  },
  framework: {
    validate: oc
      .route({ method: 'POST', path: '/framework/validate' })
      .input(z.object({ framework: FrameworkSchema, state: ConfigStateSchema }))
      .output(ValidateResultSchema),
  },
};
export type Contract = typeof contract;
