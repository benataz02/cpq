import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ANTHROPIC_MODEL, createAiClient, toStructuredFormat } from '../src/index';

describe('ai', () => {
  it('exposes a configured model id', () => {
    expect(typeof ANTHROPIC_MODEL).toBe('string');
    expect(ANTHROPIC_MODEL.length).toBeGreaterThan(0);
  });

  it('constructs a client without a key (degrades gracefully)', () => {
    expect(createAiClient()).toBeDefined();
  });

  it('converts a zod schema to JSON Schema (same schemas, AI surface)', () => {
    const js = toStructuredFormat(z.object({ a: z.string() })) as Record<string, unknown>;
    expect(js.type).toBe('object');
    expect(js).toHaveProperty('properties');
  });
});
