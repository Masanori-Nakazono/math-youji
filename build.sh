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
<link rel="apple-touch-icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%23FBF4E9'/%3E%3Ctext x='50' y='72' font-size='62' text-anchor='middle'%3E%F0%9F%94%A2%3C/text%3E%3C/svg%3E">
HEAD
  cat src/head.html
  echo '<style>html,body{margin:0;padding:0}img{max-width:100%}[hidden]{display:none!important}</style>'
  echo '<style>'; cat src/styles.css; echo '</style>'
  echo '</head>'
  echo '<body>'
  cat src/body.html
  echo '<script>'; sed 's|</script>|<\\/script>|g' "$TMP/bundle.js"; echo '</script>'
  echo '</body></html>'
} > dist/kazu-no-bouken.html

printf 'built:\n  dist/artifact.html          %s\n  dist/kazu-no-bouken.html    %s\n' \
  "$(wc -c < dist/artifact.html | tr -d ' ') bytes" \
  "$(wc -c < dist/kazu-no-bouken.html | tr -d ' ') bytes"
