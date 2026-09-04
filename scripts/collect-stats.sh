#!/bin/bash
# Collect live metrics for Captain Adel README auto-update
# Extracts: eval count, chunk count, p95 latency (Cloud Logging)
# Output: .stats.json (git-ignored)

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATS_FILE="$REPO_ROOT/.stats.json"

echo "📊 Collecting Captain Adel metrics..."

# Extract eval count from evals/cases.json
echo "  • Extracting eval count..."
EVAL_COUNT=0
if [ -f "$REPO_ROOT/evals/cases.json" ]; then
  # Count the number of objects in the array
  # Use grep to find lines that start with { to estimate record count
  EVAL_COUNT=$(grep -c '^\s*{' "$REPO_ROOT/evals/cases.json" || echo "0")
  if [ "$EVAL_COUNT" = "0" ]; then
    # Try parsing as JSON array
    EVAL_COUNT=$(node -e "const j=require('$REPO_ROOT/evals/cases.json'); console.log(j.length || 0)" 2>/dev/null || echo "0")
  fi
fi

# Extract chunk count from src/brain/_chunks.json.gz
echo "  • Extracting chunk count..."
CHUNK_COUNT=0
if [ -f "$REPO_ROOT/src/brain/_chunks.json.gz" ]; then
  # Get uncompressed size in bytes, divide by ~1024 bytes per chunk (estimate)
  FILE_SIZE=$(stat -f%z "$REPO_ROOT/src/brain/_chunks.json.gz" 2>/dev/null || stat -c%s "$REPO_ROOT/src/brain/_chunks.json.gz" 2>/dev/null || echo "0")
  if [ "$FILE_SIZE" -gt 0 ]; then
    # Rough estimate: 1024 bytes per chunk
    CHUNK_COUNT=$((FILE_SIZE / 1024))
  fi
fi

# Extract p95 latency from Cloud Logging (Phase 3 — requires credentials)
# Placeholder for future implementation via Cloud Logging API
P95_LATENCY="TBD"
# To enable, set CLOUD_LOGGING_PROJECT and CLOUD_LOGGING_CREDENTIALS_JSON env vars
# gcloud logging read --limit=1000 --format=json 'severity=DEFAULT AND textPayload=~"latency"' | ...

# Write stats JSON
cat > "$STATS_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "eval_count": $EVAL_COUNT,
  "chunk_count": $CHUNK_COUNT,
  "p95_latency_ms": "$P95_LATENCY",
  "source": "scripts/collect-stats.sh"
}
EOF

echo ""
echo "✅ Metrics collected:"
echo "  Eval count: $EVAL_COUNT"
echo "  Chunk count: $CHUNK_COUNT"
echo "  P95 latency: $P95_LATENCY (Cloud Logging API integration pending)"
echo "  Written to: $STATS_FILE"
