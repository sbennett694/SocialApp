#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const LOCAL_REVIEW_MODEL = "qwen3-coder:30b";


const ROOT = process.cwd();
const TASK_ROOT = path.join(ROOT, "Task Folders");
const ORCH_DIR = path.join(TASK_ROOT, "orchestration");
const STATUS_FILE = path.join(ORCH_DIR, "task-status.json");
const REPORT_TEMPLATE = path.join(ORCH_DIR, "task-completion-template.md");
const REPORTS_DIR = path.join(ORCH_DIR, "reports");
const PHILOSOPHY_DIR = path.join(ROOT, "docs", "Philosophy");

function ensureCleanGit() {
  const { execSync } = require("child_process");

  try {
    const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();

    if (status.length > 0) {
      console.log("\nYour working directory has uncommitted changes.\n");
      console.log("Please commit or stash them before starting a new task.\n");
      process.exit(1);
    }
  } catch (err) {
    console.log("Warning: Unable to check git status.");
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readFileIfExists(filePath) {
  try {
    if (!exists(filePath)) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return null;
  }
}
function getTaskDocs(taskId) {
  const taskDir = taskPath(taskId);

  const files = [
    "user-story.md",
    "requirements.md",
    "design.md",
    "prompt.md"
  ];

  const parts = [];

  for (const file of files) {
    const fullPath = path.join(taskDir, file);
    const content = readFileIfExists(fullPath);
    if (content) {
      parts.push(`FILE: ${file}\n${content}`);
    }
  }

  return parts.join("\n\n====================\n\n");
}

function getRelevantPhilosophyDocs() {
  const candidateFiles = [
    "01-vision.md",
    "02-core-philosophy.md",
    "03-prosocial-loop.md",
    "04-product-pillars.md",
    "07-product-principles.md"
  ];

  const parts = [];

  for (const file of candidateFiles) {
    const fullPath = path.join(PHILOSOPHY_DIR, file);
    const content = readFileIfExists(fullPath);
    if (content) {
      parts.push(`FILE: ${file}\n${content}`);
    }
  }

  return parts.join("\n\n====================\n\n");
}

function generateProductUXSuggestions(taskId, files) {
  const taskDocs = getTaskDocs(taskId);
  const philosophyDocs = getRelevantPhilosophyDocs();

  const changedFilesText = files.length
    ? files.map((f) => `- ${f}`).join("\n")
    : "- none detected";

  const inputText = `
TASK DOCS
${taskDocs}

====================

PRODUCT / PHILOSOPHY DOCS
${philosophyDocs}

====================

CHANGED FILES
${changedFilesText}
`.trim();

  const maxChars = 35000;
  const truncatedInput =
    inputText.length > maxChars ? inputText.slice(0, maxChars) : inputText;

  const prompt = `
You are a product and UX review assistant for a social/productivity app called ProSocial.

Review the task context and return ONLY markdown in exactly this structure:

## Product / UX Suggestions
- item

## UX Risks / Friction Points
- item

## Alignment With Product Direction
- item

Rules:
- Keep suggestions narrow and practical.
- Focus on likely user expectations, clarity, interaction quality, and social/productivity alignment.
- Do not suggest broad redesigns unless strongly justified.
- Do not invent missing product goals; use the provided task and philosophy context.
- If no meaningful suggestions are identified for a section, write:
- none strongly identified

Context:
${truncatedInput}
`.trim();

  try {
    const output = cp.execSync(
      `ollama run ${LOCAL_REVIEW_MODEL}`,
      {
        input: prompt,
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"]
      }
    );

    return output.trim();
  } catch (err) {
    return `Product / UX AI Assist failed: ${err.message}`;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}


function checkTaskSanity(taskId) {
  const taskDir = taskPath(taskId);

  const requiredFiles = [
    "requirements.md",
    "design.md"
  ];

  const recommendedFiles = [
    "user-story.md",
    "prompt.md"
  ];

  const missingRequired = requiredFiles.filter((file) =>
    !exists(path.join(taskDir, file))
  );

  const missingRecommended = recommendedFiles.filter((file) =>
    !exists(path.join(taskDir, file))
  );

  return {
    taskId,
    taskDir,
    missingRequired,
    missingRecommended,
    passed: missingRequired.length === 0
  };
}

function printSanityCheck(result) {
  console.log(`\nPhase 0 — Task Sanity Check: ${result.taskId}\n`);

  if (result.missingRequired.length === 0) {
    console.log("Required files: OK");
  } else {
    console.log("Missing required files:");
    result.missingRequired.forEach((file) => console.log(`- ${file}`));
  }

  if (result.missingRecommended.length === 0) {
    console.log("Recommended files: OK");
  } else {
    console.log("Missing recommended files:");
    result.missingRecommended.forEach((file) => console.log(`- ${file}`));
  }

  console.log(
    `Recommendation: ${result.passed ? "Proceed" : "Request clarification / complete task docs"}`
  );
}

function getUntrackedFiles() {
  const output = run("git ls-files --others --exclude-standard");
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}


function generateRootCauseAssessment(taskId, files) {
  const taskDocs = getTaskDocs(taskId);
  const diffText = getDiffForFiles(files);

  const inputText = `
TASK DOCS
${taskDocs}

====================

GIT DIFF
${diffText}
`.trim();

  const maxChars = 35000;
  const truncatedInput =
    inputText.length > maxChars ? inputText.slice(0, maxChars) : inputText;

  const prompt = `
You are a bugfix review assistant.

Review the task docs and code diff, then return ONLY markdown in exactly this structure:

## Likely Root Cause
- item

## Alternate Possible Causes
- item

## Resolution Confidence
- High / Medium / Low
- brief reason

## Remaining Risks / What To Validate
- item

Rules:
- Base the analysis only on the provided task docs and diff.
- Do not claim certainty if the evidence is incomplete.
- If the task does not appear bug-oriented, still provide a cautious best-effort assessment.
- Keep the output concise.
- If a section has little evidence, write:
- none strongly identified

Context:
${truncatedInput}
`.trim();

  try {
    const output = cp.execSync(
      `ollama run ${LOCAL_REVIEW_MODEL}`,
      {
        input: prompt,
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"]
      }
    );

    return output.trim();
  } catch (err) {
    return `Root Cause AI Assist failed: ${err.message}`;
  }
}

function getStatusIcon(status) {
  const map = {
    "completed": "✅",
    "in-progress": "🚧",
    "review": "🔎",
    "pending": "⏳",
    "blocked": "⛔"
  };
  return map[status] || "❔";
}

function getRoadmapGroups() {
  return [
    {
      name: "Foundation",
      tasks: [
        "001-club-admin-panel-polish",
        "002-notification-preview-navigation",
        "003-private-friends-notes"
      ]
    },
    {
      name: "Core Social",
      tasks: [
        "004-club-commons-feed",
        "005-project-activity-timeline",
        "006-feed-card-types",
        "007-notification-preview-text",
        "008-club-project-creation",
        "009-volunteer-system",
        "010-profile-privacy-fields"
      ]
    },
    {
      name: "Reputation",
      tasks: [
        "011-skill-endorsements",
        "012-contribution-metrics",
        "013-praise-tokens",
        "014-reputation-guardrails",
        "015-impact-profile-ui"
      ]
    }
  ];
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

function getDiffForFiles(files) {
  const diffParts = [];

  for (const file of files) {
    const diff = run(`git diff HEAD -- "${file}"`);
    if (diff) {
      diffParts.push(`FILE: ${file}\n${diff}`);
    }
  }

  return diffParts.join("\n\n====================\n\n");
}

function generateLocalTechnicalDetails(taskId, files) {
  const diffText = getDiffForFiles(files);

  if (!diffText.trim()) {
    return "AI Assist skipped: no diff content found.";
  }

  const maxChars = 30000;
  const truncatedDiff =
    diffText.length > maxChars ? diffText.slice(0, maxChars) : diffText;

  const prompt = `
You are a code-diff analyzer.

Task ID: ${taskId}

Read the git diff below and output ONLY markdown in exactly this format:

## Functions Modified
- item
- item

## Functions Added
- item
- item

## Key Structures / Endpoints / Components Affected
- item
- item

Rules:
- Do not explain anything outside those sections.
- Do not apologize.
- Do not mention model limitations.
- Do not suggest other models or tools.
- Use exact names when clearly identifiable from the diff.
- If a section has no confident items, write:
- none confidently identified

Git diff:
${truncatedDiff}
`.trim();

  try {
    const output = cp.execSync(
      `ollama run ${LOCAL_REVIEW_MODEL}`,
      {
        input: prompt,
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"]
      }
    );

    return output.trim();
  } catch (err) {
    return `AI Assist failed: ${err.message}`;
  }
}

function injectTechnicalDetailsIntoReport(reportPathValue, aiDetails) {
  if (!aiDetails || !aiDetails.trim()) return;

  let content = fs.readFileSync(reportPathValue, "utf8");

  const techBlockRegex =
    /## Functions Modified\r?\n\r?\n-\r?\n\r?\n## Functions Added\r?\n\r?\n-\r?\n\r?\n## Key Structures \/ Endpoints \/ Components Affected\r?\n\r?\n-/;

  if (!techBlockRegex.test(content)) {
    return;
  }

  content = content.replace(techBlockRegex, aiDetails.trim());

  fs.writeFileSync(reportPathValue, content, "utf8");
}

function buildAutofillReport(taskId, reportPathValue, files) {
  const { created, modified } = splitCreatedVsModified(files);
  const testFiles = changedTestFiles(files);

  if (!exists(REPORT_TEMPLATE)) {
    throw new Error(`Missing report template: ${REPORT_TEMPLATE}`);
  }

  let content = fs.readFileSync(REPORT_TEMPLATE, "utf8");

  content = content.replace(
    /Task ID:\s*/i,
    `Task ID: ${taskId}\n`
  );

    content = content.replace(
    /Status:\r?\n- review\r?\n- completed\r?\n- follow-up\r?\n- blocked/,
    "Status: review"
  );

  const createdSection =
    created.length ? created.map((f) => `- ${f}`).join("\n") : "- none detected";

  const modifiedSection =
    modified.length ? modified.map((f) => `- ${f}`).join("\n") : "- none detected";

  const testSection =
    testFiles.length ? testFiles.map((f) => `- ${f}`).join("\n") : "- none detected";

  content = content.replace(
    /# Files Modified\r?\n\r?\n-/,
    `# Files Modified\n\n${modifiedSection}`
  );

  content = content.replace(
    /# Files Added\r?\n\r?\n-/,
    `# Files Added\n\n${createdSection}`
  );

  content = content.replace(
    /# Tests Run\r?\n\r?\n-/,
    `# Tests Run\n\n${testSection}`
  );

  content = content.replace(
    /# Manual Validation Steps\r?\n\r?\n1\.\r?\n2\.\r?\n3\./,
    `# Manual Validation Steps\n\n1. Verify feature behavior in UI\n2. Confirm expected data flow\n3. Validate edge cases`
  );

  fs.writeFileSync(reportPathValue, content, "utf8");
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

- Task Folders/${taskId}/user-story.md (if present)
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
- how the implementation supports the user story and expected state
- if the task is unclear or conflicts with the user story, pause and request clarification

Do NOT implement yet.
Wait for my approval before making changes.

After approval, implement only this task with the smallest viable change set.

When implementation is complete, STOP and produce a structured completion report.

In the Technical Change Details section, explicitly list:
- functions modified
- functions added
- key routes, endpoints, components, hooks, services, and structures affected

Inspect the changed files directly and populate those sections from the code changes.
Do not leave those sections blank if identifiable code changes were made.
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

function sanity(taskId) {
  const data = getStatusData();

  if (!data.tasks[taskId]) {
    throw new Error(`Task not found in task-status.json: ${taskId}`);
  }

  if (!exists(taskPath(taskId))) {
    throw new Error(`Task folder missing: ${taskPath(taskId)}`);
  }

  const result = checkTaskSanity(taskId);
  printSanityCheck(result);

  if (!result.passed) {
    console.log("\nSanity check failed.\n");
    process.exit(1);
  }

  console.log("\nSanity check passed.\n");
}

function start(taskId) {
  ensureCleanGit();

  const data = getStatusData();
  if (!data.tasks[taskId]) throw new Error(`Task not found: ${taskId}`);
  if (!exists(taskPath(taskId))) throw new Error(`Task folder missing: ${taskPath(taskId)}`);

  const sanity = checkTaskSanity(taskId);
  printSanityCheck(sanity);

  if (!sanity.passed) {
    console.log("\nTask cannot be started until required task files exist.\n");
    process.exit(1);
  }

  data.tasks[taskId].status = "in-progress";
  saveStatusData(data);

  console.log(`\nTask marked in-progress: ${taskId}\n`);
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

  const reviewFiles = files.filter(
    (f) =>
      /\.(ts|tsx|js|jsx)$/.test(f) &&
      !/(^|\/)(test|tests)\b|\.test\./i.test(f) &&
      !f.includes("task-runner.js")
  );

  console.log("\nSuggested Technical Details (AI Assist):\n");
  const aiDetails = generateLocalTechnicalDetails(taskId, reviewFiles);
  console.log(aiDetails);

  injectTechnicalDetailsIntoReport(report, aiDetails);

  console.log("\nProduct / UX Suggestions (AI Assist):\n");
  const uxSuggestions = generateProductUXSuggestions(taskId, reviewFiles);
  console.log(uxSuggestions);

  console.log("\nRoot Cause / Resolution Assessment (AI Assist):\n");
  const rootCauseAssessment = generateRootCauseAssessment(taskId, reviewFiles);
  console.log(rootCauseAssessment);

  console.log("\nNext step:");
  console.log(`Open ${path.relative(ROOT, report)} and fill in the remaining sections before completing the task.`);
}

function complete(taskId) {
  const data = getStatusData();
  if (!data.tasks[taskId]) throw new Error(`Task not found: ${taskId}`);

  const report = ensureReport(taskId);
  const reportBody = fs.readFileSync(report, "utf8");

const requiredSections = [
  "# Summary",
  "# User Value Alignment",
  "# Files Modified",
  "# Files Added",
  "# Tests Run",
  "# Manual Validation Steps",
  "# Known Gaps",
  "# Follow-Up Suggestions",
  "# Dev Review"
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

function roadmap() {
  const data = getStatusData();
  const groups = getRoadmapGroups();

  console.log("\nProSocial Roadmap\n");

  for (const group of groups) {
    console.log(`${group.name}`);
    for (const taskId of group.tasks) {
      const task = data.tasks[taskId];
      const status = task ? task.status : "missing";
      const icon = getStatusIcon(status);
      console.log(`  ${icon} ${taskId}`);
    }
    console.log("");
  }
}

function usage() {
  console.log(`
Usage:
  node scripts/task-runner.js status
  node scripts/task-runner.js next
  node scripts/task-runner.js sanity <task-id>
  node scripts/task-runner.js start <task-id>
  node scripts/task-runner.js review <task-id>
  node scripts/task-runner.js complete <task-id>
  node scripts/task-runner.js roadmap
`.trim());
}

function main() {
  const [, , cmd, taskId] = process.argv;

  try {
    if (cmd === "status") return status();
    if (cmd === "next") return next();
    if (cmd === "sanity") return taskId ? sanity(taskId) : usage();
    if (cmd === "start") return taskId ? start(taskId) : usage();
    if (cmd === "review") return taskId ? review(taskId) : usage();
    if (cmd === "complete") return taskId ? complete(taskId) : usage();
    if (cmd === "roadmap") return roadmap();
    usage();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();