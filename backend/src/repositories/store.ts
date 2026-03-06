import {
  GlobalSearchResult,
  LocalPost,
  ProjectClubLink,
  ProjectHighlight,
  ProjectMilestone,
  ProjectMilestoneTask,
  resetStoreToDefault,
  seedStoreWithDemoData,
  store as inMemoryStore
} from "./inMemoryStore";

export type RepositoryMode = "memory" | "file" | "sqlite" | "dynamodb";

function resolveRepositoryMode(rawValue: string | undefined): RepositoryMode {
  const value = (rawValue ?? "memory").trim().toLowerCase();
  if (value === "memory" || value === "file" || value === "sqlite" || value === "dynamodb") {
    return value;
  }
  return "memory";
}

export const repositoryMode = resolveRepositoryMode(process.env.SOCIALAPP_REPOSITORY_MODE);

// Future-ready provider map: currently only in-memory is active.
const providers: Record<RepositoryMode, typeof inMemoryStore> = {
  memory: inMemoryStore,
  file: inMemoryStore,
  sqlite: inMemoryStore,
  dynamodb: inMemoryStore
};

export const store = providers[repositoryMode];

export { resetStoreToDefault, seedStoreWithDemoData };

export type {
  GlobalSearchResult,
  LocalPost,
  ProjectClubLink,
  ProjectHighlight,
  ProjectMilestone,
  ProjectMilestoneTask
};
