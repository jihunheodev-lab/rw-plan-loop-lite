#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "=== RW Plan Loop Lite Smoke Test ==="
echo "root=$ROOT"

required_files=(
  "$ROOT/.github/agents/rw-planner.agent.md"
  "$ROOT/.github/agents/rw-loop.agent.md"
  "$ROOT/.github/prompts/subagents/rw-loop-coder.subagent.md"
  "$ROOT/.github/prompts/subagents/rw-loop-task-inspector.subagent.md"
  "$ROOT/.github/prompts/subagents/rw-loop-security-review.subagent.md"
  "$ROOT/.github/prompts/subagents/rw-loop-phase-inspector.subagent.md"
  "$ROOT/.github/prompts/subagents/rw-loop-review.subagent.md"
  "$ROOT/docs/memory-contract.md"
  "$ROOT/docs/feature-template.md"
  "$ROOT/scripts/validation/check-prompts.mjs"
  "$ROOT/scripts/archive/archive-progress.mjs"
)

for f in "${required_files[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "SMOKE_FAIL missing_file=$f"
    exit 1
  fi
done

node "$ROOT/scripts/validation/check-prompts.mjs"

# Contract-focused smoke checks for recent guardrails.
planner_prompt="$(cat "$ROOT/.github/agents/rw-planner.agent.md")"

planner_required=(
  "handoffs:"
  "label: Start Implementation"
  "agent: rw-loop"
  "Allowed writes: .ai/** only."
  "Disallowed writes: product code paths"
  "FEATURE_REVIEW_REASON=<APPROVAL_MISSING|APPROVAL_RESET_SCOPE_CHANGED>"
  "FEATURE_REVIEW_HINT=<what_to_edit>"
  "Feature Hash: <sha256>"
  "PLAN_STRATEGY=<SINGLE|PARALLEL_AUTO>"
  "candidate-selection.md"
  "FEATURE_KEY=<JIRA-123|FEATURE-XX>"
  "task-graph.yaml"
  "PAUSE_DETECTED"
)

for token in "${planner_required[@]}"; do
  if [[ "$planner_prompt" != *"$token"* ]]; then
    echo "SMOKE_FAIL planner_token_missing=$token"
    exit 1
  fi
done

loop_prompt="$(cat "$ROOT/.github/agents/rw-loop.agent.md")"
loop_required=(
  "SECURITY_GATE=PASS|FAIL"
  "USER_PATH_GATE=PASS|FAIL"
  "PHASE_REVIEW_STATUS=<APPROVED|NEEDS_REVISION|FAILED>"
  "--max-parallel=<1..4>"
)

for token in "${loop_required[@]}"; do
  if [[ "$loop_prompt" != *"$token"* ]]; then
    echo "SMOKE_FAIL loop_token_missing=$token"
    exit 1
  fi
done

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rw2lite-smoke-XXXXXX")"
mkdir -p "$TMP_DIR/.ai/progress-archive"
cat > "$TMP_DIR/.ai/PROGRESS.md" <<'EOF'
# Progress

## Task Status

| Task | Title | Status | Commit |
|------|-------|--------|--------|
| TASK-01 | sample done | completed | abc123 |
| TASK-02 | sample pending | pending | - |

## Phase Status

Current Phase: Phase 1
- Phase 1: in-progress

## Log

- **2026-02-23** — sample log
EOF

node "$ROOT/scripts/archive/archive-progress.mjs" --root "$TMP_DIR"

if ! ls "$TMP_DIR/.ai/progress-archive/STATUS-"*.md >/dev/null 2>&1; then
  echo "SMOKE_FAIL archive_status_missing"
  exit 1
fi
if ! ls "$TMP_DIR/.ai/progress-archive/LOG-"*.md >/dev/null 2>&1; then
  echo "SMOKE_FAIL archive_log_missing"
  exit 1
fi

rm -rf "$TMP_DIR"
echo "SMOKE_OK"
