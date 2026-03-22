export function buildNotificationPreviewText(text: string | undefined | null, wordLimit = 7): string | undefined {
  if (!text) return undefined;

  const words = text
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) return undefined;
  const safeLimit = Math.max(1, wordLimit);
  const truncated = words.slice(0, safeLimit).join(" ");
  return words.length > safeLimit ? `${truncated}...` : truncated;
}

type NotificationTone = "COMMENTS" | "QUESTIONS" | "THANK_YOU" | "SUGGESTIONS";

export function deriveNotificationAction(threadType?: string | null): "responded" | "commented" | "asked" | "thanked" | "suggested" {
  switch (threadType) {
    case "COMMENTS":
      return "commented";
    case "QUESTIONS":
      return "asked";
    case "THANK_YOU":
      return "thanked";
    case "SUGGESTIONS":
      return "suggested";
    default:
      return "responded";
  }
}

export function buildCommentNotificationMessage(input: {
  actorId: string;
  textContent?: string | null;
  threadType?: NotificationTone | string | null;
}): string {
  const action = deriveNotificationAction(input.threadType);
  const previewText = buildNotificationPreviewText(input.textContent);

  if (!previewText) {
    return `@${input.actorId} ${action}.`;
  }

  return `@${input.actorId} ${action}: "${previewText}"`;
}
