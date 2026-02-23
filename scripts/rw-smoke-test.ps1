$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Write-Output "=== RW 2-Agent Lite Smoke Test (PowerShell) ==="
Write-Output "root=$root"

$required = @(
  "$root/.github/agents/rw-planner.agent.md",
  "$root/.github/agents/rw-loop.agent.md",
  "$root/.github/prompts/subagents/rw-loop-coder.subagent.md",
  "$root/.github/prompts/subagents/rw-loop-task-inspector.subagent.md",
  "$root/.github/prompts/subagents/rw-loop-security-review.subagent.md",
  "$root/.github/prompts/subagents/rw-loop-phase-inspector.subagent.md",
  "$root/.github/prompts/subagents/rw-loop-review.subagent.md",
  "$root/docs/memory-contract.md",
  "$root/docs/feature-template.md",
  "$root/scripts/validation/check-prompts.mjs",
  "$root/scripts/archive/archive-progress.mjs"
)

foreach ($f in $required) {
  if (-not (Test-Path $f -PathType Leaf)) {
    Write-Output "SMOKE_FAIL missing_file=$f"
    exit 1
  }
}

node "$root/scripts/validation/check-prompts.mjs"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

# Contract-focused smoke checks for recent guardrails.
$plannerPrompt = Get-Content -Raw "$root/.github/agents/rw-planner.agent.md"

$plannerRequired = @(
  "handoffs:",
  "label: Start Implementation",
  "agent: rw-loop",
  "Allowed writes: .ai/** only.",
  "Disallowed writes: product code paths",
  "FEATURE_REVIEW_REASON=<APPROVAL_MISSING|APPROVAL_RESET_SCOPE_CHANGED>",
  "FEATURE_REVIEW_HINT=<what_to_edit>",
  "Feature Hash: <sha256>",
  "PLAN_STRATEGY=<SINGLE|PARALLEL_AUTO>",
  "candidate-selection.md",
  "FEATURE_KEY=<JIRA-123|FEATURE-XX>",
  "task-graph.yaml",
  "PAUSE_DETECTED"
)

foreach ($token in $plannerRequired) {
  if (-not $plannerPrompt.Contains($token)) {
    Write-Output "SMOKE_FAIL planner_token_missing=$token"
    exit 1
  }
}

$loopPrompt = Get-Content -Raw "$root/.github/agents/rw-loop.agent.md"
$loopRequired = @(
  "SECURITY_GATE=PASS|FAIL",
  "USER_PATH_GATE=PASS|FAIL",
  "PHASE_REVIEW_STATUS=<APPROVED|NEEDS_REVISION|FAILED>",
  "--max-parallel=<1..4>"
)

foreach ($token in $loopRequired) {
  if (-not $loopPrompt.Contains($token)) {
    Write-Output "SMOKE_FAIL loop_token_missing=$token"
    exit 1
  }
}

# Archive smoke on temporary root
$tmp = Join-Path $env:TEMP ("rw2lite-smoke-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tmp ".ai/progress-archive") -Force | Out-Null

$sampleProgress = @"
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
"@

Set-Content -Path (Join-Path $tmp ".ai/PROGRESS.md") -Value $sampleProgress -NoNewline
node "$root/scripts/archive/archive-progress.mjs" --root "$tmp"
if ($LASTEXITCODE -ne 0) {
  Write-Output "SMOKE_FAIL archive_script"
  exit $LASTEXITCODE
}

$statusFiles = Get-ChildItem -Path (Join-Path $tmp ".ai/progress-archive") -Filter "STATUS-*.md" -File
$logFiles = Get-ChildItem -Path (Join-Path $tmp ".ai/progress-archive") -Filter "LOG-*.md" -File
if ($statusFiles.Count -lt 1 -or $logFiles.Count -lt 1) {
  Write-Output "SMOKE_FAIL archive_outputs_missing"
  exit 1
}

Remove-Item -Recurse -Force $tmp
Write-Output "SMOKE_OK"
