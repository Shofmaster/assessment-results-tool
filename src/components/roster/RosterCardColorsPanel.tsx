import { useMemo, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { toast } from "sonner";
import type { RosterPersonRow } from "../../utils/rosterOrganization";
import {
  ROSTER_COLOR_PRESETS,
  SUGGESTED_MANAGEMENT_LEVELS,
  describeColorRule,
  type RosterCardColorRule,
} from "../../utils/rosterCardColors";
import { RosterCardColorPicker } from "./RosterCardColorPicker";
import { Button } from "../ui";

type ColorRuleRow = RosterCardColorRule & { _id: string };

type Props = {
  personnel: RosterPersonRow[];
  rules: ColorRuleRow[];
  onSetBulkColor: (args: {
    matchKind: "managementLevel" | "roleTitle";
    matchValue: string;
    cardColor: string | null;
  }) => Promise<{ updated: number }>;
  onAddRule: (args: {
    matchKind: RosterCardColorRule["matchKind"];
    matchValue: string;
    matchMode?: "exact" | "contains";
    color: string;
  }) => Promise<void>;
  onRemoveRule: (ruleId: string) => Promise<void>;
};

export function RosterManagementLevelSelect({
  value,
  onChange,
  options,
  selectSize = "sm",
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  selectSize?: "sm" | "md";
}) {
  const sizeClass = selectSize === "md" ? "px-3 py-2 text-sm" : "px-2 py-1.5 text-xs";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg bg-white/5 border border-white/10 text-white ${sizeClass}`}
    >
      <option value="">Management level — optional</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function BulkColorRow({
  label,
  count,
  color,
  onChange,
}: {
  label: string;
  count: number;
  color?: string;
  onChange: (color: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-white truncate">{label}</div>
          <div className="text-[11px] text-white/45">
            {count} team member{count !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
      <RosterCardColorPicker
        compact
        value={color}
        label=""
        onChange={async (next) => {
          try {
            setSaving(true);
            await onChange(next);
          } finally {
            setSaving(false);
          }
        }}
      />
      {saving ? <p className="text-[10px] text-white/40">Saving…</p> : null}
    </li>
  );
}

export function RosterCardColorsPanel({ personnel, rules, onSetBulkColor, onAddRule, onRemoveRule }: Props) {
  const [matchValue, setMatchValue] = useState("");
  const [color, setColor] = useState<string>(ROSTER_COLOR_PRESETS[1].hex);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const managementLevelRows = useMemo(() => {
    const counts = new Map<string, number>();
    const colors = new Map<string, string>();
    for (const level of SUGGESTED_MANAGEMENT_LEVELS) {
      counts.set(level, 0);
    }
    for (const person of personnel) {
      const level = person.managementLevel?.trim();
      if (!level) continue;
      counts.set(level, (counts.get(level) ?? 0) + 1);
      if (person.cardColor) colors.set(level, person.cardColor);
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 0)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([level, count]) => ({ level, count, color: colors.get(level) }));
  }, [personnel]);

  const roleTitleRows = useMemo(() => {
    const buckets = new Map<string, { count: number; color?: string }>();
    for (const person of personnel) {
      const title = person.roleTitle?.trim();
      if (!title) continue;
      const existing = buckets.get(title) ?? { count: 0, color: undefined };
      existing.count += 1;
      if (person.cardColor) existing.color = person.cardColor;
      buckets.set(title, existing);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([title, data]) => ({ title, ...data }));
  }, [personnel]);

  const handleAddRule = async () => {
    const trimmed = matchValue.trim();
    if (!trimmed) {
      toast.error("Enter a value to match");
      return;
    }
    try {
      setIsAdding(true);
      await onAddRule({
        matchKind: "orgDepth",
        matchValue: trimmed,
        color,
      });
      setMatchValue("");
      toast.success("Org chart color rule added");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to add color rule");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveRule = async (rule: ColorRuleRow) => {
    const ok = window.confirm(`Remove color rule for ${describeColorRule(rule)}?`);
    if (!ok) return;
    try {
      setRemovingId(rule._id);
      await onRemoveRule(rule._id);
      toast.success("Color rule removed");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to remove color rule");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Card colors</h2>
        <p className="text-sm text-white/55 mt-0.5 max-w-2xl">
          Click a color swatch on any team member card to change one person, or use the bulk rows below to color everyone
          with the same management level or job title at once.
        </p>
      </div>

      {managementLevelRows.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-white/45">By management level</h3>
          <ul className="space-y-2">
            {managementLevelRows.map((row) => (
              <BulkColorRow
                key={row.level}
                label={row.level}
                count={row.count}
                color={row.color}
                onChange={async (next) => {
                  const result = await onSetBulkColor({
                    matchKind: "managementLevel",
                    matchValue: row.level,
                    cardColor: next,
                  });
                  toast.success(`Updated ${result.updated} card${result.updated !== 1 ? "s" : ""}`);
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {roleTitleRows.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-white/45">By job title</h3>
          <ul className="space-y-2">
            {roleTitleRows.map((row) => (
              <BulkColorRow
                key={row.title}
                label={row.title}
                count={row.count}
                color={row.color}
                onChange={async (next) => {
                  const result = await onSetBulkColor({
                    matchKind: "roleTitle",
                    matchValue: row.title,
                    cardColor: next,
                  });
                  toast.success(`Updated ${result.updated} card${result.updated !== 1 ? "s" : ""}`);
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-wide text-white/45">Org chart level rules (optional)</h3>
        {rules.length > 0 ? (
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li
                key={rule._id}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <span
                  className="w-8 h-8 rounded-md border border-white/15 shrink-0"
                  style={{ backgroundColor: rule.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">{describeColorRule(rule)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemoveRule(rule)}
                  disabled={removingId === rule._id}
                  className="p-1.5 rounded-md text-white/35 hover:text-red-300 hover:bg-white/5 disabled:opacity-50"
                  title="Remove rule"
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/45 italic">No org-chart level rules — add one below if you want level-based colors.</p>
        )}

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={matchValue}
              onChange={(e) => setMatchValue(e.target.value)}
              placeholder="Org level (0 = top, 1, 2…)"
              className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
            />
            <RosterCardColorPicker value={color} label="" onChange={(next) => setColor(next ?? ROSTER_COLOR_PRESETS[1].hex)} />
          </div>
          <Button size="sm" icon={<FiPlus className="w-3.5 h-3.5" />} loading={isAdding} onClick={() => void handleAddRule()}>
            Add org level rule
          </Button>
        </div>
      </section>
    </div>
  );
}
