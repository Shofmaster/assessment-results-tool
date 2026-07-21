import { useMemo, useState } from 'react';
import { Badge } from '../ui';
import type { AircraftModification } from '../../types/aircraftModification';
import { aggregateModRequirements, type SourcedItem } from '../../utils/modRequirements';

interface ModRequirementsSummaryProps {
  mods: AircraftModification[];
}

function CollapsibleGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-sm font-medium text-white/85">{title}</span>
        <span className="flex items-center gap-2 text-xs text-white/50">
          <Badge variant="default" size="sm" pill>
            {count}
          </Badge>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && <div className="border-t border-white/10 px-3 py-2">{children}</div>}
    </div>
  );
}

function SourcedList({ items, render }: { items: SourcedItem<any>[]; render: (item: any) => React.ReactNode }) {
  return (
    <ul className="space-y-1.5">
      {items.map((entry, i) => (
        <li key={i} className="text-sm text-white/80">
          {render(entry.item)}
          <span className="ml-2 text-xs text-white/40">from {entry.modTitle}</span>
        </li>
      ))}
    </ul>
  );
}

/** Rolled-up "what this aircraft carries because of its modifications" card. */
export function ModRequirementsSummary({ mods }: ModRequirementsSummaryProps) {
  const rollup = useMemo(() => aggregateModRequirements(mods), [mods]);
  const { counts } = rollup;

  if (counts.installedMods === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/65 mb-2">
        Modification-driven requirements
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <Badge variant="info" size="md" pill>
          {counts.installedMods} installed mod{counts.installedMods === 1 ? '' : 's'}
        </Badge>
        <Badge variant="info" size="md" pill>
          {counts.icaTasks} ICA task{counts.icaTasks === 1 ? '' : 's'}
        </Badge>
        <Badge variant="success" size="md" pill>
          {counts.recurringInspections} recurring inspection{counts.recurringInspections === 1 ? '' : 's'}
        </Badge>
        <Badge variant="warning" size="md" pill>
          {counts.afmsSupplements} AFM supplement{counts.afmsSupplements === 1 ? '' : 's'}
        </Badge>
        <Badge variant="destructive" size="md" pill>
          {counts.placards} placard{counts.placards === 1 ? '' : 's'}
        </Badge>
        {rollup.netWeightChangeLbs !== 0 && (
          <Badge variant="outline" size="md" pill>
            {rollup.netWeightChangeLbs > 0 ? '+' : ''}
            {rollup.netWeightChangeLbs} lbs net
          </Badge>
        )}
      </div>
      <div className="space-y-2">
        <CollapsibleGroup title="ICA tasks" count={counts.icaTasks}>
          <SourcedList
            items={rollup.icaTasks}
            render={(ica) => (
              <>
                {ica.description}
                {ica.interval && <span className="ml-2 text-xs text-sky-300">{ica.interval}</span>}
              </>
            )}
          />
        </CollapsibleGroup>
        <CollapsibleGroup title="Recurring inspections" count={counts.recurringInspections}>
          <SourcedList
            items={rollup.recurringInspections}
            render={(insp) => (
              <>
                {insp.description}
                {insp.interval !== undefined && (
                  <span className="ml-2 text-xs text-emerald-300">
                    every {insp.interval} {(insp.intervalUnit ?? '').replace('_', ' ')}
                  </span>
                )}
              </>
            )}
          />
        </CollapsibleGroup>
        <CollapsibleGroup title="AFM supplements" count={counts.afmsSupplements}>
          <SourcedList items={rollup.afmsSupplements} render={(ref) => ref} />
        </CollapsibleGroup>
        <CollapsibleGroup title="AFMS limitations" count={rollup.afmsLimitations.length}>
          <SourcedList items={rollup.afmsLimitations} render={(lim) => lim} />
        </CollapsibleGroup>
        <CollapsibleGroup title="Placards" count={counts.placards}>
          <SourcedList
            items={rollup.placards}
            render={(placard) => <span className="font-mono text-rose-200">{placard}</span>}
          />
        </CollapsibleGroup>
      </div>
    </div>
  );
}
