/** Conformance, preservation, fuzzing, and interoperability test utilities. */
export {
  capabilityMatrix,
  defineRequirementManifest,
  SPREADSHEET_REQUIREMENTS,
} from "./requirements.ts";
export type {
  CapabilityEvidence,
  CapabilityStage,
  CapabilityStatus,
  RequirementLevel,
  StandardsRequirement,
} from "./requirements.ts";
export {
  defineFixtureManifest,
  fixtureIdentity,
} from "./fixtures.ts";
export type {
  FixtureFormat,
  FixtureMetadata,
  FixturePrivacy,
  FixtureProvenance,
} from "./fixtures.ts";
