import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readReleasePackages } from "./release-packages.ts";

import { verifyPackedPackages } from "./verify-packed-packages.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packages = await readReleasePackages(root);

await verifyPackedPackages(root, packages);

for (const pkg of packages) console.log(`${pkg.name}@${pkg.version}`);
console.log(`Validated ${packages.length} public packages in dependency order.`);
