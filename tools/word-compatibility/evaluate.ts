import { createHash } from 'node:crypto';
import { dimensions, oracles, type Counts, type Dimension, type Evidence, type Oracle, type Requirement, type RequirementResult, type ScenarioDefinition, type Status, type Topic } from './model.ts';

const minimumOracles: Readonly<Record<Dimension, readonly Oracle[]>> = {
  read: ['assertion'], preserve: ['package-diff'], write: ['openxml'],
  edit: ['assertion', 'openxml'], render: ['reference-layout'], interoperate: ['libreoffice'],
};
export const evidenceKey = (scenario: string, oracle: Oracle) => `${scenario}/${oracle}`;
export const hashDefinition = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Score explicit requirements, not standards headings or test counts. All mandatory checks must pass. */
export function evaluate(topics: readonly Topic[], requirements: readonly Requirement[], scenarios: readonly ScenarioDefinition[], evidence: readonly Evidence[]): RequirementResult[] {
  const topicMap = unique(topics, topic => topic.id, 'topic');
  const scenarioMap = unique(scenarios, scenario => scenario.id, 'scenario');
  unique(requirements, requirement => requirement.id, 'requirement');
  const evidenceMap = unique(evidence, result => evidenceKey(result.scenario, result.oracle), 'evidence');
  for (const scenario of scenarios) {
    if (!scenario.topics.length || !scenario.dimensions.length || !scenario.oracles.length) throw new Error(`Incomplete scenario ${scenario.id}`);
    for (const topic of scenario.topics) if (!topicMap.has(topic)) throw new Error(`Unknown topic ${topic}`);
    unique(scenario.topics, value => value, 'scenario topic');
    unique(scenario.oracles, value => value, 'scenario oracle');
    for (const dimension of scenario.dimensions) if (!dimensions.includes(dimension)) throw new Error(`Unknown dimension ${dimension}`);
    for (const oracle of scenario.oracles) if (!oracles.includes(oracle)) throw new Error(`Unknown oracle ${oracle}`);
  }
  for (const result of evidence) {
    if (!scenarioMap.get(result.scenario)?.oracles.includes(result.oracle)) throw new Error(`Undeclared evidence ${result.scenario}/${result.oracle}`);
    if (!['passed', 'failed', 'blocked'].includes(result.outcome)) throw new Error(`Invalid outcome ${result.scenario}`);
  }
  return requirements.map(requirement => {
    if (!dimensions.includes(requirement.dimension) || !requirement.title.trim() || !requirement.criteria.trim() || !requirement.topics.length) throw new Error(`Incomplete requirement ${requirement.id}`);
    for (const topic of requirement.topics) if (!topicMap.has(topic)) throw new Error(`Unknown topic ${topic}`);
    unique(requirement.topics, value => value, 'requirement topic');
    unique(requirement.checks, item => evidenceKey(item.scenario, item.oracle), 'required check');
    if (requirement.checks.length) {
      for (const oracle of minimumOracles[requirement.dimension]) {
        if (!requirement.checks.some(check => check.oracle === oracle)) throw new Error(`Missing ${oracle} oracle for ${requirement.id}`);
      }
    }
    for (const check of requirement.checks) {
      const scenario = scenarioMap.get(check.scenario);
      if (!scenario?.dimensions.includes(requirement.dimension) || !scenario.oracles.includes(check.oracle) || !requirement.topics.every(topic => scenario.topics.includes(topic))) {
        throw new Error(`Evidence does not cover ${requirement.id}: ${check.scenario}/${check.oracle}`);
      }
    }
    const results = requirement.checks.map(check => evidenceMap.get(evidenceKey(check.scenario, check.oracle)));
    // A demonstrated failure wins over missing or blocked cases.
    const status: Status = results.some(result => result?.outcome === 'failed') ? 'failed'
      : !results.length || results.some(result => !result) ? 'untested'
      : results.some(result => result?.outcome === 'blocked') ? 'blocked' : 'verified';
    return { ...requirement, status, definitionHash: hashDefinition(requirement) };
  });
}

export function count(statuses: readonly Status[]): Counts {
  const occurrences = (status: Status) => statuses.filter(value => value === status).length;
  const verified = occurrences('verified');
  return {
    total: statuses.length, verified, failed: occurrences('failed'), blocked: occurrences('blocked'), untested: occurrences('untested'),
    percent: statuses.length === 0 ? null : Math.floor(verified * 1_000_000 / statuses.length) / 10_000,
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
