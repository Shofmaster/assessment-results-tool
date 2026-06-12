import type { RosterPersonRow } from "./rosterOrganization";

export type RosterCardColorRule = {
  matchKind: "roleTitle" | "managementLevel" | "orgDepth";
  matchValue: string;
  matchMode?: "exact" | "contains";
  color: string;
};

export const SUGGESTED_MANAGEMENT_LEVELS = [
  "Executive / Accountable Manager",
  "Director",
  "Manager / Supervisor",
  "Lead / Crew Chief",
  "Staff / Technician",
] as const;

export const ROSTER_COLOR_PRESETS = [
  { label: "Purple", hex: "#a855f7" },
  { label: "Blue", hex: "#3b82f6" },
  { label: "Cyan", hex: "#06b6d4" },
  { label: "Green", hex: "#22c55e" },
  { label: "Amber", hex: "#f59e0b" },
  { label: "Rose", hex: "#f43f5e" },
  { label: "Slate", hex: "#94a3b8" },
] as const;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matchesValue(
  source: string | undefined,
  ruleValue: string,
  matchMode: "exact" | "contains" = "exact",
): boolean {
  const haystack = source?.trim();
  if (!haystack) return false;
  const needle = ruleValue.trim();
  if (!needle) return false;
  if (matchMode === "contains") {
    return normalize(haystack).includes(normalize(needle));
  }
  return normalize(haystack) === normalize(needle);
}

export function isValidRosterCardColor(color: string): boolean {
  return HEX_COLOR.test(color.trim());
}

export function resolveRosterCardColor(
  person: RosterPersonRow,
  rules: RosterCardColorRule[],
  orgDepth?: number,
): string | undefined {
  if (person.cardColor && isValidRosterCardColor(person.cardColor)) {
    return person.cardColor.trim();
  }

  for (const rule of rules) {
    if (rule.matchKind !== "roleTitle") continue;
    if (!isValidRosterCardColor(rule.color)) continue;
    if (matchesValue(person.roleTitle, rule.matchValue, rule.matchMode ?? "exact")) {
      return rule.color;
    }
  }

  for (const rule of rules) {
    if (rule.matchKind !== "managementLevel") continue;
    if (!isValidRosterCardColor(rule.color)) continue;
    if (matchesValue(person.managementLevel, rule.matchValue, rule.matchMode ?? "exact")) {
      return rule.color;
    }
  }

  if (orgDepth !== undefined) {
    for (const rule of rules) {
      if (rule.matchKind !== "orgDepth") continue;
      if (!isValidRosterCardColor(rule.color)) continue;
      if (rule.matchValue.trim() === String(orgDepth)) {
        return rule.color;
      }
    }
  }

  return undefined;
}

export function rosterCardSurfaceStyle(color: string | undefined): { borderColor?: string; backgroundColor?: string } | undefined {
  if (!color || !isValidRosterCardColor(color)) return undefined;
  return {
    borderColor: `${color}66`,
    backgroundColor: `${color}1a`,
  };
}

export function rosterCardAvatarStyle(color: string | undefined): { borderColor?: string; backgroundColor?: string; color?: string } | undefined {
  if (!color || !isValidRosterCardColor(color)) return undefined;
  return {
    borderColor: `${color}55`,
    backgroundColor: `${color}28`,
    color,
  };
}

export function collectManagementLevelOptions(
  personnel: RosterPersonRow[],
  rules: RosterCardColorRule[],
): string[] {
  const merged = new Set<string>(SUGGESTED_MANAGEMENT_LEVELS);
  for (const person of personnel) {
    const level = person.managementLevel?.trim();
    if (level) merged.add(level);
  }
  for (const rule of rules) {
    if (rule.matchKind === "managementLevel" && rule.matchValue.trim()) {
      merged.add(rule.matchValue.trim());
    }
  }
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
}

export function describeColorRule(rule: RosterCardColorRule): string {
  if (rule.matchKind === "orgDepth") {
    const depth = Number(rule.matchValue);
    if (depth === 0) return "Org chart level 0 (top)";
    return `Org chart level ${rule.matchValue}`;
  }
  const mode = rule.matchMode === "contains" ? "contains" : "equals";
  if (rule.matchKind === "roleTitle") {
    return `Job title ${mode} "${rule.matchValue}"`;
  }
  return `Management level ${mode} "${rule.matchValue}"`;
}
