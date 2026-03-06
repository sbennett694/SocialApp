import { FeedCursor, FeedEvent } from "../domain/feedEvent";
import { store } from "./store";

export type FeedEventQueryInput = {
  cursor?: FeedCursor;
  limit: number;
};

function compareFeedEventsDesc(a: FeedEvent, b: FeedEvent): number {
  if (a.sortTimestamp === b.sortTimestamp) {
    return b.id.localeCompare(a.id);
  }
  return b.sortTimestamp.localeCompare(a.sortTimestamp);
}

function applyCursor(events: FeedEvent[], cursor?: FeedCursor): FeedEvent[] {
  if (!cursor) return events;
  return events.filter(
    (event) =>
      event.sortTimestamp < cursor.sortTimestamp ||
      (event.sortTimestamp === cursor.sortTimestamp && event.id < cursor.id)
  );
}

function sortAndLimit(events: FeedEvent[], input: FeedEventQueryInput): FeedEvent[] {
  const sorted = [...events].sort(compareFeedEventsDesc);
  return applyCursor(sorted, input.cursor).slice(0, input.limit);
}

export const feedEventRepository = {
  append(event: FeedEvent): FeedEvent {
    store.feedEvents.unshift(event);
    return event;
  },

  listRecent(input: FeedEventQueryInput): FeedEvent[] {
    return sortAndLimit(store.feedEvents, input);
  },

  listByVisibility(visibility: FeedEvent["visibility"], input: FeedEventQueryInput): FeedEvent[] {
    return sortAndLimit(store.feedEvents.filter((event) => event.visibility === visibility), input);
  },

  listByActor(actorId: string, input: FeedEventQueryInput): FeedEvent[] {
    return sortAndLimit(store.feedEvents.filter((event) => event.actorId === actorId), input);
  },

  listByClub(clubId: string, input: FeedEventQueryInput): FeedEvent[] {
    return sortAndLimit(store.feedEvents.filter((event) => event.clubId === clubId), input);
  },

  listByProject(projectId: string, input: FeedEventQueryInput): FeedEvent[] {
    return sortAndLimit(store.feedEvents.filter((event) => event.projectId === projectId), input);
  }
};
