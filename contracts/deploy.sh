#!/usr/bin/env bash
# Deploy both contracts to Stellar and print the contract IDs.
# Usage: ./deploy.sh <your-stellar-account-alias> [network]
#
# Prerequisites:
#   stellar keys generate --global <alias> --network <network>
#   stellar keys fund <alias> --network <network>
#
set -euo pipefail

ACCOUNT="${1:?Usage: ./deploy.sh <account-alias> [network]}"
NETWORK="${2:-testnet}"
WASM_DIR="target/wasm32v1-none/release"

echo "==> Deploying token-locker..."
TOKEN_LOCKER_ID=$(stellar contract deploy \
  --wasm "$WASM_DIR/token_locker.wasm" \
  --source "$ACCOUNT" \
  --network "$NETWORK")
echo "    token_locker: $TOKEN_LOCKER_ID"

echo "==> Deploying lp-locker..."
LP_LOCKER_ID=$(stellar contract deploy \
  --wasm "$WASM_DIR/lp_locker.wasm" \
  --source "$ACCOUNT" \
  --network "$NETWORK")
echo "    lp_locker: $LP_LOCKER_ID"

echo ""
echo "==> Paste these into src/lib/stellar.ts:"
echo "    tokenLocker: \"$TOKEN_LOCKER_ID\","
echo "    lpLocker:    \"$LP_LOCKER_ID\","
