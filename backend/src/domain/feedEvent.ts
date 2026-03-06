import { ModerationState, Visibility } from "./types";

export type FeedEventType =
  | "POST_CREATED"
  | "CLUB_POST_CREATED"
  | "PROJECT_HIGHLIGHT_CREATED"
  | "MILESTONE_COMPLETED"
  | "TASK_COMPLETED"
  | "PROJECT_CREATED";

export type FeedEventContextType = "POST" | "PROJECT_HIGHLIGHT" | "MILESTONE" | "TASK" | "CLUB" | "PROJECT";

export type FeedSource = "COMMONS" | "CLUBS" | "PROJECTS";

export type FeedEntityType = "POST" | "PROJECT_HIGHLIGHT" | "PROJECT_MILESTONE" | "PROJECT_TASK" | "PROJECT";

export type FeedEvent = {
  id: string;
  eventType: FeedEventType;
  contextType: FeedEventContextType;
  entityType: FeedEntityType;
  entityId: string;
  actorId: string;
  source: FeedSource;
  visibility: Visibility;
  clubId?: string;
  projectId?: string;
  createdAt: string;
  sortTimestamp: string;
  moderationState: ModerationState;
  isDeleted: boolean;
  summary?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type FeedCursor = {
  sortTimestamp: string;
  id: string;
};

export type FeedQueryFilters = {
  source?: FeedSource;
  eventType?: FeedEventType;
  clubId?: string;
  projectId?: string;
  actorId?: string;
};
