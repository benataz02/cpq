import { describe, expect, it } from 'vitest';
import {
  classifyHttpError,
  ODataErrorSchema,
  SapAuthError,
  SapConfigError,
  SapHttpError,
} from '../src/errors';

describe('classifyHttpError', () => {
  it('classifies HTTP 401 as SapAuthError (subclass of SapHttpError)', () => {
    const e = classifyHttpError(401, '/Items', { error: { code: 301, message: 'Unauthorized' } });
    expect(e).toBeInstanceOf(SapAuthError);
    expect(e).toBeInstanceOf(SapHttpError);
    expect(e.name).toBe('SapAuthError');
    expect(e.status).toBe(401);
    expect(e.path).toBe('/Items');
  });

  it('classifies OData code -304 as SapAuthError regardless of HTTP status', () => {
    const e = classifyHttpError(500, '/Items', { error: { code: -304, message: 'Invalid session' } });
    expect(e).toBeInstanceOf(SapAuthError);
    expect(e.odataCode).toBe('-304');
  });

  it('classifies a message mentioning "session" as SapAuthError', () => {
    const e = classifyHttpError(500, '/Items', { error: { code: -1, message: 'The session has been changed' } });
    expect(e).toBeInstanceOf(SapAuthError);
  });

  it('classifies a message mentioning "expired" as SapAuthError', () => {
    const e = classifyHttpError(500, '/Items', { error: { code: -1, message: 'Token has expired' } });
    expect(e).toBeInstanceOf(SapAuthError);
  });

  it('classifies an ordinary 500 business error as SapHttpError (NOT auth)', () => {
    const e = classifyHttpError(500, '/Orders', { error: { code: -2028, message: 'No matching records found' } });
    expect(e).toBeInstanceOf(SapHttpError);
    expect(e).not.toBeInstanceOf(SapAuthError);
    expect(e.name).toBe('SapHttpError');
    expect(e.odataCode).toBe('-2028');
  });

  it('extracts a nested { message: { value } } OData error message', () => {
    const body = { error: { code: -1, message: { value: 'session timeout occurred' } } };
    const e = classifyHttpError(500, '/Items', body);
    expect(e).toBeInstanceOf(SapAuthError);
    expect(e.message).toContain('session timeout occurred');
  });

  it('tolerates a body that is not a valid OData error envelope', () => {
    const e = classifyHttpError(500, '/Items', 'plain text body');
    expect(e).toBeInstanceOf(SapHttpError);
    expect(e).not.toBeInstanceOf(SapAuthError);
    expect(e.odataCode).toBeUndefined();
  });
});

describe('ODataErrorSchema', () => {
  it('accepts a string message', () => {
    const p = ODataErrorSchema.parse({ error: { code: -1, message: 'boom' } });
    expect(p.error.message).toBe('boom');
  });

  it('accepts a { value } message', () => {
    const p = ODataErrorSchema.parse({ error: { code: -1, message: { value: 'boom' } } });
    expect(p.error.message).toEqual({ value: 'boom' });
  });
});

describe('SapConfigError', () => {
  it('is a plain Error with a name', () => {
    const e = new SapConfigError('missing SAP_BASE_URL');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('SapConfigError');
    expect(e.message).toBe('missing SAP_BASE_URL');
  });
});
