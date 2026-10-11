export const dimensions = ['read', 'preserve', 'write', 'edit', 'render', 'interoperate'] as const;
export type Dimension = typeof dimensions[number];
export const oracles = ['assertion', 'package-diff', 'openxml', 'libreoffice', 'reference-layout'] as const;
export type Oracle = typeof oracles[number];
export type Outcome = 'passed' | 'failed' | 'blocked';
export type Status = 'untested' | 'blocked' | 'failed' | 'verified';

export interface Topic {
  readonly id: string;
  readonly source: string;
  readonly section: string;
  readonly title: string;
  readonly page: number;
}
export interface ScenarioDefinition {
  readonly id: string;
  readonly title: string;
  readonly topics: readonly string[];
  readonly dimensions: readonly Dimension[];
  readonly oracles: readonly Oracle[];
}
export interface Check { readonly scenario: string; readonly oracle: Oracle }
/** One explicit, bounded behaviour in one applicable dimension. No automatic clause-level credit. */
export interface Requirement {
  readonly id: string;
  readonly dimension: Dimension;
  readonly title: string;
  readonly criteria: string;
  readonly topics: readonly string[];
  /** Empty means an explicit requirement without executable coverage, not an exclusion. */
  readonly checks: readonly Check[];
}
export interface RequirementResult extends Requirement {
  readonly status: Status;
  readonly definitionHash: string;
}
export interface Evidence extends Check {
  readonly outcome: Outcome;
  readonly detail: string;
  readonly artifacts: readonly { readonly path: string; readonly sha256: string }[];
}
export interface Counts {
  readonly total: number;
  readonly verified: number;
  readonly failed: number;
  readonly blocked: number;
  readonly untested: number;
  readonly percent: number | null;
}
export interface CompatibilityReport {
  readonly schemaVersion: 3;
  readonly scope: string;
  readonly inventorySha256: string;
  readonly contractHash: string;
  readonly provenance: {
    readonly commit: string; readonly treeSha256: string; readonly bun: string;
    readonly platform: string; readonly arch: string; readonly dotnet: string | null;
    readonly libreoffice: string | null; readonly openXmlSdk: string;
  };
  readonly coverageTargets: readonly import('./coverage.ts').CoverageTarget[];
  readonly requirementCounts: Counts;
  readonly overall: Counts;
  readonly dimensions: Readonly<Record<Dimension, Counts>>;
  /** Mapping is traceability only; it does not establish complete decomposition of these topics. */
  readonly inventory: { readonly total: number; readonly mapped: number; readonly withoutRequirements: number };
  readonly sources: readonly { readonly id: string; readonly total: number; readonly mapped: number; readonly coverage: Counts }[];
  readonly requirements: readonly RequirementResult[];
  readonly scenarios: readonly ScenarioDefinition[];
  readonly evidence: readonly Evidence[];
  readonly topics: readonly Topic[];
}
