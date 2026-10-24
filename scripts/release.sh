#!/bin/bash
#
# Cut a release: build the app, sign the update, and put it where the app looks.
#
#   bash scripts/release.sh 0.2.0 "What changed, in a sentence or two."
#
# Taken from Tzz's (../yt-mp3/scripts/release.sh), which explains the why of
# most of it at more length. What differs here:
#
#   - The key is ~/.tauri/fokus.key, and it has no password. Its public half is
#     plugins.updater.pubkey in src-tauri/tauri.conf.json; the app trusts that
#     key and no other. A replacement is made like this, and its public half
#     then goes into that file:
#
#       npx tauri signer generate -w ~/.tauri/fokus.key -p "" -f --ci
#
#   - The build is universal (Apple Silicon and Intel): nothing here is
#     arm64-only, and the Mac it is for may be either.
#
#   - Updater artifacts are asked for here rather than in tauri.conf.json, so a
#     plain local build (npx tauri build --bundles app) needs no key.
#
#   - Only the version bump is committed: the repo is public, and whatever else
#     is lying in the working tree is not this script's to publish.
#
# The app is not signed by Apple, so the first open of the .dmg's app needs
# System Settings -> Privacy & Security -> Open Anyway (right-click -> Open
# before macOS 15). The release page also gives a Terminal line that installs
# without that (see the body below). Updates after that install without asking.

set -euo pipefail
cd "$(dirname "$0")/.."

version="${1:-}"
notes="${2:-A new version.}"

if [ -z "$version" ]; then
  echo "usage: bash scripts/release.sh <version> [notes]"
  exit 1
fi

# The version file may already be bumped by a run that fell over: that is fine.
if [ -n "$(git status --porcelain --untracked-files=no -- . ':!src-tauri/tauri.conf.json')" ]; then
  echo "There are uncommitted changes. Commit them first; a release is built"
  echo "from what is committed, and only the version bump is added here."
  exit 1
fi

key="$HOME/.tauri/fokus.key"
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  if [ ! -f "$key" ]; then
    echo "No signing key at $key. Make one, once:"
    echo "  npx tauri signer generate -w ~/.tauri/fokus.key -p \"\" -f --ci"
    exit 1
  fi
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$key")"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
fi

repo="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
if [ -z "$repo" ]; then
  echo "This checkout has no GitHub repo. Create one, push, then run this again."
  exit 1
fi

# The version the app reports, and the one an update is compared against.
python3 - "$version" <<'PY'
import collections, json, sys
path = "src-tauri/tauri.conf.json"
conf = json.load(open(path), object_pairs_hook=collections.OrderedDict)
conf["version"] = sys.argv[1]
json.dump(conf, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY

echo "== build"
npx tauri build --target universal-apple-darwin --bundles app,dmg \
  --config '{"bundle":{"createUpdaterArtifacts":true}}'

bundle="src-tauri/target/universal-apple-darwin/release/bundle"
archive="$(ls "$bundle"/macos/*.app.tar.gz 2>/dev/null | head -1)"
dmg="$(ls "$bundle"/dmg/*"_${version}_"*.dmg 2>/dev/null | head -1)"
if [ -z "$archive" ] || [ ! -f "$archive.sig" ]; then
  echo "No signed updater archive was produced. Is the signing key right?"
  exit 1
fi
if [ -z "$dmg" ]; then
  echo "No .dmg for $version was produced."
  exit 1
fi

# The release page: the notes, then how to install without macOS stopping the
# first open. A browser download is quarantined, and an app Apple has not
# notarised is refused until System Settings overrides it; curl sets no
# quarantine, so nothing is asked. latest.json keeps the bare notes: the app
# shows those in its update notice.
install="https://github.com/$repo/releases/latest/download/$(basename "$archive")"
body="$(cat <<EOF
$notes

## Install

Paste this into Terminal (Fokus quit, if it is already installed):

\`\`\`
curl -fsSL $install | tar -xz -C /Applications && open /Applications/Fokus.app
\`\`\`

Installed that way, Fokus opens straight away. The .dmg below works too, but Fokus is not signed by Apple, so macOS stops its first open with "Fokus Not Opened". To let it through, paste this into Terminal once:

\`\`\`
xattr -dr com.apple.quarantine /Applications/Fokus.app
\`\`\`

or open System Settings → Privacy & Security → Open Anyway. Updates arrive inside the app after that.
EOF
)"

echo "== release v$version"
git add src-tauri/tauri.conf.json
git commit -qm "Version $version" || true
git tag -f "v$version"
git push -q origin HEAD
git push -q -f origin "v$version"

# Re-runnable: a release that fell over halfway is mended by running this
# again. The archive and its signature go up together.
if gh release view "v$version" > /dev/null 2>&1; then
  echo "   v$version exists; replacing what it holds"
  gh release edit "v$version" --title "Fokus $version" --notes "$body" > /dev/null
  gh release upload "v$version" "$archive" "$archive.sig" "$dmg" --clobber
else
  gh release create "v$version" --title "Fokus $version" --notes "$body" \
    "$archive" "$archive.sig" "$dmg"
fi

# The manifest names the archive as GitHub serves it, which is only known
# after the upload: GitHub renames what it is given.
url="$(gh release view "v$version" --json assets \
  -q '.assets[] | select(.name | endswith(".app.tar.gz")) | .url')"
if [ -z "$url" ]; then
  echo "The release has no .app.tar.gz asset. Nothing to point the manifest at."
  exit 1
fi

# One universal archive serves both kinds of Mac.
python3 - "$version" "$notes" "$url" "$archive" <<'MANIFEST'
import datetime, json, sys
version, notes, url, archive = sys.argv[1:5]
entry = {"signature": open(archive + ".sig").read().strip(), "url": url}
json.dump({
    "version": version,
    "notes": notes,
    "pub_date": datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "platforms": {"darwin-aarch64": entry, "darwin-x86_64": entry},
}, open("latest.json", "w"), indent=2)
MANIFEST

gh release upload "v$version" latest.json --clobber
rm -f latest.json

echo
echo "== check"

# This release's own manifest, not whatever /latest points at this second.
here="$(mktemp -d)"
gh release download "v$version" -p latest.json -D "$here" --clobber > /dev/null

got="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["platforms"]["darwin-aarch64"]["url"])' "$here/latest.json")"
code="$(curl -sIL -o /dev/null -w '%{http_code}' "$got")"
echo "   archive:  $got"
echo "   fetching it says: $code"
[ "$code" = 200 ] || { echo "   that is not a download. The update would fail."; exit 1; }

if ! python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1]))["platforms"]["darwin-aarch64"]["signature"] == open(sys.argv[2]).read().strip() else 1)' \
    "$here/latest.json" "$archive.sig"; then
  echo "   the manifest's signature is not this build's. The app would refuse it."
  exit 1
fi
echo "   signature:  matches this build"
rm -rf "$here"

# And the address the app is actually given, once GitHub agrees this is the
# newest release.
manifest="https://github.com/$repo/releases/latest/download/latest.json"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  serving="$(curl -fsSL "$manifest" 2> /dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])' 2> /dev/null || true)"
  [ "$serving" = "$version" ] && break
  sleep 3
done
echo "   $manifest serves: ${serving:-nothing yet}"
if [ "$serving" != "$version" ]; then
  echo "   GitHub still calls an older release the newest. It usually catches up;"
  echo "   if it does not, the release is there but the app will not see it."
  exit 1
fi

echo
echo "Done. The .dmg is on https://github.com/$repo/releases/tag/v$version"
echo "and installed copies will offer the update the next time they start."
