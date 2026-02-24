---
name: rw-loop
description: 'Lite+Contract AI implementation loop agent for executing planned tasks. Use when asked to implement tasks, run implementation loops, delegate coding to subagents, enforce TDD evidence, run security gates, phase inspections, or complete planned features. Requires rw-planner to have run first and a valid .ai/PROGRESS.md to exist. Outputs NEXT_COMMAND=done/rw-loop/rw-planner. Pairs with the rw-planner skill to form a complete plan-then-implement pipeline.'
---

# rw-loop

Lite+Contract implementation loop skill. Picks dispatchable tasks from the DAG, delegates implementation to a coder subagent, enforces TDD evidence and completion invariants, runs task inspection, user-path gate, security gate, phase inspection, and final review before emitting `NEXT_COMMAND`.

## When to Use This Skill

- User says `@rw-loop`, "implement tasks", "start implementation", or "continue loop"
- A plan already exists (`.ai/PROGRESS.md` and `.ai/tasks/` are present)
- One or more tasks are in `pending` or `in-progress` state
- You need to enforce TDD evidence, security gates, and phase inspection after coding
- All tasks are complete and a final review gate is needed

## Prerequisites

- `rw-planner` skill must have run first (or a valid plan must already exist)
- `.ai/PROGRESS.md` must exist with task rows
- `.ai/tasks/TASK-*.md` files must exist
- `runSubagent` must be available
- All five subagent prompt files must exist at the expected paths (see Setup)

## Setup for a New Project

Copy the template files to your project at these exact paths:

```
.github/agents/rw-loop.agent.md                            ← from templates/
.github/prompts/subagents/rw-loop-coder.subagent.md        ← from templates/
.github/prompts/subagents/rw-loop-task-inspector.subagent.md
.github/prompts/subagents/rw-loop-security-review.subagent.md
.github/prompts/subagents/rw-loop-phase-inspector.subagent.md
.github/prompts/subagents/rw-loop-review.subagent.md
```

All six template files are bundled in the `templates/` folder of this skill.

## Supported Flags

| Flag | Effect |
|------|--------|
| `--auto` or `--no-hitl` | Minimize human-in-the-loop confirmation prompts |
| `--hitl` | Keep human confirmation at phase boundaries |
| `--parallel` | Dispatch independent tasks in parallel (up to 4) |
| `--parallel --max-parallel=<1..4>` | Set max parallel dispatch count |

## Step-by-Step Workflow

### Step 0 – Environment Guard (Mandatory)

1. Read `.ai/CONTEXT.md`. If missing/unreadable: emit `LANG_POLICY_MISSING` + `NEXT_COMMAND=rw-planner` and stop.
2. Ensure `.ai/PROGRESS.md` and `.ai/tasks/` exist. If missing: emit `TARGET_ROOT_INVALID` + `NEXT_COMMAND=rw-planner` and stop.
3. Ensure `runSubagent` is available. If not: emit `RW_ENV_UNSUPPORTED` + `NEXT_COMMAND=rw-loop` and stop.
4. This agent never writes product code directly.
5. Ensure all five required subagent prompt files exist:
   - `.github/prompts/subagents/rw-loop-coder.subagent.md`
   - `.github/prompts/subagents/rw-loop-task-inspector.subagent.md`
   - `.github/prompts/subagents/rw-loop-security-review.subagent.md`
   - `.github/prompts/subagents/rw-loop-phase-inspector.subagent.md`
   - `.github/prompts/subagents/rw-loop-review.subagent.md`
   - If any missing: emit `RW_SUBAGENT_PROMPT_MISSING` + `NEXT_COMMAND=rw-loop` and stop.
6. Resolve HITL mode: `--auto`/`--no-hitl` → `HITL_MODE=OFF`; `--hitl` → `HITL_MODE=ON`; default → `HITL_MODE=ON`.
7. Resolve parallel mode: `--parallel` → `PARALLEL_MODE=ON`; else `PARALLEL_MODE=OFF`.
8. Resolve max parallel: default `MAX_PARALLEL=4`; `--max-parallel=<n>` clamps to 1–4.
9. If `.ai/memory/shared-memory.md` exists, read it before loop start.
10. If `.ai/runtime/rw-active-plan-id.txt` exists, read matching `.ai/plans/<PLAN_ID>/task-graph.yaml` as the primary dependency graph.

