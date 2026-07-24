#!/usr/bin/env bash
# Run this once as a repository admin to enforce branch protection on main.
# Requires: gh CLI authenticated with a token that has the `repo` + `admin:repo` scope.
#
# Usage:
#   gh auth login          # if not already logged in as an admin
#   bash .github/scripts/apply-branch-protection.sh

set -euo pipefail

REPO="StellarLock/StellarLock"
BRANCH="main"

echo "Applying branch protection to ${REPO}:${BRANCH} ..."

gh api "repos/${REPO}/branches/${BRANCH}/protection" \
  --method PUT \
  --header "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": []
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "require_last_push_approval": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "block_creations": false
}
JSON

echo "Done. Verify at: https://github.com/${REPO}/settings/branch_protection_rules"
