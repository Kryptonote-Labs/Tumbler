import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const RELEASE_PACKAGE_DIRECTORIES = [
  "opc",
  "ooxml",
  "formulas",
  "charts",
  "core",
  "sheets",
  "svelte",
] as const;

export interface ReleasePackage {
  readonly directory: (typeof RELEASE_PACKAGE_DIRECTORIES)[number];
  readonly name: string;
  readonly version: string;
  readonly dependencies: Readonly<Record<string, string>>;
}

interface PackageManifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly description?: unknown;
  readonly private?: unknown;
  readonly license?: unknown;
  readonly files?: unknown;
  readonly dependencies?: unknown;
  readonly publishConfig?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "string")) return undefined;
  return value as Record<string, string>;
}

export function validateReleasePackageGraph(
  packages: readonly ReleasePackage[],
): readonly string[] {
  const errors: string[] = [];
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const order = new Map(packages.map((pkg, index) => [pkg.name, index]));

  for (const [index, pkg] of packages.entries()) {
    for (const [dependency, requestedVersion] of Object.entries(pkg.dependencies)) {
      if (!dependency.startsWith("@tumblerjs/")) continue;
      const target = byName.get(dependency);
      if (target === undefined) {
        errors.push(`${pkg.name} depends on unlisted public package ${dependency}.`);
        continue;
      }
      if (requestedVersion !== target.version) {
        errors.push(`${pkg.name} requests ${dependency}@${requestedVersion}, but its release version is ${target.version}.`);
      }
      if ((order.get(dependency) ?? index) >= index) {
        errors.push(`${dependency} must be published before ${pkg.name}.`);
      }
    }
  }

  return errors;
}

export async function readReleasePackages(root: string): Promise<readonly ReleasePackage[]> {
  const errors: string[] = [];
  const packages: ReleasePackage[] = [];

  for (const directory of RELEASE_PACKAGE_DIRECTORIES) {
    const packageRoot = resolve(root, "packages", directory);
    const manifestPath = resolve(packageRoot, "package.json");
    const parsed: unknown = await Bun.file(manifestPath).json();
    if (!isRecord(parsed)) {
      errors.push(`${directory}/package.json must contain an object.`);
      continue;
    }
    const manifest: PackageManifest = parsed;
    const expectedName = `@tumblerjs/${directory}`;
    const dependencies = stringRecord(manifest.dependencies);
    const publishConfig = isRecord(manifest.publishConfig) ? manifest.publishConfig : undefined;
    const files = Array.isArray(manifest.files) ? manifest.files : [];

    if (manifest.name !== expectedName) errors.push(`${directory} must be named ${expectedName}.`);
    if (typeof manifest.version !== "string" || !/^0\.1\.0-alpha\.\d+$/.test(manifest.version)) {
      errors.push(`${expectedName} must use a 0.1.0-alpha.N version.`);
    }
    if (typeof manifest.description !== "string" || manifest.description.length === 0) {
      errors.push(`${expectedName} needs a package description.`);
    }
    if (manifest.private === true) errors.push(`${expectedName} cannot be private.`);
    if (manifest.license !== "MIT") errors.push(`${expectedName} must declare the MIT license.`);
    if (publishConfig?.access !== "public" || publishConfig.tag !== "alpha") {
      errors.push(`${expectedName} must publish publicly under the alpha tag.`);
    }
    for (const requiredFile of ["src", "README.md", "LICENSE"]) {
      if (!files.includes(requiredFile)) errors.push(`${expectedName} must include ${requiredFile} in files.`);
      if (!existsSync(resolve(packageRoot, requiredFile))) errors.push(`${expectedName} is missing ${requiredFile}.`);
    }
    if (dependencies === undefined && manifest.dependencies !== undefined) {
      errors.push(`${expectedName} dependencies must be string versions.`);
    }
    const dependencyVersions = dependencies ?? {};
    for (const [dependency, version] of Object.entries(dependencyVersions)) {
      if (dependency.startsWith("@tumblerjs/") && version.startsWith("workspace:")) {
        errors.push(`${expectedName} cannot publish workspace protocol dependency ${dependency}.`);
      }
    }

    if (typeof manifest.name === "string" && typeof manifest.version === "string") {
      packages.push({ directory, name: manifest.name, version: manifest.version, dependencies: dependencyVersions });
    }
  }

  errors.push(...validateReleasePackageGraph(packages));
  if (errors.length > 0) throw new Error(`Tumbler release validation failed:\n- ${errors.join("\n- ")}`);
  return packages;
}
