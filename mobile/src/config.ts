export type DataMode = "mock" | "local-api" | "remote-dev";

const fallbackLocalApiBaseUrl = "http://127.0.0.1:3001";

function normalizeLoopback(url: string): string {
  return url.replace("://localhost", "://127.0.0.1");
}

function resolveDataMode(rawMode: string | undefined): DataMode {
  const value = (rawMode ?? "local-api").trim().toLowerCase();
  if (value === "mock" || value === "local-api" || value === "remote-dev") {
    return value;
  }
  return "local-api";
}

const dataMode = resolveDataMode(process.env.EXPO_PUBLIC_DATA_MODE);
const localApiBaseUrl = normalizeLoopback(
  process.env.EXPO_PUBLIC_LOCAL_API_BASE_URL ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? fallbackLocalApiBaseUrl
);
const remoteDevApiBaseUrl =
  process.env.EXPO_PUBLIC_REMOTE_DEV_API_BASE_URL ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? localApiBaseUrl;

function resolveApiBaseUrl(mode: DataMode): string {
  if (mode === "remote-dev") {
    return remoteDevApiBaseUrl;
  }

  // Keep current local API behavior for both local-api and mock mode.
  // Mock mode can later switch to local in-app fixtures without breaking callers.
  return localApiBaseUrl;
}

export const config = {
  dataMode,
  apiBaseUrl: resolveApiBaseUrl(dataMode),
  authMode: process.env.EXPO_PUBLIC_AUTH_MODE ?? "mock"
};




