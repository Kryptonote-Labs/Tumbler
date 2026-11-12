import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { readReleasePackages, type ReleasePackage } from "./release-packages.ts";

/** Check Bun's published manifests, including rewritten workspace dev dependencies. */
export async function verifyPackedPackages(root: string, packages: readonly ReleasePackage[]): Promise<void> {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "tumbler-release-"));
  try {
    for (const pkg of packages) {
      const archive = resolve(temporaryRoot, `${pkg.directory}.tgz`);
      const packedRoot = resolve(temporaryRoot, "packages", pkg.directory);
      await mkdir(packedRoot, { recursive: true });
      for (const command of [
        [process.execPath, "pm", "pack", "--cwd", resolve(root, "packages", pkg.directory), "--filename", archive, "--quiet"],
        ["tar", "-xzf", archive, "-C", packedRoot, "--strip-components=1"],
      ]) {
        const result = Bun.spawnSync(command, { cwd: root, stdout: "pipe", stderr: "pipe" });
        if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
      }
    }
    await readReleasePackages(temporaryRoot, { packed: true });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
