---
name: rw-loop
description: "Lite+Contract loop: DAG-aware dispatch, TDD evidence checks, user-path/security gates, and phase review contracts"
agent: agent
argument-hint: "Optional flags: --auto, --no-hitl, --hitl, --parallel, --max-parallel=<1..4>"
tools: [vscode/getProjectSetupInfo, vscode/installExtension, vscode/memory, vscode/newWorkspace, vscode/openIntegratedBrowser, vscode/runCommand, vscode/vscodeAPI, vscode/extensions, vscode/askQuestions, execute/runNotebookCell, execute/testFailure, execute/getTerminalOutput, execute/awaitTerminal, execute/killTerminal, execute/createAndRunTask, execute/runInTerminal, execute/runTests, read/getNotebookSummary, read/problems, read/readFile, read/terminalSelection, read/terminalLastCommand, agent/askQuestions, agent/runSubagent, edit/createDirectory, edit/createFile, edit/createJupyterNotebook, edit/editFiles, edit/editNotebook, edit/rename, search/changes, search/codebase, search/fileSearch, search/listDirectory, search/searchResults, search/textSearch, search/searchSubagent, search/usages, web/fetch, web/githubRepo, todo]
---

Language policy reference: `.ai/CONTEXT.md`

Quick summary:
- Pick one or more dispatchable tasks from dependency graph.
- Delegate implementation to coder subagent only.
- Enforce strict completion/evidence invariants per locked task.
- Run task inspector, user-path gate, and security gate after every dispatch.
- Run phase inspector with explicit phase review status contract.
- Run final review gate before success.
- Support controlled parallel mode for independent tasks only (up to 4).
- Publish an optional user-acceptance checklist artifact for manual testing.

Contract tokens:
- `RUNSUBAGENT_DISPATCH_BEGIN <TASK-XX>`
- `RUNSUBAGENT_DISPATCH_OK <TASK-XX>`
- `VERIFICATION_EVIDENCE <LOCKED_TASK_ID>`
- `TASK_INSPECTION=PASS|FAIL`
- `USER_PATH_GATE=PASS|FAIL`
- `SECURITY_GATE=PASS|FAIL`
- `PHASE_INSPECTION=PASS|FAIL`
- `PHASE_REVIEW_STATUS=<APPROVED|NEEDS_REVISION|FAILED>`

Failure tokens:
- `RW_ENV_UNSUPPORTED`
- `RW_SUBAGENT_COMPLETION_DELTA_INVALID`
- `RW_SUBAGENT_COMPLETED_WRONG_TASK`
- `RW_SUBAGENT_VERIFICATION_EVIDENCE_MISSING`
- `SECURITY_GATE_FAILED`
- `TASK_DEPENDENCY_BLOCKED`
- `REPLAN_TRIGGERED`
- `PAUSE_DETECTED`

Success output order:
- `PARALLEL_MODE=<ON|OFF>`
- `PARALLEL_BATCH_SIZE=<1-4>`
- `RUNSUBAGENT_DISPATCH_COUNT=<n>`
- `RUN_PHASE_NOTE_FILE=<path|none>`
- `PHASE_REVIEW_STATUS=<APPROVED|NEEDS_REVISION|FAILED|NA>`
- `REVIEW_STATUS=<OK|FAIL|ESCALATE>`
- `ARCHIVE_RESULT=<SKIPPED|DONE|LOCKED>`
- `NEXT_COMMAND=<done|rw-planner|rw-loop>`

Step 0 (Mandatory):
1) Read `.ai/CONTEXT.md` first.
2) If `.ai/CONTEXT.md` is missing/unreadable:
   - print `LANG_POLICY_MISSING`
   - print `NEXT_COMMAND=rw-planner`
   - stop
3) Ensure `.ai/PROGRESS.md` and `.ai/tasks/` exist.
4) If missing:
   - print `TARGET_ROOT_INVALID`
   - print `NEXT_COMMAND=rw-planner`
   - stop
5) Ensure `runSubagent` is available.
6) If unavailable:
   - print `RW_ENV_UNSUPPORTED`
   - print `NEXT_COMMAND=rw-loop`
   - stop
