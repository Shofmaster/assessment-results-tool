import { useState, useMemo } from 'react';
import { FiX, FiCheck, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { MANUAL_CAPABILITIES, getCapabilitiesForType } from '../services/manualWriterService';
import type { CapabilityCategory } from '../services/manualWriterService';

interface CapabilitiesModalProps {
  manualType: string;
  manualTypeLabel: string;
  enabledCapabilities: string[];
  onChange: (caps: string[]) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<CapabilityCategory, string> = {
  ratings: 'Ratings & Work Categories',
  'special-process': 'Special Processes',
  'records-tech': 'Records & Technology',
  operations: 'Operational Programs',
  programs: 'Quality & Safety Programs',
};

const CATEGORY_ORDER: CapabilityCategory[] = [
  'ratings',
  'special-process',
  'records-tech',
  'operations',
  'programs',
];

export default function CapabilitiesModal({
  manualType,
  manualTypeLabel,
  enabledCapabilities,
  onChange,
  onClose,
}: CapabilitiesModalProps) {
  const available = useMemo(() => getCapabilitiesForType(manualType), [manualType]);
  const [selected, setSelected] = useState<Set<string>>(new Set(enabledCapabilities));
  const [expandedCategories, setExpandedCategories] = useState<Set<CapabilityCategory>>(
    new Set(CATEGORY_ORDER)
  );

  const grouped = useMemo(() => {
    const map: Partial<Record<CapabilityCategory, typeof available>> = {};
    for (const cap of available) {
      if (!map[cap.category]) map[cap.category] = [];
      map[cap.category]!.push(cap);
    }
    return map;
  }, [available]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(cat: CapabilityCategory) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function handleApply() {
    onChange(Array.from(selected));
    onClose();
  }

  const selectedCount = selected.size;
  const addedSectionsCount = Array.from(selected).reduce((acc, id) => {
    const cap = MANUAL_CAPABILITIES.find((c) => c.id === id);
    return acc + (cap?.addsSections.length ?? 0);
  }, 0);

  if (available.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-navy-800 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg p-8 text-center">
          <p className="text-slate-400">No capabilities defined for {manualTypeLabel} yet.</p>
          <button onClick={onClose} className="mt-4 text-sm text-blue-400 hover:text-blue-300">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-navy-800 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Manual Capabilities</h2>
            <p className="text-xs text-slate-400 mt-0.5">{manualTypeLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <FiX size={16} />
          </button>
        </div>

        {/* Summary strip */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-3 px-6 py-2.5 bg-blue-500/10 border-b border-blue-500/20 flex-shrink-0">
            <span className="text-xs text-blue-300">
              <span className="font-semibold text-blue-200">{selectedCount}</span> capabilit{selectedCount === 1 ? 'y' : 'ies'} enabled
              {addedSectionsCount > 0 && (
                <span className="text-slate-400"> · adds <span className="text-slate-300">{addedSectionsCount}</span> section{addedSectionsCount === 1 ? '' : 's'}</span>
              )}
            </span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4 space-y-3">
          {CATEGORY_ORDER.filter((cat) => grouped[cat] && grouped[cat]!.length > 0).map((cat) => {
            const caps = grouped[cat]!;
            const isExpanded = expandedCategories.has(cat);
            const enabledInCat = caps.filter((c) => selected.has(c.id)).length;

            return (
              <div key={cat} className="rounded-xl border border-white/8 overflow-hidden">
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/8 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium text-slate-200">{CATEGORY_LABELS[cat]}</span>
                    {enabledInCat > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-medium">
                        {enabledInCat} on
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="text-xs">{caps.length} option{caps.length !== 1 ? 's' : ''}</span>
                    {isExpanded ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                  </div>
                </button>

                {/* Capability list */}
                {isExpanded && (
                  <div className="divide-y divide-white/5">
                    {caps.map((cap) => {
                      const isOn = selected.has(cap.id);
                      return (
                        <button
                          key={cap.id}
                          onClick={() => toggle(cap.id)}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                            isOn ? 'bg-blue-500/8 hover:bg-blue-500/12' : 'hover:bg-white/5'
                          }`}
                        >
                          {/* Checkbox */}
                          <div className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            isOn
                              ? 'bg-blue-500 border-blue-500 text-white'
                              : 'border-slate-600 bg-transparent'
                          }`}>
                            {isOn && <FiCheck size={10} />}
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-medium leading-tight ${isOn ? 'text-white' : 'text-slate-300'}`}>
                                {cap.label}
                              </span>
                              {cap.cfrRef && (
                                <span className="text-xs text-slate-500 font-mono">{cap.cfrRef}</span>
                              )}
                              {cap.addsSections.length > 0 && (
                                <span className="text-xs text-slate-500">
                                  +{cap.addsSections.length} section{cap.addsSections.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{cap.description}</p>
                            {isOn && cap.addsSections.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {cap.addsSections.map((s) => (
                                  <span key={s.title} className="text-xs bg-blue-500/15 text-blue-300 px-1.5 py-0.5 rounded">
                                    {s.title}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 flex-shrink-0">
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear all
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
            >
              Apply{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
