export type Type =
  | {
      kind:
        | 'number'
        | 'string'
        | 'boolean'
        | 'null'
        | 'undefined'
        | 'void'
        | 'unknown'
        | 'any'
        | 'never';
    }
  | { kind: 'array' | 'promise'; value: Type }
  | { kind: 'record'; fields: Record<string, { type: Type; optional: boolean }> }
  | {
      kind: 'function';
      parameters: Type[];
      optional: boolean[];
      result: Type;
      rest?: Type;
      builtin?: string;
    }
  | { kind: 'overload'; signatures: (Type & { kind: 'function' })[] }
  | { kind: 'union'; values: Type[] };
export const type = (
  kind:
    'number' | 'string' | 'boolean' | 'null' | 'undefined' | 'void' | 'unknown' | 'any' | 'never',
): Type => ({ kind });
export function typeText(t: Type): string {
  if (t.kind === 'overload')
    return '{ ' + t.signatures.map((fn) => functionText(fn, '): ')).join('; ') + ' }';
  if (t.kind === 'array') return `(${typeText(t.value)})[]`;
  if (t.kind === 'promise') return `Promise<${typeText(t.value)}>`;
  if (t.kind === 'union')
    return t.values
      .map((value) => (value.kind === 'function' ? `(${typeText(value)})` : typeText(value)))
      .join(' | ');
  if (t.kind === 'record')
    return (
      '{ ' +
      Object.entries(t.fields)
        .map(([key, v]) => `${JSON.stringify(key)}${v.optional ? '?' : ''}: ${typeText(v.type)}`)
        .join('; ') +
      ' }'
    );
  if (t.kind === 'function') return functionText(t);
  return t.kind;
}
function functionText(t: Type & { kind: 'function' }, separator = ') => '): string {
  const parameters = t.parameters.map((p, i) => {
    const rest = !!t.rest && i === t.parameters.length - 1;
    // A default before a required positional parameter cannot use TS's ? syntax.
    const requiredAfter = t.optional.slice(i + 1, t.rest ? -1 : undefined).includes(false);
    const optional = t.optional[i] && !rest;
    return `${rest ? '...' : ''}arg${i}${optional && !requiredAfter ? '?' : ''}: ${typeText(optional && requiredAfter ? union([p, type('undefined')]) : p)}`;
  });
  return '(' + parameters.join(', ') + separator + typeText(t.result);
}
export const union = (values: Type[]): Type => {
  const all = values
    .flatMap((t) => (t.kind === 'union' ? t.values : [t]))
    .filter((t) => t.kind !== 'never');
  const unique = [...new Map(all.map((t) => [typeText(t), t])).values()];
  return unique.length === 1
    ? unique[0]!
    : unique.length
      ? { kind: 'union', values: unique }
      : type('never');
};
export const nullable = (t: Type) =>
  t.kind === 'null' || t.kind === 'undefined' || (t.kind === 'union' && t.values.some(nullable));
export const present = (t: Type): Type =>
  t.kind === 'union'
    ? union(t.values.filter((t) => t.kind !== 'null' && t.kind !== 'undefined'))
    : t.kind === 'null' || t.kind === 'undefined'
      ? type('never')
      : t;
export function assignable(from: Type, to: Type, invariant = false): boolean {
  if (from.kind === 'any' || to.kind === 'any' || to.kind === 'unknown' || from.kind === 'never')
    return true;
  if (from.kind === 'union') return from.values.every((t) => assignable(t, to, invariant));
  if (to.kind === 'union') return to.values.some((t) => assignable(from, t, invariant));
  if (from.kind === 'overload' && to.kind === 'overload')
    return to.signatures.every((target) =>
      from.signatures.some((source) => assignable(source, target, invariant)),
    );
  if (from.kind === 'overload') return from.signatures.some((t) => assignable(t, to, invariant));
  if (to.kind === 'overload') return to.signatures.every((t) => assignable(from, t, invariant));
  if (from.kind === to.kind) {
    if (
      (to.kind === 'array' && from.kind === 'array') ||
      (to.kind === 'promise' && from.kind === 'promise')
    )
      return (
        assignable(from.value, to.value, invariant) &&
        (!invariant || to.kind === 'promise' || assignable(to.value, from.value, true))
      );
    if (to.kind === 'record' && from.kind === 'record')
      return Object.entries(to.fields).every(([k, v]) =>
        from.fields[k]
          ? (!from.fields[k]!.optional || v.optional) &&
            assignable(from.fields[k]!.type, v.type, invariant) &&
            (!invariant ||
              ((!v.optional || from.fields[k]!.optional) &&
                assignable(v.type, from.fields[k]!.type, true)))
          : v.optional,
      );
    if (to.kind === 'function' && from.kind === 'function') {
      const required = (fn: Type & { kind: 'function' }) =>
        fn.parameters.reduce(
          (n, _, i) =>
            !fn.optional[i] && !(fn.rest && i === fn.parameters.length - 1) ? i + 1 : n,
          0,
        );
      const at = (fn: Type & { kind: 'function' }, i: number): Type | undefined =>
        fn.rest && i >= fn.parameters.length - 1
          ? fn.rest.kind === 'array'
            ? fn.rest.value
            : fn.rest
          : fn.parameters[i];
      return (
        required(from) <= required(to) &&
        to.parameters.every((_, i) => !at(from, i) || assignable(at(to, i)!, at(from, i)!)) &&
        assignable(from.result, to.result, true)
      );
    }
    return true;
  }
  return to.kind === 'void' && from.kind === 'undefined';
}

/** Keep mutable shapes at their declared width when a write narrows nullability. */
export function assignedType(value: Type, contract: Type): Type {
  if (!assignable(value, contract)) return contract;
  if (contract.kind === 'union') {
    const values = value.kind === 'union' ? value.values : [value];
    return union(
      contract.values.filter((candidate) => values.some((part) => assignable(part, candidate))),
    );
  }
  return ['record', 'array', 'any'].includes(contract.kind) ? contract : value;
}
