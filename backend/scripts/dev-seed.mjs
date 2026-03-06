const mode = (process.argv[2] || "seed").toLowerCase();
const baseUrl = process.env.SOCIALAPP_LOCAL_API_URL || "http://127.0.0.1:3001";

const endpointByMode = {
  seed: "/dev/seed-demo-data",
  reset: "/dev/reset-data",
  reseed: "/dev/seed-demo-data"
};

async function postJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `Request failed (${response.status}) for ${path}`);
  }
  return payload;
}

async function run() {
  if (!(mode in endpointByMode)) {
    throw new Error("Mode must be one of: seed, reset, reseed");
  }

  if (mode === "reseed") {
    const resetResult = await postJson(endpointByMode.reset);
    const seedResult = await postJson(endpointByMode.seed);
    console.log(JSON.stringify({ reset: resetResult, seed: seedResult }, null, 2));
    return;
  }

  const result = await postJson(endpointByMode[mode]);
  console.log(JSON.stringify(result, null, 2));
}

run().catch((error) => {
  console.error(`[dev-seed] ${error.message}`);
  process.exit(1);
});
