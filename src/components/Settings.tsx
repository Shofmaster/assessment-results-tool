import { useRef, useState, useCallback } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
import {
  FiInfo,
  FiLogOut,
  FiUser,
  FiCpu,
  FiRefreshCw,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { useUserSettings, useUpsertUserSettings } from '../hooks/useConvexData';
import {
  getProvider,
  getModel,
  setProvider,
  setModel,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  type LLMProvider,
} from '../services/modelConfig';
import { getConvexErrorMessage } from '../utils/convexError';
import { Button, Select } from './ui';

interface AvailableModel {
  id: string;
  display_name: string;
  created_at: string;
}

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
};

export default function Settings() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const { signOut } = useClerk();
  const { user } = useUser();

  const userSettings = useUserSettings();
  const upsertSettings = useUpsertUserSettings();

  const savedProvider = (userSettings?.llmProvider as LLMProvider) || DEFAULT_PROVIDER;
  const savedModel =
    userSettings?.llmModel ?? userSettings?.claudeModel ?? DEFAULT_MODEL;

  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const displayProvider = selectedProvider ?? savedProvider;
  const displayModel = selectedModel ?? savedModel;

  const fetchModels = useCallback(async (provider: LLMProvider) => {
    setLoadingModels(true);
    try {
      const url = provider === 'anthropic' ? '/api/claude-models' : '/api/openai-models';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      setAvailableModels(data.models);
      toast.success(`Found ${data.models.length} available models`);
    } catch (error) {
      toast.error(`Failed to fetch models: ${getConvexErrorMessage(error)}`);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const handleSaveModel = useCallback(async () => {
    const providerToSave = displayProvider;
    const modelToSave = displayModel;
    setSaving(true);
    try {
      await upsertSettings({ llmProvider: providerToSave, llmModel: modelToSave });
      setProvider(providerToSave);
      setModel(modelToSave);
      setSelectedProvider(null);
      setSelectedModel(null);
      toast.success(`Model updated to ${PROVIDER_LABELS[providerToSave]} / ${modelToSave}`);
    } catch (error) {
      toast.error(`Failed to save: ${getConvexErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }, [displayProvider, displayModel, upsertSettings]);

  const hasUnsavedChange =
    (selectedProvider !== null && selectedProvider !== savedProvider) ||
    (selectedModel !== null && selectedModel !== savedModel);

  return (
    <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-white/60 text-lg">
          Configure your application preferences
        </p>
      </div>

      {/* Account */}
      {user && (
        <div className="glass rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <FiUser className="text-white" />
            </div>
            <h2 className="text-xl font-display font-bold">Account</h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {user.imageUrl ? (
              <img src={user.imageUrl} alt="" className="w-12 h-12 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-sky/20 flex items-center justify-center text-lg text-sky-light font-medium">
                {(user.fullName || user.primaryEmailAddress?.emailAddress || '?')[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-lg font-medium">{user.fullName || user.primaryEmailAddress?.emailAddress}</div>
              <div className="text-sm text-white/70">{user.primaryEmailAddress?.emailAddress}</div>
            </div>
            <button
              onClick={() => signOut()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 glass glass-hover rounded-xl text-red-400 text-sm font-medium transition-all"
            >
              <FiLogOut />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* AI API Configuration */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky to-sky-light flex items-center justify-center">
            <FiInfo className="text-white" />
          </div>
          <h2 className="text-xl font-display font-bold">AI API Configuration</h2>
        </div>
        <div className="space-y-2 text-white/70">
          <p>
            Requests are handled server-side. Set
            <code className="px-1.5 py-0.5 bg-white/10 rounded text-sm mx-1">ANTHROPIC_API_KEY</code>
            and/or
            <code className="px-1.5 py-0.5 bg-white/10 rounded text-sm mx-1">OPENAI_API_KEY</code>
            in your server environment.
          </p>
        </div>
      </div>

      {/* AI Provider & Model Selection */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <FiCpu className="text-white" />
          </div>
          <h2 className="text-xl font-display font-bold">AI Provider & Model</h2>
        </div>

        <div className="space-y-4">
          <p className="text-white/70 text-sm">
            Choose provider and model for all AI features (analysis, audit simulation, paperwork review, etc.).
            Extended thinking is only available with Anthropic.
          </p>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div className="w-full sm:max-w-xs">
                <Select
                  label="Provider"
                  value={displayProvider}
                  onChange={(e) => {
                    const p = e.target.value as LLMProvider;
                    setSelectedProvider(p);
                    setAvailableModels([]);
                  }}
                >
                  {(Object.keys(PROVIDER_LABELS) as LLMProvider[]).map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                variant="secondary"
                size="md"
                icon={<FiRefreshCw className={loadingModels ? 'animate-spin' : ''} />}
                loading={loadingModels}
                onClick={() => fetchModels(displayProvider)}
              >
                Load models
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div className="flex-1 w-full">
                {availableModels.length > 0 ? (
                  <Select
                    label="Model"
                    value={displayModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    {!availableModels.some((m) => m.id === savedModel) && savedModel && (
                      <option value={savedModel}>{savedModel} (current)</option>
                    )}
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name}{m.id === savedModel ? ' (current)' : ''}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white/80">Model</label>
                    <div className="w-full bg-white/10 border border-white/20 text-white px-4 py-3 rounded-xl text-sm">
                      {displayModel}
                    </div>
                    <p className="text-xs text-white/50 mt-1">Click &quot;Load models&quot; to list available models.</p>
                  </div>
                )}
              </div>
            </div>

            {hasUnsavedChange && (
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  loading={saving}
                  onClick={handleSaveModel}
                >
                  Save selection
                </Button>
                <button
                  className="text-sm text-white/50 hover:text-white/70 transition-colors"
                  onClick={() => {
                    setSelectedProvider(null);
                    setSelectedModel(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            <p className="text-xs text-white/40">
              Active: <code className="px-1 py-0.5 bg-white/10 rounded">{getProvider()}</code> /{' '}
              <code className="px-1 py-0.5 bg-white/10 rounded">{getModel()}</code>
            </p>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-xl font-display font-bold mb-4">About</h2>
        <div className="space-y-2 text-white/80">
          <p>
            <strong>Version:</strong> 2.0.0
          </p>
          <p>
            <strong>Developer:</strong> Aviation Quality Company
          </p>
          <p className="pt-4 border-t border-white/10">
            This application uses AI (Claude, GPT, or your chosen provider) to perform comprehensive
            aviation quality assessments against regulatory standards including 14 CFR Part 145,
            EASA regulations, and industry best practices.
          </p>
        </div>
      </div>
    </div>
  );
}
