import { readFileSync } from 'node:fs';
import { AppError } from '@cpq/core';
import { SapClient, type SapClientOptions } from './client.js';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new AppError('sap_config', `${name} is required for the SAP B1 connection`);
  return v;
}

// Password from a file secret (mirrors docker/secrets/db_password) with an env
// fallback for local dev. Never bake the secret into the image or compose env.
function readPassword(): string {
  const file = process.env.SAP_PASSWORD_FILE;
  if (file) return readFileSync(file, 'utf8').trim();
  return required('SAP_PASSWORD');
}

// Single-tenant env config for P1. Per-tenant connector_config (spec §15) is a
// documented P5 seam — this factory is the one place that resolves it.
export function sapClientFromEnv(opts: SapClientOptions = {}): SapClient {
  return new SapClient(
    required('SAP_SL_URL'),
    { CompanyDB: required('SAP_COMPANYDB'), UserName: required('SAP_USERNAME'), Password: readPassword() },
    opts,
  );
}
