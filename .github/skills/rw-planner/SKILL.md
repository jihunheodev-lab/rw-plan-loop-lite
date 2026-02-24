---
name: rw-planner
description: 'Lite+Contract AI planner agent for structured feature planning workflows. Use when asked to plan features, create implementation tasks, run intake interviews, score ambiguity, generate DAG task-graphs, or kick off a structured development workflow. Handles hybrid askQuestions intake, feature approval gating, subagent-based plan generation, and hands off to rw-loop with NEXT_COMMAND=rw-loop. Pairs with the rw-loop skill to form a complete plan-then-implement pipeline.'
---

# rw-planner

Lite+Contract planner skill. Runs a structured intake interview, scores ambiguity, generates a DAG-based task plan, enforces feature approval, and hands off to `rw-loop` for implementation.

## When to Use This Skill

- User asks to "plan a feature", "create tasks", or "start a new workflow"
- You need structured requirement gathering with explicit scope boundaries
- Feature needs approval gating before any code is touched
- Ambiguity needs to be scored and a planning strategy chosen (SINGLE vs PARALLEL_AUTO)
- You need DAG-based task decomposition for dependent steps

## Prerequisites

- `runSubagent` must be available in the Copilot agent environment
- `askQuestions` must be available for the intake interview
- Workspace root must be writable
- Pair with `rw-loop` skill to execute tasks after planning is complete

## Setup for a New Project

Copy the template agent file and supporting docs to your project:

```
.github/agents/rw-planner.agent.md   ← from templates/
docs/feature-template.md             ← from templates/
docs/memory-contract.md              ← from templates/
```

The agent file contains the exact frontmatter and toolset required for GitHub Copilot to load `rw-planner` as a named agent (`@rw-planner`).

## Step-by-Step Workflow

### Step 0 – Environment Guard (Mandatory)

1. Validate workspace root is writable and resolvable.
   - On failure: emit `TARGET_ROOT_INVALID` + `NEXT_COMMAND=rw-planner` and stop.
2. Ensure `.ai/CONTEXT.md` exists; create minimal policy file if missing.
3. Read `.ai/CONTEXT.md`. If still unreadable: emit `LANG_POLICY_MISSING` + stop.
4. If `.ai/PAUSE.md` exists: emit `PAUSE_DETECTED` + stop.
5. Verify `runSubagent` is available; if not: emit `RW_ENV_UNSUPPORTED` + stop.
6. Verify `askQuestions` is available; if not: emit `INTERVIEW_REQUIRED` + stop.
7. Never write product code. Allowed writes: `.ai/**` only.

### Step 1 – Bootstrap (First-Run Safe)

Ensure the following directories and files exist, creating them if missing:

**Directories:** `.ai/features`, `.ai/tasks`, `.ai/notes`, `.ai/runtime`, `.ai/plans`, `.ai/memory`

**Files (create if missing):**
- `.ai/CONTEXT.md` – minimal language policy file
- `.ai/PLAN.md`
- `.ai/PROGRESS.md` – must contain `## Task Status`, `## Log`, `## Phase Status`, and table header `| Task | Title | Status | Commit |`
- `.ai/memory/shared-memory.md`
- `.ai/features/FEATURE-TEMPLATE.md` – include approval checklist and hash field

### Step 2 – Hybrid Intake Interview

**Phase A – Mandatory Need-Gate** (resolve from context first, ask only missing fields):

Resolve these four required fields, asking only for what cannot be inferred:
- `TARGET_KIND`: `PRODUCT_CODE` or `AGENT_WORKFLOW`
  - Default: `PRODUCT_CODE`
  - Use `AGENT_WORKFLOW` only when request explicitly targets `.github/agents/**`, `.github/prompts/**`, `.ai/**`, `scripts/health/**`, `scripts/validation/**`
- `USER_PATH`: how the end user reaches and uses the feature
- `SCOPE_BOUNDARY`: explicit in-scope and out-of-scope items
- `ACCEPTANCE_SIGNAL`: observable behavior + verification command

**Phase B – Deep Dive** (conditional via `askQuestions`, 6–10 questions):

Trigger when:
- Target is ambiguous without a clear location
- User path is missing
- Acceptance signal is non-testable
- Request affects 3+ directories or has security/data risk

If still unresolved: emit `INTERVIEW_DEEP_REQUIRED` + `NEXT_COMMAND=rw-planner` and stop.

