import { FrameworkSchema, hashFramework, validate, type Framework, type ConfigState } from '@cpq/contract';

export async function publish(input: unknown): Promise<{ hash: string; framework: Framework }> {
  const framework = FrameworkSchema.parse(input); // shape gate
  return { hash: await hashFramework(framework), framework }; // immutable content-hashed identity
}

export function configure(framework: Framework, state: ConfigState) {
  return validate(framework, state);
}
