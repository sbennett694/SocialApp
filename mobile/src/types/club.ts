import { Club } from "../api/client";

export type ClubWithCounts = Club & {
  memberCount?: number;
  pendingJoinRequestCount?: number;
};
