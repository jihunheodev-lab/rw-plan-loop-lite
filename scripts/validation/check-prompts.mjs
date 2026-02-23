#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function requireToken(errors, filePath, content, token) {
  if (!content.includes(token)) {
    errors.push(`${filePath}: missing token "${token}"`);
  }
}

async function read(filePath, errors) {
  if (!(await exists(filePath))) {
    errors.push(`${filePath}: missing file`);
    return "";
  }
  return fs.readFile(filePath, "utf8");
}

async function main() {
  const root = process.cwd();
  const errors = [];

  const plannerPath = path.join(root, ".github", "agents", "rw-planner.agent.md");
  const loopPath = path.join(root, ".github", "agents", "rw-loop.agent.md");
  const autoPath = path.join(root, ".github", "agents", "rw-auto.agent.md");
  const coderPromptPath = path.join(root, ".github", "prompts", "subagents", "rw-loop-coder.subagent.md");
  const taskInspectorPath = path.join(root, ".github", "prompts", "subagents", "rw-loop-task-inspector.subagent.md");
  const securityReviewPath = path.join(root, ".github", "prompts", "subagents", "rw-loop-security-review.subagent.md");
  const phaseInspectorPath = path.join(root, ".github", "prompts", "subagents", "rw-loop-phase-inspector.subagent.md");
  const reviewPromptPath = path.join(root, ".github", "prompts", "subagents", "rw-loop-review.subagent.md");
  const memoryContractPath = path.join(root, "docs", "memory-contract.md");
  const featureTemplatePath = path.join(root, "docs", "feature-template.md");
  const healthCheckPath = path.join(root, "scripts", "health", "ai-health-check.mjs");
  const topLevelRunnerPath = path.join(root, "scripts", "orchestrator", "rw-top-level-runner.mjs");

  const planner = await read(plannerPath, errors);
  const loop = await read(loopPath, errors);
  const auto = await read(autoPath, errors);
  const coderPrompt = await read(coderPromptPath, errors);
  const taskInspectorPrompt = await read(taskInspectorPath, errors);
  const securityReviewPrompt = await read(securityReviewPath, errors);
  const phaseInspectorPrompt = await read(phaseInspectorPath, errors);
  const reviewPrompt = await read(reviewPromptPath, errors);
  const memoryContract = await read(memoryContractPath, errors);
  const featureTemplate = await read(featureTemplatePath, errors);
  const healthCheck = await read(healthCheckPath, errors);
  const topLevelRunner = await read(topLevelRunnerPath, errors);

  if (planner) {
    requireToken(errors, "rw-planner.agent.md", planner, "name: rw-planner");
    requireToken(errors, "rw-planner.agent.md", planner, "Language policy reference: `.ai/CONTEXT.md`");
    requireToken(errors, "rw-planner.agent.md", planner, "Step 0 (Mandatory):");
    requireToken(errors, "rw-planner.agent.md", planner, "LANG_POLICY_MISSING");
    requireToken(errors, "rw-planner.agent.md", planner, "runSubagent");
    requireToken(errors, "rw-planner.agent.md", planner, "RW_ENV_UNSUPPORTED");
    requireToken(errors, "rw-planner.agent.md", planner, "Hybrid intake (mandatory):");
    requireToken(errors, "rw-planner.agent.md", planner, "Phase A - Mandatory Need-Gate");
    requireToken(errors, "rw-planner.agent.md", planner, "Phase B - Deep Dive");
    requireToken(errors, "rw-planner.agent.md", planner, "Phase C - Confirmation Gate");
    requireToken(errors, "rw-planner.agent.md", planner, "Phase D - Ambiguity Scoring");
    requireToken(errors, "rw-planner.agent.md", planner, "Phase E - Subagent Planning");
    requireToken(errors, "rw-planner.agent.md", planner, "Do not place plan text inside `askQuestions` placeholders.");
    requireToken(errors, "rw-planner.agent.md", planner, "TARGET_KIND");
    requireToken(errors, "rw-planner.agent.md", planner, "AMBIGUITY_SCORE=<0-100>");
    requireToken(errors, "rw-planner.agent.md", planner, "AMBIGUITY_REASONS=<comma-separated-codes>");
    requireToken(errors, "rw-planner.agent.md", planner, "PLAN_STRATEGY=<SINGLE|PARALLEL_AUTO>");
    requireToken(errors, "rw-planner.agent.md", planner, "FEATURE_KEY=<JIRA-123|FEATURE-XX>");
    requireToken(errors, "rw-planner.agent.md", planner, "candidate-plan-1.md");
    requireToken(errors, "rw-planner.agent.md", planner, "candidate-plan-4.md");
    requireToken(errors, "rw-planner.agent.md", planner, "candidate-selection.md");
    requireToken(errors, "rw-planner.agent.md", planner, "TASK_GRAPH_FILE=<path>");
    requireToken(errors, "rw-planner.agent.md", planner, "task-graph.yaml");
    requireToken(errors, "rw-planner.agent.md", planner, "PAUSE_DETECTED");
    requireToken(errors, "rw-planner.agent.md", planner, "[A-Z]+-[0-9]+");
    requireToken(errors, "rw-planner.agent.md", planner, "citations");
    requireToken(errors, "rw-planner.agent.md", planner, "FEATURE_REVIEW_REQUIRED");
    requireToken(errors, "rw-planner.agent.md", planner, "FEATURE_REVIEW_REASON=<APPROVAL_MISSING|APPROVAL_RESET_SCOPE_CHANGED>");
    requireToken(errors, "rw-planner.agent.md", planner, "FEATURE_REVIEW_HINT=<what_to_edit>");
    requireToken(errors, "rw-planner.agent.md", planner, "Approval: PENDING|APPROVED");
    requireToken(errors, "rw-planner.agent.md", planner, "Feature Hash: <sha256>");
    requireToken(errors, "rw-planner.agent.md", planner, "SHA-256");
    requireToken(errors, "rw-planner.agent.md", planner, "## Candidate JSON");
    requireToken(errors, "rw-planner.agent.md", planner, "winner_candidate_id");
    requireToken(errors, "rw-planner.agent.md", planner, "INTERVIEW_DEEP_REQUIRED");
    requireToken(errors, "rw-planner.agent.md", planner, "INTERVIEW_ABORTED");
    requireToken(errors, "rw-planner.agent.md", planner, "PLAN_ARTIFACTS_INCOMPLETE");
    requireToken(errors, "rw-planner.agent.md", planner, "PLAN_ID=<id>");
    requireToken(errors, "rw-planner.agent.md", planner, "PLAN_TASK_RANGE=<TASK-XX~TASK-YY>");
    requireToken(errors, "rw-planner.agent.md", planner, "NEXT_COMMAND=rw-loop");
    requireToken(errors, "rw-planner.agent.md", planner, "## Phase Status");
    requireToken(errors, "rw-planner.agent.md", planner, "Accessibility Criteria");
    requireToken(errors, "rw-planner.agent.md", planner, "Verify artifact completeness (mandatory):");
    requireToken(errors, "rw-planner.agent.md", planner, ".ai/memory/shared-memory.md");
  }

  if (loop) {
    requireToken(errors, "rw-loop.agent.md", loop, "name: rw-loop");
    requireToken(errors, "rw-loop.agent.md", loop, "Language policy reference: `.ai/CONTEXT.md`");
    requireToken(errors, "rw-loop.agent.md", loop, "Step 0 (Mandatory):");
    requireToken(errors, "rw-loop.agent.md", loop, "LANG_POLICY_MISSING");
    requireToken(errors, "rw-loop.agent.md", loop, "RUNSUBAGENT_DISPATCH_BEGIN <TASK-XX>");
    requireToken(errors, "rw-loop.agent.md", loop, "RW_SUBAGENT_VERIFICATION_EVIDENCE_MISSING");
    requireToken(errors, "rw-loop.agent.md", loop, "TASK_INSPECTION=PASS|FAIL");
    requireToken(errors, "rw-loop.agent.md", loop, "USER_PATH_GATE=PASS|FAIL");
    requireToken(errors, "rw-loop.agent.md", loop, "SECURITY_GATE=PASS|FAIL");
    requireToken(errors, "rw-loop.agent.md", loop, "PHASE_INSPECTION=PASS|FAIL");
    requireToken(errors, "rw-loop.agent.md", loop, "PHASE_REVIEW_STATUS=<APPROVED|NEEDS_REVISION|FAILED>");
    requireToken(errors, "rw-loop.agent.md", loop, "SECURITY_GATE_FAILED");
    requireToken(errors, "rw-loop.agent.md", loop, "HITL_MODE=<ON|OFF>");
    requireToken(errors, "rw-loop.agent.md", loop, "PARALLEL_MODE=<ON|OFF>");
    requireToken(errors, "rw-loop.agent.md", loop, "--parallel");
    requireToken(errors, "rw-loop.agent.md", loop, "--max-parallel=<1..4>");
    requireToken(errors, "rw-loop.agent.md", loop, "MAX_PARALLEL=4");
    requireToken(errors, "rw-loop.agent.md", loop, "task-graph.yaml");
    requireToken(errors, "rw-loop.agent.md", loop, ".github/prompts/subagents/rw-loop-security-review.subagent.md");
    requireToken(errors, "rw-loop.agent.md", loop, "PAUSE_DETECTED");
    requireToken(errors, "rw-loop.agent.md", loop, ".ai/memory/shared-memory.md");
  }

  if (auto) {
    requireToken(errors, "rw-auto.agent.md", auto, "name: rw-auto");
    requireToken(errors, "rw-auto.agent.md", auto, "Language policy reference: `.ai/CONTEXT.md`");
    requireToken(errors, "rw-auto.agent.md", auto, "LANG_POLICY_MISSING");
    requireToken(errors, "rw-auto.agent.md", auto, "AUTO_EXECUTION_MODE=ROUTE_ONLY");
    requireToken(errors, "rw-auto.agent.md", auto, "AUTO_ROUTE_TARGET=<rw-planner|rw-loop|done>");
    requireToken(errors, "rw-auto.agent.md", auto, "AUTO_ROUTE_REASON=<RECOVERY_CONTEXT|RECOVERY_STATE|FEATURE_SUMMARY|ACTIVE_TASKS|TASK_ROWS_REVIEW|READY_FEATURE|PLAN_ARTIFACTS_MISSING|NO_WORK|UNDECIDED_DEFAULT>");
    requireToken(errors, "rw-auto.agent.md", auto, "AUTO_ROUTE_UNDECIDED");
    requireToken(errors, "rw-auto.agent.md", auto, ".ai/runtime/rw-auto.lock");
    requireToken(errors, "rw-auto.agent.md", auto, "AUTO_LOCK_HELD");
    requireToken(errors, "rw-auto.agent.md", auto, "AUTO_PLAN_ARTIFACTS_MISSING");
    requireToken(errors, "rw-auto.agent.md", auto, "AUTO_HEALTHCHECK_FAILED");
    requireToken(errors, "rw-auto.agent.md", auto, "AUTO_INPUT_SUMMARY_OVERRIDES_TASKS");
    requireToken(errors, "rw-auto.agent.md", auto, "ai-health-check.mjs --mode check");
    requireToken(errors, "rw-auto.agent.md", auto, "PAUSE_DETECTED");
    requireToken(errors, "rw-auto.agent.md", auto, "Never call `runSubagent`.");
    requireToken(errors, "rw-auto.agent.md", auto, "NEXT_COMMAND=<rw-planner|rw-loop|done|rw-auto>");
    requireToken(errors, "rw-auto.agent.md", auto, "NEXT_COMMAND=rw-planner");
  }

  if (healthCheck) {
    requireToken(errors, "scripts/health/ai-health-check.mjs", healthCheck, "AI_HEALTH_STATUS=");
    requireToken(errors, "scripts/health/ai-health-check.mjs", healthCheck, "AI_HEALTH_FIX_APPLIED=");
    requireToken(errors, "scripts/health/ai-health-check.mjs", healthCheck, "ACTIVE_PLAN_ID=");
    requireToken(errors, "scripts/health/ai-health-check.mjs", healthCheck, "PLAN_DIR=");
  }

  if (topLevelRunner) {
    requireToken(errors, "scripts/orchestrator/rw-top-level-runner.mjs", topLevelRunner, "RUNNER_MODE=TOP_LEVEL");
    requireToken(errors, "scripts/orchestrator/rw-top-level-runner.mjs", topLevelRunner, "RUNNER_NEXT_COMMAND=");
    requireToken(errors, "scripts/orchestrator/rw-top-level-runner.mjs", topLevelRunner, "RUNNER_MAX_STEPS_REACHED");
    requireToken(errors, "scripts/orchestrator/rw-top-level-runner.mjs", topLevelRunner, "NEXT_COMMAND");
    requireToken(errors, "scripts/orchestrator/rw-top-level-runner.mjs", topLevelRunner, "AUTO_ROUTE_TARGET");
  }

  if (coderPrompt) {
    requireToken(errors, "rw-loop-coder.subagent.md", coderPrompt, "VERIFICATION_EVIDENCE <LOCKED_TASK_ID>");
    requireToken(errors, "rw-loop-coder.subagent.md", coderPrompt, "Mandatory workflow (TDD first):");
    requireToken(errors, "rw-loop-coder.subagent.md", coderPrompt, "confirm at least one targeted failure before implementation");
    requireToken(errors, "rw-loop-coder.subagent.md", coderPrompt, "user entry wiring");
    requireToken(errors, "rw-loop-coder.subagent.md", coderPrompt, "failing test evidence (exit_code != 0)");
    requireToken(errors, "rw-loop-coder.subagent.md", coderPrompt, "Never call `runSubagent`");
  }

  if (taskInspectorPrompt) {
    requireToken(errors, "rw-loop-task-inspector.subagent.md", taskInspectorPrompt, "TASK_INSPECTION=PASS");
    requireToken(errors, "rw-loop-task-inspector.subagent.md", taskInspectorPrompt, "TASK_INSPECTION=FAIL");
    requireToken(errors, "rw-loop-task-inspector.subagent.md", taskInspectorPrompt, "USER_PATH_GATE=PASS");
    requireToken(errors, "rw-loop-task-inspector.subagent.md", taskInspectorPrompt, "USER_PATH_GATE=FAIL");
    requireToken(errors, "rw-loop-task-inspector.subagent.md", taskInspectorPrompt, "REVIEW_FINDING");
  }

  if (securityReviewPrompt) {
    requireToken(errors, "rw-loop-security-review.subagent.md", securityReviewPrompt, "SECURITY_GATE=PASS");
    requireToken(errors, "rw-loop-security-review.subagent.md", securityReviewPrompt, "SECURITY_GATE=FAIL");
    requireToken(errors, "rw-loop-security-review.subagent.md", securityReviewPrompt, "SECURITY_FINDINGS=<n>");
    requireToken(errors, "rw-loop-security-review.subagent.md", securityReviewPrompt, "SECURITY_FINDING <LOCKED_TASK_ID>");
  }

  if (phaseInspectorPrompt) {
    requireToken(errors, "rw-loop-phase-inspector.subagent.md", phaseInspectorPrompt, "PHASE_INSPECTION=PASS");
    requireToken(errors, "rw-loop-phase-inspector.subagent.md", phaseInspectorPrompt, "PHASE_INSPECTION=FAIL");
    requireToken(errors, "rw-loop-phase-inspector.subagent.md", phaseInspectorPrompt, "PHASE_REVIEW_STATUS=APPROVED");
    requireToken(errors, "rw-loop-phase-inspector.subagent.md", phaseInspectorPrompt, "PHASE_REVIEW_STATUS=NEEDS_REVISION");
    requireToken(errors, "rw-loop-phase-inspector.subagent.md", phaseInspectorPrompt, "PHASE_REVIEW_STATUS=FAILED");
    requireToken(errors, "rw-loop-phase-inspector.subagent.md", phaseInspectorPrompt, "REVIEW-ESCALATE TASK-XX");
  }

  if (reviewPrompt) {
    requireToken(errors, "rw-loop-review.subagent.md", reviewPrompt, "REVIEW_STATUS=OK");
    requireToken(errors, "rw-loop-review.subagent.md", reviewPrompt, "REVIEW_STATUS=FAIL");
    requireToken(errors, "rw-loop-review.subagent.md", reviewPrompt, "REVIEW_STATUS=ESCALATE");
  }

  if (memoryContract) {
    requireToken(errors, "docs/memory-contract.md", memoryContract, ".ai/memory/shared-memory.md");
    requireToken(errors, "docs/memory-contract.md", memoryContract, "Never store secrets.");
  }

  if (featureTemplate) {
    requireToken(errors, "docs/feature-template.md", featureTemplate, "Approval: PENDING | APPROVED");
    requireToken(errors, "docs/feature-template.md", featureTemplate, "Feature Hash: <sha256>");
    requireToken(errors, "docs/feature-template.md", featureTemplate, "## Approval Checklist");
    requireToken(errors, "docs/feature-template.md", featureTemplate, "JIRA-123-add-search-command.md");
    requireToken(errors, "docs/feature-template.md", featureTemplate, "FEATURE-04-add-search-command.md");
  }

  if (errors.length > 0) {
    console.error("PROMPT_INTEGRITY_FAIL");
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log("PROMPT_INTEGRITY_OK");
}

main().catch((err) => {
  console.error("PROMPT_INTEGRITY_FAIL");
  console.error(`- unexpected error: ${err.message}`);
  process.exit(1);
});
