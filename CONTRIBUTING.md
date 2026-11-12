# Contributing to Tumbler

Tumbler is being developed in public at an extremely early stage. Contributions
are welcome, but maintainers may substantially change or remove any API while
the document model and preservation contract are still being established.

Before proposing a large implementation, open an issue describing the problem,
the relevant OOXML requirements, and the intended compatibility behavior. Small
bug fixes, focused tests, and documentation corrections can go directly to a
pull request.

## Development

Tumbler requires Bun 1.3 or newer.

```sh
bun install
bun run check
bun test
```

Keep changes narrow and typesafe. Tests should exercise observable behavior,
preservation, standards requirements, or consumer compatibility rather than
implementation details. Format-specific behavior belongs in its format package;
shared layers must not acquire shortcuts for one document type.

## Documents and fixtures

Do not submit confidential, customer, or personally identifying documents.
Only contribute fixtures that you created or have clear permission to
redistribute. State their origin and license in the pull request. Prefer small,
purpose-built fixtures that isolate one behavior.

Standards documents and other restricted reference material must not be added to
the repository. The project keeps its local reference archive ignored for this
reason.

## Compatibility claims

Do not describe a format or feature as supported solely because one generated
fixture passes. Compatibility claims need focused tests, preservation evidence,
and—where applicable—validation or round trips through independent Office
consumers.

By contributing, you agree that your contribution is licensed under the MIT
License in this repository.

## Alpha releases

Public packages use one exact lockstep version. Version bumps are committed
manifest changes; `release:next` and `release:publish` do not bump versions.
Update every public package version and every internal reference in
`dependencies`, `optionalDependencies`, `peerDependencies`, and `devDependencies`.
This includes optional peers declared through `peerDependenciesMeta`.
Internal dev dependencies may use `workspace:*`; Bun replaces that with the
workspace package's exact version when packing. Keep external dependency ranges
unchanged unless the release requires an update.

Run `bun run release:verify` after editing manifests. It checks the source graph,
packs all public packages, and checks the resulting manifests, including dev
references rewritten by Bun. It rejects stale internal versions and unresolved
workspace references in archives. The same source validation runs before the
publisher selects a package, and qualification runs the packed checks before
stamping a commit.


Releases are maintainer-operated while npm requires web authentication for each package.

After committing a release candidate, qualify the exact packed artifacts against
Tumbler and the local Kryptonote checkout:

```sh
bun run release:qualify /path/to/consumer
```

Use the consumer checkout path explicitly when it differs from the historical
default, or set `TUMBLER_CONSUMER_ROOT`. Also run `bun run docs:check` and
`bun run docs:build` when preparing release documentation.

Qualification validates package metadata, runs Tumbler's checks and tests, verifies each
tarball contains its README, license, manifest, and source entry point, mounts
the packed packages in Kryptonote, and runs Kryptonote's frontend check. A
successful run records the qualified commit locally.

Push that exact commit to `origin/main`, then inspect the registry plan:

```sh
bun run release:next
```

Publish exactly one package at a time:

```sh
bun run release:publish
```

The publish command uses npm's URL-based web authentication and exits after one
package. Rerun it after each successful authentication. Already-published
packages are detected from the registry and skipped, so an interrupted release
resumes safely in dependency order. Every publish explicitly uses the `latest`
distribution tag.
