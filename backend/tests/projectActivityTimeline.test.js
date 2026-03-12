const assert = require("node:assert/strict");

const { resetStoreToDefault, seedStoreWithDemoData, store } = require("../dist/repositories/store.js");
const { feedQueryService } = require("../dist/services/feedQueryService.js");

seedStoreWithDemoData();

const planterTimeline = feedQueryService.queryProjectTimeline({
  viewerId: "alex",
  projectId: "project-planter-series",
  limit: 50
});

assert.ok(Array.isArray(planterTimeline), "project timeline should return an array");
assert.ok(planterTimeline.length > 0, "expected seeded project timeline entries");
assert.ok(
  planterTimeline.every((item) => item.projectId === "project-planter-series"),
  "project timeline should only include the requested project"
);

for (let index = 1; index < planterTimeline.length; index += 1) {
  assert.ok(
    planterTimeline[index - 1].createdAt >= planterTimeline[index].createdAt,
    "project timeline should be ordered newest first"
  );
}

const timelineTypes = new Set(planterTimeline.map((item) => item.activityType));
assert.ok(timelineTypes.has("project_created"), "should include project created activity");
assert.ok(timelineTypes.has("highlight"), "should include highlight activity");
assert.ok(timelineTypes.has("milestone_completed"), "should include milestone completion activity");
assert.ok(timelineTypes.has("task_completed"), "should include task completion activity");
assert.ok(timelineTypes.has("comment"), "should include project comment activity when available");
assert.ok(timelineTypes.has("suggestion"), "should include project suggestion activity when available");

const highlightItem = planterTimeline.find((item) => item.activityType === "highlight");
assert.ok(highlightItem, "expected a highlight item");
assert.match(highlightItem.description, /First batch is assembled/i, "highlight text should map into timeline description");

const milestoneItem = planterTimeline.find((item) => item.activityType === "milestone_completed");
assert.ok(milestoneItem, "expected a milestone-completed item");
assert.match(milestoneItem.description, /Cut and prep cedar panels/i, "milestone title should map into timeline description");

const taskItem = planterTimeline.find((item) => item.activityType === "task_completed");
assert.ok(taskItem, "expected a task-completed item");
assert.match(taskItem.description, /Dry-fit joinery/i, "task text should map into timeline description");

const ids = planterTimeline.map((item) => item.id);
assert.equal(new Set(ids).size, ids.length, "project timeline should not duplicate events after feed dedupe");

resetStoreToDefault();
const emptyProjectId = "project-empty-timeline";
const createdAt = new Date().toISOString();
store.projects.push({
  id: emptyProjectId,
  ownerId: "alex",
  categoryId: "woodworking",
  title: "Empty Timeline Project",
  visibility: "PUBLIC",
  createdBy: "alex",
  createdAt
});

const emptyTimeline = feedQueryService.queryProjectTimeline({
  viewerId: "alex",
  projectId: emptyProjectId,
  limit: 20
});

assert.deepEqual(emptyTimeline, [], "projects with no feed events should return an empty timeline");

console.log("projectActivityTimeline.test.js passed");