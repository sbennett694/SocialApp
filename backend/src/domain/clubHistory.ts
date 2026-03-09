export type ClubHistoryVisibility = "CLUB_MEMBERS" | "PUBLIC";

export type ClubHistoryEventType =
  | "CLUB_CREATED"
  | "FOUNDER_RECORDED"
  | "OWNERSHIP_TRANSFERRED"
  | "CLUB_SETTINGS_UPDATED"
  | "CLUB_EVENT_CREATED"
  | "CLUB_EVENT_UPDATED"
  | "CLUB_EVENT_CANCELED"
  | "PROJECT_CREATED_FOR_CLUB"
  | "MEMBER_ROLE_CHANGED"
  | "MODERATOR_ADDED"
  | "MODERATOR_REMOVED"
  | "MEMBER_REMOVED"
  | "PROJECT_LINK_REQUESTED"
  | "PROJECT_LINK_APPROVED"
  | "PROJECT_LINK_REJECTED"
  | "PROJECT_LINK_REMOVED";

export type ClubHistoryEvent = {
  id: string;
  clubId: string;
  sequence: number;
  eventType: ClubHistoryEventType;
  actorId?: string;
  subjectUserId?: string;
  subjectProjectId?: string;
  metadata?: Record<string, unknown>;
  visibility: ClubHistoryVisibility;
  createdAt: string;
};
