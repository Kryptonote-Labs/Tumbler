import type { CoveragePlan } from '../coverage.ts';
import type { Requirement } from '../model.ts';
import { topics, type Feature } from './cases.ts';

const definitions: Readonly<Record<Feature, { id: string; criteria: string }>> = {
  span: { id: 'read.table-grid-span', criteria: 'Default omitted gridSpan to one; retain explicit one; resolve staggered horizontal spans and grow the logical grid when cells exceed the declared grid, including an empty declared grid. Retain each source cell identity and expected cell text.' },
  before: { id: 'read.table-grid-before', criteria: 'Default omitted gridBefore to zero; position cells after valid leading omissions; ignore offsets greater than the declared grid instead of manufacturing leading columns. Retain the raw declaration separately from the effective grid.' },
  after: { id: 'read.table-grid-after', criteria: 'Default omitted gridAfter to zero; retain valid trailing omissions and combined leading/trailing gaps; ignore conflicting trailing counts rather than expanding the grid. Retain the declared grid and raw row properties.' },
  merge: { id: 'read.table-vertical-merge', criteria: 'Resolve restart and explicit/implicit continue into consecutive-row groups covering exactly the same columns; retain continuation identities without duplicating anchor text. Handle independent groups, restarting groups and leading omissions. Close groups at unmerged cells or omitted positions. Reject orphaned, shifted or differently sized continuations and invalid merge tokens.' },
};
const readRequirements: readonly Requirement[] = Object.entries(topics).map(([feature, topic]) => {
  const definition = definitions[feature as Feature];
  return { id: definition.id, dimension: 'read', title: `Resolve table ${feature}`, criteria: definition.criteria + (feature === 'merge' ? '' : ' Accept decimal integer signs, leading zeroes and XML whitespace; reject missing or malformed values and counts outside the existing parser range.'), topics: [topic],
    checks: ['strict', 'transitional'].flatMap(profile => (['assertion', 'openxml'] as const).map(oracle => ({ scenario: `table-${feature}-${profile}`, oracle }))),
  };
});
export const tableRequirements: readonly Requirement[] = [...readRequirements, ...readRequirements.map((read): Requirement => ({
  id: read.id.replace('read.', 'preserve.'), dimension: 'preserve', title: read.title.replace('Resolve', 'Preserve'), topics: read.topics,
  criteria: 'Retain the entire table XML byte-for-byte during neighbouring text and paragraph/run formatting edits, including all structural and integer-spelling fixtures from the read contract. Reopen and assert the expected grid, cell text and merge ownership. No-op and undo restore exact package bytes; all other package entries remain unchanged. ' + read.criteria,
  checks: ['strict', 'transitional'].flatMap(profile => (['assertion', 'package-diff', 'openxml'] as const).map(oracle => ({ scenario: `table-preserve-${Object.entries(topics).find(([, topic]) => topic === read.topics[0])![0]}-${profile}`, oracle }))),
}))];
export const tablePlans: readonly CoveragePlan[] = tableRequirements.map(requirement => ({
  topic: requirement.topics[0]!, dimension: requirement.dimension, requirements: [requirement.id],
  obligations: `${requirement.topics[0]} in pinned ECMA-376-1:2016: ${requirement.criteria} Qualification covers the headless table grid and, for preservation, unrelated source-preserving edits. It does not cover layout, authoring, structural edits or external-consumer behaviour. See tables/README.md for boundaries.`,
}));