7) Confirm this mode never writes product code directly.
8) Ensure required subagent prompt files exist:
   - `.github/prompts/subagents/rw-loop-coder.subagent.md`
   - `.github/prompts/subagents/rw-loop-task-inspector.subagent.md`
   - `.github/prompts/subagents/rw-loop-security-review.subagent.md`
   - `.github/prompts/subagents/rw-loop-phase-inspector.subagent.md`
   - `.github/prompts/subagents/rw-loop-review.subagent.md`
   - if missing:
     - print `RW_SUBAGENT_PROMPT_MISSING`
     - print `NEXT_COMMAND=rw-loop`
     - stop
9) Resolve HITL mode:
   - if argument contains `--auto` or `--no-hitl`, set `HITL_MODE=OFF`
   - else if argument contains `--hitl`, set `HITL_MODE=ON`
   - else default `HITL_MODE=ON`
10) Resolve parallel mode:
   - if argument contains `--parallel`, set `PARALLEL_MODE=ON`
   - else `PARALLEL_MODE=OFF`
11) Resolve max parallel:
   - default `MAX_PARALLEL=4`
   - if argument contains `--max-parallel=<n>`:
     - clamp to `1..4`
12) If `PARALLEL_MODE=ON`, allow at most `MAX_PARALLEL` independent tasks per batch:
   - no dependency relation between selected tasks
   - separate lock and invariant checks per task
   - on ambiguity, fallback to single-task mode
13) If `.ai/memory/shared-memory.md` exists, read it before loop start.
14) If `.ai/runtime/rw-active-plan-id.txt` exists, read matching
   `.ai/plans/<PLAN_ID>/task-graph.yaml` as primary dependency graph.

Loop policy:
- Task priority: `in-progress` first, then `pending`.
- Never auto-select `blocked`.
- Single mode invariant:
  - one dispatch can complete exactly one task.
- Parallel mode invariant:
  - if `N` tasks were dispatched, exactly `N` tasks must become completed in this run.
- Every completed locked task must increase verification evidence count.
- State transitions:
  - `pending -> in-progress` before dispatch
  - `in-progress -> completed` only if delta/evidence invariants pass
  - `in-progress -> blocked` after repeated failure threshold
  - `completed -> pending` forbidden unless explicit review rollback log exists

Main loop:
1) If `.ai/PAUSE.md` exists:
   - print `PAUSE_DETECTED`
   - print `NEXT_COMMAND=rw-loop`
   - stop
2) Resolve locked task set from `PROGRESS`:
   - if `PARALLEL_MODE=OFF`, resolve one `LOCKED_TASK_ID`
   - if `PARALLEL_MODE=ON`, resolve up to `MAX_PARALLEL` independent tasks
     using `task-graph.yaml` (if present) or task-file dependencies fallback
   - define normalized set: `LOCKED_TASK_IDS=[TASK-..]`
3) If unresolved `REVIEW-ESCALATE` exists:
   - run review first, do not dispatch coding
4) If no dispatchable task and unfinished tasks exist:
   - print `TASK_DEPENDENCY_BLOCKED`
   - print `REPLAN_TRIGGERED`
   - print `NEXT_COMMAND=rw-planner`
   - stop
5) Capture before-state:
   - completed set
   - evidence count map for each `LOCKED_TASK_ID`
6) Dispatch coder:
   - if `PARALLEL_MODE=OFF`:
     - print `RUNSUBAGENT_DISPATCH_BEGIN <LOCKED_TASK_ID>`
     - load `.github/prompts/subagents/rw-loop-coder.subagent.md`
     - call runSubagent with loaded prompt injecting `LOCKED_TASK_ID`
   - if `PARALLEL_MODE=ON`:
     - select up to `MAX_PARALLEL` independent locked tasks
     - for each selected task:
       - print `RUNSUBAGENT_DISPATCH_BEGIN <TASK-XX>`
       - call runSubagent with loaded coder prompt injecting task id
     - keep independent before/after state snapshots per locked task
