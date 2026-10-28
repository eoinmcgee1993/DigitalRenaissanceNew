#!/usr/bin/env bash
set -euo pipefail

REPO="eoinmcgee1993/DigitalRenaissanceNew"
WORKFLOW_FILE=".github/workflows/deploy.yml"
WORKFLOW_NAME="deploy.yml"
EXPECTED_SLUG="claude-operator-blueprint"
EXPECTED_PRICE_CENTS=4700
PROFILE_URL="https://digitalrena1ssance.gumroad.com"
PRODUCT_URL="${PROFILE_URL}/l/${EXPECTED_SLUG}"
API_BASE="https://api.gumroad.com/v2"

fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }
need git
need gh
need jq
need curl

printf '%s\n' '================================================='
printf '%s\n' 'DIGITAL RENAISSANCE: HARDENED GATE AUDIT'
printf 'Target Repo: %s\n' "$REPO"
printf '%s\n' '================================================='

# 1. Bind CI verification to the exact local commit. Run this from the
# checked-out commit intended for release, after its workflow has run.
printf '[1/4] Verifying workflow %s against local HEAD...\n' "$WORKFLOW_NAME"
TARGET_SHA="$(git rev-parse HEAD 2>/dev/null)" || fail "Unable to resolve local git HEAD SHA."
printf 'Target Commit SHA: %s\n' "$TARGET_SHA"

gh api "repos/$REPO/contents/$WORKFLOW_FILE" --jq '.name' >/dev/null || fail "Workflow file $WORKFLOW_FILE does not exist on the repository default branch or is not accessible."

WORKFLOW_RUNS="$(gh run list --repo "$REPO" --workflow "$WORKFLOW_NAME" --limit 100 --json status,conclusion,headSha,url,databaseId,createdAt)" \
  || fail "Could not query GitHub Actions. Check gh authentication and repository access."
MATCHED_RUNS="$(printf '%s' "$WORKFLOW_RUNS" | jq -c --arg sha "$TARGET_SHA" '[.[] | select(.headSha == $sha)] | sort_by(.createdAt) | reverse')"
RUN_COUNT="$(printf '%s' "$MATCHED_RUNS" | jq 'length')"
[ "$RUN_COUNT" -gt 0 ] || fail "No workflow run found for commit $TARGET_SHA in $REPO."

RUN="$(printf '%s' "$MATCHED_RUNS" | jq -c '.[0]')"
RUN_STATUS="$(printf '%s' "$RUN" | jq -r '.status // "null"')"
RUN_CONCLUSION="$(printf '%s' "$RUN" | jq -r '.conclusion // "null"')"
RUN_URL="$(printf '%s' "$RUN" | jq -r '.url // "unavailable"')"
if [ "$RUN_STATUS" != "completed" ] || [ "$RUN_CONCLUSION" != "success" ]; then
  fail "Workflow run for $TARGET_SHA is not green (status=$RUN_STATUS, conclusion=$RUN_CONCLUSION, $RUN_URL)."
fi
printf 'PASSED: Exact commit has a completed successful workflow run (%s).\n' "$RUN_URL"

# 2. Authenticate without printing the token or raw API response.
printf '%s\n' '[2/4] Authenticating Gumroad API v2...'
[ -n "${GUMROAD_ACCESS_TOKEN:-}" ] || fail "GUMROAD_ACCESS_TOKEN environment variable is not set."
USER_RESPONSE="$(curl --silent --show-error --fail-with-body \
  -H "Authorization: Bearer ${GUMROAD_ACCESS_TOKEN}" \
  -H 'Accept: application/json' "$API_BASE/user")" \
  || fail "Gumroad /user request failed (HTTP or network error)."
AUTH_SUCCESS="$(printf '%s' "$USER_RESPONSE" | jq -r '.success // false')" \
  || fail "Gumroad /user returned invalid JSON."
[ "$AUTH_SUCCESS" = "true" ] || fail "Gumroad API authentication was unsuccessful."
USER_NAME="$(printf '%s' "$USER_RESPONSE" | jq -r '.user.name // "Unknown"')"
printf 'PASSED: Authenticated as %s.\n' "$USER_NAME"
unset USER_RESPONSE AUTH_SUCCESS

