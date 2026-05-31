import { create, all, type MathNode } from 'mathjs';

// Hardened mathjs instance. 15.2.0 closes the known formula-injection CVE; we
// additionally neutralise the dangerous builtins as defense-in-depth so a
// published formula cannot import code, mutate units, or build new parsers.
const math = create(all, {});
const DISABLED = ['import', 'createUnit', 'reviver', 'simplify', 'derivative', 'resolve', 'parser', 'evaluate'];
math.import(
  Object.fromEntries(
    DISABLED.map((n) => [
      n,
      () => {
        throw new Error(`mathjs ${n} disabled`);
      },
    ]),
  ),
  { override: true },
);

export function compileFormula(expr: string): { evaluate: (scope: Record<string, number>) => number } {
  const node: MathNode = math.parse(expr); // parse at publish time only
  node.traverse((n) => {
    if (n.type === 'AssignmentNode' || n.type === 'FunctionAssignmentNode') {
      throw new Error('assignment not allowed in formulas');
    }
  });
  const code = node.compile();
  return { evaluate: (scope) => code.evaluate({ ...scope }) as number }; // data-only numeric scope
}
