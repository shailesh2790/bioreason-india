#!/usr/bin/env bash
# BioReason one-shot deploy: GitHub -> Railway (FastAPI) -> Vercel (Next.js) + alias promote
# Usage: bash scripts/deploy.sh ["commit message"]
set -euo pipefail

cd "$(dirname "$0")/.."
ALIAS_DOMAIN="bioreason-india.vercel.app"

step() { printf "\n\033[1;36m[%s]\033[0m %s\n" "$(date +%H:%M:%S)" "$*"; }
fail() { printf "\n\033[1;31m[FAIL]\033[0m %s\n" "$*" >&2; exit 1; }

step "Checking git state"
if [[ -n "$(git status --porcelain)" ]]; then
  if [[ $# -ge 1 ]]; then
    git add -A
    git commit -m "$1"
  else
    fail "Uncommitted changes. Pass a commit message: bash scripts/deploy.sh \"msg\""
  fi
fi
git push origin main

step "Triggering Railway redeploy (FastAPI)"
railway up --service fastapi --detach

step "Deploying Vercel production"
DEPLOY_URL=$(npx --yes vercel --prod --yes 2>&1 | tee /tmp/bioreason-vercel.log | grep -oE 'https://bioreason-[a-z0-9-]+\.vercel\.app' | head -1)
[[ -n "$DEPLOY_URL" ]] || fail "Could not parse Vercel deployment URL. See /tmp/bioreason-vercel.log"
echo "  -> $DEPLOY_URL"

step "Waiting for Vercel build to be reachable"
until curl -sf -m 8 "$DEPLOY_URL" -o /dev/null; do sleep 8; done

step "Promoting alias $ALIAS_DOMAIN"
npx --yes vercel alias set "${DEPLOY_URL#https://}" "$ALIAS_DOMAIN"

step "Waiting for Railway FastAPI to expose new routes"
until curl -sf -m 10 "https://$ALIAS_DOMAIN/api/stats" -o /dev/null; do sleep 8; done

step "Smoke-testing /api/repurpose"
HTTP_CODE=$(curl -s -m 30 -o /tmp/bioreason-smoke.json -w "%{http_code}" \
  -X POST -H "Content-Type: application/json" \
  -d '{"disease":"tuberculosis","limit":3,"india_context":true}' \
  "https://$ALIAS_DOMAIN/api/repurpose")
if [[ "$HTTP_CODE" = "200" ]]; then
  CANDIDATES=$(grep -oE '"drug":"[^"]+"' /tmp/bioreason-smoke.json | head -3 | tr '\n' ' ')
  printf "\n\033[1;32m[OK]\033[0m /api/repurpose 200 -> %s\n" "$CANDIDATES"
else
  printf "\n\033[1;33m[WARN]\033[0m /api/repurpose returned %s (Railway may still be building). Retry in ~60s.\n" "$HTTP_CODE"
  head -c 400 /tmp/bioreason-smoke.json; echo
fi

step "Done. Live at https://$ALIAS_DOMAIN"
