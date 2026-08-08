import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readReleasePackages, type ReleasePackage } from "./release-packages.ts";
import { nextUnpublishedPackage, type RegistryPackageState } from "./release-state.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const confirm = process.argv.includes("--confirm");
const decoder = new TextDecoder();

function git(...args: readonly string[]): string {
  const process = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (process.exitCode !== 0) throw new Error(decoder.decode(process.stderr).trim() || `git ${args.join(" ")} failed.`);
  return decoder.decode(process.stdout).trim();
}

function registryPackageUrl(name: string, version?: string): string {
  const base = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  return version === undefined ? base : `${base}/${encodeURIComponent(version)}`;
}

async function registryState(pkg: ReleasePackage): Promise<RegistryPackageState> {
  const versionResponse = await fetch(registryPackageUrl(pkg.name, pkg.version), {
    headers: { accept: "application/json" },
  });
  if (versionResponse.status !== 200 && versionResponse.status !== 404) {
    throw new Error(`Registry returned HTTP ${versionResponse.status} for ${pkg.name}@${pkg.version}.`);
  }

  const packageResponse = await fetch(registryPackageUrl(pkg.name), {
    headers: { accept: "application/json" },
  });
  if (!packageResponse.ok) throw new Error(`Registry returned HTTP ${packageResponse.status} for ${pkg.name}.`);
  const metadata: unknown = await packageResponse.json();
  const tags = typeof metadata === "object" && metadata !== null && "dist-tags" in metadata
    ? (metadata as { readonly "dist-tags"?: unknown })["dist-tags"]
    : undefined;
  const tagRecord = typeof tags === "object" && tags !== null ? tags as Record<string, unknown> : {};

  return {
    published: versionResponse.ok,
    ...(typeof tagRecord.alpha === "string" ? { alphaTag: tagRecord.alpha } : {}),
    ...(typeof tagRecord.latest === "string" ? { latestTag: tagRecord.latest } : {}),
  };
}

async function readRegistry(packages: readonly ReleasePackage[]): Promise<ReadonlyMap<string, RegistryPackageState>> {
  const states = await Promise.all(packages.map(async (pkg) => [pkg.name, await registryState(pkg)] as const));
  return new Map(states);
}

function requireQualifiedCommit(): void {
  if (git("status", "--porcelain") !== "") throw new Error("Commit or restore all Tumbler changes before publishing.");
  if (git("branch", "--show-current") !== "main") throw new Error("Publish Tumbler packages only from main.");
  const head = git("rev-parse", "HEAD");
  if (git("rev-parse", "origin/main") !== head) throw new Error("Push the qualified commit to origin/main before publishing.");
  let qualified = "";
  try {
    qualified = git("config", "--local", "--get", "tumbler.release-qualified");
  } catch {
    // A missing qualification stamp is reported below with the same recovery.
  }
  if (qualified !== head) throw new Error("Run `bun run release:qualify` for this exact commit before publishing.");
}

const packages = await readReleasePackages(root);
const registry = await readRegistry(packages);
for (const pkg of packages) {
  const state = registry.get(pkg.name)!;
  const status = state.published ? "published" : "pending";
  console.log(`${status.padEnd(9)} ${pkg.name}@${pkg.version} (alpha: ${state.alphaTag ?? "none"}, latest: ${state.latestTag ?? "none"})`);
}

const next = nextUnpublishedPackage(packages, registry);
if (next === undefined) {
  console.log("Every package in this release is published.");
  process.exit(0);
}

console.log(`Next package: ${next.name}@${next.version}`);
if (!confirm) {
  console.log("Run `bun run release:publish` to publish this one package with npm web authentication.");
  process.exit(0);
}

requireQualifiedCommit();
const publish = Bun.spawn([
  process.execPath,
  "publish",
  "--cwd",
  resolve(root, "packages", next.directory),
  "--access",
  "public",
  "--tag",
  "alpha",
  "--auth-type",
  "web",
], { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
const exitCode = await publish.exited;
if (exitCode !== 0) process.exit(exitCode);

console.log(`Published ${next.name}@${next.version}. Rerun the command for the next package.`);
