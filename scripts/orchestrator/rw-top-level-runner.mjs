#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const VALID_NEXT = new Set(["rw-auto", "rw-planner", "rw-loop", "done"]);

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/orchestrator/rw-top-level-runner.mjs \\",
      "    --auto-cmd \"<command template>\" \\",
      "    --planner-cmd \"<command template>\" \\",
      "    --loop-cmd \"<command template>\"",
      "",
      "Options:",
      "  --summary <text>            Optional feature summary.",
      "  --start <agent>             Start agent. Default: rw-auto",
      "  --max-steps <n>             Max orchestration steps. Default: 12",
      "  --cwd <path>                Working directory for child commands.",
      "  --log-dir <path>            Command log directory.",
      "  --loop-flags <text>         Optional loop flags string.",
      "  --dry-run                   Print resolved commands only.",
      "",
      "Template variables:",
      "  {summary}                   Raw summary text",
      "  {summary_json}              JSON-escaped summary text",
      "  {loop_flags}                Loop flags text",
      "  {step}                      Current step number",
      "  {agent}                     Current agent name",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {
    start: "rw-auto",
    maxSteps: 12,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (!token.startsWith("--")) {
      fail(`RUNNER_INVALID_ARG token=${token}`);
    }

    const withValue = token.includes("=") ? token : `${token}=${argv[i + 1] ?? ""}`;
    const [key, ...rest] = withValue.split("=");
    const value = rest.join("=");
    if (!token.includes("=")) {
      i += 1;
    }

    switch (key) {
      case "--auto-cmd":
        args.autoCmd = value;
        break;
      case "--planner-cmd":
        args.plannerCmd = value;
        break;
      case "--loop-cmd":
        args.loopCmd = value;
        break;
      case "--summary":
        args.summary = value;
        break;
      case "--start":
        args.start = value;
        break;
      case "--max-steps":
        args.maxSteps = Number.parseInt(value, 10);
        break;
      case "--cwd":
        args.cwd = value;
        break;
      case "--log-dir":
        args.logDir = value;
        break;
      case "--loop-flags":
        args.loopFlags = value;
        break;
      default:
        fail(`RUNNER_INVALID_ARG key=${key}`);
    }
  }

  return args;
}

function renderTemplate(template, context) {
  return template.replace(/\{([a-z_]+)\}/gi, (all, key) => {
    if (!(key in context)) {
      return all;
    }
    return String(context[key] ?? "");
  });
}

function extractLastToken(output, tokenName) {
  const pattern = new RegExp(`^${tokenName}=([^\\r\\n]+)$`, "gm");
  let found = null;
  let match = pattern.exec(output);
  while (match) {
    found = match[1].trim();
    match = pattern.exec(output);
  }
  return found;
}

function normalizeNextCommand(output) {
  const next = extractLastToken(output, "NEXT_COMMAND");
  if (next && VALID_NEXT.has(next)) {
    return next;
  }

  const routeTarget = extractLastToken(output, "AUTO_ROUTE_TARGET");
  if (routeTarget && VALID_NEXT.has(routeTarget)) {
    return routeTarget;
  }

  return null;
}

function runCommand(command, cwd, env) {
  return new Promise((resolve) => {
    const stdoutChunks = [];
    const stderrChunks = [];

    const child = spawn(command, {
      cwd,
      env,
      shell: true,
      windowsHide: true,
    });

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(chunk);
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
      process.stderr.write(chunk);
    });

    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      resolve({ code: code ?? 1, stdout, stderr, combined: `${stdout}${stderr}` });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.autoCmd) {
    fail("RUNNER_TEMPLATE_MISSING agent=rw-auto");
  }
  if (!args.plannerCmd) {
    fail("RUNNER_TEMPLATE_MISSING agent=rw-planner");
  }
  if (!args.loopCmd) {
    fail("RUNNER_TEMPLATE_MISSING agent=rw-loop");
  }
  if (!VALID_NEXT.has(args.start)) {
    fail(`RUNNER_INVALID_START value=${args.start}`);
  }
  if (!Number.isInteger(args.maxSteps) || args.maxSteps < 1 || args.maxSteps > 100) {
    fail("RUNNER_INVALID_MAX_STEPS expected=1..100");
  }

  const cwd = path.resolve(args.cwd ?? process.cwd());
  const logDir = path.resolve(args.logDir ?? path.join(cwd, ".ai", "runtime", "orchestrator"));
  await fs.mkdir(logDir, { recursive: true });

  const templates = {
    "rw-auto": args.autoCmd,
    "rw-planner": args.plannerCmd,
    "rw-loop": args.loopCmd,
  };

  const summary = args.summary ?? "";
  const contextBase = {
    summary,
    summary_json: JSON.stringify(summary),
    loop_flags: args.loopFlags ?? "",
  };

  let current = args.start;
  console.log("RUNNER_MODE=TOP_LEVEL");
  console.log(`RUNNER_START=${current}`);
  console.log(`RUNNER_MAX_STEPS=${args.maxSteps}`);
  console.log(`RUNNER_LOG_DIR=${logDir}`);

  for (let step = 1; step <= args.maxSteps; step += 1) {
    const template = templates[current];
    if (!template) {
      fail(`RUNNER_TEMPLATE_MISSING agent=${current}`);
    }

    const context = {
      ...contextBase,
      step,
      agent: current,
    };
    const command = renderTemplate(template, context);

    console.log(`RUNNER_STEP=${step}`);
    console.log(`RUNNER_AGENT=${current}`);
    console.log(`RUNNER_COMMAND=${command}`);

    if (args.dryRun) {
      const nextDry = current === "rw-auto" ? "rw-planner" : current === "rw-planner" ? "rw-loop" : "done";
      console.log(`RUNNER_DRY_RUN_NEXT=${nextDry}`);
      current = nextDry;
      if (current === "done") {
        console.log("RUNNER_STATUS=DONE");
        process.exit(0);
      }
      continue;
    }

    const result = await runCommand(command, cwd, {
      ...process.env,
      RW_FEATURE_SUMMARY: summary,
      RW_LOOP_FLAGS: args.loopFlags ?? "",
      RW_RUNNER_STEP: String(step),
      RW_RUNNER_AGENT: current,
    });

    const logName = `step-${String(step).padStart(2, "0")}-${current}.log`;
    const logPath = path.join(logDir, logName);
    await fs.writeFile(logPath, result.combined, "utf8");
    console.log(`RUNNER_STEP_LOG=${logPath}`);

    if (result.code !== 0) {
      fail(`RUNNER_CHILD_EXIT_NONZERO code=${result.code} agent=${current}`);
    }

    const next = normalizeNextCommand(result.combined);
    if (!next) {
      fail(`RUNNER_NEXT_COMMAND_MISSING agent=${current}`);
    }

    console.log(`RUNNER_NEXT_COMMAND=${next}`);
    if (next === "done") {
      console.log("RUNNER_STATUS=DONE");
      process.exit(0);
    }

    current = next;
  }

  fail("RUNNER_MAX_STEPS_REACHED");
}

main().catch((error) => {
  fail(`RUNNER_UNEXPECTED_ERROR message=${error.message}`);
});
