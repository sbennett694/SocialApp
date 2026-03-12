#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const ROOT = process.cwd();
const TASK_ROOT = path.join(ROOT, "Task Folders");
const ORCH_DIR = path.join(TASK_ROOT, "orchestration");
const STATUS_FILE = path.join(ORCH_DIR, "task-status.json");
const REPORT_TEMPLATE = path.join(ORCH_DIR, "task-completion-template.md");
const REPORTS_DIR = path.join(ORCH_DIR, "reports");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}
function getUntrackedFiles() {
  const output = run("git ls-files --others --exclude-standard");
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function splitCreatedVsModified(files) {
  const untracked = new Set(getUntrackedFiles());
  const created = [];
  const modified = [];

  for (const file of files) {
    if (untracked.has(file)) created.push(file);
    else modified.push(file);
  }

  return { created, modified };

}

function buildAutofillReport(taskId, reportPathValue, files) {
  const { created, modified } = splitCreatedVsModified(files);
  const testFiles = changedTestFiles(files);

  const report = `# Task Completion Report

Task ID: ${taskId}

Status: review

Summary:
TODO

Files Created:
${created.length ? created.map((f) => `- ${f}`).join("\n") : "None"}

Files Modified:
${modified.length ? modified.map((f) => `- ${f}`).join("\n") : "None"}

Tests Added:
${testFiles.length ? testFiles.map((f) => `- ${f}`).join("\n") : "None"}

Commands Run:
TODO

Test Results:
TODO

Manual Validation Notes:
TODO

Known Gaps:
TODO

Follow-Up Suggestions:
TODO
`;

  fs.writeFileSync(reportPathValue, report, "utf8");
}

function exists(p) {
  return fs.existsSync(p);
}

function ensureDirs() {
  if (!exists(STATUS_FILE)) {
    throw new Error(`Missing status file: ${STATUS_FILE}`);
  }
  if (!exists(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function taskPath(taskId) {
  return path.join(TASK_ROOT, taskId);
}

function reportPath(taskId) {
  return path.join(REPORTS_DIR, `${taskId}.md`);
}

function getStatusData() {
  ensureDirs();
  return readJson(STATUS_FILE);
}

function saveStatusData(data) {
  writeJson(STATUS_FILE, data);
}

function getNextPendingTask(data) {
  for (const taskId of data.queue) {
    const task = data.tasks[taskId];
    if (task && task.status === "pending") return taskId;
  }
  return null;
}

function run(cmd) {
  try {
    return cp.execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err) {
    return "";
  }
}

function getChangedFiles() {
  const output = run("git diff --name-only HEAD");
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function getStagedFiles() {
  const output = run("git diff --cached --name-only");
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function getTaskExpectedKeywords(taskId) {
  const map = {
    "001-club-admin-panel-polish": ["club", "membership", "admin", "request"],
    "002-notification-preview-navigation": ["notification", "comment", "highlight", "navigation"],
    "003-private-friends-notes": ["friend", "profile", "notes", "private"],
    "004-club-commons-feed": ["club", "feed", "commons", "activity"],
    "005-project-activity-timeline": ["project", "timeline", "milestone", "task"],
    "006-feed-card-types": ["feed", "card", "activity", "highlight"],
    "007-notification-preview-text": ["notification", "preview"],
    "008-club-project-creation": ["club", "project", "create"],
    "009-volunteer-system": ["volunteer", "project", "task", "milestone"],
    "010-profile-privacy-fields": ["profile", "privacy", "visibility"],
    "011-skill-endorsements": ["skill", "endorsement", "profile"],
    "012-contribution-metrics": ["contribution", "metric", "profile"],
    "013-praise-tokens": ["praise", "token", "profile"],
    "014-reputation-guardrails": ["reputation", "guardrail", "endorsement", "praise"],
    "015-impact-profile-ui": ["profile", "impact", "endorsement", "contribution"]
  };
  return map[taskId] || [];
}

function findOutOfScopeFiles(taskId, files) {
  const keywords = getTaskExpectedKeywords(taskId);
  if (!keywords.length) return [];
  return files.filter((file) => {
    const lower = file.toLowerCase();
    return !keywords.some((k) => lower.includes(k));
  });
}

function changedTestFiles(files) {
  return files.filter((f) => /(^|\/)(test|tests)\b|\.test\./i.test(f));
}

function ensureReport(taskId) {
  const target = reportPath(taskId);
  if (!exists(target)) {
    if (!exists(REPORT_TEMPLATE)) {
      throw new Error(`Missing report template: ${REPORT_TEMPLATE}`);
    }
    let content = fs.readFileSync(REPORT_TEMPLATE, "utf8");
    content = content.replace(/Task ID:\s*/i, `Task ID: ${taskId}\n`);
    fs.writeFileSync(target, content, "utf8");
    console.log(`Created report: ${path.relative(ROOT, target)}`);
  }
  return target;
}

function printBootstrapPrompt(taskId) {
  console.log(`
Paste this into a fresh Cline conversation:

You are working on exactly one task in this repository.

Current task:
Task Folders/${taskId}

Before doing anything else, read:

- Task Folders/${taskId}/requirements.md
- Task Folders/${taskId}/design.md
- Task Folders/${taskId}/prompt.md
- Task Folders/shared/task-contract.md
- Task Folders/shared/TESTING_GUIDELINES.md
- Task Folders/shared/repo-orientation.md
- Task Folders/shared/repo-map.md
- Task Folders/orchestration/task-queue.md
- Task Folders/orchestration/global-rules.md
- Task Folders/orchestration/task-execution-rules.md

Then inspect the repository and return a concise implementation plan that includes:
- relevant existing files found
- files likely to change
- backend changes
- frontend/mobile changes
- test plan
- risks / assumptions

Do NOT implement yet.
Wait for my approval before making changes.
`.trim());
}

function status() {
  const data = getStatusData();
  console.log("\nTask Status\n");
  for (const taskId of data.queue) {
    const task = data.tasks[taskId];
    console.log(`${taskId}: ${task ? task.status : "missing"}`);
  }
}

function next() {
  const data = getStatusData();
  const nextTask = getNextPendingTask(data);
  if (!nextTask) {
    console.log("No pending tasks remain.");
    return;
  }
  console.log(`Next pending task: ${nextTask}\n`);
  printBootstrapPrompt(nextTask);
}

function start(taskId) {
  const data = getStatusData();
  if (!data.tasks[taskId]) throw new Error(`Task not found: ${taskId}`);
  if (!exists(taskPath(taskId))) throw new Error(`Task folder missing: ${taskPath(taskId)}`);

  data.tasks[taskId].status = "in-progress";
  saveStatusData(data);

  console.log(`Task marked in-progress: ${taskId}\n`);
  printBootstrapPrompt(taskId);
}

function review(taskId) {
  const data = getStatusData();
  if (!data.tasks[taskId]) throw new Error(`Task not found: ${taskId}`);

  const report = reportPath(taskId);
  const files = [...new Set([...getChangedFiles(), ...getStagedFiles(), ...getUntrackedFiles()])];
  const testFiles = changedTestFiles(files);
  const outOfScope = findOutOfScopeFiles(taskId, files);

  if (!exists(report)) {
    buildAutofillReport(taskId, report, files);
    console.log(`Created autofilled report: ${path.relative(ROOT, report)}`);
  }

  data.tasks[taskId].status = "review";
  data.tasks[taskId].report = path.relative(ROOT, report);
  saveStatusData(data);

  console.log(`Task marked review: ${taskId}`);
  console.log(`Report: ${path.relative(ROOT, report)}\n`);

  console.log("Changed files:");
  if (files.length) files.forEach((f) => console.log(`- ${f}`));
  else console.log("- none detected");

  console.log("\nChanged test files:");
  if (testFiles.length) testFiles.forEach((f) => console.log(`- ${f}`));
  else console.log("- WARNING: no changed test files detected");

  console.log("\nPotentially out-of-scope files:");
  if (outOfScope.length) outOfScope.forEach((f) => console.log(`- ${f}`));
  else console.log("- none flagged");

  console.log("\nNext step:");
  console.log(`Open ${path.relative(ROOT, report)} and fill in the TODO sections before completing the task.`);
}

function complete(taskId) {
  const data = getStatusData();
  if (!data.tasks[taskId]) throw new Error(`Task not found: ${taskId}`);

  const report = ensureReport(taskId);
  const reportBody = fs.readFileSync(report, "utf8");

  const requiredSections = [
    "Summary:",
    "Files Created:",
    "Files Modified:",
    "Tests Added:",
    "Commands Run:",
    "Test Results:"
  ];

  const missing = requiredSections.filter((section) => !reportBody.includes(section));
  if (missing.length) {
    console.log("WARNING: report may be incomplete. Missing sections:");
    missing.forEach((m) => console.log(`- ${m}`));
    console.log("");
  }

  data.tasks[taskId].status = "completed";
  data.tasks[taskId].report = path.relative(ROOT, report);
  data.tasks[taskId].completedAt = new Date().toISOString();
  saveStatusData(data);

  console.log(`Task marked completed: ${taskId}`);
  console.log(`Report: ${path.relative(ROOT, report)}\n`);

  const nextTask = getNextPendingTask(data);
  if (nextTask) {
    console.log(`Next pending task: ${nextTask}\n`);
    printBootstrapPrompt(nextTask);
  } else {
    console.log("No pending tasks remain.");
  }
}

function usage() {
  console.log(`
Usage:
  node scripts/task-runner.js status
  node scripts/task-runner.js next
  node scripts/task-runner.js start <task-id>
  node scripts/task-runner.js review <task-id>
  node scripts/task-runner.js complete <task-id>
`.trim());
}

function main() {
  const [, , cmd, taskId] = process.argv;

  try {
    if (cmd === "status") return status();
    if (cmd === "next") return next();
    if (cmd === "start") return taskId ? start(taskId) : usage();
    if (cmd === "review") return taskId ? review(taskId) : usage();
    if (cmd === "complete") return taskId ? complete(taskId) : usage();
    usage();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();