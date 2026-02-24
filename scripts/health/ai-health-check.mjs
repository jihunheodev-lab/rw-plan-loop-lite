#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const REQUIRED_AI_DIRS = ["features", "tasks", "plans", "runtime", "memory", "notes"];
const REQUIRED_PLAN_FILES = ["plan-summary.yaml", "task-graph.yaml"];
const REQUIRED_AI_FILES = {
  context: "CONTEXT.md",
  progress: "PROGRESS.md",
  sharedMemory: path.join("memory", "shared-memory.md"),
};

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function parseArgs(argv) {
  let root = process.cwd();
  let mode = "check";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root" && argv[i + 1]) {
      root = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--mode" && argv[i + 1]) {
      mode = String(argv[i + 1]).trim().toLowerCase();
      i += 1;
      continue;
    }
  }

  if (!["check", "fix"].includes(mode)) {
    throw new Error(`invalid --mode: ${mode} (expected check|fix)`);
  }

  return { root, mode };
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function readTextIfExists(filePath) {
  if (!(await exists(filePath))) {
    return "";
  }
  return readText(filePath);
}

async function writeText(filePath, body) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body, "utf8");
}

function parseActivePlan(planMdBody) {
  const lines = planMdBody.replace(/\r\n/g, "\n").split("\n");
  let planId = "";
  let feature = "";
  let strategy = "";
  let taskRange = "";

  for (const line of lines) {
    if (line.startsWith("- Plan ID:")) {
      planId = line.replace("- Plan ID:", "").trim();
    } else if (line.startsWith("- Feature:")) {
      feature = line.replace("- Feature:", "").trim();
    } else if (line.startsWith("- Strategy:")) {
      strategy = line.replace("- Strategy:", "").trim();
    } else if (line.startsWith("- Task Range:")) {
      taskRange = line.replace("- Task Range:", "").trim();
    }
  }

  return { planId, feature, strategy, taskRange };
}

function parseTaskIds(progressBody) {
  const ids = [];
  const lines = progressBody.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const m = line.match(/^\|\s*(TASK-\d+)\s*\|/);
    if (m) {
      ids.push(m[1]);
    }
  }
  return Array.from(new Set(ids));
}

function sortTaskIds(taskIds) {
  return [...taskIds].sort((a, b) => {
    const an = Number.parseInt(a.replace("TASK-", ""), 10);
    const bn = Number.parseInt(b.replace("TASK-", ""), 10);
    return an - bn;
  });
}

function buildTaskRange(taskIds) {
  if (taskIds.length === 0) {
    return "TASK-00 ~ TASK-00";
  }
  const ordered = sortTaskIds(taskIds);
  return `${ordered[0]} ~ ${ordered[ordered.length - 1]}`;
}

async function listDirs(dirPath) {
  if (!(await exists(dirPath))) {
    return [];
  }
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function listFiles(dirPath) {
  if (!(await exists(dirPath))) {
    return [];
  }
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

async function getLatestFeature(aiRoot) {
  const featuresDir = path.join(aiRoot, "features");
  if (!(await exists(featuresDir))) {
    return null;
  }
  const files = await fs.readdir(featuresDir, { withFileTypes: true });
  const candidates = [];

  for (const entry of files) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".md")) continue;
    if (entry.name === "FEATURE-TEMPLATE.md") continue;
    const filePath = path.join(featuresDir, entry.name);
    const stat = await fs.stat(filePath);
    candidates.push({ filePath, name: entry.name, mtimeMs: stat.mtimeMs });
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (candidates.length === 0) {
    return null;
  }

  const latest = candidates[0];
  const body = await readText(latest.filePath);
  const statusLine = body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .find((line) => line.trim().startsWith("- ") && line.includes("Status"));
  const status = statusLine ? statusLine.split(":").slice(1).join(":").trim() : "";

  return {
    key: latest.name.replace(/\.md$/i, ""),
    filePath: latest.filePath,
    status,
  };
}

