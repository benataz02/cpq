import { readFileSync } from 'node:fs';
import { SapConfigError } from './errors.js';
import type { SapCreds } from './client.js';

/** The resolved per-tenant SAP Service Layer connection config — feeds `new SapClient(...)` in the registry. */
export interface SapConfig {
  baseUrl: string;
  creds: SapCreds;
  rejectUnauthorized: boolean;
}

/** Default tmpfs file-secret path for the SAP password (mirrors the DB secret convention in `compose.yml`). */
const SAP_PASSWORD_FILE = '/run/secrets/sap_password';

/**
 * Resolve the SAP connection config from the environment (and the tmpfs file-secret for the password).
 *
 * `SAP_BASE_URL` / `SAP_COMPANY_DB` / `SAP_USERNAME` come from env; the password is `SAP_PASSWORD` if set, else
 * read from `/run/secrets/sap_password` (file-secret). TLS is verified unless `SAP_REJECT_UNAUTHORIZED === 'false'`.
 * Throws {@link SapConfigError} when `SAP_BASE_URL` is missing — the one field with no sensible default.
 *
 * `tenantId` is accepted (and reserved) so per-tenant config sourcing can evolve without a signature change.
 */
export function resolveSapConfig(_tenantId: string): SapConfig {
  const baseUrl = process.env.SAP_BASE_URL;
  if (!baseUrl) {
    throw new SapConfigError('SAP_BASE_URL is not configured');
  }
  const password = process.env.SAP_PASSWORD ?? readFileSync(SAP_PASSWORD_FILE, 'utf8');
  return {
    baseUrl,
    creds: {
      CompanyDB: process.env.SAP_COMPANY_DB ?? '',
      UserName: process.env.SAP_USERNAME ?? '',
      Password: password,
    },
    rejectUnauthorized: process.env.SAP_REJECT_UNAUTHORIZED !== 'false',
  };
}
