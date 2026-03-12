import { ModerationState, Visibility } from "./types";

export type FeedEventType =
  | "POST_CREATED"
  | "CLUB_POST_CREATED"
  | "COMMENT_ADDED"
  | "QUESTION_ADDED"
  | "SUGGESTION_ADDED"
  | "GRATITUDE_ADDED"
  | "PROJECT_HIGHLIGHT_CREATED"
  | "MILESTONE_COMPLETED"
  | "TASK_COMPLETED"
  | "CLUB_EVENT_CREATED"
  | "PROJECT_CREATED";

export type FeedEventContextType =
  | "POST"
  | "COMMENT"
  | "PROJECT_HIGHLIGHT"
  | "MILESTONE"
  | "TASK"
  | "CLUB"
  | "CLUB_EVENT"
  | "PROJECT";

export type FeedSource = "COMMONS" | "CLUBS" | "PROJECTS";

export type FeedEntityType =
  | "POST"
  | "COMMENT"
  | "PROJECT_HIGHLIGHT"
  | "PROJECT_MILESTONE"
  | "PROJECT_TASK"
  | "CLUB_EVENT"
  | "PROJECT";

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
