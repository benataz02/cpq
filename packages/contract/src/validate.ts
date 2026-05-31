import { ac3, type Domain, type BinaryConstraint } from '@cpq/constraint-engine';
import { compileFormula } from '@cpq/expr';
import type { Framework, ConfigState, ValidateResult, Issue } from './types.js';

function compileConstraints(fw: Framework, domains: Record<string, Domain>): BinaryConstraint[] {
  const out: BinaryConstraint[] = [];
  for (const c of fw.constraints) {
    if (c.type === 'requires')
      out.push({ a: c.if.field, b: c.then.field, pred: (av, bv) => av !== c.if.eq || c.then.in.includes(bv) });
    else if (c.type === 'excludes')
      out.push({ a: c.a.field, b: c.b.field, pred: (av, bv) => !(av === c.a.eq && bv === c.b.eq) });
    else if (c.type === 'allowedCombo' && c.fields.length === 2) {
      const [fa, fb] = c.fields;
      out.push({ a: fa, b: fb, pred: (av, bv) => c.combos.some(([x, y]) => x === av && y === bv) });
    }
    // allowedCombo with >2 fields: P2 (n-ary AC; documented limitation).
  }
  return out.filter((bc) => domains[bc.a] && domains[bc.b]);
}

export function validate(framework: Framework, state: ConfigState): ValidateResult {
  const issues: Issue[] = [];
  const fields = new Map(framework.fields.map((f) => [f.key, f]));
  const values = state.values ?? {};

  for (const k of Object.keys(values))
    if (!fields.has(k)) issues.push({ field: k, code: 'unknown_field', message: `Unknown field '${k}'` });

  for (const f of framework.fields) {
    const v = values[f.key];
    if (v === undefined || v === null) {
      if (f.required) issues.push({ field: f.key, code: 'required', message: `'${f.key}' is required` });
      continue;
    }
    if (f.kind === 'number') {
      if (typeof v !== 'number') {
        issues.push({ field: f.key, code: 'type', message: `'${f.key}' must be a number` });
        continue;
      }
      if (f.min !== undefined && v < f.min) issues.push({ field: f.key, code: 'range', message: `'${f.key}' below min ${f.min}` });
      if (f.max !== undefined && v > f.max) issues.push({ field: f.key, code: 'range', message: `'${f.key}' above max ${f.max}` });
    } else if (f.kind === 'enum') {
      if (!f.domain?.some((d) => d === v)) issues.push({ field: f.key, code: 'domain', message: `'${f.key}'='${String(v)}' not in domain` });
    } else if (f.kind === 'boolean') {
      if (typeof v !== 'boolean') issues.push({ field: f.key, code: 'type', message: `'${f.key}' must be boolean` });
    } else if (f.kind === 'text') {
      if (typeof v !== 'string') issues.push({ field: f.key, code: 'type', message: `'${f.key}' must be text` });
    }
  }

  for (const c of framework.constraints) {
    if (c.type === 'range') {
      const v = values[c.field];
      if (typeof v === 'number') {
        if (c.min !== undefined && v < c.min) issues.push({ field: c.field, code: 'range', message: `'${c.field}' below ${c.min}` });
        if (c.max !== undefined && v > c.max) issues.push({ field: c.field, code: 'range', message: `'${c.field}' above ${c.max}` });
      }
    }
  }

  const domains: Record<string, Domain> = {};
  for (const f of framework.fields) {
    const v = values[f.key];
    if (v !== undefined && v !== null) {
      domains[f.key] = [v as string | number | boolean];
      continue;
    } // ANY assigned field -> singleton (lets a numeric antecedent drive a `requires`)
    if (f.kind === 'boolean') domains[f.key] = [true, false];
    else if (f.kind === 'enum') domains[f.key] = [...(f.domain ?? [])];
    // unassigned number/text: genuinely infinite domain -> excluded from AC-3 (participates only once assigned)
  }
  const ac3res = ac3(domains, compileConstraints(framework, domains));
  const enumKeys = new Set(framework.fields.filter((f) => f.kind === 'enum').map((f) => f.key));
  const narrowedDomains: Record<string, Array<string | number>> = {};
  for (const [k, d] of Object.entries(ac3res.domains)) {
    if (d.length === 0) issues.push({ field: k, code: 'constraint', message: `'${k}' has no consistent value` });
    if (enumKeys.has(k)) narrowedDomains[k] = d as Array<string | number>; // expose enum domains only (UI option-pruning); spec type is string|number
  }

  const derived: Record<string, unknown> = { ...(state.derived ?? {}) };
  const numericScope: Record<string, number> = {};
  for (const [k, val] of Object.entries(values)) if (typeof val === 'number') numericScope[k] = val;
  for (const formula of framework.formulas) {
    try {
      derived[formula.target] = compileFormula(formula.expr).evaluate(numericScope);
    } catch (e) {
      issues.push({ field: formula.target, code: 'constraint', message: `formula '${formula.target}' failed: ${(e as Error).message}` });
    }
  }

  return { valid: issues.length === 0, issues, narrowedDomains, derived };
}
