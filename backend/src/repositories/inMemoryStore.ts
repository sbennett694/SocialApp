import { v4 as uuidv4 } from "uuid";
import {
  Club,
  CloseCircleInvite,
  ClubMember,
  Comment,
  Follow,
  ModerationAction,
  PostTag,
  Project,
  Reaction,
  Report,
  Visibility
} from "../domain/types";
import { FeedEvent } from "../domain/feedEvent";

export type LocalPost = {
  postId: string;
  userId: string;
  text: string;
  createdAt: string;
  moderationStatus: "approved" | "flagged" | "hidden";
  visibility: Visibility;
  clubId?: string;
  projectId?: string;
  postedAsClub?: boolean;
  clubActorId?: string;
  tags: PostTag[];
};

export type GlobalSearchResult = {
  users: Array<{ id: string; handle: string; displayName: string; type: "USER" }>;
  clubs: Array<{ id: string; name: string; categoryId: string; type: "CLUB" }>;
  projects: Array<{ id: string; title: string; categoryId: string; type: "PROJECT" }>;
};

export type ProjectMilestone = {
  id: string;
  projectId: string;
  title: string;
  status: "OPEN" | "DONE";
  order: number;
  tasks: ProjectMilestoneTask[];
  createdBy: string;
  createdAt: string;
};

export type ProjectMilestoneTask = {
  id: string;
  text: string;
  isDone: boolean;
  createdBy: string;
  createdAt: string;
};

export type ProjectHighlight = {
  id: string;
  projectId: string;
  text: string;
  authorId: string;
  createdAt: string;
};

export type ProjectClubLink = {
  projectId: string;
  clubId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedBy: string;
  createdAt: string;
};

export const store = {
  users: [
    { id: "alex", handle: "alex", displayName: "Alex" },
    { id: "jamie", handle: "jamie", displayName: "Jamie" },
    { id: "taylor", handle: "taylor", displayName: "Taylor" },
    { id: "welcome", handle: "welcome", displayName: "Welcome User" }
  ],
  follows: [] as Follow[],
  closeCircleInvites: [] as CloseCircleInvite[],
  clubMembers: [] as ClubMember[],
  clubs: [] as Club[],
  projects: [] as Project[],
  projectClubLinks: [] as ProjectClubLink[],
  projectMilestones: [] as ProjectMilestone[],
  projectHighlights: [] as ProjectHighlight[],
  reactions: [] as Reaction[],
  comments: [] as Comment[],
  reports: [] as Report[],
  moderationActions: [] as ModerationAction[],
  feedEvents: [] as FeedEvent[],
  mutedPairs: new Set<string>(),
  blockedPairs: new Set<string>(),
  posts: [
    {
      postId: uuidv4(),
      userId: "welcome",
      text: "Welcome to SocialApp — share hobbies, interests, and positivity.",
      createdAt: new Date().toISOString(),
      moderationStatus: "approved",
      visibility: "PUBLIC" as const,
      tags: ["SHOWCASE" as const]
    }
  ] as LocalPost[]
};
