const assert = require("node:assert/strict");

const { createServer } = require("../dist/server.js");
const { seedStoreWithDemoData, resetStoreToDefault } = require("../dist/repositories/store.js");

async function withServer(run) {
  const app = createServer();
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function postVolunteerRequest(baseUrl, projectId, body) {
  const response = await fetch(`${baseUrl}/projects/${encodeURIComponent(projectId)}/volunteer-requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function getVolunteerRequests(baseUrl, projectId, actorId) {
  const response = await fetch(
    `${baseUrl}/projects/${encodeURIComponent(projectId)}/volunteer-requests?actorId=${encodeURIComponent(actorId)}`
  );
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function patchVolunteerRequest(baseUrl, projectId, requestId, body) {
  const response = await fetch(
    `${baseUrl}/projects/${encodeURIComponent(projectId)}/volunteer-requests/${encodeURIComponent(requestId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function main() {
  seedStoreWithDemoData();

  await withServer(async (baseUrl) => {
    const projectId = "project-planter-series";

    const noTarget = await postVolunteerRequest(baseUrl, projectId, {
      userId: "jamie",
      targetType: "NONE"
    });
    assert.equal(noTarget.response.status, 201, "should create a no-target volunteer request");
    assert.equal(noTarget.payload.status, "PENDING");
    assert.equal(noTarget.payload.targetType, "NONE");

    const duplicate = await postVolunteerRequest(baseUrl, projectId, {
      userId: "jamie",
      targetType: "NONE"
    });
    assert.equal(duplicate.response.status, 409, "should block identical pending requests");

    const milestoneTarget = await postVolunteerRequest(baseUrl, projectId, {
      userId: "taylor",
      targetType: "MILESTONE",
      targetId: "ms-planter-assembly"
    });
    assert.equal(milestoneTarget.response.status, 201, "should create milestone-target volunteer request");
    assert.equal(milestoneTarget.payload.targetId, "ms-planter-assembly");

    const taskTarget = await postVolunteerRequest(baseUrl, projectId, {
      userId: "alex",
      targetType: "TASK",
      targetId: "task-planter-seal"
    });
    assert.equal(taskTarget.response.status, 201, "should create task-target volunteer request");
    assert.equal(taskTarget.payload.targetId, "task-planter-seal");

    const invalidTarget = await postVolunteerRequest(baseUrl, projectId, {
      userId: "alex",
      targetType: "TASK",
      targetId: "task-zine-edit"
    });
    assert.equal(invalidTarget.response.status, 400, "should reject targets outside the project");

    const nonManagerList = await getVolunteerRequests(baseUrl, projectId, "taylor");
    assert.equal(nonManagerList.response.status, 403, "non-managers should not list volunteer requests");

    const managerList = await getVolunteerRequests(baseUrl, projectId, "alex");
    assert.equal(managerList.response.status, 200, "project manager should list volunteer requests");
    assert.equal(managerList.payload.length, 3, "manager should see all created volunteer requests");

    const accepted = await patchVolunteerRequest(baseUrl, projectId, noTarget.payload.id, {
      actorId: "alex",
      status: "ACCEPTED"
    });
    assert.equal(accepted.response.status, 200, "manager should accept volunteer requests");
    assert.equal(accepted.payload.status, "ACCEPTED");
    assert.equal(accepted.payload.reviewedBy, "alex");

    const rejected = await patchVolunteerRequest(baseUrl, projectId, milestoneTarget.payload.id, {
      actorId: "alex",
      status: "REJECTED"
    });
    assert.equal(rejected.response.status, 200, "manager should reject volunteer requests");
    assert.equal(rejected.payload.status, "REJECTED");

    const nonManagerReview = await patchVolunteerRequest(baseUrl, projectId, taskTarget.payload.id, {
      actorId: "taylor",
      status: "ACCEPTED"
    });
    assert.equal(nonManagerReview.response.status, 403, "non-managers should not review volunteer requests");
  });

  resetStoreToDefault();
  console.log("volunteerRequests.test.js passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});