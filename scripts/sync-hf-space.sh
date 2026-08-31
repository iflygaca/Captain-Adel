#!/bin/bash
set -euo pipefail

# sync-hf-space.sh — Push local repository to Hugging Face Spaces (flygaca/captain-adel)
#
# Usage:
#   HF_TOKEN="hf_..." bash scripts/sync-hf-space.sh
#   or if git remote 'huggingface' is already configured:
#   bash scripts/sync-hf-space.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

HF_SPACE_URL="https://huggingface.co/spaces/flygaca/captain-adel"

echo "ℹ Checking Hugging Face Space remote configuration..."

cd "$REPO_ROOT"

if ! git remote | grep -q "^huggingface$"; then
  if [ -n "${HF_TOKEN:-}" ]; then
    git remote add huggingface "https://flygaca:${HF_TOKEN}@huggingface.co/spaces/flygaca/captain-adel"
    echo "✓ Added 'huggingface' remote with authentication token."
  else
    git remote add huggingface "https://huggingface.co/spaces/flygaca/captain-adel"
    echo "✓ Added 'huggingface' remote ($HF_SPACE_URL)."
  fi
else
  if [ -n "${HF_TOKEN:-}" ]; then
    git remote set-url huggingface "https://flygaca:${HF_TOKEN}@huggingface.co/spaces/flygaca/captain-adel"
  fi
fi

echo "ℹ Current Git remotes:"
git remote -v

echo "ℹ Pushing to Hugging Face Spaces (flygaca/captain-adel)..."
git push huggingface main:main || {
  echo "⚠ Direct push requires authentication. Ensure you are logged in via 'huggingface-cli login' or have set HF_TOKEN."
}

echo "✓ Sync operation completed."
