/**
 * Shared AircraftSelector dropdown — used by LogbookManagement (paper theme)
 * and Entry Review (dark glass theme).
 */

import { useState } from 'react';
import { FiSettings, FiChevronDown, FiPlus } from 'react-icons/fi';
import type { AircraftAsset } from '../../types/logbook';

export type AircraftSelectorVariant = 'paper' | 'dark';

interface AircraftSelectorProps {
  aircraft: AircraftAsset[];
  selected?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  variant?: AircraftSelectorVariant;
  disabled?: boolean;
  disabledTooltip?: string;
}

const themes = {
  paper: {
    trigger: 'bg-[#fff8eb] hover:bg-[#fffdf6] border-amber-300/80 text-stone-700',
    triggerIcon: 'text-sky-700/80',
    triggerText: 'text-stone-700',
    triggerChevron: 'text-stone-500',
    dropdown: 'bg-[#fffaf2] border-amber-300 shadow-xl shadow-black/20',
    itemActive: 'bg-sky-100 text-sky-900',
    itemIdle: 'text-stone-700 hover:bg-amber-50 hover:text-stone-900',
    itemSub: 'text-stone-500',
    divider: 'border-amber-200',
    addBtn: 'text-sky-800 hover:bg-amber-50',
  },
  dark: {
    trigger: 'bg-white/5 hover:bg-white/10 border-white/15 text-white/80',
    triggerIcon: 'text-sky-light/70',
    triggerText: 'text-white/80',
    triggerChevron: 'text-white/40',
    dropdown: 'bg-navy-light/95 border-white/15 shadow-xl shadow-black/40 backdrop-blur-xl',
    itemActive: 'bg-sky/15 text-sky-light',
    itemIdle: 'text-white/70 hover:bg-white/5 hover:text-white/90',
    itemSub: 'text-white/40',
    divider: 'border-white/10',
    addBtn: 'text-sky-light hover:bg-white/5',
  },
} as const;

export default function AircraftSelector({
  aircraft,
  selected,
  onSelect,
  onAdd,
  variant = 'paper',
  disabled = false,
  disabledTooltip,
}: AircraftSelectorProps) {
  const [open, setOpen] = useState(false);
  const current = aircraft.find((a) => a._id === selected);
  const t = themes[variant];

  return (
    <div className="relative" title={disabled ? disabledTooltip : undefined}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors min-w-[230px] ${t.trigger} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <FiSettings className={`${t.triggerIcon} flex-shrink-0`} />
        <span className={`text-sm font-medium truncate ${t.triggerText}`}>
          {current ? `${current.tailNumber} — ${current.make ?? ''} ${current.model ?? ''}`.trim() : 'Select Aircraft'}
        </span>
        <FiChevronDown className={`${t.triggerChevron} ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`absolute z-50 mt-1 w-72 rounded-lg border overflow-hidden ${t.dropdown}`}>
          <div className="max-h-56 overflow-auto">
            {aircraft.map((a) => (
              <button
                key={a._id}
                type="button"
                onClick={() => { onSelect(a._id); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  a._id === selected ? t.itemActive : t.itemIdle
                }`}
              >
                <div className="font-medium">{a.tailNumber}</div>
                <div className={`text-xs ${t.itemSub}`}>{[a.make, a.model, a.serial].filter(Boolean).join(' · ')}</div>
              </button>
            ))}
          </div>
          <div className={`border-t ${t.divider}`}>
            <button
              type="button"
              onClick={() => { onAdd(); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${t.addBtn}`}
            >
              <FiPlus className="text-xs" /> Add Aircraft
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
