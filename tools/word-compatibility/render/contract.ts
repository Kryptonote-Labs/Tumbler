import type { CoveragePlan } from '../coverage.ts';
import type { Requirement } from '../model.ts';
import { renderCases } from './cases.ts';
import { renderTopics } from './scenarios.ts';

export const renderRequirements: readonly Requirement[] = (['size', 'breaks', 'spacing'] as const).map(group => ({
  id: `render.reference-${group}`, dimension: 'render', title: `Compare ${group} geometry with LibreOffice`, topics: [renderTopics[group]],
  criteria: group === 'size'
    ? 'Match PDF page width/height and exact page text assignment across default/explicit portrait, landscape, wide portrait, custom dimensions, printer-code metadata and a section size change. Check every page in two-page fixtures in Strict and Transitional. Orientation must not swap the authored display dimensions, and printer code must not override them. Geometry tolerance is 0.1pt.'
    : group === 'breaks'
      ? 'Match explicit page breaks and implicit/explicit text-wrapping breaks, page text assignments and line advances against pinned LibreOffice PDFs. Floating-object clearance and column breaks remain outside this requirement.'
      : 'Match automatic single, 1.15 and double line spacing plus exact and at-least 20pt advances for three 11pt paragraphs against pinned LibreOffice PDFs within 0.1pt. Paragraph before/after spacing, contextual spacing, mixed font metrics and wrapping remain outside this requirement.',
  checks: renderCases.filter(item => item.group === group).flatMap(item => (['strict', 'transitional'] as const).flatMap(profile => (['assertion', 'openxml', 'reference-layout'] as const).map(oracle => ({ scenario: `render-${item.id}-${profile}`, oracle })))),
}));

// The other two requirements are bounded evidence, not a full decomposition of their topics.
export const renderPlans: readonly CoveragePlan[] = [{
  topic: renderTopics.size, dimension: 'render', requirements: ['render.reference-size'],
  obligations: 'ECMA-376-1:2016 §17.6.13: w/h determine displayed page dimensions throughout each section; omitted orient means portrait, landscape controls paper orientation without swapping authored display dimensions; code is descriptive metadata and cannot override size. Check explicit sizes, both orientation values, code independence, repeated pages and a section transition. This qualifies displayed page geometry, not printer behaviour, physical media selection, glyph rendering or unspecified application defaults when dimensions are absent. See render/README.md.',
}];
