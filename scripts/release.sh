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
#   - Windows is built by GitHub, from the tag pushed here (.github/workflows/
#     windows.yml, so run this from a branch that has it), since no Mac can
#     build it. Its installer is signed here: the key never goes to GitHub. On
#     Windows the updater downloads that installer and runs it.
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

## On a Mac

Paste this into Terminal (Fokus quit, if it is already installed):

\`\`\`
curl -fsSL $install | tar -xz -C /Applications && open /Applications/Fokus.app
\`\`\`

Installed that way, Fokus opens straight away. The .dmg below works too, but Fokus is not signed by Apple, so macOS stops its first open with "Fokus Not Opened". To let it through, paste this into Terminal once:

\`\`\`
xattr -dr com.apple.quarantine /Applications/Fokus.app
\`\`\`

or open System Settings → Privacy & Security → Open Anyway. Updates arrive inside the app after that.

## On Windows

Download Fokus_${version}_x64-setup.exe below and open it. Fokus is not signed by Microsoft either, so Windows may stop it with "Windows protected your PC": choose More info → Run anyway. It installs for you alone, with no administrator asked for, and updates arrive inside the app after that.
EOF
)"

echo "== release v$version"
git add src-tauri/tauri.conf.json
git commit -qm "Version $version" || true
git tag -f "v$version"
git push -q origin HEAD
git push -q -f origin "v$version"

# The tag starts GitHub's Windows build of this very commit. The release is
# made once that is in, so it never stands there with the Mac's half alone.
echo "== windows"
sha="$(git rev-parse HEAD)"
run=""
for _ in $(seq 1 20); do
  run="$(gh run list --workflow windows.yml --event push --limit 20 \
    --json databaseId,headSha -q ".[] | select(.headSha == \"$sha\") | .databaseId" | head -1)"
  [ -n "$run" ] && break
  sleep 3
done
if [ -z "$run" ]; then
  echo "   GitHub started no Windows build for $sha. Has this branch windows.yml?"
  exit 1
fi
echo "   waiting for https://github.com/$repo/actions/runs/$run"
if ! gh run watch "$run" --exit-status --interval 30 > /dev/null; then
  echo "   the Windows build failed; nothing is released. Mend it, or rerun it"
  echo "   (gh run rerun $run), then run this again."
  exit 1
fi
win="$(mktemp -d)"
gh run download "$run" -n installer -D "$win"
setup="$win/Fokus_${version}_x64-setup.exe"
if [ ! -f "$setup" ]; then
  echo "   the Windows build made no installer for $version: $(ls "$win")"
  exit 1
fi
# Bound to the version, as tauri build binds the Mac's.
npx tauri signer sign --app-version "$version" "$setup" > /dev/null
if [ ! -f "$setup.sig" ]; then
  echo "   the Windows installer could not be signed. Is the signing key right?"
  exit 1
fi

# Re-runnable: a release that fell over halfway is mended by running this
# again. Each update and its signature go up together.
if gh release view "v$version" > /dev/null 2>&1; then
  echo "   v$version exists; replacing what it holds"
  gh release edit "v$version" --title "Fokus $version" --notes "$body" > /dev/null
  gh release upload "v$version" "$archive" "$archive.sig" "$dmg" "$setup" "$setup.sig" --clobber
else
  gh release create "v$version" --title "Fokus $version" --notes "$body" \
    "$archive" "$archive.sig" "$dmg" "$setup" "$setup.sig"
fi

# The manifest names the archive as GitHub serves it, which is only known
# after the upload: GitHub renames what it is given.
url="$(gh release view "v$version" --json assets \
  -q '.assets[] | select(.name | endswith(".app.tar.gz")) | .url')"
win_url="$(gh release view "v$version" --json assets \
  -q '.assets[] | select(.name | endswith("-setup.exe")) | .url')"
if [ -z "$url" ] || [ -z "$win_url" ]; then
  echo "The release lacks its .app.tar.gz or its -setup.exe. Nothing to point the manifest at."
  exit 1
fi

# One universal archive serves both kinds of Mac.
python3 - "$version" "$notes" "$url" "$archive" "$win_url" "$setup" <<'MANIFEST'
import datetime, json, sys
version, notes, url, archive, win_url, setup = sys.argv[1:7]
mac = {"signature": open(archive + ".sig").read().strip(), "url": url}
windows = {"signature": open(setup + ".sig").read().strip(), "url": win_url}
json.dump({
    "version": version,
    "notes": notes,
    "pub_date": datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "platforms": {"darwin-aarch64": mac, "darwin-x86_64": mac, "windows-x86_64": windows},
}, open("latest.json", "w"), indent=2)
MANIFEST

gh release upload "v$version" latest.json --clobber
rm -f latest.json

echo
echo "== check"

# This release's own manifest, not whatever /latest points at this second.
here="$(mktemp -d)"
gh release download "v$version" -p latest.json -D "$here" --clobber > /dev/null

# Each platform's update: there to download, and signed as this build.
check() {
  local platform="$1" built="$2" got code
  got="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["platforms"][sys.argv[2]]["url"])' "$here/latest.json" "$platform")"
  code="$(curl -sIL -o /dev/null -w '%{http_code}' "$got")"
  echo "   $platform:  $got"
  echo "   fetching it says: $code"
  [ "$code" = 200 ] || { echo "   that is not a download. The update would fail."; exit 1; }
  if ! python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1]))["platforms"][sys.argv[2]]["signature"] == open(sys.argv[3]).read().strip() else 1)' \
      "$here/latest.json" "$platform" "$built.sig"; then
    echo "   the manifest's signature is not this build's. The app would refuse it."
    exit 1
  fi
  echo "   signature:  matches this build"
}
check darwin-aarch64 "$archive"
check windows-x86_64 "$setup"
rm -rf "$here" "$win"

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
echo "Done. The .dmg and the Windows installer are on https://github.com/$repo/releases/tag/v$version"
echo "and installed copies will offer the update the next time they start."
