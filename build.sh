#!/usr/bin/env bash
# かずのぼうけん — bundle src/ into two single-file builds.
set -euo pipefail
cd "$(dirname "$0")"

# numeric prefixes give the load order; globbing means a new src/js file can never
# be silently left out of the bundle
JS_FILES=()
while IFS= read -r f; do JS_FILES+=("$f"); done < <(ls src/js/*.js | sort)

mkdir -p dist
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

{
  echo "(function(){"
  for f in "${JS_FILES[@]}"; do
    echo "/* ---- $(basename "$f") ---- */"
    cat "$f"
    echo
  done
  echo "})();"
} > "$TMP/bundle.js"

# fail the build on a syntax error rather than shipping a blank page
if command -v node >/dev/null 2>&1; then
  node --check "$TMP/bundle.js"
fi

# ---- 1. Artifact build: body-level content only (host supplies doctype/head/body)
{
  cat src/head.html
  echo '<style>'; cat src/styles.css; echo '</style>'
  cat src/body.html
  echo '<script>'; sed 's|</script>|<\\/script>|g' "$TMP/bundle.js"; echo '</script>'
} > dist/artifact.html

# ---- 2. Standalone build: a complete document to save on the iPad / host anywhere
{
  cat <<'HEAD'
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="かずのぼうけん">
<meta name="theme-color" content="#FBF4E9">
<meta name="description" content="小学校入学前の算数の土台を、タップして遊びながら身につけるアプリ。">
<link rel="manifest" href="manifest.webmanifest">
HEAD
  # iOS ignores an SVG apple-touch-icon, so the real PNG goes in as a data URI:
  # the AirDropped single file then has a proper icon with nothing to fetch.
  printf '<link rel="apple-touch-icon" href="data:image/png;base64,%s">\n' \
    "$(base64 < src/icon-180.png | tr -d '\n')"
  cat src/head.html
  echo '<style>html,body{margin:0;padding:0}img{max-width:100%}[hidden]{display:none!important}</style>'
  echo '<style>'; cat src/styles.css; echo '</style>'
  echo '</head>'
  echo '<body>'
  cat src/body.html
  echo '<script>'; sed 's|</script>|<\\/script>|g' "$TMP/bundle.js"; echo '</script>'
  echo '</body></html>'
} > dist/kazu-no-bouken.html

# ---- 3. the extras a hosted copy needs: installable, and openable with no network
sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi; }
# stamping the cache name with the build makes a deploy replace the old cache
VERSION="$(sha dist/kazu-no-bouken.html | cut -c1-12)"
sed "s/__VERSION__/$VERSION/" src/sw.js > dist/sw.js
cp src/manifest.webmanifest dist/manifest.webmanifest
cp src/icon-180.png src/icon-192.png src/icon-512.png dist/

printf 'built:\n  dist/artifact.html          %s\n  dist/kazu-no-bouken.html    %s\n  dist/sw.js                  cache %s\n  dist/manifest.webmanifest + icon-180/192/512.png\n' \
  "$(wc -c < dist/artifact.html | tr -d ' ') bytes" \
  "$(wc -c < dist/kazu-no-bouken.html | tr -d ' ') bytes" \
  "$VERSION"
