const assert = require("node:assert/strict");
const { buildNotificationPreviewText } = require("../dist/lib/notificationPreview.js");

assert.equal(buildNotificationPreviewText("One two three four five six"), "One two three four five");
assert.equal(buildNotificationPreviewText("  short   text  "), "short text");
assert.equal(buildNotificationPreviewText(""), undefined);
assert.equal(buildNotificationPreviewText(undefined), undefined);

console.log("notificationPreview.test.js passed");
