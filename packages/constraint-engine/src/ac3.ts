export type Domain = Array<string | number | boolean>;
export interface BinaryConstraint {
  a: string;
  b: string;
  pred: (av: Domain[number], bv: Domain[number]) => boolean;
}

export function ac3(
  domainsIn: Record<string, Domain>,
  constraints: BinaryConstraint[],
): { domains: Record<string, Domain>; consistent: boolean } {
  const domains: Record<string, Domain> = Object.fromEntries(
    Object.entries(domainsIn).map(([k, d]) => [k, [...d]]),
  );
  interface Arc {
    x: string;
    y: string;
    pred: (xv: Domain[number], yv: Domain[number]) => boolean;
  }
  const arcs: Arc[] = [];
  for (const c of constraints) {
    arcs.push({ x: c.a, y: c.b, pred: (xv, yv) => c.pred(xv, yv) });
    arcs.push({ x: c.b, y: c.a, pred: (xv, yv) => c.pred(yv, xv) });
  }
  const revise = (arc: Arc): boolean => {
    let removed = false;
    domains[arc.x] = domains[arc.x].filter((xv) => {
      const ok = domains[arc.y].some((yv) => arc.pred(xv, yv));
      if (!ok) removed = true;
      return ok;
    });
    return removed;
  };
  const queue: Arc[] = [...arcs];
  while (queue.length) {
    const arc = queue.shift()!;
    if (revise(arc)) {
      if (domains[arc.x].length === 0) return { domains, consistent: false };
      // Re-enqueue EVERY arc that uses arc.x as its support variable. The classic
      // AC-3 optimization (skip the reverse arc, a.x === arc.y) is only sound with
      // ONE constraint per variable pair — with multiple constraints on the same
      // pair it skips arcs of *other* constraints and terminates non-arc-consistent.
      for (const n of arcs.filter((a) => a.y === arc.x)) queue.push(n);
    }
  }
  return { domains, consistent: Object.values(domains).every((d) => d.length > 0) };
}
