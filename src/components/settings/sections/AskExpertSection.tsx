import { FiMessageCircle } from 'react-icons/fi';
import { SaveStatus, SettingsCard, ToggleRow, useSaveStatus } from '../../ui';

export function AskExpertSection({
  settings,
  upsertSettings,
}: {
  settings: Record<string, any> | undefined | null;
  upsertSettings: (patch: Record<string, unknown>) => Promise<unknown>;
}) {
  const save = useSaveStatus();
  const forceCompanyContextDefault = settings?.forceCompanyContextDefault === true;

  return (
    <SettingsCard
      title="Ask an Expert defaults"
      description="Applied to new chats started from the home page."
      icon={<FiMessageCircle />}
      iconGradient="from-sky-500 to-indigo-500"
    >
      <ToggleRow
        label="Force company context by default"
        description="New Ask an Expert chats start with uploaded manuals and company profile grounding enabled."
        checked={forceCompanyContextDefault}
        disabled={save.state === 'saving'}
        onChange={(next) => {
          void save.run(() => upsertSettings({ forceCompanyContextDefault: next }));
        }}
      />
      <SaveStatus
        state={save.state}
        errorLabel={save.error ?? undefined}
        savedLabel="Default saved"
        className="mt-3"
      />
    </SettingsCard>
  );
}
