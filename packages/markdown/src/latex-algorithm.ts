import { environmentAt, groupAt, whitespaceEnd } from './latex-syntax';

/** The body and placement of a complete algorithm float, with its caption left in source. */
export function readLatexAlgorithm(source: string) {
  if (!/^\s*\\begin\s*\{algorithm\}/.test(source)) return;
  const environment = environmentAt(source, whitespaceEnd(source, 0));
  if (!environment || source.slice(environment.end).trim()) return;
  const placement = groupAt(source, whitespaceEnd(source, environment.from), '[', ']');
  return {
    body: source.slice(placement?.end ?? environment.from, environment.to),
    placement: placement && source.slice(placement.from, placement.to),
  };
}
