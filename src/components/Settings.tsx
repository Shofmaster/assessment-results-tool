import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import {
  FiBriefcase,
  FiCpu,
  FiCreditCard,
  FiInfo,
  FiLink,
  FiMessageCircle,
  FiSliders,
} from 'react-icons/fi';
import {
  useUpsertUserSettings,
  useUserSettings,
  useAvailableClaudeModels,
  useDefaultClaudeModel,
  useAuditSimModel,
  usePaperworkReviewModel,
  useDctTraceabilityModel,
  useMyAdminCompanies,
  useListWhereCanManageProjectsCompanies,
  useAvianisStatus,
  useTestAvianisConnection,
  useSyncAvianis,
} from '../hooks/useConvexData';
import { useAppStore } from '../store/appStore';
import { getSharedGoogleConfig, resolveGoogleConfig } from '../utils/googleConfig';
import { getSharedDriveService, resetSharedDriveService } from '../services/googleDrive';
import { api } from '../../convex/_generated/api';
import BillingSection from './billing/BillingSection';
import { SettingsShell, type SettingsSection } from './settings/SettingsShell';
import { GeneralSection } from './settings/sections/GeneralSection';
import { WorkspaceSection } from './settings/sections/WorkspaceSection';
import { AskExpertSection } from './settings/sections/AskExpertSection';
import { AiModelsSection } from './settings/sections/AiModelsSection';
import { IntegrationsSection } from './settings/sections/IntegrationsSection';
import { AboutSection } from './settings/sections/AboutSection';

export default function Settings() {
  const [activeId, setActiveId] = useState('general');

  const settings = useUserSettings() as Record<string, any> | undefined | null;
  const upsertSettings = useUpsertUserSettings();
  const myAdminCompanies = useMyAdminCompanies() as { _id: string; name: string }[] | undefined;
  const projectManageCompanies = useListWhereCanManageProjectsCompanies() as
    | { _id: string; name: string }[]
    | undefined;
  const { models: claudeModels, loading: modelsLoading } = useAvailableClaudeModels();
  const defaultModel = useDefaultClaudeModel();
  const auditSimModel = useAuditSimModel();
  const paperworkReviewModel = usePaperworkReviewModel();
  const dctTraceabilityModel = useDctTraceabilityModel();

  const [driveBusy, setDriveBusy] = useState(false);
  const driveConnected = useQuery(api.googleDriveAuth.hasConnection);
  const disconnectDrive = useMutation(api.googleDriveAuth.disconnect);

  const sharedGoogle = getSharedGoogleConfig();
  const sharedGoogleConfigured = !!sharedGoogle.clientId && !!sharedGoogle.apiKey;

  const avianisStatus = useAvianisStatus() as Record<string, any> | undefined | null;
  const testAvianis = useTestAvianisConnection();
  const syncAvianis = useSyncAvianis();
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const canOpenCompanyAdmin = !!myAdminCompanies?.length || !!projectManageCompanies?.length;

  const handleDriveConnect = async () => {
    const { clientId, apiKey } = resolveGoogleConfig(settings);
    if (!clientId || !apiKey) {
      toast.error('Google Drive API credentials are not configured.');
      return;
    }
    setDriveBusy(true);
    try {
      await getSharedDriveService({ clientId, apiKey }).connect();
      toast.success('Google Drive connected — stays linked across reloads and sign-outs.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Google Drive connect failed.');
    } finally {
      setDriveBusy(false);
    }
  };

  const handleDriveDisconnect = async () => {
    setDriveBusy(true);
    try {
      const { clientId, apiKey } = resolveGoogleConfig(settings);
      if (clientId && apiKey) {
        await getSharedDriveService({ clientId, apiKey }).disconnect();
      } else {
        await disconnectDrive({});
        resetSharedDriveService();
      }
      toast.success('Google Drive disconnected.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed.');
    } finally {
      setDriveBusy(false);
    }
  };

  const sections = useMemo<SettingsSection[]>(() => {
    const list: SettingsSection[] = [
      {
        id: 'general',
        label: 'General',
        icon: <FiSliders />,
        render: () => <GeneralSection />,
      },
      {
        id: 'billing',
        label: 'Billing',
        icon: <FiCreditCard />,
        render: () => <BillingSection />,
      },
    ];

    if (canOpenCompanyAdmin) {
      list.push({
        id: 'workspace',
        label: 'Workspace',
        icon: <FiBriefcase />,
        render: () => (
          <WorkspaceSection
            myAdminCompanies={myAdminCompanies}
            projectManageCompanies={projectManageCompanies}
          />
        ),
      });
    }

    list.push(
      {
        id: 'ask-expert',
        label: 'Ask an Expert',
        icon: <FiMessageCircle />,
        render: () => (
          <AskExpertSection settings={settings} upsertSettings={upsertSettings as any} />
        ),
      },
      {
        id: 'ai-models',
        label: 'AI Models',
        icon: <FiCpu />,
        render: () => (
          <AiModelsSection
            settings={settings}
            upsertSettings={upsertSettings as any}
            claudeModels={claudeModels}
            modelsLoading={modelsLoading}
            modelValues={{
              claudeModel: defaultModel,
              auditSimModel,
              paperworkReviewModel,
              dctTraceabilityModel,
            }}
          />
        ),
      },
      {
        id: 'integrations',
        label: 'Integrations',
        icon: <FiLink />,
        render: () => (
          <IntegrationsSection
            settings={settings}
            upsertSettings={upsertSettings as any}
            driveConnected={driveConnected}
            sharedGoogleConfigured={sharedGoogleConfigured}
            driveBusy={driveBusy}
            onDriveConnect={() => void handleDriveConnect()}
            onDriveDisconnect={() => void handleDriveDisconnect()}
            avianisStatus={avianisStatus}
            activeProjectId={activeProjectId}
            onAvianisTest={async () =>
              (await testAvianis({})) as { ok: boolean; message: string }
            }
            onAvianisSync={async () => {
              const result = (await syncAvianis({ projectId: activeProjectId as any })) as {
                aircraftSynced: number;
                discrepanciesSynced: number;
              };
              return `Synced ${result.aircraftSynced} aircraft, ${result.discrepanciesSynced} discrepancies.`;
            }}
          />
        ),
      },
      {
        id: 'about',
        label: 'About',
        icon: <FiInfo />,
        render: () => <AboutSection />,
      },
    );

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canOpenCompanyAdmin,
    myAdminCompanies,
    projectManageCompanies,
    settings,
    claudeModels,
    modelsLoading,
    defaultModel,
    auditSimModel,
    paperworkReviewModel,
    dctTraceabilityModel,
    driveConnected,
    sharedGoogleConfigured,
    driveBusy,
    avianisStatus,
    activeProjectId,
  ]);

  return (
    <SettingsShell
      title="Settings"
      subtitle="Configure your application preferences"
      sections={sections}
      activeId={activeId}
      onActiveIdChange={setActiveId}
      syncHash
    />
  );
}
