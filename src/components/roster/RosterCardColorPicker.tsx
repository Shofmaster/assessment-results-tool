import { ROSTER_COLOR_PRESETS, isValidRosterCardColor } from "../../utils/rosterCardColors";

type Props = {
  value?: string;
  onChange: (color: string | null) => void;
  compact?: boolean;
  label?: string;
};

export function RosterCardColorPicker({ value, onChange, compact, label = "Card color" }: Props) {
  const active = value && isValidRosterCardColor(value) ? value : undefined;
  const swatchSize = compact ? "w-6 h-6" : "w-7 h-7";

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-white/50 ${compact ? "text-[11px]" : "text-xs"}`}>{label}</span>
        <button
          type="button"
          title="Default (no color)"
          onClick={() => onChange(null)}
          className={`${swatchSize} rounded-md border transition-all ${
            !active
              ? "border-white ring-1 ring-white/50 bg-white/10"
              : "border-white/25 bg-white/5 hover:border-white/40"
          }`}
        />
        {ROSTER_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.hex}
            type="button"
            title={preset.label}
            onClick={() => onChange(preset.hex)}
            className={`${swatchSize} rounded-md border transition-all ${
              active === preset.hex
                ? "border-white ring-2 ring-white/60 scale-110"
                : "border-white/20 hover:border-white/45 hover:scale-105"
            }`}
            style={{ backgroundColor: preset.hex }}
          />
        ))}
        <label className={`inline-flex items-center gap-1.5 cursor-pointer ${compact ? "text-[11px]" : "text-xs"} text-white/45`}>
          Custom
          <input
            type="color"
            value={active ?? "#3b82f6"}
            onChange={(e) => onChange(e.target.value)}
            className={`${compact ? "h-6 w-8" : "h-7 w-9"} rounded border border-white/15 bg-transparent cursor-pointer`}
          />
        </label>
      </div>
    </div>
  );
}
