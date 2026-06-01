import Anthropic from '@anthropic-ai/sdk';
import { z, type ZodType } from 'zod';

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

export function createAiClient(): Anthropic {
  // Degrades gracefully: constructs even without a key (calls fail until configured).
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? 'not-configured' });
}

// Binds the SAME zod schemas to a structured-output JSON Schema. The full agent
// loop (tool use, the manual/ai shared ConfigState) is P4.
export function toStructuredFormat(schema: ZodType): unknown {
  return z.toJSONSchema(schema);
}
