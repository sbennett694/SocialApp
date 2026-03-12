const assert = require("node:assert/strict");

const { resetStoreToDefault, seedStoreWithDemoData, store } = require("../dist/repositories/store.js");
const { feedQueryService } = require("../dist/services/feedQueryService.js");

seedStoreWithDemoData();

const woodFeed = feedQueryService.queryClubCommonsFeed({
  viewerId: "alex",
  clubId: "club-woodworking-lab",
  limit: 20
});

assert.ok(Array.isArray(woodFeed.items), "club commons feed should return items array");
assert.ok(woodFeed.items.length > 0, "wood club should have activity items");

const activityTypes = new Set(woodFeed.items.map((item) => item.activityType));
assert.ok(activityTypes.has("highlight"), "should include highlight activity");
assert.ok(activityTypes.has("comment"), "should include comment activity");
assert.ok(activityTypes.has("suggestion"), "should include suggestion activity");
assert.ok(activityTypes.has("milestone_update"), "should include milestone update activity");
assert.ok(activityTypes.has("volunteer_event"), "should include volunteer event activity");

for (let index = 1; index < woodFeed.items.length; index += 1) {
  assert.ok(
    woodFeed.items[index - 1].createdAt >= woodFeed.items[index].createdAt,
    "club commons feed should be ordered newest first"
  );
}

assert.ok(
  woodFeed.items.every((item) => item.clubId === "club-woodworking-lab"),
  "club commons feed should only include items from the requested club"
);

const suggestionItem = woodFeed.items.find((item) => item.activityType === "suggestion");
assert.ok(suggestionItem, "expected suggestion item to exist");
assert.match(suggestionItem.previewText, /mini how-to/i, "suggestion item should map preview text from comment content");

const commentItem = woodFeed.items.find((item) => item.activityType === "comment");
assert.ok(commentItem, "expected comment item to exist");
assert.match(commentItem.previewText, /jig idea/i, "comment item should map preview text from comment content");

resetStoreToDefault();
const emptyClubId = "club-empty-test";
store.clubs.push({
  id: emptyClubId,
  categoryId: "woodworking",
  name: "Empty Club",
  founderId: "alex",
  ownerId: "alex",
  isPublic: true,
  joinPolicy: "OPEN",
  createdAt: new Date().toISOString()
});
store.clubMembers.push({
  clubId: emptyClubId,
  userId: "alex",
  role: "OWNER",
  createdAt: new Date().toISOString()
});

const emptyFeed = feedQueryService.queryClubCommonsFeed({
  viewerId: "alex",
  clubId: emptyClubId,
  limit: 20
});

assert.deepEqual(emptyFeed.items, [], "empty clubs should return an empty activity list");

console.log("clubCommonsFeed.test.js passed");