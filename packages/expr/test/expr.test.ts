import { describe, expect, it } from 'vitest';
import { compileFormula } from '../src/index';

describe('compileFormula', () => {
  it('evaluates arithmetic with a numeric scope', () => {
    expect(compileFormula('a + b * 2').evaluate({ a: 1, b: 3 })).toBe(7);
  });

  it('supports common math functions', () => {
    expect(compileFormula('max(a, b) + min(a, b)').evaluate({ a: 2, b: 5 })).toBe(7);
  });

  it('rejects assignment expressions at compile time', () => {
    expect(() => compileFormula('x = 1')).toThrow(/assignment/i);
  });

  it('rejects function-assignment expressions at compile time', () => {
    expect(() => compileFormula('f(x) = x^2')).toThrow(/assignment/i);
  });

  it('disables the import() function inside a formula', () => {
    const f = compileFormula('import("os")');
    expect(() => f.evaluate({})).toThrow(/import|disabled/i);
  });
});
