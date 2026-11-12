#!/usr/bin/env bash

set -euo pipefail

repository_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
consumer_root=${1:-${TUMBLER_CONSUMER_ROOT:-"$repository_root/../../Kryptonote/Kn-Frontend"}}
packages=(opc ooxml ink formulas charts core sheets word slides pdf svelte cli)
archive_root=$(mktemp -d)
consumer_workspace="$consumer_root"
if [[ -f "$consumer_root/apps/web/package.json" ]]; then
  consumer_workspace="$consumer_root/apps/web"
fi
consumer_modules="$consumer_workspace/node_modules/@tumblerjs"
# Workspace consumers may also import source helpers through their vendor path.
# Replace that single package root so direct imports and package aliases share
# the same class identities. The exit trap restores the original vendor tree.
if [[ -d "$consumer_root/vendor/tumbler/packages" ]]; then
  consumer_modules="$consumer_root/vendor/tumbler/packages"
fi
consumer_modules_backup="$archive_root/consumer-registry-packages"
consumer_modules_mounted=false

restore() {
  local result=$?
  if [[ $consumer_modules_mounted == true ]]; then
    if [[ -d "$consumer_modules" ]]; then
      mv -- "$consumer_modules" "$archive_root/consumer-qualified-packages"
    fi
    mv -- "$consumer_modules_backup" "$consumer_modules"
  fi
  rm -rf -- "$archive_root"
  exit "$result"
}
trap restore EXIT

if [[ ! -f "$consumer_root/package.json" || ! -f "$consumer_root/bun.lock" ]]; then
  printf 'Consumer must contain package.json and bun.lock: %s\n' "$consumer_root" >&2
  exit 1
fi
if [[ ! -d "$consumer_modules" ]]; then
  printf 'Install the consumer dependencies before qualification: %s\n' "$consumer_root" >&2
  exit 1
fi
if [[ -n $(git -C "$repository_root" status --porcelain) ]]; then
  printf 'Commit or restore all Tumbler changes before release qualification.\n' >&2
  exit 1
fi

cd -- "$repository_root"
bun run release:verify
bun run check
bun test

archives=()
for package in "${packages[@]}"; do
  archive=$(bun pm pack --cwd "packages/$package" --destination "$archive_root" --quiet | tail -n 1)
  if [[ $archive != /* ]]; then
    archive="$archive_root/$archive"
  fi
  if [[ ! -f "$archive" ]]; then
    printf 'Bun did not create the expected archive: %s\n' "$archive" >&2
    exit 1
  fi
  tar -tzf "$archive" | grep -Fx 'package/README.md' >/dev/null
  tar -tzf "$archive" | grep -Fx 'package/LICENSE' >/dev/null
  tar -tzf "$archive" | grep -Fx 'package/package.json' >/dev/null
  tar -tzf "$archive" | grep -Fx 'package/src/index.ts' >/dev/null
  archives+=("$archive")
  printf 'Qualified package contents: @tumblerjs/%s\n' "$package"
done

mv -- "$consumer_modules" "$consumer_modules_backup"
mkdir -p -- "$consumer_modules"
consumer_modules_mounted=true
# Vendor roots are outside node_modules, so provide one shared package lookup.
mkdir -p -- "$consumer_modules/node_modules/@tumblerjs"
for package in "${packages[@]}"; do
  ln -s -- "$consumer_modules/$package" "$consumer_modules/node_modules/@tumblerjs/$package"
done
for index in "${!packages[@]}"; do
  package=${packages[$index]}
  mounted_package="$consumer_modules/$package"
  mkdir -p -- "$mounted_package"
  tar -xzf "${archives[$index]}" -C "$mounted_package" --strip-components=1

  # Packed packages omit dependencies. Mount each external dependency by its
  # manifest name so scoped packages and their type declarations resolve too.
  source_package="$repository_root/packages/$package"
  mapfile -t dependencies < <(bun -e 'const p = await Bun.file(process.argv[1]).json(); for (const name of Object.keys({ ...p.dependencies, ...p.peerDependencies })) if (!name.startsWith("@tumblerjs/")) console.log(name)' "$source_package/package.json")
  for dependency_name in "${dependencies[@]}"; do
    dependency_source="$source_package/node_modules/$dependency_name"
    # Resolve peers from the consumer, as a normal package installation does.
    if bun -e 'const p = await Bun.file(process.argv[1]).json(); process.exit(Object.hasOwn(p.peerDependencies ?? {}, process.argv[2]) ? 0 : 1)' "$source_package/package.json" "$dependency_name"; then
      dependency_source="$consumer_workspace/node_modules/$dependency_name"
    fi
    if [[ ! -d "$dependency_source" ]]; then
      printf 'Install dependency %s before qualification: %s\n' "$dependency_name" "$dependency_source" >&2
      exit 1
    fi
    mkdir -p -- "$(dirname -- "$mounted_package/node_modules/$dependency_name")"
    ln -s -- "$(readlink -f -- "$dependency_source")" "$mounted_package/node_modules/$dependency_name"
  done

done

bun run --cwd "$consumer_workspace" check
git -C "$repository_root" config --local tumbler.release-qualified "$(git -C "$repository_root" rev-parse HEAD)"
printf 'All public package tarballs passed Tumbler and consumer qualification.\n'
