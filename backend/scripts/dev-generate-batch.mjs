import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const generatorScriptPath = resolve(scriptDir, "dev-generate.mjs");

function getArg(name, fallback) {
  const exact = `--${name}`;
  const withValue = args.find((entry) => entry.startsWith(`${exact}=`));
  if (withValue) return withValue.slice(exact.length + 1);
  const index = args.findIndex((entry) => entry === exact);
  if (index >= 0) return args[index + 1] ?? fallback;
  return fallback;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function getNumericShortcutCount() {
  for (const entry of args) {
    const match = entry.match(/^--(\d+)$/);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isInteger(parsed) && parsed > 0) {
      return String(parsed);
    }
  }
  return undefined;
}

const preset = (getArg("preset", "all") || "all").toLowerCase();
const allCount = getArg("all", getNumericShortcutCount());
const count = getArg("count", allCount);
const actor = getArg("actor", undefined);
const postAuthor = getArg("post-author", undefined);
const commenter = getArg("commenter", undefined);
const delayMs = getArg("delay-ms", undefined);
const useDefaultValues = hasFlag("default") || !!allCount;
const usersArg = getArg("users", "alex,jamie,taylor");
const users = usersArg
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const presetCommands = {
  core: ["create-clubs", "create-projects", "create-milestones", "create-tasks"],
  "comment-nav": ["scenario-comment-nav"],
  all: ["create-clubs", "create-projects", "create-milestones", "create-tasks", "scenario-comment-nav"]
};

function getCommands() {
  if (presetCommands[preset]) return presetCommands[preset];
  const rawCommands = getArg("commands", "");
  if (!rawCommands.trim()) {
    throw new Error("Unknown preset. Use --preset core|comment-nav|all or provide --commands cmd1,cmd2");
  }
  return rawCommands
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildCommandArgs(command) {
  const commandArgs = [generatorScriptPath, command];
  const includeCount = count && command !== "create-milestones" && command !== "create-tasks" ? true : !!count;

  if (includeCount) {
    commandArgs.push("--count", count);
  }
  if (delayMs) {
    commandArgs.push("--delay-ms", delayMs);
  }

  if (command === "scenario-comment-nav") {
    if (postAuthor) commandArgs.push("--post-author", postAuthor);
    if (commenter) commandArgs.push("--commenter", commenter);
  } else if (actor) {
    commandArgs.push("--actor", actor);
  }

  if (hasFlag("non-interactive")) {
    // Force deterministic non-interactive behavior by always passing count.
    if (!count) {
      commandArgs.push("--count", "1");
    }
  }

  return commandArgs;
}

function rotateCommenter(authorId) {
  const index = users.indexOf(authorId);
  if (index < 0 || users.length === 1) return users[0] ?? "jamie";
  return users[(index + 1) % users.length];
}

function getRuns(commands) {
  if (actor || postAuthor || commenter || hasFlag("single-user")) {
    return commands.map((command) => ({
      command,
      actor: actor,
      postAuthor: postAuthor,
      commenter: commenter
    }));
  }

  const runs = [];
  for (const user of users) {
    for (const command of commands) {
      if (command === "scenario-comment-nav") {
        runs.push({
          command,
          postAuthor: user,
          commenter: rotateCommenter(user)
        });
      } else {
        runs.push({
          command,
          actor: user
        });
      }
    }
  }
  return runs;
}

function buildCommandArgsForRun(run) {
  const commandArgs = [generatorScriptPath, run.command];
  const includeCount = count && run.command !== "create-milestones" && run.command !== "create-tasks" ? true : !!count;

  if (useDefaultValues) {
    commandArgs.push("--default");
  }

  if (includeCount) {
    commandArgs.push("--count", count);
  }
  if (allCount && run.command === "scenario-comment-nav") {
    commandArgs.push("--post-count", allCount);
  }
  if (delayMs) {
    commandArgs.push("--delay-ms", delayMs);
  }

  if (run.command === "scenario-comment-nav") {
    if (run.postAuthor) commandArgs.push("--post-author", run.postAuthor);
    if (run.commenter) commandArgs.push("--commenter", run.commenter);
  } else if (run.actor) {
    commandArgs.push("--actor", run.actor);
  }

  if (hasFlag("non-interactive") && !count) {
    commandArgs.push("--non-interactive", "--count", "1");
  } else if (hasFlag("non-interactive")) {
    commandArgs.push("--non-interactive");
  }

  return commandArgs;
}

function runNode(argsToRun) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argsToRun, {
      stdio: "inherit",
      env: process.env
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed with exit code ${code}: node ${argsToRun.join(" ")}`));
    });
  });
}

async function run() {
  const commands = getCommands();
  const runs = getRuns(commands);
  for (const run of runs) {
    const descriptor = run.command === "scenario-comment-nav"
      ? `${run.command} (post-author=${run.postAuthor}, commenter=${run.commenter})`
      : `${run.command} (actor=${run.actor})`;
    console.log(`\n[dev-generate-batch] Running: ${descriptor}`);
    await runNode(buildCommandArgsForRun(run));
  }
  console.log(`\n[dev-generate-batch] Completed preset '${preset}' (${runs.length} run(s)).`);
}

run().catch((error) => {
  console.error(`[dev-generate-batch] ${error.message}`);
  process.exit(1);
});