**Phase C – Confirmation Gate:**

1. Summarize normalized scope in 4 lines (target kind, user path, in-scope, out-of-scope).
2. Ask one explicit yes/no confirmation via `askQuestions`.
3. If user does not confirm: emit `INTERVIEW_ABORTED` + stop.

**Phase D – Ambiguity Scoring** (mandatory, cap at 100):

| Condition | Score |
|-----------|-------|
| `TARGET_KIND` conflicting signals after defaulting | +5 |
| `USER_PATH` missing/uncertain | +25 |
| `SCOPE_BOUNDARY` missing/uncertain | +20 |
| `ACCEPTANCE_SIGNAL` missing/non-testable | +20 |
| Target path/file not specified | +10 |
| Generic verbs only (improve/add/fix without scope) | +10 |
| Broad expressions ("overall", "global", "optimize all") | +5 |
| Impact spans 3+ directories | +10 |
| Security/data/permission concern unresolved | +15 |

Strategy selection:
- Any required field unclear → `PLAN_STRATEGY=PARALLEL_AUTO`
- `AMBIGUITY_SCORE >= 40` → `PLAN_STRATEGY=PARALLEL_AUTO`
- Otherwise → `PLAN_STRATEGY=SINGLE`

Emit: `AMBIGUITY_SCORE=<0-100>`, `AMBIGUITY_REASONS=<comma-separated-codes>`, `PLAN_STRATEGY=<SINGLE|PARALLEL_AUTO>`

**Phase E – Subagent Planning** (mandatory):

- `PLAN_STRATEGY=SINGLE`: dispatch one Plan subagent via `runSubagent`.
- `PLAN_STRATEGY=PARALLEL_AUTO`: dispatch four Plan subagents for candidate generation.
  - Save candidates to `.ai/plans/<PLAN_ID>/candidate-plan-{1..4}.md`
  - Each candidate: `## Assumptions`, `## User Path`, `## Scope`, `## Acceptance/Test Strategy`, `## Risk Notes`, `## Candidate Score`, `## Candidate JSON`
  - Required JSON keys: `candidate_id`, `assumptions`, `user_path`, `acceptance_strategy`, `risk_level`, `complexity`, `estimated_tasks`
  - Synthesize comparison table in `.ai/plans/<PLAN_ID>/candidate-selection.md` with `winner_candidate_id`, `winner_reason`, `rejected_reasons`
- Show candidate plan text in main chat as-is.
- Ask one confirmation question via `askQuestions` before writing tasks/progress.
- If not confirmed: emit `INTERVIEW_ABORTED` + stop.

### Step 3 – Feature File Management

1. Apply scope guard: if `TARGET_KIND=PRODUCT_CODE`, exclude `.github/agents/**` and `.github/prompts/**` from scope.
2. Select or create feature file under `.ai/features/`:
   - Naming priority: `<ISSUE_KEY>-<slug>.md` (if issue key found) else `FEATURE-XX-<slug>.md`
3. Set `Status: READY_FOR_PLAN` before planning.
4. Ensure approval metadata fields:
   - `Approval: PENDING|APPROVED`
   - `Approved By: <name-or-id>`
   - `Approved At: <YYYY-MM-DD>`
   - `Feature Hash: <sha256>` (SHA-256 of normalized `TARGET_KIND + USER_PATH + SCOPE_BOUNDARY + ACCEPTANCE_SIGNAL`)

**Feature Review Gate (mandatory):**
- If `Approval` is not `APPROVED`: emit `FEATURE_REVIEW_REQUIRED` + `FEATURE_REVIEW_REASON=APPROVAL_MISSING` + `FEATURE_FILE=<path>` + `FEATURE_REVIEW_HINT=Review feature scope, then set Approval: APPROVED and fill Approved By/Approved At.` + `NEXT_COMMAND=rw-planner` and stop.
- If `Approval=APPROVED` but `Feature Hash` differs from current hash: reset `Approval: PENDING`, clear approved fields, update hash, emit `FEATURE_REVIEW_REQUIRED` + `FEATURE_REVIEW_REASON=APPROVAL_RESET_SCOPE_CHANGED` + stop.

### Step 4 – Plan Artifact Generation

