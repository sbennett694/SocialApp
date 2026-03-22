const assert = require("node:assert/strict");
const {
  buildCommentNotificationMessage,
  buildNotificationPreviewText,
  deriveNotificationAction
} = require("../dist/lib/notificationPreview.js");

assert.equal(buildNotificationPreviewText("One two three four five six"), "One two three four five six");
assert.equal(
  buildNotificationPreviewText("One two three four five six seven eight nine"),
  "One two three four five six seven..."
);
assert.equal(buildNotificationPreviewText("  short   text  "), "short text");
assert.equal(buildNotificationPreviewText(""), undefined);
assert.equal(buildNotificationPreviewText(undefined), undefined);

assert.equal(deriveNotificationAction(undefined), "responded");
assert.equal(deriveNotificationAction("QUESTIONS"), "asked");
assert.equal(deriveNotificationAction("SUGGESTIONS"), "suggested");
assert.equal(deriveNotificationAction("THANK_YOU"), "thanked");
assert.equal(deriveNotificationAction("COMMENTS"), "commented");

assert.equal(
  buildCommentNotificationMessage({
    actorId: "alex",
    textContent: "Should we simplify this flow before launch?",
    threadType: "QUESTIONS"
  }),
  '@alex asked: "Should we simplify this flow before launch?"'
);

assert.equal(
  buildCommentNotificationMessage({
    actorId: "sam",
    textContent: "Improving onboarding docs could reduce repeated setup help for new members.",
    threadType: "SUGGESTIONS"
  }),
  '@sam suggested: "Improving onboarding docs could reduce repeated setup..."'
);

assert.equal(
  buildCommentNotificationMessage({
    actorId: "jordan",
    textContent: "",
    threadType: undefined
  }),
  "@jordan responded."
);

console.log("notificationPreview.test.js passed");
