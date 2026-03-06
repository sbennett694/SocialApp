import { v4 as uuidv4 } from "uuid";
import { ClubMember, PostTag, Project, Visibility } from "../domain/types";
import { store } from "../repositories/store";

export function relationKey(viewerId: string, targetId: string): string {
  return `${viewerId}::${targetId}`;
}

export function getClubMembershipRole(clubId: string, userId: string): ClubMember["role"] | null {
  return store.clubMembers.find((member) => member.clubId === clubId && member.userId === userId)?.role ?? null;
}

export function canManageClub(clubId: string, userId: string): boolean {
  const role = getClubMembershipRole(clubId, userId);
  return role === "OWNER" || role === "MODERATOR";
}

export function canManageProject(project: Project, actorId: string): boolean {
  if (project.clubId) return canManageClub(project.clubId, actorId);
  return project.ownerId === actorId || project.createdBy === actorId;
}

export function getProjectMilestonesOrdered(projectId: string) {
  return store.projectMilestones
    .filter((item) => item.projectId === projectId)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function publishActivityPost(input: {
  userId: string;
  text: string;
  visibility?: Visibility;
  clubId?: string;
  projectId?: string;
  postedAsClub?: boolean;
  clubActorId?: string;
  tags?: PostTag[];
}) {
  store.posts.unshift({
    postId: uuidv4(),
    userId: input.userId,
    text: input.text,
    createdAt: new Date().toISOString(),
    moderationStatus: "approved",
    visibility: input.visibility ?? "PUBLIC",
    clubId: input.clubId,
    projectId: input.projectId,
    postedAsClub: input.postedAsClub,
    clubActorId: input.clubActorId,
    tags: input.tags ?? ["PROGRESS"]
  });
}
