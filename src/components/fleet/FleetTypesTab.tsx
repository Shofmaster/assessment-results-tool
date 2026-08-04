import { FiLayers } from 'react-icons/fi';
import { useIsLogbookEnabled } from '../../hooks/useConvexData';
import AircraftTypesPanel from '../aircraft/AircraftTypesPanel';
import { SettingsCard } from '../ui';

/**
 * First non-modal home for aircraft types. Previously reachable only through a
 * dropdown footer inside Logbook Management.
 */
export default function FleetTypesTab({ projectId }: { projectId: string }) {
  const isLogbookEnabled = useIsLogbookEnabled();

  return (
    <SettingsCard
      title="Aircraft types"
      description="Make/model families. Assign a tail to a type and it inherits that type's manuals."
      icon={<FiLayers />}
    >
      {isLogbookEnabled ? (
        <AircraftTypesPanel projectId={projectId} embedded tone="glass" />
      ) : (
        <p className="text-sm text-white/60">
          Aircraft types require the Logbook module.
        </p>
      )}
    </SettingsCard>
  );
}
