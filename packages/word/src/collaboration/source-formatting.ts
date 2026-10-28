/** Compare JSON attributes independently of insertion order. */
export function stableSourceValue(value: unknown) {
  return JSON.stringify(value, (_key, part: unknown) =>
    part && typeof part === 'object' && !Array.isArray(part)
      ? Object.fromEntries(Object.entries(part).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : part,
  );
}

export function sourceFormattingKey(attributes: Record<string, unknown>) {
  const { wordSource: _source, ...rest } = attributes;
  return stableSourceValue(rest);
}
