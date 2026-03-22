const assert = require("node:assert/strict");

const { createServer } = require("../dist/server.js");
const { seedStoreWithDemoData, resetStoreToDefault, store } = require("../dist/repositories/store.js");

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

async function createProject(baseUrl, body) {
  const response = await fetch(`${baseUrl}/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function listClubProjects(baseUrl, clubId) {
  const response = await fetch(`${baseUrl}/clubs/${encodeURIComponent(clubId)}/projects`);
  const payload = await response.json();
  return { response, payload };
}

async function main() {
  seedStoreWithDemoData();

  await withServer(async (baseUrl) => {
    const clubId = "club-woodworking-lab";

    const success = await createProject(baseUrl, {
      ownerId: clubId,
      createdBy: "jamie",
      clubId,
      categoryId: "woodworking",
      title: "Club Build Night Fixtures",
      description: "Prep shared fixtures for the next club build night.",
      visibility: "PUBLIC"
    });

    assert.equal(success.response.status, 201, "moderators should be able to create club-context projects");
    assert.equal(success.payload.clubId, clubId, "project should persist the active club context");
    assert.equal(success.payload.createdBy, "jamie", "project should preserve human creator attribution");
    assert.equal(success.payload.ownerId, clubId, "club-owned project pattern should remain unchanged");

    const linkedProject = store.projectClubLinks.find(
      (link) => link.projectId === success.payload.id && link.clubId === clubId && link.status === "APPROVED"
    );
    assert.ok(linkedProject, "club project creation should auto-create an approved club link");

    const clubHistoryEvent = store.clubHistoryEvents.find(
      (event) => event.subjectProjectId === success.payload.id && event.eventType === "PROJECT_CREATED_FOR_CLUB"
    );
    assert.ok(clubHistoryEvent, "club project creation should append a club history event");

    const clubProjects = await listClubProjects(baseUrl, clubId);
    assert.equal(clubProjects.response.status, 200, "club project list should remain available");
    assert.ok(
      clubProjects.payload.some((project) => project.id === success.payload.id),
      "new club project should appear in the club project list"
    );

    const forbidden = await createProject(baseUrl, {
      ownerId: clubId,
      createdBy: "taylor",
      clubId,
      categoryId: "woodworking",
      title: "Unauthorized Club Project",
      visibility: "PUBLIC"
    });

    assert.equal(forbidden.response.status, 403, "non-managers should not be able to create club-context projects");
    assert.match(forbidden.payload.message, /Only club owner\/admin can create club projects/i);
  });

  resetStoreToDefault();
  console.log("clubProjectCreation.test.js passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});