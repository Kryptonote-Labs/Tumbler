#!/usr/bin/env bash

set -euo pipefail

repository_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
consumer_root=${1:-${TUMBLER_CONSUMER_ROOT:-"$repository_root/../../Kryptonote/Kn-Frontend"}}
packages=(opc ooxml formulas charts core sheets svelte)
archive_root=$(mktemp -d)
consumer_modules="$consumer_root/node_modules/@tumblerjs"
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
for index in "${!packages[@]}"; do
  package=${packages[$index]}
  mounted_package="$consumer_modules/$package"
  mkdir -p -- "$mounted_package"
  tar -xzf "${archives[$index]}" -C "$mounted_package" --strip-components=1

  # Packed packages do not contain dependencies. Mount the workspace's resolved
  # external dependencies while the packed @tumblerjs graph occupies the scope.
  source_modules="$repository_root/packages/$package/node_modules"
  if [[ -d "$source_modules" ]]; then
    for dependency in "$source_modules"/*; do
      if [[ ! -L "$dependency" ]]; then
        continue
      fi
      mkdir -p -- "$mounted_package/node_modules"
      ln -s -- "$(readlink -f -- "$dependency")" "$mounted_package/node_modules/${dependency##*/}"
    done
  fi
done

bun run --cwd "$consumer_root" check
git -C "$repository_root" config --local tumbler.release-qualified "$(git -C "$repository_root" rev-parse HEAD)"
printf 'All public package tarballs passed Tumbler and consumer qualification.\n'