# 3. Require exactly one product match and validate price, currency, and state.
printf '[3/4] Inspecting product payload for %s...\n' "$EXPECTED_SLUG"
PRODUCTS_RESPONSE="$(curl --silent --show-error --fail-with-body \
  -H "Authorization: Bearer ${GUMROAD_ACCESS_TOKEN}" \
  -H 'Accept: application/json' "$API_BASE/products")" \
  || fail "Gumroad /products request failed (HTTP or network error)."
printf '%s' "$PRODUCTS_RESPONSE" | jq -e '.success == true and (.products | type == "array")' >/dev/null \
  || fail "Gumroad /products returned an unsuccessful or unexpected JSON payload."

MATCHED_PRODUCTS="$(printf '%s' "$PRODUCTS_RESPONSE" | jq -c --arg slug "$EXPECTED_SLUG" '
  [.products[]? | select(
    .custom_permalink == $slug or
    .short_url == $slug or
    ((.short_url // "") | endswith("/l/" + $slug)) or
    ((.url // "") | endswith("/l/" + $slug))
  )]')"
unset PRODUCTS_RESPONSE
MATCH_COUNT="$(printf '%s' "$MATCHED_PRODUCTS" | jq 'length')"
[ "$MATCH_COUNT" -eq 1 ] || fail "Expected exactly one product matching $EXPECTED_SLUG; found $MATCH_COUNT."

PRODUCT="$(printf '%s' "$MATCHED_PRODUCTS" | jq -c '.[0]')"
LIVE_PRICE="$(printf '%s' "$PRODUCT" | jq -r '.price // empty')"
LIVE_CURRENCY="$(printf '%s' "$PRODUCT" | jq -r '.price_currency_type // empty | ascii_upcase')"
PUBLISHED_STATE="$(printf '%s' "$PRODUCT" | jq -r '.published // empty')"
DELETED_STATE="$(printf '%s' "$PRODUCT" | jq -r '.deleted // false')"

[[ "$LIVE_PRICE" =~ ^[0-9]+$ ]] || fail "Product price is missing or is not an integer."
[ "$PUBLISHED_STATE" = "true" ] || [ "$PUBLISHED_STATE" = "false" ] || fail "Product published field is not a boolean."
[ "$LIVE_PRICE" -eq "$EXPECTED_PRICE_CENTS" ] || fail "Expected 4700 cents; API returned $LIVE_PRICE."
[ -n "$LIVE_CURRENCY" ] || fail "Product currency field is missing from Gumroad API response."
[ "$LIVE_CURRENCY" = "USD" ] || fail "Expected USD price currency; API returned $LIVE_CURRENCY."
[ "$PUBLISHED_STATE" = "true" ] || fail "Product is not published."
[ "$DELETED_STATE" != "true" ] || fail "Product is marked deleted."
printf '%s\n' 'PASSED: Exactly one product matched, priced at USD 47.00 and published.'
unset MATCHED_PRODUCTS PRODUCT

# 4. Check public route status. HTTP 200 alone does not verify checkout completion.
printf '%s\n' '[4/4] Checking public profile and product routes...'
PROFILE_HTTP="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --location "$PROFILE_URL")" \
  || fail "Could not request the public profile."
PRODUCT_HTTP="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --location "$PRODUCT_URL")" \
  || fail "Could not request the public product page."
[ "$PROFILE_HTTP" = "200" ] || fail "Profile route returned HTTP $PROFILE_HTTP."
[ "$PRODUCT_HTTP" = "200" ] || fail "Product route returned HTTP $PRODUCT_HTTP."

printf '%s\n' '================================================='
printf '%s\n' 'VERIFICATION SUCCESSFUL: ALL FOUR HARDENED GATES PASSED'
printf 'Commit SHA: %s\n' "$TARGET_SHA"
printf 'CI run: %s\n' "$RUN_URL"
printf 'Profile: %s\n' "$PROFILE_URL"
printf 'Product: %s\n' "$PRODUCT_URL"
printf '%s\n' 'Note: Checkout completion still requires a separate safe test.'
printf '%s\n' '================================================='
