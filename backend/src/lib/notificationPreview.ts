export function buildNotificationPreviewText(text: string | undefined | null, wordLimit = 5): string | undefined {
  if (!text) return undefined;

  const words = text
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) return undefined;
  return words.slice(0, Math.max(1, wordLimit)).join(" ");
}
