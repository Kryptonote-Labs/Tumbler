import type { CoveragePlan } from '../coverage.ts';
import type { Requirement } from '../model.ts';
import { profiles, properties, requirementId, scenarioId } from './properties.ts';

export const preservationRequirements: readonly Requirement[] = properties.map(property => ({
  id: requirementId(property), dimension: 'preserve', title: `Preserve ${property.kind} ${property.name}`,
  topics: [property.topic],
  criteria: 'Preserve absent, implicit-true and every legal boolean lexical form in Strict and Transitional body/table paragraphs, including paragraph-mark properties. No-op ZIP bytes, untouched part payloads and undo bytes must match exactly. Text replacement, substring colour formatting and paragraph alignment changes must retain each property XML and its original location; style/default/basedOn markup must remain byte-identical. Validate before and after packages with Open XML SDK.',
  checks: profiles.flatMap(profile => (['assertion', 'package-diff', 'openxml'] as const).map(oracle => ({ scenario: scenarioId(property, profile), oracle }))),
}));

export const preservationPlans: readonly CoveragePlan[] = properties.map(property => ({
  topic: property.topic, dimension: 'preserve', requirements: [requirementId(property)],
  obligations: `${property.topic}, ECMA-376-1:2016 §17.17.4 / §22.9.2.7 and Transitional boolean spellings: retain ${property.kind} ${property.name} presence, omission, lexical value and placement; do not flatten defaults or style inheritance/toggle chains. Preserve paragraph-mark copies and untouched style definitions through supported text/format edits and undo/redo. This qualifies storage preservation only, not semantic interpretation, authoring, layout or LibreOffice behaviour. See preservation/README.md for the operation boundary and source review.`,
}));
