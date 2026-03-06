import { v4 as uuidv4 } from "uuid";
import { FeedEvent, FeedEventContextType, FeedEntityType, FeedEventType, FeedSource } from "../domain/feedEvent";
import { ModerationState, Visibility } from "../domain/types";
import { feedEventRepository } from "../repositories/feedEventRepository";

type EmitFeedEventInput = {
  eventType: FeedEventType;
  contextType: FeedEventContextType;
  entityType: FeedEntityType;
  entityId: string;
  actorId: string;
  source: FeedSource;
  visibility: Visibility;
  clubId?: string;
  projectId?: string;
  moderationState?: ModerationState;
  summary?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

function emitFeedEvent(input: EmitFeedEventInput): FeedEvent {
  const timestamp = new Date().toISOString();
  return feedEventRepository.append({
    id: uuidv4(),
    eventType: input.eventType,
    contextType: input.contextType,
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: input.actorId,
    source: input.source,
    visibility: input.visibility,
    clubId: input.clubId,
    projectId: input.projectId,
    createdAt: timestamp,
    sortTimestamp: timestamp,
    moderationState: input.moderationState ?? "OK",
    isDeleted: false,
    summary: input.summary,
    metadata: input.metadata
  });
}

export const feedEventService = {
  emitPostCreated(input: {
    entityId: string;
    actorId: string;
    visibility: Visibility;
    clubId?: string;
    projectId?: string;
    moderationState?: ModerationState;
  }) {
    return emitFeedEvent({
      eventType: "POST_CREATED",
      contextType: "POST",
      entityType: "POST",
      entityId: input.entityId,
      actorId: input.actorId,
      source: "COMMONS",
      visibility: input.visibility,
      clubId: input.clubId,
      projectId: input.projectId,
      moderationState: input.moderationState
    });
  },

  emitClubPostCreated(input: {
    entityId: string;
    actorId: string;
    visibility: Visibility;
    clubId: string;
    projectId?: string;
    moderationState?: ModerationState;
  }) {
    return emitFeedEvent({
      eventType: "CLUB_POST_CREATED",
      contextType: "POST",
      entityType: "POST",
      entityId: input.entityId,
      actorId: input.actorId,
      source: "CLUBS",
      visibility: input.visibility,
      clubId: input.clubId,
      projectId: input.projectId,
      moderationState: input.moderationState
    });
  },

  emitProjectCreated(input: { entityId: string; actorId: string; visibility?: Visibility; projectId?: string; clubId?: string }) {
    return emitFeedEvent({
      eventType: "PROJECT_CREATED",
      contextType: "PROJECT",
      entityType: "PROJECT",
      entityId: input.entityId,
      actorId: input.actorId,
      source: "PROJECTS",
      visibility: input.visibility ?? "PUBLIC",
      projectId: input.projectId ?? input.entityId,
      clubId: input.clubId
    });
  },

  emitProjectHighlightCreated(input: {
    entityId: string;
    actorId: string;
    projectId: string;
    clubId?: string;
    visibility?: Visibility;
  }) {
    return emitFeedEvent({
      eventType: "PROJECT_HIGHLIGHT_CREATED",
      contextType: "PROJECT_HIGHLIGHT",
      entityType: "PROJECT_HIGHLIGHT",
      entityId: input.entityId,
      actorId: input.actorId,
      source: "PROJECTS",
      visibility: input.visibility ?? "PUBLIC",
      projectId: input.projectId,
      clubId: input.clubId
    });
  },

  emitMilestoneCompleted(input: {
    entityId: string;
    actorId: string;
    projectId: string;
    clubId?: string;
    visibility?: Visibility;
  }) {
    return emitFeedEvent({
      eventType: "MILESTONE_COMPLETED",
      contextType: "MILESTONE",
      entityType: "PROJECT_MILESTONE",
      entityId: input.entityId,
      actorId: input.actorId,
      source: "PROJECTS",
      visibility: input.visibility ?? "PUBLIC",
      projectId: input.projectId,
      clubId: input.clubId
    });
  },

  emitTaskCompleted(input: { entityId: string; actorId: string; projectId: string; clubId?: string; visibility?: Visibility }) {
    return emitFeedEvent({
      eventType: "TASK_COMPLETED",
      contextType: "TASK",
      entityType: "PROJECT_TASK",
      entityId: input.entityId,
      actorId: input.actorId,
      source: "PROJECTS",
      visibility: input.visibility ?? "PUBLIC",
      projectId: input.projectId,
      clubId: input.clubId
    });
  }
};
