#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

function utcNow() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return {
    stamp: `${yyyy}${mm}${dd}-${hh}${mi}${ss}`,
    ymd: `${yyyy}-${mm}-${dd}`,
    iso: `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`,
  };
}

function parseArgs(argv) {
  let root = process.cwd();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root" && argv[i + 1]) {
      root = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return { root };
}

async function main() {
  const { root } = parseArgs(process.argv.slice(2));
  const aiRoot = path.join(root, ".ai");
  const progressPath = path.join(aiRoot, "PROGRESS.md");
  const archiveDir = path.join(aiRoot, "progress-archive");

  const body = await fs.readFile(progressPath, "utf8");
  const lines = body.replace(/\r\n/g, "\n").split("\n");

  const taskIdx = lines.findIndex((l) => l.trim() === "## Task Status");
  const logIdx = lines.findIndex((l) => l.trim() === "## Log");
  if (taskIdx === -1 || logIdx === -1 || logIdx <= taskIdx) {
    console.error("ARCHIVE_RESULT=FAILED");
    console.error("ARCHIVE_REASON=PROGRESS_FORMAT_INVALID");
    process.exit(1);
  }

  const { stamp, ymd, iso } = utcNow();
  await fs.mkdir(archiveDir, { recursive: true });
  const statusFile = path.join(archiveDir, `STATUS-${stamp}.md`);
  const logFile = path.join(archiveDir, `LOG-${stamp}.md`);

  const tableLines = lines.slice(taskIdx, logIdx);
  const logLines = lines.slice(logIdx);

  await fs.writeFile(
    statusFile,
    ["# Progress Status Archive", "", `- Archived At (UTC): ${iso}`, ...tableLines, ""].join("\n"),
    "utf8"
  );
  await fs.writeFile(logFile, ["# Progress Log Archive", "", `- Archived At (UTC): ${iso}`, ...logLines, ""].join("\n"), "utf8");

  const newProgress = [
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
    `- **${ymd}** — Archived snapshot: STATUS-${stamp}.md, LOG-${stamp}.md`,
    "",
  ].join("\n");

  await fs.writeFile(progressPath, newProgress, "utf8");

  console.log(`ARCHIVE_STATUS_FILE=.ai/progress-archive/STATUS-${stamp}.md`);
  console.log(`ARCHIVE_LOG_FILE=.ai/progress-archive/LOG-${stamp}.md`);
  console.log("ARCHIVE_RESULT=DONE");
}

main().catch((err) => {
  console.error("ARCHIVE_RESULT=FAILED");
  console.error(`ARCHIVE_REASON=${err.message}`);
  process.exit(1);
});