1. Determine plan mode: `REPLAN` (if `.ai/runtime/rw-plan-replan.flag` exists), `EXTENSION` (if existing task rows exist), else `INITIAL`.
2. Generate `PLAN_ID=YYYYMMDD-HHMM-<slug>`.
3. Write required artifacts under `.ai/plans/<PLAN_ID>/`:
   - `research_findings_<focus_area>.yaml` (keys: `focus_area`, `summary`, `citations`, `assumptions`)
   - `plan-summary.yaml`
   - `task-graph.yaml` (keys: `plan_id`, `nodes[task_id, phase, title]`, `edges[from, to]`, `parallel_groups`)
4. Write `.ai/runtime/rw-active-plan-id.txt`.
5. Update `.ai/PLAN.md` with `PLAN_ID`, feature key, strategy, task range.
6. Verify artifact completeness: all three artifacts must exist and be non-empty. If any missing: emit `PLAN_ARTIFACTS_INCOMPLETE` + stop.

### Step 5 – Task Creation

1. Create/update `.ai/tasks/TASK-00-READBEFORE.md`.
2. Create 2–6 atomic task files `TASK-XX-*.md`, each containing:
   - `Phase`, `Title`, `Dependencies`, `Dependency Rationale`, `User Path`, `Description`, `Acceptance Criteria`, `Accessibility Criteria`, `Files to Create/Modify`, `Test Strategy`, `Verification`
   - Prose in `Response language` from `.ai/CONTEXT.md`; headers and machine tokens in English
3. Update `.ai/PROGRESS.md`:
   - Append new task rows as `pending`
   - Create/update `## Phase Status` section with `Current Phase: Phase 1`
   - Append one log entry with task range
4. Update feature status to `PLANNED`.
5. Append one short planning decision entry to `.ai/memory/shared-memory.md`.

### Step 6 – Success Output Contract

Emit in this exact order:

```
FEATURE_FILE=<path>
FEATURE_KEY=<JIRA-123|FEATURE-XX>
FEATURE_STATUS=PLANNED
PLAN_ID=<id>
PLAN_STRATEGY=<SINGLE|PARALLEL_AUTO>
AMBIGUITY_SCORE=<0-100>
AMBIGUITY_REASONS=<comma-separated-codes>
PLAN_MODE=<INITIAL|REPLAN|EXTENSION>
PLAN_TASK_RANGE=<TASK-XX~TASK-YY>
TASK_BOOTSTRAP_FILE=<path>
TASK_GRAPH_FILE=<path>
PLAN_RISK_LEVEL=<LOW|MEDIUM|HIGH>
PLAN_CONFIDENCE=<HIGH|MEDIUM|LOW>
OPEN_QUESTIONS_COUNT=<n>
NEXT_COMMAND=rw-loop
```

## Rules

- Machine tokens remain unchanged: `pending`, `in-progress`, `completed`, `blocked`, `VERIFICATION_EVIDENCE`
- Never renumber existing tasks
- Planner must never mark tasks as `completed`
- Planner must not create tasks before Phase C and Phase E confirmations
- Planner must not create tasks before feature `Approval: APPROVED`
- `Feature Hash` is the approval integrity guard

## Artifact Language Policy

- Read `.ai/CONTEXT.md` before writing any `.ai/**` artifact
- Plan/feature/task prose follows `Response language` in `.ai/CONTEXT.md`
- Section headers may remain English unless `.ai/CONTEXT.md` states otherwise
- Machine tokens, status values, and command tokens must remain English

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `TARGET_ROOT_INVALID` | Ensure workspace root is writable and fully resolved |
| `LANG_POLICY_MISSING` | Create or repair `.ai/CONTEXT.md` with a valid language policy |
| `RW_ENV_UNSUPPORTED` | Ensure `runSubagent` is available in your Copilot environment |
| `INTERVIEW_REQUIRED` | Ensure `askQuestions` is enabled in your agent tools |
| `FEATURE_REVIEW_REQUIRED` | Open the feature file, review scope, and set `Approval: APPROVED` |
| `PLAN_ARTIFACTS_INCOMPLETE` | Check `.ai/plans/<PLAN_ID>/` for missing yaml files |
| Skill not discovered | Use trigger phrases: "plan feature", "create tasks", "start workflow" |

## References

- `templates/` – agent file and doc templates for new projects
- Pair with `rw-loop` skill for the full plan-then-implement pipeline
