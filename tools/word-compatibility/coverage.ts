import { count, hashDefinition } from './evaluate.ts';
import { dimensions, type Dimension, type RequirementResult, type Status, type Topic } from './model.ts';

/** A complete decomposition must cite the obligations, boundaries and interactions it covers. */
export interface CoveragePlan {
  readonly topic: string;
  readonly dimension: Dimension;
  readonly obligations: string;
  readonly requirements: readonly string[];
}
export interface CoverageTarget {
  readonly id: string;
  readonly topic: string;
  readonly source: string;
  readonly dimension: Dimension;
  readonly status: Status;
  readonly definitionHash: string;
  readonly requirements: readonly string[];
  readonly gap: string | null;
}

// Narrow fixtures do not yet exhaust any standards topic in any dimension.
export const coveragePlans: readonly CoveragePlan[] = [];

/** Every topic stays in every dimension. No exclusions or credit for merely linking a fixture. */
export function coverage(topics: readonly Topic[], requirements: readonly RequirementResult[], plans: readonly CoveragePlan[] = coveragePlans) {
  const mapped = new Map<string, CoveragePlan>();
  for (const plan of plans) {
    const key = `${plan.topic}/${plan.dimension}`;
    if (mapped.has(key) || !topics.some(topic => topic.id === plan.topic) || !dimensions.includes(plan.dimension) || !plan.obligations.trim() || !plan.requirements.length || new Set(plan.requirements).size !== plan.requirements.length) throw new Error(`Invalid coverage plan ${key}`);
    for (const id of plan.requirements) {
      const requirement = requirements.find(item => item.id === id);
      if (!requirement || requirement.dimension !== plan.dimension || !requirement.topics.includes(plan.topic)) throw new Error(`Mismatched coverage requirement ${id}`);
    }
    mapped.set(key, plan);
  }
  const targets = topics.flatMap(topic => dimensions.map(dimension => {
    const id = `${topic.id}/${dimension}`;
    const plan = mapped.get(id);
    const linked = requirements.filter(item => item.dimension === dimension && item.topics.includes(topic.id));
    // Include all linked failures, even if a plan omitted their requirement.
    const status: Status = linked.some(item => item.status === 'failed') ? 'failed'
      : !plan || linked.some(item => item.status === 'untested') ? 'untested'
      : linked.some(item => item.status === 'blocked') ? 'blocked' : 'verified';
    return { id, topic: topic.id, source: topic.source, dimension, status,
      definitionHash: hashDefinition({ topic, dimension, plan, requirements: linked.map(item => item.definitionHash) }),
      requirements: linked.map(item => item.id),
      gap: !plan ? 'Decompose the full topic into obligations, defaults, boundaries and interactions, then attach executable checks.' : status !== 'verified' ? 'Complete all linked requirement checks.' : null,
    } satisfies CoverageTarget;
  }));
  return { targets, overall: count(targets.map(item => item.status)),
    dimensions: Object.fromEntries(dimensions.map(dimension => [dimension, count(targets.filter(item => item.dimension === dimension).map(item => item.status))])) as Record<Dimension, ReturnType<typeof count>> };
}
