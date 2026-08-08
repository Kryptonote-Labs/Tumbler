import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readReleasePackages, validateReleasePackageGraph, type ReleasePackage } from "./release-packages.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("public package release graph", () => {
  test("accepts the repository's publish manifests and required files", async () => {
    const packages = await readReleasePackages(root);
    expect(packages.map((pkg) => pkg.name)).toEqual([
      "@tumblerjs/opc",
      "@tumblerjs/ooxml",
      "@tumblerjs/formulas",
      "@tumblerjs/charts",
      "@tumblerjs/core",
      "@tumblerjs/sheets",
      "@tumblerjs/svelte",
    ]);
  });

  test("rejects internal version drift and reversed dependency order", () => {
    const packages: readonly ReleasePackage[] = [
      { directory: "sheets", name: "@tumblerjs/sheets", version: "0.1.0-alpha.2", dependencies: { "@tumblerjs/opc": "0.1.0-alpha.1" } },
      { directory: "opc", name: "@tumblerjs/opc", version: "0.1.0-alpha.0", dependencies: {} },
    ];

    expect(validateReleasePackageGraph(packages)).toEqual([
      "@tumblerjs/sheets requests @tumblerjs/opc@0.1.0-alpha.1, but its release version is 0.1.0-alpha.0.",
      "@tumblerjs/opc must be published before @tumblerjs/sheets.",
    ]);
  });
});
