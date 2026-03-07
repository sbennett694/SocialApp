import { v4 as uuidv4 } from "uuid";
import { ClubHistoryEvent } from "../domain/clubHistory";
import { store } from "./store";

export type CreateClubHistoryEventInput = Omit<ClubHistoryEvent, "id" | "sequence" | "createdAt"> & {
  createdAt?: string;
};

function nextClubHistorySequence(clubId: string): number {
  let maxSequence = 0;
  for (const event of store.clubHistoryEvents as ClubHistoryEvent[]) {
    if (event.clubId !== clubId) continue;
    if (event.sequence > maxSequence) maxSequence = event.sequence;
  }
  return maxSequence + 1;
}

export const clubHistoryRepository = {
  append(input: CreateClubHistoryEventInput): ClubHistoryEvent {
    const event: ClubHistoryEvent = {
      id: uuidv4(),
      clubId: input.clubId,
      sequence: nextClubHistorySequence(input.clubId),
      eventType: input.eventType,
      actorId: input.actorId,
      subjectUserId: input.subjectUserId,
      subjectProjectId: input.subjectProjectId,
      metadata: input.metadata,
      visibility: input.visibility,
      createdAt: input.createdAt ?? new Date().toISOString()
    };

    store.clubHistoryEvents.push(event);
    return event;
  },

  listByClub(clubId: string): ClubHistoryEvent[] {
    return (store.clubHistoryEvents as ClubHistoryEvent[])
      .filter((event) => event.clubId === clubId)
      .sort((a, b) => b.sequence - a.sequence || b.createdAt.localeCompare(a.createdAt));
  }
};
