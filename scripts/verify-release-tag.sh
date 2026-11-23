#!/usr/bin/env bash
set -euo pipefail

tag=$1
expected_commit=$2
remote_commit="$(git ls-remote --tags origin "refs/tags/$tag^{}" | cut -f1)"

if [[ -z "$remote_commit" || "$remote_commit" != "$expected_commit" ]]; then
  printf 'Origin tag %s must point to %s. Found %s.\n' \
    "$tag" "$expected_commit" "${remote_commit:-no annotated tag}" >&2
  exit 1
fi
