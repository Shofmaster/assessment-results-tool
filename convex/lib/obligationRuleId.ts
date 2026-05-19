export function buildObligationRuleId(regulationRef?: string | null, title?: string | null): string | undefined {
  const base = (regulationRef || title || "").toLowerCase().trim();
  if (!base) return undefined;
  const normalized = base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) return undefined;
  return `rule:${normalized}`;
}

