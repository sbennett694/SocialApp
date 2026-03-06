import { config } from "../config";

export type AuthUser = {
  userId: string;
  displayName: string;
};

const mockUsers: AuthUser[] = [
  { userId: "alex", displayName: "Alex" },
  { userId: "jamie", displayName: "Jamie" },
  { userId: "taylor", displayName: "Taylor" }
];

export function getMockUsers(): AuthUser[] {
  return mockUsers;
}

export function getCurrentUser(selectedMockUserId?: string): AuthUser {
  if (config.authMode === "cognito") {
    // Placeholder for future Cognito integration.
    // For now we keep a deterministic dev identity so UI work can continue locally.
    return {
      userId: "cognito-user",
      displayName: "Cognito User"
    };
  }

  return mockUsers.find((user) => user.userId === selectedMockUserId) ?? mockUsers[0];
}
