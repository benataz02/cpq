import { z } from 'zod';
import { FrameworkSchema } from './types.js';

export * from './types.js';
export * from './canonical.js';
export * from './validate.js';
export * from './rpc.js';

/** JSON Schema for the framework meta-model (P2 builder UI). zod v4 built-in; default target draft-2020-12. */
export const frameworkJsonSchema = () => z.toJSONSchema(FrameworkSchema);
