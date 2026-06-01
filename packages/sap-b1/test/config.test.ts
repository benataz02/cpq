import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSapConfig } from '../src/config';
import { SapConfigError } from '../src/errors';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveSapConfig', () => {
  it('resolves a full config from SAP_* env + SAP_PASSWORD', () => {
    vi.stubEnv('SAP_BASE_URL', 'https://sap.example.com/b1s/v2');
    vi.stubEnv('SAP_COMPANY_DB', 'SBODEMOUS');
    vi.stubEnv('SAP_USERNAME', 'manager');
    vi.stubEnv('SAP_PASSWORD', 's3cret');
    vi.stubEnv('SAP_REJECT_UNAUTHORIZED', '');

    const cfg = resolveSapConfig('demo');

    expect(cfg.baseUrl).toBe('https://sap.example.com/b1s/v2');
    expect(cfg.creds).toEqual({
      CompanyDB: 'SBODEMOUS',
      UserName: 'manager',
      Password: 's3cret',
    });
    expect(cfg.rejectUnauthorized).toBe(true);
  });

  it('honours SAP_REJECT_UNAUTHORIZED=false', () => {
    vi.stubEnv('SAP_BASE_URL', 'https://sap.example.com/b1s/v2');
    vi.stubEnv('SAP_COMPANY_DB', 'SBODEMOUS');
    vi.stubEnv('SAP_USERNAME', 'manager');
    vi.stubEnv('SAP_PASSWORD', 's3cret');
    vi.stubEnv('SAP_REJECT_UNAUTHORIZED', 'false');

    const cfg = resolveSapConfig('demo');

    expect(cfg.rejectUnauthorized).toBe(false);
  });

  it('throws SapConfigError when SAP_BASE_URL is missing', () => {
    vi.stubEnv('SAP_BASE_URL', '');
    vi.stubEnv('SAP_COMPANY_DB', 'SBODEMOUS');
    vi.stubEnv('SAP_USERNAME', 'manager');
    vi.stubEnv('SAP_PASSWORD', 's3cret');

    expect(() => resolveSapConfig('demo')).toThrow(SapConfigError);
  });
});