### Step 1 – Task Selection

**Loop policy:**
- Priority: `in-progress` tasks first, then `pending`; never auto-select `blocked`
- Single mode: exactly one task per dispatch
- Parallel mode: up to `MAX_PARALLEL` independent tasks (no dependency relation between them)

**Main entry:**
1. If `.ai/PAUSE.md` exists: emit `PAUSE_DETECTED` + `NEXT_COMMAND=rw-loop` and stop.
2. Resolve locked task set from `PROGRESS.md`:
   - `PARALLEL_MODE=OFF`: resolve one `LOCKED_TASK_ID`
   - `PARALLEL_MODE=ON`: resolve up to `MAX_PARALLEL` independent tasks via `task-graph.yaml`
3. If unresolved `REVIEW-ESCALATE` exists: run review first, skip coding dispatch.
4. If no dispatchable task but unfinished tasks exist: emit `TASK_DEPENDENCY_BLOCKED` + `REPLAN_TRIGGERED` + `NEXT_COMMAND=rw-planner` and stop.
5. Capture before-state: completed set + evidence count map for each locked task.

### Step 2 – Coder Dispatch

- Emit `RUNSUBAGENT_DISPATCH_BEGIN <LOCKED_TASK_ID>` before each dispatch.
- Load `.github/prompts/subagents/rw-loop-coder.subagent.md` and call `runSubagent` injecting `LOCKED_TASK_ID`.
- In parallel mode, dispatch independently per task, keeping separate before/after state snapshots.

**Post-dispatch validation (per task):**
- Single mode: exactly 1 new completed task must match `LOCKED_TASK_ID`.
- Parallel mode: newly completed count must equal number of dispatched tasks, matching `LOCKED_TASK_IDS` exactly.
- On count/set mismatch: emit `RW_SUBAGENT_COMPLETION_DELTA_INVALID` + `NEXT_COMMAND=rw-loop` and stop.
- On wrong task completed: emit `RW_SUBAGENT_COMPLETED_WRONG_TASK` + stop.
- Evidence count for each task must increase: if not, emit `RW_SUBAGENT_VERIFICATION_EVIDENCE_MISSING` + stop.
- Emit `RUNSUBAGENT_DISPATCH_OK <TASK-XX>` per successful task.

### Step 3 – Mandatory Task Inspection

After every dispatch, for each locked task:

1. Load `.github/prompts/subagents/rw-loop-task-inspector.subagent.md` and call `runSubagent` injecting task id.
2. Require: `TASK_INSPECTION=PASS|FAIL` and `USER_PATH_GATE=PASS|FAIL`.
3. On fail: keep task as `in-progress` or set `blocked` per retry threshold.
4. **3-strike rule**: if same task fails inspection 3 times, append `REVIEW-ESCALATE <LOCKED_TASK_ID>: reached 3-strike`, set status `blocked`, emit `NEXT_COMMAND=rw-planner` and stop.

### Step 4 – Mandatory Security Gate

After every dispatch:

1. Load `.github/prompts/subagents/rw-loop-security-review.subagent.md` and call `runSubagent` with locked task ids.
2. Require: `SECURITY_GATE=PASS|FAIL`.
3. On fail: emit `SECURITY_GATE_FAILED`, keep task `in-progress` or set `blocked` for critical severity, emit `NEXT_COMMAND=rw-loop` and stop.

### Step 5 – Phase Inspection (When Phase Completes)

If all tasks in the current phase are completed:

1. Load `.github/prompts/subagents/rw-loop-phase-inspector.subagent.md` and call `runSubagent`.
2. Require: `PHASE_INSPECTION=PASS|FAIL` and `PHASE_REVIEW_STATUS=APPROVED|NEEDS_REVISION|FAILED`.
3. `NEEDS_REVISION` → emit `NEXT_COMMAND=rw-loop` and stop.
4. `FAILED` → emit `NEXT_COMMAND=rw-planner` and stop.
5. If `HITL_MODE=ON`: ask one yes/no confirmation asking whether to approve the current phase and proceed to the next one. Ask in the `Response language` defined by `.ai/CONTEXT.md`. If user declines, emit `NEXT_COMMAND=rw-loop` and stop.

