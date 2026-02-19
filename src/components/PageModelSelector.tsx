import {
  useAvailableClaudeModels,
  useDefaultClaudeModel,
  useAuditSimModel,
  usePaperworkReviewModel,
  useUpsertUserSettings,
} from '../hooks/useConvexData';
import { Select } from './ui';

export type PageModelField = 'claudeModel' | 'auditSimModel' | 'paperworkReviewModel';

export interface PageModelSelectorProps {
  /** Which settings field to read/write (determines which feature's model is shown). */
  field: PageModelField;
  /** Optional label; defaults to "AI model". */
  label?: string;
  /** Optional disabled state (e.g. while a request is in progress). */
  disabled?: boolean;
  /** Optional class name for the wrapper. */
  className?: string;
}

function useModelForField(field: PageModelField): string {
  const defaultModel = useDefaultClaudeModel();
  const auditSimModel = useAuditSimModel();
  const paperworkModel = usePaperworkReviewModel();
  switch (field) {
    case 'claudeModel':
      return defaultModel;
    case 'auditSimModel':
      return auditSimModel;
    case 'paperworkReviewModel':
      return paperworkModel;
    default:
      return defaultModel;
  }
}

export function PageModelSelector({
  field,
  label = 'AI model',
  disabled = false,
  className = '',
}: PageModelSelectorProps) {
  const { models, loading } = useAvailableClaudeModels();
  const value = useModelForField(field);
  const upsertSettings = useUpsertUserSettings();

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    await upsertSettings(
      field === 'claudeModel'
        ? { claudeModel: next }
        : field === 'auditSimModel'
          ? { auditSimModel: next }
          : { paperworkReviewModel: next }
    );
  };

  return (
    <div className={className}>
      <Select
        label={label}
        value={value}
        onChange={handleChange}
        disabled={loading || disabled}
        selectSize="sm"
        className="min-w-[180px]"
      >
        {models.length === 0 && value && (
          <option value={value} className="bg-navy-800 text-white">
            {value}
          </option>
        )}
        {models.map((m) => (
          <option key={m.id} value={m.id} className="bg-navy-800 text-white">
            {m.display_name}
            {m.supportsThinking ? ' (thinking)' : ''}
          </option>
        ))}
      </Select>
    </div>
  );
}
