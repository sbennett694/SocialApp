import { politicalTerms } from "./politicalTerms";

export type ModerationDecision = {
  allowed: boolean;
  matchedTerms: string[];
  reason?: string;
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function evaluateText(text: string): ModerationDecision {
  const normalized = normalize(text);
  const matchedTerms = politicalTerms.filter((term) => normalized.includes(term));

  if (matchedTerms.length > 0) {
    return {
      allowed: false,
      matchedTerms,
      reason: "Political content is not allowed on this platform"
    };
  }

  return { allowed: true, matchedTerms: [] };
}