### Step 6 – Final Review Gate (When All Tasks Complete)

1. Load `.github/prompts/subagents/rw-loop-review.subagent.md` and run review subagent.
2. Require: `REVIEW_STATUS=OK|FAIL|ESCALATE`.
3. On fail/escalate: emit `NEXT_COMMAND=rw-loop` or `NEXT_COMMAND=rw-planner` and stop.

### Step 7 – Optional User Acceptance Checklist

When all tasks complete and `REVIEW_STATUS=OK` (advisory, non-blocking):

- Create/update `.ai/plans/<PLAN_ID>/user-acceptance-checklist.md`
- Content: "How to run" commands (from task `Verification`), expected user-visible results, quick failure hints
- Never block `NEXT_COMMAND`; never fail if file generation is skipped

### Step 8 – Success Output

Emit in this exact order (once per successful controlled stop):

```
HITL_MODE=<ON|OFF>
PARALLEL_MODE=<ON|OFF>
PARALLEL_BATCH_SIZE=<1-4>
RUNSUBAGENT_DISPATCH_COUNT=<n>
RUN_PHASE_NOTE_FILE=<path|none>
PHASE_REVIEW_STATUS=<APPROVED|NEEDS_REVISION|FAILED|NA>
REVIEW_STATUS=<OK|FAIL|ESCALATE>
ARCHIVE_RESULT=<SKIPPED|DONE|LOCKED>
NEXT_COMMAND=<done|rw-planner|rw-loop>
```

Append one short reflection entry to `.ai/memory/shared-memory.md` when run completes or escalates.

## State Machine (Task Level)

```
pending → in-progress → completed
              ↓              ↑
           blocked ──────────
```

Rules:
- `pending → in-progress` before dispatch
- `in-progress → completed` only if delta/evidence invariants pass
- `in-progress → blocked` after 3-strike failure
- `completed → pending` forbidden unless explicit review rollback log exists

## Contract Tokens

| Token | Meaning |
|-------|---------|
| `RUNSUBAGENT_DISPATCH_BEGIN <TASK-XX>` | Coder dispatch started |
| `RUNSUBAGENT_DISPATCH_OK <TASK-XX>` | Coder dispatch succeeded with evidence |
| `VERIFICATION_EVIDENCE <TASK-ID>` | Evidence entry appended by coder |
| `TASK_INSPECTION=PASS\|FAIL` | Task inspector result |
| `USER_PATH_GATE=PASS\|FAIL` | User path accessibility check |
| `SECURITY_GATE=PASS\|FAIL` | Security review result |
| `PHASE_INSPECTION=PASS\|FAIL` | Phase-level review result |
| `PHASE_REVIEW_STATUS=APPROVED\|NEEDS_REVISION\|FAILED` | Phase review decision |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `LANG_POLICY_MISSING` | Create `.ai/CONTEXT.md` via `rw-planner` first |
| `TARGET_ROOT_INVALID` | Run `rw-planner` first to create `.ai/PROGRESS.md` and `.ai/tasks/` |
| `RW_ENV_UNSUPPORTED` | Ensure `runSubagent` is available in your Copilot environment |
| `RW_SUBAGENT_PROMPT_MISSING` | Copy all five subagent prompt templates to `.github/prompts/subagents/` |
| `TASK_DEPENDENCY_BLOCKED` | All remaining tasks are blocked; run `rw-planner` to replan |
| `SECURITY_GATE_FAILED` | Fix security findings in the flagged files, then re-run `rw-loop` |
| `REVIEW-ESCALATE` after 3 strikes | Run `rw-planner` to replan the blocked task |
| Skill not discovered | Use trigger phrases: "implement tasks", "start implementation", "run loop" |

## References

- `templates/` – agent file and all subagent prompts for new projects
- Pair with `rw-planner` skill for the full plan-then-implement pipeline
