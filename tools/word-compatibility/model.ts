export const dimensions = ['read', 'preserve', 'write', 'edit', 'render', 'interoperate'] as const;
export type Dimension = typeof dimensions[number];
export const oracles = ['assertion', 'package-diff', 'openxml', 'libreoffice', 'word', 'reference-layout'] as const;
export type Oracle = typeof oracles[number];
export type Outcome = 'passed' | 'failed' | 'blocked';
export type Status = 'unreviewed' | 'untested' | 'blocked' | 'failed' | 'verified' | 'not-applicable';

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
  /** A narrow example under these topics, never a qualification of the entire clause. */
  readonly topics: readonly string[];
  readonly dimensions: readonly Dimension[];
  readonly oracles: readonly Oracle[];
}

export interface Evidence {
  readonly scenario: string;
  readonly oracle: Oracle;
  readonly outcome: Outcome;
  readonly detail: string;
  readonly artifacts: readonly { readonly path: string; readonly sha256: string }[];
}

export type Obligation = {
  readonly kind: 'required';
  /** Reviewed acceptance criteria, including boundary, interaction and negative cases. */
  readonly criteria: string;
  readonly evidence: readonly { readonly scenario: string; readonly oracle: Oracle }[];
} | {
  readonly kind: 'not-applicable';
  /** A standards-based applicability decision, never "not implemented". */
  readonly reason: string;
};

export interface Qualification {
  readonly topic: string;
  readonly rationale: string;
  readonly obligations: Readonly<Record<Dimension, Obligation>>;
}

export interface TopicResult extends Topic {
  readonly status: Status;
  readonly dimensions: Readonly<Record<Dimension, Status>>;
  readonly evidence: readonly string[];
}

export interface Counts {
  readonly total: number;
  readonly verified: number;
  readonly failed: number;
  readonly blocked: number;
  readonly untested: number;
  readonly unreviewed: number;
  readonly notApplicable: number;
  /** Null means no applicable denominator, never 100%. */
  readonly percent: number | null;
}

export interface CompatibilityReport {
  readonly scope: string;
  readonly inventorySha256: string;
  readonly provenance: {
    readonly commit: string; readonly treeSha256: string; readonly bun: string;
    readonly platform: string; readonly arch: string; readonly dotnet: string | null;
    readonly libreoffice: string | null; readonly openXmlSdk: string;
  };
  readonly overall: Counts;
  readonly dimensions: Readonly<Record<Dimension, Counts>>;
  readonly sources: Readonly<Record<string, Counts>>;
  readonly scenarios: readonly ScenarioDefinition[];
  readonly evidence: readonly Evidence[];
  readonly topics: readonly TopicResult[];
}
