import { oc } from '@orpc/contract';
import { z } from 'zod';
import { FrameworkSchema, ConfigStateSchema, ValidateResultSchema } from './types.js';
import {
  EntitySetName,
  EntityKey,
  EntityQuery,
  EntityRecord,
  EntityConfig,
  DescribeOutput,
  DiscoveredEntity,
  RecordWithEtag,
} from './sap.js';

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
  sap: {
    metadata: {
      refresh: oc
        .route({ method: 'POST', path: '/sap/metadata/refresh' })
        .input(z.object({}))
        .output(z.object({ entities: z.array(DiscoveredEntity) })),
      entities: oc
        .route({ method: 'GET', path: '/sap/metadata/entities' })
        .input(z.object({}))
        .output(z.object({ entities: z.array(DiscoveredEntity) })),
      describe: oc
        .route({ method: 'GET', path: '/sap/metadata/entities/{entitySet}' })
        .input(z.object({ entitySet: EntitySetName }))
        .output(DescribeOutput),
    },
    entityConfig: {
      list: oc
        .route({ method: 'GET', path: '/sap/entity-configs' })
        .input(z.object({}))
        .output(z.object({ configs: z.array(EntityConfig) })),
      upsert: oc
        .route({ method: 'POST', path: '/sap/entity-configs' })
        .input(EntityConfig)
        .output(EntityConfig),
    },
    entity: {
      list: oc
        .route({ method: 'POST', path: '/sap/entities/{entitySet}/list' })
        .input(z.object({ entitySet: EntitySetName, query: EntityQuery.optional() }))
        .output(z.object({ records: z.array(EntityRecord), nextLink: z.string().optional() })),
      get: oc
        .route({ method: 'POST', path: '/sap/entities/{entitySet}/get' })
        .input(z.object({ entitySet: EntitySetName, key: EntityKey }))
        .output(RecordWithEtag),
      create: oc
        .route({ method: 'POST', path: '/sap/entities/{entitySet}/create' })
        .input(z.object({ entitySet: EntitySetName, data: EntityRecord }))
        .output(RecordWithEtag),
      update: oc
        .route({ method: 'POST', path: '/sap/entities/{entitySet}/update' })
        .input(z.object({ entitySet: EntitySetName, key: EntityKey, patch: EntityRecord }))
        .output(RecordWithEtag),
      delete: oc
        .route({ method: 'POST', path: '/sap/entities/{entitySet}/delete' })
        .input(z.object({ entitySet: EntitySetName, key: EntityKey }))
        .output(z.object({ deleted: z.boolean() })),
      action: oc
        .route({ method: 'POST', path: '/sap/entities/{entitySet}/action' })
        .input(z.object({ entitySet: EntitySetName, key: EntityKey, action: z.string(), data: EntityRecord.optional() }))
        .output(RecordWithEtag),
    },
  },
};
export type Contract = typeof contract;
