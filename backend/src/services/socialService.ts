import { v4 as uuidv4 } from "uuid";
import { Club, ClubMember, PostTag, Project, Visibility } from "../domain/types";
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

export function assertFounderImmutable(club: Club, proposedFounderId: string | undefined) {
  if (proposedFounderId !== undefined && proposedFounderId !== club.founderId) {
    throw new Error("Founder identity is immutable and cannot be changed.");
  }
}

export function assertClubHasExactlyOneOwner(clubId: string) {
  const ownerMemberships = store.clubMembers.filter((member) => member.clubId === clubId && member.role === "OWNER");
  if (ownerMemberships.length !== 1) {
    throw new Error("Club must have exactly one owner membership.");
  }

  const club = store.clubs.find((entry) => entry.id === clubId);
  if (!club) {
    throw new Error("Club not found.");
  }

  const ownerMembership = ownerMemberships[0];
  if (club.ownerId !== ownerMembership.userId) {
    throw new Error("Club ownerId must match the single OWNER club membership.");
  }
}

export function transferClubOwnershipAtomic(input: {
  clubId: string;
  actorId: string;
  newOwnerId: string;
  previousOwnerFallbackRole: Exclude<ClubMember["role"], "OWNER">;
}) {
  const { clubId, actorId, newOwnerId, previousOwnerFallbackRole } = input;
  const club = store.clubs.find((entry) => entry.id === clubId);
  if (!club) {
    throw new Error("Club not found.");
  }

  if (club.ownerId !== actorId) {
    throw new Error("Only current owner can transfer ownership.");
  }

  if (newOwnerId === club.ownerId) {
    throw new Error("New owner must differ from current owner.");
  }

  const currentOwnerMembership = store.clubMembers.find(
    (member) => member.clubId === clubId && member.userId === club.ownerId
  );
  const nextOwnerMembership = store.clubMembers.find(
    (member) => member.clubId === clubId && member.userId === newOwnerId
  );

  if (!currentOwnerMembership || !nextOwnerMembership) {
    throw new Error("Both current and next owner must be club members.");
  }

  // Apply as a single service operation after pre-validation.
  currentOwnerMembership.role = previousOwnerFallbackRole;
  nextOwnerMembership.role = "OWNER";
  club.ownerId = newOwnerId;

  assertFounderImmutable(club, club.founderId);
  assertClubHasExactlyOneOwner(clubId);
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
