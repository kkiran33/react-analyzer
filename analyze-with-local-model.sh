#!/usr/bin/env bash
# Analyze a React MFE repo using a local model (Ollama, LM Studio, or any OpenAI-compatible API)
#
# Usage:
#   ./analyze-with-local-model.sh [path-to-repo] [question]
#
# Defaults:
#   repo    = current directory
#   model   = llama3 (override with MODEL env var)
#   api     = http://localhost:11434/api/generate  (Ollama)
#             set API_URL + API_TYPE for other providers
#
# Examples:
#   ./analyze-with-local-model.sh ~/projects/my-mfe
#   ./analyze-with-local-model.sh ~/projects/my-mfe "Which pages exist and what do they do?"
#
#   # LM Studio (OpenAI-compatible):
#   API_URL=http://localhost:1234/v1/chat/completions API_TYPE=openai \
#   MODEL=local-model ./analyze-with-local-model.sh ~/projects/my-mfe
#
#   # Custom Ollama model:
#   MODEL=mistral ./analyze-with-local-model.sh ~/projects/my-mfe

set -euo pipefail

REPO="${1:-.}"
QUESTION="${2:-Give me a full module map: pages, components, hooks, state, APIs, and cross-MFE communication.}"

MODEL="${MODEL:-llama3}"
API_URL="${API_URL:-http://localhost:11434/api/generate}"
API_TYPE="${API_TYPE:-ollama}"   # ollama | openai

SCAN_SCRIPT="$(dirname "$0")/scan.sh"
MAP_FILE="$(dirname "$0")/mfe-map.md"
PROMPT_FILE="$(dirname "$0")/mfe-analyzer-quick.md"

# Step 1: run static scan to produce mfe-map.md
echo "→ Running static scan on $REPO ..."
if [ -f "$SCAN_SCRIPT" ]; then
  bash "$SCAN_SCRIPT" "$REPO"
else
  echo "scan.sh not found alongside this script — skipping static scan." >&2
fi

# Step 2: build context (static map + quick prompt template)
STATIC_MAP=""
if [ -f "$MAP_FILE" ]; then
  STATIC_MAP=$(cat "$MAP_FILE")
fi

ANALYSIS_PROMPT=""
if [ -f "$PROMPT_FILE" ]; then
  ANALYSIS_PROMPT=$(cat "$PROMPT_FILE")
fi

FULL_PROMPT="You are a React MFE codebase analyst.

Below is a static code map automatically extracted from the repository.
Use it as your primary source of truth. Then answer the user's question.

=== STATIC CODE MAP ===
$STATIC_MAP

=== ANALYSIS INSTRUCTIONS ===
$ANALYSIS_PROMPT

=== USER QUESTION ===
$QUESTION"

echo ""
echo "→ Sending to $API_TYPE model: $MODEL at $API_URL"
echo "  Question: $QUESTION"
echo ""

# Step 3: call the model
if [ "$API_TYPE" = "ollama" ]; then
  # Ollama generate API
  PAYLOAD=$(printf '%s' "$FULL_PROMPT" | python3 -c "
import sys, json
prompt = sys.stdin.read()
print(json.dumps({'model': '$MODEL', 'prompt': prompt, 'stream': False}))
")

  RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

  echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('response', data))
"

elif [ "$API_TYPE" = "openai" ]; then
  # OpenAI-compatible (LM Studio, vLLM, etc.)
  API_KEY="${API_KEY:-not-needed}"

  PAYLOAD=$(printf '%s' "$FULL_PROMPT" | python3 -c "
import sys, json
prompt = sys.stdin.read()
payload = {
  'model': '$MODEL',
  'messages': [{'role': 'user', 'content': prompt}],
  'temperature': 0.2,
  'stream': False
}
print(json.dumps(payload))
")

  RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "$PAYLOAD")

  echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
try:
    print(data['choices'][0]['message']['content'])
except Exception:
    print(data)
"
else
  echo "Unknown API_TYPE='$API_TYPE'. Use 'ollama' or 'openai'." >&2
  exit 1
fi
