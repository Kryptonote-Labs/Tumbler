import { dimensions, oracles, type Counts, type Dimension, type Evidence, type Oracle, type Qualification, type ScenarioDefinition, type Status, type Topic, type TopicResult } from './model.ts';

const minimumOracles: Readonly<Record<Dimension, readonly Oracle[]>> = {
  read: ['assertion'], preserve: ['package-diff'], write: ['openxml'],
  edit: ['assertion', 'openxml'], render: ['reference-layout'], interoperate: ['word'],
};
const oracleDimensions: Readonly<Record<Oracle, readonly Dimension[]>> = {
  assertion: ['read', 'write', 'edit'], 'package-diff': ['preserve'], openxml: ['write', 'edit'],
  libreoffice: ['interoperate'], word: ['interoperate'], 'reference-layout': ['render'],
};
export const evidenceKey = (scenario: string, oracle: Oracle) => `${scenario}/${oracle}`;

/** Missing, skipped and blocked evidence never earns credit. Failures dominate. */
export function evaluate(topics: readonly Topic[], plans: readonly Qualification[], scenarios: readonly ScenarioDefinition[], evidence: readonly Evidence[]): TopicResult[] {
  const topicMap = unique(topics, topic => topic.id, 'topic');
  const scenarioMap = unique(scenarios, scenario => scenario.id, 'scenario');
  const planMap = unique(plans, plan => plan.topic, 'qualification');
  const evidenceMap = unique(evidence, result => evidenceKey(result.scenario, result.oracle), 'evidence');
  for (const scenario of scenarios) {
    if (!scenario.topics.length || !scenario.dimensions.length || !scenario.oracles.length) throw new Error(`Incomplete scenario ${scenario.id}`);
    for (const topic of scenario.topics) if (!topicMap.has(topic)) throw new Error(`Unknown topic ${topic}`);
    if (new Set(scenario.topics).size !== scenario.topics.length || new Set(scenario.oracles).size !== scenario.oracles.length) throw new Error(`Duplicate scenario claims ${scenario.id}`);
    for (const dimension of scenario.dimensions) if (!dimensions.includes(dimension)) throw new Error(`Unknown dimension ${dimension}`);
    for (const oracle of scenario.oracles) if (!oracles.includes(oracle)) throw new Error(`Unknown oracle ${oracle}`);
  }
  for (const result of evidence) {
    const scenario = scenarioMap.get(result.scenario);
    if (!scenario?.oracles.includes(result.oracle)) throw new Error(`Undeclared evidence ${result.scenario}/${result.oracle}`);
    if (!['passed', 'failed', 'blocked'].includes(result.outcome)) throw new Error(`Invalid outcome ${result.scenario}`);
  }
  for (const plan of plans) {
    if (!topicMap.has(plan.topic) || !plan.rationale.trim()) throw new Error(`Invalid qualification ${plan.topic}`);
    for (const dimension of dimensions) {
      const obligation = plan.obligations[dimension];
      if (!obligation) throw new Error(`Missing applicability review ${plan.topic}/${dimension}`);
      if (obligation.kind === 'not-applicable') {
        if (!obligation.reason.trim()) throw new Error(`Unjustified exclusion ${plan.topic}/${dimension}`);
        continue;
      }
      if (obligation.kind !== 'required' || !obligation.criteria.trim() || !obligation.evidence.length) throw new Error(`Empty criteria ${plan.topic}/${dimension}`);
      unique(obligation.evidence, item => evidenceKey(item.scenario, item.oracle), 'obligation evidence');
      for (const oracle of minimumOracles[dimension]) {
        if (!obligation.evidence.some(item => item.oracle === oracle)) throw new Error(`Missing ${oracle} oracle for ${plan.topic}/${dimension}`);
      }
      for (const item of obligation.evidence) {
        const scenario = scenarioMap.get(item.scenario);
        if (!scenario?.topics.includes(plan.topic) || !scenario.dimensions.includes(dimension) || !scenario.oracles.includes(item.oracle)) {
          throw new Error(`Evidence does not cover ${plan.topic}/${dimension}: ${item.scenario}/${item.oracle}`);
        }
      }
    }
    if (dimensions.every(dimension => plan.obligations[dimension].kind === 'not-applicable')) {
      throw new Error(`Cannot remove topic ${plan.topic} through applicability; version the inventory instead`);
    }
  }
  return topics.map(topic => {
    const plan = planMap.get(topic.id);
    const relatedScenarios = scenarios.filter(scenario => scenario.topics.includes(topic.id));
    const related = evidence.filter(result => relatedScenarios.some(scenario => scenario.id === result.scenario));
    const dimensionResults = Object.fromEntries(dimensions.map(dimension => {
      const relevant = related.filter(result => scenarioMap.get(result.scenario)!.dimensions.includes(dimension) && oracleDimensions[result.oracle].includes(dimension));
      // A known counterexample defeats a qualification even if the plan omitted it.
      if (relevant.some(result => result.outcome === 'failed')) return [dimension, 'failed'];
      const obligation = plan?.obligations[dimension];
      if (!obligation) return [dimension, 'unreviewed'];
      if (obligation.kind === 'not-applicable') return [dimension, 'not-applicable'];
      const required = obligation.evidence.map(item => evidenceMap.get(evidenceKey(item.scenario, item.oracle)));
      if (required.some(result => result?.outcome === 'failed')) return [dimension, 'failed'];
      if (required.some(result => !result)) return [dimension, 'untested'];
      if (required.some(result => result?.outcome === 'blocked')) return [dimension, 'blocked'];
      return [dimension, 'verified'];
    })) as Record<Dimension, Status>;
    const statuses = dimensions.map(dimension => dimensionResults[dimension]);
    const status: Status = statuses.includes('failed') ? 'failed'
      : statuses.includes('unreviewed') ? 'unreviewed'
      : statuses.includes('untested') ? 'untested'
      : statuses.includes('blocked') ? 'blocked' : 'verified';
    return { ...topic, status, dimensions: dimensionResults, evidence: related.map(result => evidenceKey(result.scenario, result.oracle)).sort() };
  });
}

/** Every in-scope topic stays in the headline denominator, regardless of implementation. */
export function count(statuses: readonly Status[]): Counts {
  const total = statuses.filter(status => status !== 'not-applicable').length;
  const occurrences = (status: Status) => statuses.filter(value => value === status).length;
  const verified = occurrences('verified');
  return {
    total, verified, failed: occurrences('failed'), blocked: occurrences('blocked'),
    untested: occurrences('untested'), unreviewed: occurrences('unreviewed'), notApplicable: occurrences('not-applicable'),
    // Floor prevents a near-complete result being displayed as 100%.
    percent: total === 0 ? null : Math.floor(verified * 1_000_000 / total) / 10_000,
  };
}

function unique<T>(items: readonly T[], key: (item: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const id = key(item);
    if (!id.trim() || result.has(id)) throw new Error(`Duplicate or empty ${label}: ${id}`);
    result.set(id, item);
  }
  return result;
}
