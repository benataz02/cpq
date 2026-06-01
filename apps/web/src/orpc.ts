import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { contract } from '@cpq/contract';

// The client's TYPES come from the SAME contract the backend implements — one
// contract, two consumers, zero drift. Breaking the contract breaks this file's
// typecheck (acceptance #3).
const link = new RPCLink({ url: `${location.origin}/rpc` });
const client: ContractRouterClient<typeof contract> = createORPCClient(link);
export const orpc = createTanstackQueryUtils(client);
