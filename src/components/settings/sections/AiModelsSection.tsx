import { FiCpu } from 'react-icons/fi';
import { Field, SaveStatus, SettingsCard, ToggleRow, useSaveStatus } from '../../ui';

type ClaudeModel = { id: string; display_name: string; supportsThinking?: boolean };

/** The four per-feature model overrides, previously four near-identical JSX blocks. */
const MODEL_FIELDS = [
  {
    field: 'claudeModel',
    label: 'Default model',
    help: 'Used for analysis, document extraction, revision tracking, and comparison summaries.',
  },
  {
    field: 'auditSimModel',
    label: 'Audit simulation model',
    help: 'Used for audit simulation agents and discrepancy extraction. Falls back to the default model.',
  },
  {
    field: 'paperworkReviewModel',
    label: 'Paperwork review model',
    help: 'Used for paperwork review analysis. Falls back to the default model.',
  },
  {
    field: 'dctTraceabilityModel',
    label: 'DCT traceability model',
    help: 'Used for DCT Compliance AI traceability. Falls back to the default model.',
  },
] as const;

export function AiModelsSection({
  settings,
  upsertSettings,
  claudeModels,
  modelsLoading,
  modelValues,
}: {
  settings: Record<string, any> | undefined | null;
  upsertSettings: (patch: Record<string, unknown>) => Promise<unknown>;
  claudeModels: ClaudeModel[];
  modelsLoading: boolean;
  modelValues: Record<(typeof MODEL_FIELDS)[number]['field'], string>;
}) {
  const save = useSaveStatus();

  const defaultModel = modelValues.claudeModel;
  const defaultModelEntry = claudeModels.find((m) => m.id === defaultModel);
  const defaultSupportsThinking = defaultModelEntry?.supportsThinking === true;
  const defaultModelDisplayName = defaultModelEntry?.display_name ?? defaultModel;

  const thinkingEnabled = settings?.thinkingEnabled ?? false;
  const adaptiveThinking = settings?.adaptiveThinking ?? false;

  const options = claudeModels.map((m) => (
    <option key={m.id} value={m.id} className="bg-navy text-white">
      {m.display_name}
      {m.supportsThinking ? ' (supports extended thinking)' : ''}
    </option>
  ));

  return (
    <>
      <SettingsCard
        title="Models"
        description="Pick which Claude model powers each feature."
        icon={<FiCpu />}
        iconGradient="from-sky to-sky-light"
      >
        <p className="text-sm text-white/60 mb-4">
          Claude requests are handled server-side. Set{' '}
          <code className="px-1.5 py-0.5 bg-white/10 rounded text-sm">ANTHROPIC_API_KEY</code> in
          your server environment — the browser never stores or sends Claude API keys.
        </p>

        <div className="space-y-4">
          {MODEL_FIELDS.map((f) => (
            <Field key={f.field} label={f.label} help={f.help}>
              {({ id, describedBy }) => (
                <select
                  id={id}
                  aria-describedby={describedBy}
                  value={modelValues[f.field]}
                  disabled={modelsLoading}
                  onChange={(e) => {
                    const value = e.target.value;
                    void save.run(() => upsertSettings({ [f.field]: value }));
                  }}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors text-white disabled:opacity-50"
                >
                  {options}
                </select>
              )}
            </Field>
          ))}
          <SaveStatus
            state={save.state}
            errorLabel={save.error ?? undefined}
            savedLabel="Model preferences saved"
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Extended thinking"
        description="Let Claude reason before answering. Supported on select models only."
        icon={<FiCpu />}
        iconGradient="from-violet-500 to-sky-500"
      >
        <div className="space-y-4">
          <ToggleRow
            label="Enable extended thinking"
            description="Used in Analysis, Audit Simulation, and Guided Audit when the selected model supports it."
            checked={thinkingEnabled}
            disabled={!defaultSupportsThinking}
            onChange={(next) => {
              void save.run(() => upsertSettings({ thinkingEnabled: next }));
            }}
            footer={
              !defaultSupportsThinking ? (
                <p className="text-sm text-amber-400/90 mt-2">
                  Not available for {defaultModelDisplayName}. Select a model that supports
                  extended thinking to enable.
                </p>
              ) : undefined
            }
          />

          {defaultSupportsThinking && thinkingEnabled && (
            <>
              <Field label="Thinking budget">
                {({ id }) => (
                  <select
                    id={id}
                    value={settings?.thinkingBudget ?? 10000}
                    disabled={adaptiveThinking}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      void save.run(() => upsertSettings({ thinkingBudget: value }));
                    }}
                    className="w-full sm:w-72 px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light text-white disabled:opacity-50"
                  >
                    <option value={2000} className="bg-navy">
                      Light (2K tokens)
                    </option>
                    <option value={10000} className="bg-navy">
                      Standard (10K)
                    </option>
                    <option value={20000} className="bg-navy">
                      Deep (20K)
                    </option>
                  </select>
                )}
              </Field>

              <ToggleRow
                label="Adaptive thinking"
                description="Lets Claude decide when and how deeply to reason. Outperforms manual budgets on policy-heavy audit tasks."
                checked={adaptiveThinking}
                onChange={(next) => {
                  void save.run(() => upsertSettings({ adaptiveThinking: next }));
                }}
              />

              {adaptiveThinking && (
                <Field label="Reasoning effort">
                  {({ id }) => (
                    <select
                      id={id}
                      value={settings?.adaptiveThinkingEffort ?? 'high'}
                      onChange={(e) => {
                        const value = e.target.value;
                        void save.run(() => upsertSettings({ adaptiveThinkingEffort: value }));
                      }}
                      className="w-full sm:w-72 px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light text-white"
                    >
                      <option value="low" className="bg-navy">
                        Low effort
                      </option>
                      <option value="medium" className="bg-navy">
                        Medium effort
                      </option>
                      <option value="high" className="bg-navy">
                        High effort (recommended)
                      </option>
                      <option value="max" className="bg-navy">
                        Maximum effort
                      </option>
                    </select>
                  )}
                </Field>
              )}
            </>
          )}
        </div>
      </SettingsCard>
    </>
  );
}
