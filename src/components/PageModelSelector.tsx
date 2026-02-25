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
  /** Inline layout for page header: label and dropdown in one row, no stacked label. */
  compact?: boolean;
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
  compact = false,
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

  const selectContent = (
    <>
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
    </>
  );

  if (compact) {
    return (
      <div className={`flex items-center gap-2 shrink-0 ${className}`}>
        <span className="text-sm text-white/70 whitespace-nowrap">Model</span>
        <select
          value={value}
          onChange={handleChange}
          disabled={loading || disabled}
          className="h-11 px-3 py-2 text-sm rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-sky-light transition-colors min-w-[100px] max-w-full sm:min-w-[140px] sm:max-w-[220px]"
        >
          {selectContent}
        </select>
      </div>
    );
  }

  return (
    <div className={className}>
      <Select
        label={label}
        value={value}
        onChange={handleChange}
        disabled={loading || disabled}
        selectSize="sm"
        className="min-w-0 w-full sm:min-w-[160px] sm:w-auto"
      >
        {selectContent}
      </Select>
    </div>
  );
}
