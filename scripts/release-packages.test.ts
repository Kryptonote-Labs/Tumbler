import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPackedPackages } from "./verify-packed-packages.ts";
import { readReleasePackages, validateReleasePackageGraph, type ReleasePackage } from "./release-packages.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("public package release graph", () => {
  test("accepts the repository's publish manifests and required files", async () => {
    const packages = await readReleasePackages(root);
    await verifyPackedPackages(root, packages);
    expect(packages.map((pkg) => pkg.name)).toEqual([
      "@tumblerjs/opc",
      "@tumblerjs/ooxml",
      "@tumblerjs/ink",
      "@tumblerjs/formulas",
      "@tumblerjs/charts",
      "@tumblerjs/core",
      "@tumblerjs/sheets",
      "@tumblerjs/word",
      "@tumblerjs/slides",
      "@tumblerjs/pdf",
      "@tumblerjs/svelte",
      "@tumblerjs/cli",
    ]);
  });

  test("rejects internal version drift and reversed dependency order", () => {
    const packages: readonly ReleasePackage[] = [
      { directory: "sheets", name: "@tumblerjs/sheets", version: "0.1.0-alpha.0", dependencies: { "@tumblerjs/opc": "0.1.0-alpha.1" } },
      { directory: "opc", name: "@tumblerjs/opc", version: "0.1.0-alpha.0", dependencies: {} },
    ];

    expect(validateReleasePackageGraph(packages)).toEqual([
      "@tumblerjs/sheets dependencies requests @tumblerjs/opc@0.1.0-alpha.1, but its release version is 0.1.0-alpha.0.",
      "@tumblerjs/opc must be published before @tumblerjs/sheets.",
    ]);
  });
});

describe("internal dependency versions", () => {
  const target: ReleasePackage = { directory: "slides", name: "@tumblerjs/slides", version: "0.1.0-alpha.27", dependencies: {} };
  const consumer: ReleasePackage = { directory: "svelte", name: "@tumblerjs/svelte", version: target.version, dependencies: {} };

  test.each(["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"] as const)("rejects stale internal %s", (field) => {
    const errors = validateReleasePackageGraph([target, { ...consumer, [field]: { [target.name]: "0.1.0-alpha.23" } }]);
    expect(errors).toEqual([`${consumer.name} ${field} requests ${target.name}@0.1.0-alpha.23, but its release version is ${target.version}.`]);
  });

  test("accepts external ranges and workspace dev dependencies only before packing", () => {
    const packages = [target, {
      ...consumer,
      peerDependencies: { [target.name]: target.version, svelte: "^5.0.0", yjs: "^13.6.0" },
      devDependencies: { [target.name]: "workspace:*", svelte: "^5.0.0" },
    }];
    expect(validateReleasePackageGraph(packages)).toEqual([]);
    expect(validateReleasePackageGraph(packages, { packed: true })).toHaveLength(1);
    expect(validateReleasePackageGraph([target, {
      ...packages[1]!, devDependencies: { [target.name]: target.version },
    }], { packed: true })).toEqual([]);
  });

  test("rejects unlisted internal peers and workspace runtime dependencies", () => {
    expect(validateReleasePackageGraph([{
      ...consumer, dependencies: { [target.name]: "workspace:*" },
      peerDependencies: { "@tumblerjs/missing": target.version },
    }, target])).toHaveLength(3);
  });
});
