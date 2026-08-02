export type FixtureFormat = "docx" | "xlsx" | "pptx";
export type FixturePrivacy = "public" | "private" | "synthetic";
export type FixtureProvenance = "generated" | "upstream" | "customer-minimized";

export interface FixtureMetadata {
  readonly id: string;
  readonly format: FixtureFormat;
  readonly producer: string;
  readonly producerVersion?: string;
  readonly provenance: FixtureProvenance;
  readonly privacy: FixturePrivacy;
  readonly license: string;
  readonly sha256?: string;
  readonly features: readonly string[];
  readonly expectedBehavior: string;
}

export function defineFixtureManifest(fixtures: readonly FixtureMetadata[]): readonly FixtureMetadata[] {
  const identities = new Set<string>();
  for (const fixture of fixtures) {
    const identity = fixtureIdentity(fixture);
    if (identities.has(identity)) throw new TypeError(`Duplicate fixture ${identity}.`);
    if (fixture.producer.trim() === "" || fixture.license.trim() === "" || fixture.expectedBehavior.trim() === "") {
      throw new TypeError(`Fixture ${identity} is missing provenance or expected behavior.`);
    }
    if (fixture.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(fixture.sha256)) {
      throw new TypeError(`Fixture ${identity} has an invalid SHA-256 digest.`);
    }
    if (fixture.provenance === "customer-minimized" && fixture.privacy !== "private") {
      throw new TypeError(`Customer-derived fixture ${identity} must remain private.`);
    }
    identities.add(identity);
  }
  return Object.freeze([...fixtures]);
}

export function fixtureIdentity(fixture: Pick<FixtureMetadata, "format" | "id">): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fixture.id)) throw new TypeError(`Invalid fixture id ${JSON.stringify(fixture.id)}.`);
  return `${fixture.format}:${fixture.id}`;
}
