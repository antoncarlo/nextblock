#!/usr/bin/env bash
#
# POST a scheduled-job endpoint, distinguishing "our app is broken" from
# "the chain endpoint had a bad minute".
#
# The refresh endpoints are idempotent and high-water-marked: a run that cannot
# reach the chain loses nothing, because the next tick repeats the work. So an
# upstream outage is reported and tolerated, while any other failure still
# fails the step.
#
# The app marks the difference itself — a transient upstream error comes back as
# HTTP 503 with `"transient":true` in the body. Anything else is ours.
#
# Usage: cron-post.sh <url> <cron-secret>

set -uo pipefail

url="${1:?url required}"
secret="${2:?cron secret required}"

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

code="$(
  curl -sS -X POST \
    --max-time 60 --retry 2 --retry-delay 5 \
    -H "Authorization: Bearer ${secret}" \
    -o "$body_file" -w '%{http_code}' \
    "$url"
)" || {
  echo "::error::${url} — curl could not complete the request."
  cat "$body_file" || true
  exit 1
}

body="$(cat "$body_file")"

if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
  echo "${url} -> ${code}"
  echo "$body"
  exit 0
fi

# Transient upstream: the chain endpoint, not the app. Next run picks it up.
# The whitespace is deliberately loose: JSON.stringify emits no space after the
# colon, but nothing guarantees the next serialiser agrees, and a marker that
# depends on formatting is a marker that will silently stop matching one day.
if [ "$code" = "503" ] && printf '%s' "$body" | grep -Eq '"transient"[[:space:]]*:[[:space:]]*true'; then
  echo "::notice::${url} -> 503 upstream unavailable; skipping this tick, the next run repeats it."
  echo "$body"
  exit 0
fi

echo "::error::${url} -> ${code}"
echo "$body"
exit 1
