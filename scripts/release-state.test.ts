import { expect, test } from "bun:test";
import type { ReleasePackage } from "./release-packages.ts";
import { nextUnpublishedPackage } from "./release-state.ts";

const packages: readonly ReleasePackage[] = [
  { directory: "opc", name: "@tumblerjs/opc", version: "0.1.0-alpha.3", dependencies: {} },
  { directory: "ooxml", name: "@tumblerjs/ooxml", version: "0.1.0-alpha.3", dependencies: { "@tumblerjs/opc": "0.1.0-alpha.3" } },
];

test("selects only the first unpublished package in dependency order", () => {
  expect(nextUnpublishedPackage(packages, new Map())).toBe(packages[0]);
  expect(nextUnpublishedPackage(packages, new Map([
    ["@tumblerjs/opc", { published: true }],
  ]))).toBe(packages[1]);
  expect(nextUnpublishedPackage(packages, new Map([
    ["@tumblerjs/opc", { published: true }],
    ["@tumblerjs/ooxml", { published: true }],
  ]))).toBeUndefined();
});