function utcPlanId() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}-auto-recovery`;
}

async function isMissingOrEmpty(filePath) {
  if (!(await exists(filePath))) {
    return true;
  }
  const body = await readText(filePath);
  return body.trim().length === 0;
}

function rel(root, targetPath) {
  return toPosix(path.relative(root, targetPath));
}

function buildContextMd() {
  return [
    "# Context",
    "",
    "Language policy reference for planner/loop runtime.",
    "",
    "- Primary Language: Korean",
    "- Artifact prose (plan/feature/task): follow Response language",
    "- Section headers may remain English unless policy overrides",
    "- Machine tokens must remain in English.",
    "",
  ].join("\n");
}

function buildProgressMd() {
  return [
    "# Progress",
    "",
    "## Task Status",
    "",
    "| Task | Title | Status | Commit |",
    "|------|-------|--------|--------|",
    "",
    "## Phase Status",
    "",
    "Current Phase: Phase 1",
    "- Phase 1: in-progress",
    "",
    "## Log",
    "",
  ].join("\n");
}

function buildSharedMemoryMd() {
  return [
    "# Shared Memory",
    "",
    "## [Bootstrap]",
    "- Fact: Shared memory file was auto-created by ai-health-check.",
    "- Reason: Planner/loop memory contract requires this path.",
    "- Evidence: scripts/health/ai-health-check.mjs --mode fix",
    `- Updated: ${new Date().toISOString().slice(0, 10)}`,
    "",
  ].join("\n");
}

async function collectHealth(root) {
  const aiRoot = path.join(root, ".ai");
  const issues = [];

  const contextPath = path.join(aiRoot, REQUIRED_AI_FILES.context);
  const progressPath = path.join(aiRoot, REQUIRED_AI_FILES.progress);
  const planPath = path.join(aiRoot, "PLAN.md");
  const sharedMemoryPath = path.join(aiRoot, REQUIRED_AI_FILES.sharedMemory);
  const activePlanPath = path.join(aiRoot, "runtime", "rw-active-plan-id.txt");

  if (!(await exists(aiRoot))) {
    issues.push("AI_ROOT_MISSING");
    return {
      issues,
      aiRoot,
      planId: "",
      planDir: "",
      featureKey: "",
      taskIds: [],
      strategy: "SINGLE",
      contextPath,
      progressPath,
      planPath,
      sharedMemoryPath,
      activePlanPath,
    };
  }

  for (const dirName of REQUIRED_AI_DIRS) {
    const p = path.join(aiRoot, dirName);
    if (!(await exists(p))) {
      issues.push(`DIR_MISSING_${dirName.toUpperCase()}`);
    }
  }

  if (await isMissingOrEmpty(contextPath)) {
    issues.push("CONTEXT_MISSING");
  }
  if (await isMissingOrEmpty(progressPath)) {
    issues.push("PROGRESS_MISSING");
  }
  if (await isMissingOrEmpty(sharedMemoryPath)) {
    issues.push("SHARED_MEMORY_MISSING");
  }

  const progressBody = await readTextIfExists(progressPath);
  const planBody = await readTextIfExists(planPath);
  const activePlanId = (await readTextIfExists(activePlanPath)).trim();
  const planMeta = parseActivePlan(planBody);
  const taskIds = parseTaskIds(progressBody);
  const latestFeature = await getLatestFeature(aiRoot);

  const planFromMd = planMeta.planId;
  const planDirs = await listDirs(path.join(aiRoot, "plans"));
  const latestPlanDir = [...planDirs].sort().slice(-1)[0] || "";
  const selectedPlanId = activePlanId || planFromMd || latestPlanDir;
  const planDir = selectedPlanId ? path.join(aiRoot, "plans", selectedPlanId) : "";

  if (activePlanId && planFromMd && activePlanId !== planFromMd) {
    issues.push("ACTIVE_PLAN_POINTER_MISMATCH");
  }
  if (taskIds.length > 0 && !selectedPlanId) {
    issues.push("TASKS_WITHOUT_ACTIVE_PLAN");
  }
  if (!activePlanId && selectedPlanId) {
    issues.push("ACTIVE_PLAN_ID_MISSING");
  }
  if (!planFromMd && selectedPlanId) {
    issues.push("PLAN_MD_MISSING");
  }

  if (selectedPlanId) {
    if (!(await exists(planDir))) {
      issues.push("PLAN_DIR_MISSING");
    } else {
      for (const fileName of REQUIRED_PLAN_FILES) {
        if (await isMissingOrEmpty(path.join(planDir, fileName))) {
          issues.push(fileName === "plan-summary.yaml" ? "PLAN_SUMMARY_MISSING" : "TASK_GRAPH_MISSING");
        }
      }

      const planFiles = await listFiles(planDir);
      const researchFiles = planFiles.filter(
        (name) => name.startsWith("research_findings_") && name.toLowerCase().endsWith(".yaml")
      );
      if (researchFiles.length === 0) {
        issues.push("RESEARCH_FINDINGS_MISSING");
      } else {
        let hasNonEmptyResearch = false;
        for (const name of researchFiles) {
          const p = path.join(planDir, name);
          if (!(await isMissingOrEmpty(p))) {
            hasNonEmptyResearch = true;
            break;
          }
        }
        if (!hasNonEmptyResearch) {
          issues.push("RESEARCH_FINDINGS_MISSING");
        }
      }
    }
  }

  return {
    issues,
    aiRoot,
    planId: selectedPlanId || "",
    planDir,
    featureKey: latestFeature ? latestFeature.key : planMeta.feature || "FEATURE-RECOVERY",
    taskIds,
    strategy: planMeta.strategy || "SINGLE",
    contextPath,
    progressPath,
    planPath,
    sharedMemoryPath,
    activePlanPath,
  };
}

function buildPlanMd(planId, featureKey, strategy, taskRange) {
  return [
    "# Active Plan",
    "",
    `- Plan ID: ${planId}`,
    `- Feature: ${featureKey}`,
    `- Strategy: ${strategy}`,
    `- Task Range: ${taskRange}`,
    "",
  ].join("\n");
}

function buildPlanSummaryYaml(planId, featureKey, strategy, taskRange) {
  return [
    `plan_id: ${planId}`,
    `feature_key: ${featureKey}`,
    "feature_status: PLANNED",
    `plan_strategy: ${strategy}`,
    "plan_mode: RECOVERY",
    `task_range: ${taskRange.replace(" ~ ", "~")}`,
    "plan_risk_level: MEDIUM",
    "plan_confidence: MEDIUM",
    "open_questions_count: 0",
    'notes:',
    '  - "Auto-generated by ai-health-check recovery path."',
    "",
  ].join("\n");
}

function buildTaskGraphYaml(planId, taskIds) {
  const ordered = sortTaskIds(taskIds);
  const safeTasks = ordered.length > 0 ? ordered : ["TASK-00"];

  const lines = [];
  lines.push(`plan_id: ${planId}`);
  lines.push("nodes:");
  for (const taskId of safeTasks) {
    lines.push(`  - task_id: ${taskId}`);
    lines.push('    phase: "Unknown"');
    lines.push(`    title: "${taskId}"`);
  }

  lines.push("edges:");
  if (safeTasks.length === 1) {
    lines.push("  []");
  } else {
    for (let i = 0; i < safeTasks.length - 1; i += 1) {
      lines.push(`  - from: ${safeTasks[i]}`);
      lines.push(`    to: ${safeTasks[i + 1]}`);
    }
  }

  lines.push("parallel_groups:");
  lines.push("  []");
  lines.push("");
  return lines.join("\n");
}

function buildResearchYaml() {
  return [
    "focus_area: recovery",
    "summary: >",
    "  Auto-generated placeholder to restore required planner artifacts.",
    "citations:",
    "  - .ai/PROGRESS.md:1",
    "assumptions:",
    '  - "Task execution may already be complete; this file restores artifact integrity only."',
    "",
  ].join("\n");
}

async function runFix(root, inspection) {
  let applied = 0;
  const aiRoot = inspection.aiRoot;

  await fs.mkdir(aiRoot, { recursive: true });
  for (const dirName of REQUIRED_AI_DIRS) {
    const p = path.join(aiRoot, dirName);
    if (!(await exists(p))) {
      await fs.mkdir(p, { recursive: true });
      applied += 1;
    }
  }

  if (await isMissingOrEmpty(inspection.contextPath)) {
    await writeText(inspection.contextPath, buildContextMd());
    applied += 1;
  }
  if (await isMissingOrEmpty(inspection.progressPath)) {
    await writeText(inspection.progressPath, buildProgressMd());
    applied += 1;
  }
  if (await isMissingOrEmpty(inspection.sharedMemoryPath)) {
    await writeText(inspection.sharedMemoryPath, buildSharedMemoryMd());
    applied += 1;
  }

  const planId = inspection.planId || utcPlanId();
  const planDir = path.join(aiRoot, "plans", planId);
  await fs.mkdir(planDir, { recursive: true });

  const activeBody = `${planId}\n`;
  const currentActive = await readTextIfExists(inspection.activePlanPath);
  if (currentActive !== activeBody) {
    await writeText(inspection.activePlanPath, activeBody);
    applied += 1;
  }

  const taskRange = buildTaskRange(inspection.taskIds);
  const planMdBody = buildPlanMd(planId, inspection.featureKey, inspection.strategy || "SINGLE", taskRange);
  const currentPlanMd = await readTextIfExists(inspection.planPath);
  if (currentPlanMd !== planMdBody) {
    await writeText(inspection.planPath, planMdBody);
    applied += 1;
  }

  const planSummaryPath = path.join(planDir, "plan-summary.yaml");
  if (await isMissingOrEmpty(planSummaryPath)) {
    await writeText(planSummaryPath, buildPlanSummaryYaml(planId, inspection.featureKey, inspection.strategy || "SINGLE", taskRange));
    applied += 1;
  }

  const taskGraphPath = path.join(planDir, "task-graph.yaml");
  if (await isMissingOrEmpty(taskGraphPath)) {
    await writeText(taskGraphPath, buildTaskGraphYaml(planId, inspection.taskIds));
    applied += 1;
  }

  const files = await listFiles(planDir);
  const researchFiles = files.filter((name) => name.startsWith("research_findings_") && name.toLowerCase().endsWith(".yaml"));
  let hasResearch = false;
  for (const name of researchFiles) {
    if (!(await isMissingOrEmpty(path.join(planDir, name)))) {
      hasResearch = true;
      break;
    }
  }
  if (!hasResearch) {
    const researchPath = path.join(planDir, "research_findings_recovery.yaml");
    await writeText(researchPath, buildResearchYaml());
    applied += 1;
  }

  return { applied, planId, planDir };
}

function printReport({ mode, status, issues, applied, planId, planDir, root }) {
  console.log(`AI_HEALTH_MODE=${mode}`);
  console.log(`AI_HEALTH_STATUS=${status}`);
  console.log(`AI_HEALTH_ISSUES=${issues.length > 0 ? issues.join(",") : "none"}`);
  console.log(`AI_HEALTH_FIX_APPLIED=${applied}`);
  console.log(`ACTIVE_PLAN_ID=${planId || "none"}`);
  console.log(`PLAN_DIR=${planDir ? rel(root, planDir) : "none"}`);
}

async function main() {
  const { root, mode } = parseArgs(process.argv.slice(2));
  const before = await collectHealth(root);

  if (mode === "check") {
    const status = before.issues.length === 0 ? "PASS" : "FAIL";
    printReport({
      mode,
      status,
      issues: before.issues,
      applied: 0,
      planId: before.planId,
      planDir: before.planDir,
      root,
    });
    if (status === "FAIL") {
      process.exit(1);
    }
    return;
  }

  const fixResult = await runFix(root, before);
  const after = await collectHealth(root);
  const status = after.issues.length === 0 ? "FIXED" : "FAIL";
  printReport({
    mode,
    status,
    issues: after.issues,
    applied: fixResult.applied,
    planId: after.planId || fixResult.planId,
    planDir: after.planDir || fixResult.planDir,
    root,
  });
  if (status === "FAIL") {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("AI_HEALTH_MODE=unknown");
  console.error("AI_HEALTH_STATUS=FAIL");
  console.error(`AI_HEALTH_ISSUES=UNEXPECTED_ERROR:${err.message}`);
  console.error("AI_HEALTH_FIX_APPLIED=0");
  console.error("ACTIVE_PLAN_ID=none");
  console.error("PLAN_DIR=none");
  process.exit(1);
});
