#!/bin/sh
# Vercel skips the build on exit 0 and builds on exit 1.
[ "${VERCEL_ENV:-}" = preview ] || exit 1
cd "$(git rev-parse --show-toplevel)" || exit 1

# Compare against the last successful deployment on this branch when available.
# A new branch has no deployment SHA, so compare its latest commit instead.
base=${VERCEL_GIT_PREVIOUS_SHA:-}
case "$base" in
  ''|*[!0-9a-fA-F]*) base='HEAD^' ;;
esac
if ! git rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
  # Missing shallow history must not silently suppress a docs preview.
  exit 1
fi
if git diff --quiet "$base" HEAD -- apps/docs; then
  echo 'Skipping preview: apps/docs is unchanged.'
  exit 0
fi
exit 1
