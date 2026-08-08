import type { ReleasePackage } from "./release-packages.ts";

export interface RegistryPackageState {
  readonly published: boolean;
  readonly alphaTag?: string;
  readonly latestTag?: string;
}

export function nextUnpublishedPackage(
  packages: readonly ReleasePackage[],
  registry: ReadonlyMap<string, RegistryPackageState>,
): ReleasePackage | undefined {
  return packages.find((pkg) => registry.get(pkg.name)?.published !== true);
}
