import { sapClientFromEnv, type SapClient } from '@cpq/sap-b1';

// Lazy singleton: the server boots (and non-SAP routes work) even with no SAP
// env configured — a missing config throws a clear error only when a sap.*
// procedure is actually called. Keep-alive pings under the 30-min default timeout.
let singleton: SapClient | null = null;

export function getSapClient(): SapClient {
  if (!singleton) singleton = sapClientFromEnv({ keepAliveMs: 25 * 60 * 1000 });
  return singleton;
}

export async function closeSapClient(): Promise<void> {
  if (singleton) {
    await singleton.close();
    singleton = null;
  }
}
