import { expect, test } from 'bun:test';
import { openWordArtifact } from '../../../packages/word/src/index.ts';
import { scenarios } from '../scenarios.ts';

for (const scenario of scenarios) {
  test(scenario.id, () => {
    const result = scenario.run();
    expect(result.fixtures.length).toBeGreaterThan(0);
    for (const fixture of result.fixtures) fixture.verify(openWordArtifact(fixture.bytes));
    result.comparePackages?.();
    result.referenceLayout?.();
  });
}