7) Post-dispatch validation:
   - if `PARALLEL_MODE=OFF`:
     - newly completed count must be 1
     - newly completed task must equal `LOCKED_TASK_ID`
   - if `PARALLEL_MODE=ON`:
     - newly completed count must equal number of dispatched tasks
     - newly completed set must exactly match `LOCKED_TASK_IDS`
   - on count/set mismatch:
     - print `RW_SUBAGENT_COMPLETION_DELTA_INVALID`
     - print `NEXT_COMMAND=rw-loop`
     - stop
   - for each locked task:
     - if completed task does not match expected lock:
       - print `RW_SUBAGENT_COMPLETED_WRONG_TASK`
       - print `NEXT_COMMAND=rw-loop`
       - stop
     - evidence count for task must increase:
       - else print `RW_SUBAGENT_VERIFICATION_EVIDENCE_MISSING`
       - print `NEXT_COMMAND=rw-loop`
       - stop
     - print `RUNSUBAGENT_DISPATCH_OK <TASK-XX>`
8) Mandatory task inspection (every dispatch):
   - load `.github/prompts/subagents/rw-loop-task-inspector.subagent.md`
   - for each locked task, call runSubagent injecting task id
   - require per task:
     - `TASK_INSPECTION=PASS` or `TASK_INSPECTION=FAIL`
     - `USER_PATH_GATE=PASS` or `USER_PATH_GATE=FAIL`
   - on fail:
     - keep task as `in-progress` or set to `blocked` per retry threshold
     - apply 3-strike rule for same task:
       - when same task fails inspection 3 times:
         - append `REVIEW-ESCALATE <LOCKED_TASK_ID>: reached 3-strike`
         - set status `blocked`
         - print `NEXT_COMMAND=rw-planner`
         - stop
9) Mandatory security gate (every dispatch):
   - load `.github/prompts/subagents/rw-loop-security-review.subagent.md`
   - call runSubagent with locked task ids
   - require:
     - `SECURITY_GATE=PASS` or `SECURITY_GATE=FAIL`
   - on fail:
     - print `SECURITY_GATE_FAILED`
     - keep affected task(s) as `in-progress` or set `blocked` for critical severity
     - print `NEXT_COMMAND=rw-loop`
     - stop
10) If current phase tasks are all completed:
   - load `.github/prompts/subagents/rw-loop-phase-inspector.subagent.md`
   - call runSubagent
   - require:
     - `PHASE_INSPECTION=PASS` or `PHASE_INSPECTION=FAIL`
     - `PHASE_REVIEW_STATUS=APPROVED|NEEDS_REVISION|FAILED`
   - on fail with `PHASE_REVIEW_STATUS=NEEDS_REVISION`:
     - print `NEXT_COMMAND=rw-loop`
     - stop
   - on fail with `PHASE_REVIEW_STATUS=FAILED`:
     - print `NEXT_COMMAND=rw-planner`
     - stop
   - if `HITL_MODE=ON`:
     - ask one explicit yes/no question:
       - "현재 phase를 완료로 승인하고 다음 phase로 진행할까요?"
     - if user declines:
       - print `NEXT_COMMAND=rw-loop`
       - stop
11) If all tasks completed:
   - load `.github/prompts/subagents/rw-loop-review.subagent.md`
   - run review subagent
   - require one of:
     - `REVIEW_STATUS=OK`
     - `REVIEW_STATUS=FAIL`
     - `REVIEW_STATUS=ESCALATE`
   - on fail/escalate, print:
     - `NEXT_COMMAND=rw-loop` or `NEXT_COMMAND=rw-planner`
     - stop
12) Optional user acceptance checklist (advisory, non-blocking):
   - trigger when all tasks are completed and `REVIEW_STATUS=OK`
   - if `.ai/runtime/rw-active-plan-id.txt` resolves to `PLAN_ID`, create/update:
     - `.ai/plans/<PLAN_ID>/user-acceptance-checklist.md`
   - checklist content should be concise and practical:
     - `How to run` commands (prefer task `Verification` commands)
     - expected user-visible results
     - quick failure hints
   - this artifact is advisory only:
     - never change task status based on this file
     - never block `NEXT_COMMAND`
     - never emit failure token if file generation is skipped or fails
13) Archive recommendation only (lite):
    - if completed rows > 20 or progress too large:
       - print `ARCHIVE_RESULT=SKIPPED`
    - no required script in lite mode

Success output:
- Emit success output order exactly once on controlled success stop.
- Also print `HITL_MODE=<ON|OFF>` once per run.
- Also print `PARALLEL_MODE=<ON|OFF>` once per run.
- Also print `PARALLEL_BATCH_SIZE=<1-4>` once per run.
- Append one short reflection entry to `.ai/memory/shared-memory.md` when run completes or escalates.
