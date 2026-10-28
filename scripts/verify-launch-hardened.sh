#!/usr/bin/env bash
set -euo pipefail

REPO="eoinmcgee1993/DigitalRenaissanceNew"
WORKFLOW_NAME="deploy.yml"
EXPECTED_SLUG="claude-operator-blueprint"
EXPECTED_PRICE_CENTS=4700
PROFILE_URL="https://digitalrena1ssance.gumroad.com"
PRODUCT_URL="${PROFILE_URL}/l/${EXPECTED_SLUG}"
API_BASE="https://api.gumroad.com/v2"

fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }
need gh
need jq
need curl

printf '%s\n' '================================================='
printf '%s\n' 'DIGITAL RENAISSANCE: HARDENED GATE AUDIT'
printf 'Target Repo: %s\n' "$REPO"
printf '%s\n' '================================================='

# 1. Scope CI to the deployment workflow and main branch.
printf '[1/4] Checking latest %s run on main in %s...\n' "$WORKFLOW_NAME" "$REPO"
RUNS="$(gh run list --repo "$REPO" --workflow "$WORKFLOW_NAME" --branch main --limit 5 --json status,conclusion,databaseId,url,headSha,headBranch,createdAt)" \
  || fail "Could not query GitHub Actions. Check gh authentication and repository access."
RUN="$(printf '%s' "$RUNS" | jq -c 'map(select(.headBranch == "main")) | sort_by(.createdAt) | last // empty')"
[ -n "$RUN" ] || fail "No deployment workflow run found on main."
RUN_STATUS="$(printf '%s' "$RUN" | jq -r '.status // "null"')"
RUN_CONCLUSION="$(printf '%s' "$RUN" | jq -r '.conclusion // "null"')"
RUN_SHA="$(printf '%s' "$RUN" | jq -r '.headSha // "null"')"
RUN_URL="$(printf '%s' "$RUN" | jq -r '.url // "unavailable"')"

if [ "$RUN_STATUS" != "completed" ] || [ "$RUN_CONCLUSION" != "success" ]; then
  fail "Latest main workflow run is status=$RUN_STATUS conclusion=$RUN_CONCLUSION ($RUN_URL)"
fi
if [ -n "${EXPECTED_COMMIT_SHA:-}" ] && [ "$RUN_SHA" != "$EXPECTED_COMMIT_SHA" ]; then
  fail "Workflow SHA $RUN_SHA does not match EXPECTED_COMMIT_SHA."
fi
printf 'PASSED: CI is green on main (%s, %s).\n' "$RUN_SHA" "$RUN_URL"

# 2. Authenticate without ever printing the token or raw API payload.
printf '%s\n' '[2/4] Authenticating Gumroad API v2...'
[ -n "${GUMROAD_ACCESS_TOKEN:-}" ] || fail "GUMROAD_ACCESS_TOKEN is not set."
USER_RESPONSE="$(curl --silent --show-error --fail-with-body \
  -H "Authorization: Bearer ${GUMROAD_ACCESS_TOKEN}" \
  -H 'Accept: application/json' "$API_BASE/user")" \
  || fail "Gumroad /user request failed (HTTP or network error)."
AUTH_SUCCESS="$(printf '%s' "$USER_RESPONSE" | jq -r '.success // false')" \
  || fail "Gumroad /user returned invalid JSON."
[ "$AUTH_SUCCESS" = "true" ] || fail "Gumroad authentication was not successful."
USER_NAME="$(printf '%s' "$USER_RESPONSE" | jq -r '.user.name // "authenticated user"')"
printf 'PASSED: Authenticated as %s.\n' "$USER_NAME"

# 3. Require exactly one exact product match, then inspect live schema.
printf '[3/4] Checking product permalink, currency, price and publication state...\n'
PRODUCTS_JSON="$(curl --silent --show-error --fail-with-body \
  -H "Authorization: Bearer ${GUMROAD_ACCESS_TOKEN}" \
  -H 'Accept: application/json' "$API_BASE/products")" \
  || fail "Gumroad /products request failed (HTTP or network error)."
printf '%s' "$PRODUCTS_JSON" | jq -e '.success == true and (.products | type == "array")' >/dev/null \
  || fail "Gumroad /products returned an unsuccessful or unexpected JSON payload."

MATCHES="$(printf '%s' "$PRODUCTS_JSON" | jq -c --arg slug "$EXPECTED_SLUG" '
  [.products[] | select(
    .custom_permalink == $slug or
    ((.short_url // "") | endswith("/l/" + $slug)) or
    ((.url // "") | endswith("/l/" + $slug)) or
    ((.url // "") | endswith("/" + $slug))
  )]')"
MATCH_COUNT="$(printf '%s' "$MATCHES" | jq 'length')"
[ "$MATCH_COUNT" -eq 1 ] || fail "Expected exactly one product matching $EXPECTED_SLUG; found $MATCH_COUNT."

PRODUCT="$(printf '%s' "$MATCHES" | jq -c '.[0]')"
LIVE_PRICE="$(printf '%s' "$PRODUCT" | jq -r '.price // empty')"
LIVE_CURRENCY="$(printf '%s' "$PRODUCT" | jq -r '.price_currency_type // "unknown" | ascii_upcase')"
PUBLISHED_STATE="$(printf '%s' "$PRODUCT" | jq -r '.published // false')"
DELETED_STATE="$(printf '%s' "$PRODUCT" | jq -r '.deleted // false')"

[[ "$LIVE_PRICE" =~ ^[0-9]+$ ]] || fail "Product price is missing or not an integer."
[ "$LIVE_PRICE" -eq "$EXPECTED_PRICE_CENTS" ] || fail "Expected 4700 cents; API returned $LIVE_PRICE."
[ "$LIVE_CURRENCY" = "USD" ] || fail "Expected USD price currency; API returned $LIVE_CURRENCY."
[ "$PUBLISHED_STATE" = "true" ] || fail "Product is not published."
[ "$DELETED_STATE" != "true" ] || fail "Product is marked deleted."
printf '%s\n' 'PASSED: Exactly one product matched; price is USD 47.00 and product is published.'

# 4. Check public routes. HTTP 200 is a route check, not proof of a completed purchase.
printf '%s\n' '[4/4] Checking public profile and product routes...'
PROFILE_HTTP="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --location "$PROFILE_URL")" \
  || fail "Could not request the public profile."
PRODUCT_HTTP="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --location "$PRODUCT_URL")" \
  || fail "Could not request the public product page."
[ "$PROFILE_HTTP" = "200" ] || fail "Profile route returned HTTP $PROFILE_HTTP."
[ "$PRODUCT_HTTP" = "200" ] || fail "Product route returned HTTP $PRODUCT_HTTP."

printf '%s\n' '================================================='
printf '%s\n' 'VERIFICATION SUCCESSFUL: ALL FOUR GATES PASSED'
printf 'CI run: %s\n' "$RUN_URL"
printf 'Profile: %s\n' "$PROFILE_URL"
printf 'Product: %s\n' "$PRODUCT_URL"
printf '%s\n' 'Note: Checkout completion still requires a separate safe test.'
printf '%s\n' '================================================='
