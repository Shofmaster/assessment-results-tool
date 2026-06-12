import { useMemo, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { toast } from "sonner";
import {
  ROSTER_COLOR_PRESETS,
  describeColorRule,
  type RosterCardColorRule,
} from "../../utils/rosterCardColors";
import { Button } from "../ui";

type ColorRuleRow = RosterCardColorRule & { _id: string };

type Props = {
  rules: ColorRuleRow[];
  onAdd: (args: {
    matchKind: RosterCardColorRule["matchKind"];
    matchValue: string;
    matchMode?: "exact" | "contains";
    color: string;
  }) => Promise<void>;
  onRemove: (ruleId: string) => Promise<void>;
};

const MATCH_KIND_OPTIONS: { id: RosterCardColorRule["matchKind"]; label: string }[] = [
  { id: "roleTitle", label: "Job title" },
  { id: "managementLevel", label: "Management level" },
  { id: "orgDepth", label: "Org chart level" },
];

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

export function RosterCardColorsPanel({ rules, onAdd, onRemove }: Props) {
  const [matchKind, setMatchKind] = useState<RosterCardColorRule["matchKind"]>("roleTitle");
  const [matchValue, setMatchValue] = useState("");
  const [matchMode, setMatchMode] = useState<"exact" | "contains">("exact");
  const [color, setColor] = useState<string>(ROSTER_COLOR_PRESETS[1].hex);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const matchPlaceholder = useMemo(() => {
    if (matchKind === "roleTitle") return 'e.g. "DOM" or "Technician"';
    if (matchKind === "managementLevel") return 'e.g. "Director"';
    return "0 = top level, 1 = reports to top, etc.";
  }, [matchKind]);

  const handleAdd = async () => {
    const trimmed = matchValue.trim();
    if (!trimmed) {
      toast.error("Enter a value to match");
      return;
    }
    try {
      setIsAdding(true);
      await onAdd({
        matchKind,
        matchValue: trimmed,
        matchMode: matchKind === "orgDepth" ? undefined : matchMode,
        color,
      });
      setMatchValue("");
      toast.success("Card color rule added");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to add color rule");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (rule: ColorRuleRow) => {
    const ok = window.confirm(`Remove color rule for ${describeColorRule(rule)}?`);
    if (!ok) return;
    try {
      setRemovingId(rule._id);
      await onRemove(rule._id);
      toast.success("Color rule removed");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to remove color rule");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Card colors</h2>
        <p className="text-sm text-white/55 mt-0.5 max-w-2xl">
          Color roster cards and org-chart boxes by job title, management level, or org-chart depth. Job title rules
          are checked first, then management level, then org-chart level.
        </p>
      </div>

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
                <div className="text-[11px] text-white/45 font-mono">{rule.color}</div>
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(rule)}
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
        <p className="text-sm text-white/45 italic">No color rules yet — cards use the default style.</p>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
        <p className="text-xs uppercase tracking-wide text-white/45">Add rule</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={matchKind}
            onChange={(e) => setMatchKind(e.target.value as RosterCardColorRule["matchKind"])}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
          >
            {MATCH_KIND_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={matchValue}
            onChange={(e) => setMatchValue(e.target.value)}
            placeholder={matchPlaceholder}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
          />
        </div>

        {matchKind !== "orgDepth" ? (
          <div className="flex flex-wrap gap-2">
            {(["exact", "contains"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setMatchMode(mode)}
                className={`px-2.5 py-1 rounded border text-xs transition-colors ${
                  matchMode === mode
                    ? "bg-sky-500/20 text-sky-lighter border-sky-500/40"
                    : "bg-white/5 text-white/70 border-white/15"
                }`}
              >
                {mode === "exact" ? "Exact match" : "Contains"}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-white/50">Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 rounded border border-white/15 bg-transparent cursor-pointer"
          />
          {ROSTER_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              title={preset.label}
              onClick={() => setColor(preset.hex)}
              className={`w-7 h-7 rounded-md border ${
                color === preset.hex ? "border-white ring-1 ring-white/40" : "border-white/20"
              }`}
              style={{ backgroundColor: preset.hex }}
            />
          ))}
        </div>

        <Button size="sm" icon={<FiPlus className="w-3.5 h-3.5" />} loading={isAdding} onClick={() => void handleAdd()}>
          Add color rule
        </Button>
      </div>
    </div>
  );
}
